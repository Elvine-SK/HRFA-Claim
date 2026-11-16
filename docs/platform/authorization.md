# Authorization

`@elvine-sk/platform-authorization`: roles, groups and policies, checked per request. Administrators manage them in Administration → Roles and Groups; your modules declare the permissions and the fields policies may test. The same evaluator runs in the browser (`@elvine-sk/platform-authorization/client`), for showing or hiding buttons.

## Model

- A user's roles come directly (`user_roles`) and through groups (`group_members` → `group_roles`). A role grants unconditional permission keys (`resource.action`) and holds policies `{ effect: allow | deny, resource, actions (may include '*'), condition? }`.
- The `super_admin` role (`is_super`) passes every check and ignores policies.
- Subjects load once per request (`subjectOf(c)`, `null` when signed out or `mfa_pending`) and are cached per user and authorization version for 60s. Every admin change calls `bump()` inside its transaction, so role and policy changes apply on the next request; app subject attributes may lag up to the TTL.
- Policy conditions see the record's fields and `subject.*` variables: `id`, `roles`, `groups`, `isSuper`, plus what `subjectAttributes(userId)` hooks return. Declare one on the module that knows the data (`defineModule({ subjectAttributes: async (userId) => ({ branchId }) })`, read by authorization through `moduleFields`) or pass it as `authorization.subjectAttributes` in `apps/api/src/platform.options.ts`. Every hook runs and their results merge; two hooks returning the same key throw. Results are cached with the subject (60 s). Reference one as `{ field: 'ownerId', op: 'eq', value: { var: 'subject.id' } }`.

## Checks

Get the service with `ctx.services.get(AUTHORIZATION)`. All throw `401` when there is no subject.

| Call                                             | Answers                                                                    | Use for                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `requirePermission(c, 'res.action')`             | `canAll`: unconditionally allowed for every record. Throws `403`.          | Actions with no per-record rule.                           |
| `scopeAll(c, qb, 'res.action')`                  | `requirePermission`, then the scope (the tenant fence, if any).            | Admin lists. Returns a `ScopedSelect`.                     |
| `authorize(c, action, res, record)` / `can(...)` | One record. `authorize` throws `403`.                                      | Detail, update, delete, create (pass the would-be record). |
| `canSome(c, action, res)`                        | Some record could be allowed.                                              | Showing a menu or button; never enough to act.             |
| `scope(c, action, res)`                          | `{ kind: 'all' }`, `{ kind: 'none' }` or `{ kind: 'where', allow, deny }`. | Building filters by hand.                                  |
| `applyScope(c, qb, action, res, fields?)`        | Adds the scope as SQL to a Kysely select.                                  | Policy-scoped lists. Returns a `ScopedSelect`.             |

Route pattern: load the record (404 if missing), then `authorize`. For updates, authorize both the current record and `{ ...before, ...patch }`, so an edit can't move a record out of the caller's scope.

`applyScope` compiles conditions with `fields`, else the resource's `policyResources` field map, else `{}`. An ALLOW condition that can't be compiled is dropped (logged); an uncompilable DENY makes the result empty. Keep the list query's column names aligned with that field map.

```ts
// list: scope last, then paginate
const query = listQueryFrom(c, noteFields, { defaultSort: [{ field: 'createdAt', dir: 'desc' }] })
const page = await paginate(await authz().applyScope(c, live(), 'read', 'note'), query, noteFields)

// update: the record as it is and as it would be
const before = await getNote(id)
await authz().authorize(c, 'update', 'note', before)
await authz().authorize(c, 'update', 'note', { ...before, ...patch })
```

## Scoped lists

`paginate` (`platform-db`) takes only a `ScopedSelect`, so a list that skips its scope does not compile. The ways to get one:

- `authz.applyScope(c, qb, action, resource)`: records the caller's roles and policies allow, inside the tenant fence. `applyScopeFor(subject, ...)` does the same outside a request (export jobs).
- `authz.scopeAll(c, qb, 'res.read')`, or `scopeAll(ctx, c, qb, 'res.read')` from `platform-server` in packages that don't depend on authorization: admin lists. `403` without the unconditional permission; a tenant-fenced resource still gets its fence.
- `ownRows(qb, 'a.userId', user.id)` (`platform-db`): rows belonging to the caller (inbox, own requests).
- `scopedBy(qb, 'reason')` (`platform-db`): the query is restricted some other way, e.g. a parent record's attachments after the parent passed `canView`. Name the reason; it is the one place to review by hand.

Apply the scope last: any further builder call returns a plain select again. Single-record routes still need `authorize`.

`GET /approval/delegates` is a deliberate exception: a lookup, not a list, so it builds no `ScopedSelect`. Any
signed-in user gets up to 10 active colleagues (`id`, `displayName`, never email) matching a 2+ character term,
rate-limited per user (60 a minute), because delegating approvals needs a name and `GET /users` needs `user.read`.

## Units, not workspaces

Model branches and departments as organisation units (`platform-org`, `docs/platform/org.md`), not as workspaces: one tree serves the whole install. `platform-org` adds `subject.personCode`, `subject.unitCode` and `subject.unitTree` (the user's unit and every unit below it, left out above 1,000 codes), so a policy reads `{ field: 'branchCode', op: 'in', value: { var: 'subject.unitTree' } }`. Without a policy, `unitRows(ctx, qb, 'res.branchCode', userId)` (`platform-org`) returns a `ScopedSelect` of rows in the caller's unit tree (no active person, no rows). `unitTree` can lag an org change by about 2 minutes (subject cache 60 s plus org cache 60 s). Conditions do not trim leading spaces in stored codes; `unitRows` does, with `TRIM(column)`, which skips the column's index.

## Three-valued conditions

- Evaluation follows SQL: `true`, `false` or unknown (`null`). Unknown comes from a missing field or variable, `null` compared with anything other than `eq`/`ne` `null`, and incomparable types; it propagates through `not`/`all`/`any`. Booleans compare as `1`/`0`, strings case-insensitively with trailing spaces ignored (`utf8mb4_general_ci`), so the in-memory evaluator and `compileCondition` agree.
- In `can`: any unconditional DENY denies; a conditional DENY denies unless it is definitely `false`; then an unconditional grant or a conditional ALLOW that is definitely `true` allows.
- `canAll` is false whenever any DENY applies, even a conditional one.
- Policy conditions are validated on save (`validatePolicy`): known resource and actions, condition shape, fields present in `policyResources`, and compilable to SQL.

## Explaining a check

`POST /authz/explain` (needs `role.read`; the policy editor's test panel uses it) answers "may this user do `action` on a record with
these field values, and why": `{ allowed, steps }`, the steps in the order `can` decides (`fence`, `super`,
`deny` policies, role `permission`, `allow` policies, `none`), the last one deciding. `policy` in the body is
an unsaved policy to try (it replaces the stored one with the same `id`); it is validated like a saved one.

## Escalation rules

Applied to non-super actors; "holds" means `canAll`.

- Granting permissions (role create, adding keys to a role) needs the actor to hold every added key. Keys must exist in the synced catalog.
- An ALLOW policy needs the actor to hold every listed action; only supers grant `'*'`.
- Lifting a DENY (editing or deleting a DENY policy, removing a role that has DENYs from a user or group, deleting such a role, a member leaving such a group) needs the matching ALLOW.
- Adding or removing a role (directly, via group roles, or via group membership) needs the actor to hold all the role's keys and its ALLOW policies.
- Only supers grant, change or administer `super_admin` and super users (`assertMayManage`). Changes that could drop the last active super lock `authz_state`, count supers before and after, and fail with `409` if the count reaches 0.
- Each change records an audit event (`authz.*`) and bumps the version.
