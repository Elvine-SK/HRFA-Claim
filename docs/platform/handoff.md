# Sign-in from a host portal (`platform-auth-handoff`)

Read this before connecting the app to a host portal.

The app opens as a tile in a portal that already has its own login. The portal's server vouches for the person and
gets a one-time code; the browser redeems the code and gets a normal platform session. People never sign in twice,
and the host team builds only one server-to-server call and a redirect.

## Install

- `nelv add handoff` adds the package, the module line and the environment lines.
- By hand: `handoff(handoffHostsFromEnv())` in the app's module list, or `handoff({ hosts, defaultHost })` written
  out. The module `dependsOn` `auth` and `audit`; list both before it.
- Migrations: `pnpm run migrate` creates `handoff_codes`, `handoff_drops` and `handoff_disabled_users`. Portal accounts live in `user_identities`, which belongs
  to `auth` and is shared with single sign-on.
- Web: set `NUXT_PUBLIC_PLATFORM_SIGN_IN_MODE=handoff` (see "The web").

## Environment

`HANDOFF_HOSTS=intranet,branch` lists the host keys (lowercase letters, digits, `-`; at most 32 characters).
`HANDOFF_DEFAULT_HOST` names the host a browser with no session is sent to; required with more than one host.
Per key, upper-cased with `-` as `_`:

| Variable                         | Meaning                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `HANDOFF_<KEY>_SECRET`           | Shared secret the host's server sends, at least 32 characters                   |
| `HANDOFF_<KEY>_LOGIN_URL`        | The host's login page; `{returnTo}` is replaced with the URL-encoded app path   |
| `HANDOFF_<KEY>_LABEL`            | Shown to admins and on the signed-out page (default: the key)                   |
| `HANDOFF_<KEY>_LINK_BY_EMAIL`    | `true` / `1` / `on`: a first visit may link to an existing user with that email |
| `HANDOFF_<KEY>_ALLOWED_IPS`      | Comma list of IPs or CIDRs allowed to call the server-to-server routes          |
| `HANDOFF_<KEY>_CODE_TTL_SECONDS` | Code lifetime, 10–300 (default 60)                                              |

Any other `HANDOFF_*` key is a startup error. In production login URLs must be `https`. The client IP for the allow
list is read as everywhere else (`X-Forwarded-For` only behind `TRUSTED_PROXIES`).

## The host's side (give this section to the host team)

All calls go to the app's API origin over HTTPS, from the host's **server**, never from the browser. Each carries
the host's secret in the header `X-Handoff-Secret` (not `Authorization`).

**1. When a person clicks the tile**, create a code and redirect the browser to `redirectUrl`:

```http
POST /api/v1/auth/handoff/codes
X-Handoff-Secret: <secret>
Content-Type: application/json

{
  "externalId": "E10234",
  "username": "somchai.k",
  "displayName": "Somchai K.",
  "email": "somchai@example.la",
  "attributes": { "unitCode": "BR-04", "position": "Officer" },
  "returnTo": "/approvals/123"
}
```

```json
{
  "data": {
    "code": "…",
    "redirectUrl": "https://app.example/api/v1/auth/handoff/intranet/redeem?code=…",
    "expiresAt": "2026-10-21T08:00:60.000Z"
  }
}
```

- `externalId` (required, 1–255 characters, case-sensitive): the person's id in the portal. It never changes for a
  person.
- `username` (3–64 of `a-z 0-9 . _ -`, starting with a letter or digit), `displayName` (1–128), `email`: sent each
  time; the app overwrites its copy with them. Leave a field out to keep the app's value. A new person needs an
  `email` or a `username`. The email counts as verified.
- `attributes`: a flat object of strings, numbers and booleans, at most 4 KB as JSON (unit, position, …). The app
  keeps the latest set.
- `returnTo`: a path on the app (`/…`), at most 500 characters. Default `/`.
- The code works **once**, only at this host's redeem URL, for `HANDOFF_<KEY>_CODE_TTL_SECONDS` (default 60 s).
  Create a new code per click; never cache `redirectUrl`.

**2. To create, update or disable people ahead of their first visit** (so approval steps can name them):

```http
PUT /api/v1/auth/handoff/users/E10234
X-Handoff-Secret: <secret>
Content-Type: application/json

{ "username": "somchai.k", "displayName": "Somchai K.", "email": "somchai@example.la", "active": true }
```

Answers `{ "data": { "userId": "…", "created": true } }`. `"active": false` says this host no longer lists the person:
once every host they are linked at has said so, the app disables them and ends their sessions at once.
`"active": true` lists them again and enables a person the hosts disabled, never one an administrator disabled.
Same field rules as above.

**3. The app sends browsers without a session** to `HANDOFF_<KEY>_LOGIN_URL` with `{returnTo}` filled in. After
the person signs in at the portal, the portal does step 1 with that `returnTo`.

Answers:

| Status | When                                                                                                                                   |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `200`  | Done                                                                                                                                   |
| `400`  | `handoff.invalid_return`: `returnTo` is not a path on the app                                                                          |
| `401`  | `handoff.secret_invalid`: wrong or missing secret                                                                                      |
| `403`  | The caller's IP is not in `HANDOFF_<KEY>_ALLOWED_IPS`                                                                                  |
| `422`  | A field is invalid (`error.details` names it)                                                                                          |
| `429`  | Too many calls: 10 codes a minute per person, 600 codes and 600 user updates a minute per host, 10 wrong secrets per 10 minutes per IP |

When a redeem fails the browser lands on the app's sign-in page with `?error=` set to one of
`handoff.code_invalid` (expired, used, or another host's code), `handoff.user_inactive`, `handoff.email_conflict`
(another account has that email or username; an admin links them), `handoff.profile_incomplete` (a new person with
neither email nor username), `rate_limit.exceeded` or `handoff.failed`. The page explains each one.

Keep the secret on the host's server only. A host example in Node:

```js
app.post('/tiles/purchase-requests', requireLogin, async (req, res) => {
  const answer = await fetch('https://pr.example/api/v1/auth/handoff/codes', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-handoff-secret': process.env.PR_HANDOFF_SECRET },
    body: JSON.stringify({
      externalId: req.user.id,
      username: req.user.login,
      displayName: req.user.name,
      email: req.user.email,
      returnTo: req.query.next ?? '/',
    }),
  })
  if (!answer.ok) return res.status(502).send('The app is unavailable')
  res.redirect((await answer.json()).data.redirectUrl)
})
```

And in PHP:

```php
$ch = curl_init('https://pr.example/api/v1/auth/handoff/codes');
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'X-Handoff-Secret: ' . getenv('PR_HANDOFF_SECRET')],
  CURLOPT_POSTFIELDS => json_encode([
    'externalId' => $user['id'], 'username' => $user['login'], 'displayName' => $user['name'],
    'email' => $user['email'], 'returnTo' => $_GET['next'] ?? '/',
  ]),
]);
$answer = json_decode(curl_exec($ch), true);
if (curl_getinfo($ch, CURLINFO_HTTP_CODE) !== 200) { http_response_code(502); exit('The app is unavailable'); }
header('Location: ' . $answer['data']['redirectUrl']);
```

## How the app resolves the person

1. A portal account `(handoff:<host>, externalId)` already linked: that user. A disabled user is refused
   (`handoff.user_inactive`); a host enables them again only when the hosts disabled them
   (`PUT … "active": true` or the people sync); an administrator always can.
2. Else, when the host has `LINK_BY_EMAIL` and exactly one user has the email: link that user, unless that account
   has 2-step required or set up (refused as `handoff.email_conflict`; an admin links it by hand).
3. Else, a user who already has the email or username: refused (`handoff.email_conflict`), never merged.
4. Else a new active user: no password, no invitation, no 2-step.

Nothing about the person changes until the code is redeemed. The code is spent before the person is resolved, so
a refused visit also uses up its code.

**`LINK_BY_EMAIL` trusts the portal with every account it can name by email.** Turn it on only for a portal you
trust as much as your own sign-in page, and give administrators 2-step: accounts with 2-step are never linked by
email. Redeems are limited to 300 per 10 minutes per client IP; behind a proxy set `TRUSTED_PROXIES`, or an office
behind one address shares that budget.

**The host is the authenticator.** A handoff session is active at once, even when the platform would ask a password
user for 2-step. Portal users have no password; the account page hides password and 2-step for them, and "forgot password" sends
them nothing (a reset would give them a way in that skips the portal).

Audit actions: `auth.handoff.code_issued`, `auth.handoff.login`, `auth.handoff.failed`, `auth.handoff.linked`,
`auth.handoff.user_upserted`, `auth.handoff.deactivated`, `auth.handoff.secret_rejected` (never with the secret),
and for the people sync and session check `auth.handoff.dropped`, `auth.handoff.returned`,
`auth.handoff.reactivated`, `auth.handoff.host_signed_out`, `auth.handoff.sync_refused`.

## People sync, host sessions and default roles

Three per-host options, given in code (functions cannot come from the environment). An app that reads hosts from
the environment adds them before passing the hosts on:

```ts
const { hosts, defaultHost } = handoffHostsFromEnv()
handoff({
  defaultHost,
  hosts: hosts.map((h) => (h.key === 'hrm' ? { ...h, directory: hrmDirectory, presence: hrmPresence } : h)),
})
```

- **`defaultRoles`** (also `HANDOFF_<KEY>_DEFAULT_ROLES`, a comma list): role keys given to a user when the
  handoff creates them (first visit, `PUT /users`, admin create, the sync, `ensureUser`); never again later, so an
  administrator who removes the role is not overruled. Every key must exist when the app starts and none may be the
  super role. Admin create needs an administrator who could grant those roles. Needs the `authorization` module
  listed before `handoff`.
- **`directory`**: who may use the app. `people({ externalIds })` returns the people the host allows, as
  `PUT /users` takes them; with `externalIds` only those (at most 500 per call). A job `handoff.sync:<key>` runs
  `every` (default `15m`): it updates linked people, marks the ones not returned as dropped and the ones returned
  again as back. With `createUsers: true` it calls `people({})` and creates everyone listed.
- **`presence`**: who is signed in at the host now. `signedIn(externalIds)` returns the ones still signed in. A job
  `handoff.presence:<key>` runs `every` (default `1m`) and ends every session of a portal user it does not
  return; the account stays active, the next tile click signs them in. Sessions younger than `graceSeconds`
  (default 120) are not checked, for hosts that write their "signed in" row late.

Both jobs need the `jobs` module listed before `handoff`. A directory and a presence check over a data source
(`data-sources.md`):

```ts
export const hrmDirectory: HandoffDirectory = {
  async people({ externalIds }) {
    let qb = source('hrm').selectFrom('employees').select(['eid', 'name']).where('working', '=', 1)
    if (externalIds) qb = qb.where('eid', 'in', externalIds)
    return (await qb.execute()).map((r) => ({
      externalId: r.eid,
      username: r.eid.toLowerCase(),
      displayName: r.name,
    }))
  },
}
export const hrmPresence: HandoffPresence = {
  async signedIn(externalIds) {
    const rows = await source('hrm')
      .selectFrom('currentLogins')
      .select('eid')
      .where('eid', 'in', externalIds)
      .execute()
    return rows.map((r) => r.eid)
  },
}
```

Rules:

- **Ids are trimmed, then matched exactly** (case counts): return them as the host sends them on sign-in (no case
  change on one side only). A row with an invalid field is skipped, as `PUT /users` would refuse it.
- **Several hosts.** A user is disabled only when every host they are linked at has dropped them, and enabled when
  any of them lists them again. A user an administrator disabled is never enabled by a host; once an administrator
  sets the status, the hosts' disable is forgotten. The session check signs out only when every other host the
  user is linked at also has a presence check and also does not list them.
- **Guard.** With at least `guard.minPeople` (default 10) people in play, a run that would drop or sign out more
  than `guard.maxShare` (default 0.5) of them changes nothing, is audited as `auth.handoff.sync_refused` and
  fails the job. An emptied or lagging upstream table cannot lock everyone out.
- **Host unavailable.** A data source outage (`source.unavailable`) makes the run change nothing and succeed with
  `unavailable: true`; the next run catches up. Any other error fails the job.
- One person who cannot be applied (an email another user has) is audited as `auth.handoff.failed` and skipped.

In server code, through `ctx.services.get(HANDOFF)`: `ensureUser(host, externalId)` creates or updates one person
the directory lists (e.g. an approver named on a record before they visit) and returns `{ userId, created }`, or
`null` when the directory does not list them; `userIdOf(host, externalId)` and `externalIdOf(host, userId)` look
up the link; `syncPeople(host)` and `checkPresence(host)` run one pass now.

## Administration

With hosts configured, Administration → Users gets **Add portal user** (`user.invite`: host, portal user id, name,
email or username) and, in a user's panel, **Portal accounts** (`user.read`) with **Link portal account**
(`user.update` and `user.set_password`, like setting a password; the platform's escalation guard applies, and
nobody links their own account) for someone who had an account before the portal. Routes: `GET /auth/handoff/admin/hosts`,
`POST /auth/handoff/admin/users`, `GET|POST /auth/handoff/admin/users/{id}/identities`.

## The web

`NUXT_PUBLIC_PLATFORM_SIGN_IN_MODE=handoff` (runtime config `platform.signInMode`) makes the sign-in page send the
browser to `/api/v1/auth/handoff/login?returnTo=…`, which redirects to the default host's login page. The form
still shows for `/auth/sign-in?local=1` (the first admin, break-glass accounts with a password when the portal is
down) and when `?error=` is set. Signing out lands on `/auth/signed-out` ("Return to the portal"). Default mode
`password` keeps the usual sign-in page.

`NUXT_PUBLIC_PLATFORM_SIGN_IN_URL` (runtime config `platform.signInUrl`) sends those browsers straight to a page of
the portal instead, for a portal that signs people in without this module (it hands people over its own way). As
with `HANDOFF_<KEY>_LOGIN_URL`, `{returnTo}` is replaced with the URL-encoded app path:
`https://portal.example/login?next={returnTo}`. It applies only with `SIGN_IN_MODE=handoff`; the signed-out page's
button uses it too. The web is a static build: set the variable when building, or wherever
the build reads its runtime config.

## Not built

- A signed token (JWT with a shared key) for hosts that cannot make a server-to-server call.
- Reading the one-time code from the host's own database (the host writes the code, the app reads it through a
  data source).
- People's portal attributes in authorization policies.
