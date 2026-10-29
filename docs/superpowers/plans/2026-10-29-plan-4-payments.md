# Plan 4 — Payment calculation, checking table and upload file

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finance opens an approved agreement by REF or Doc.no, the system calculates every member's entitlements
into a checking table, the payment runs its approval (finance officer → finance section head), and Finance exports
one balanced `.xlsx` upload file per agreement for CORE, then marks it posted. Cancelling an agreement after its
export marks the payment "cancelled after export" for Finance.

**Architecture:** A pure calculation (`payments/calculate.ts`, no database) turns an agreement, its members and the
rates in effect into payment items; a loader feeds it from `travel-master`. A new API module `payments` stores the
payment, its items and Finance's day-8 bills, and runs approval like `agreements`. Posting entries are master data
(`travel_posting_entries`); a pure builder turns items + entries into upload lines; a stored procedure creates the
balanced batch once per agreement and kind; an XLSX writer behind an interface writes the file. Agreements tell
payments about a cancellation through a listener, so `agreements` does not import `payments`.

**Tech Stack:** nelvine-platform 1.0.0 (Hono, Kysely, MariaDB 11.4, Nuxt 4 + Nuxt UI), `@elvine-sk/platform-approval`,
`-audit`, `-notifications`, `exceljs` 4.4.0 (new), TypeScript, vitest, pnpm.

**Spec:** [`docs/specs/2026-10-21-travel-payment-design-v3.md`](../../specs/2026-10-21-travel-payment-design-v3.md)
§7 (posting entries), §8 (cancellation after export), §9, §11, §12, §14 (payment screens), §16 (calculation and
posting tests), §18 step 4. Working answers to business questions 3, 4, 6, 7, 9, 14 and the fuel rounding:
`HANDOFF.md` "Plan 4 working answers". Carry items: `HANDOFF.md` "Carry into plan 4". Platform guides:
`docs/platform/modules.md` ("Stored procedures", "Approval"), `authorization.md`, `testing.md`, `web.md`.

## Global Constraints

- Everything in plans 2 and 3's Global Constraints still holds (module layout, `currentDb()`/`appDb()`,
  `inTransaction`, `writeHistory`/`announceHistory`, access check per route, `BINARY(16)` UUIDs, en + lo strings,
  an HTTP test per route with a refusal, migration keys `YYYYMMDDHHmm_<module>_<change>`, `DATE` as `YYYY-MM-DD`
  strings, money as decimal strings through `travel-master/money.ts`, never floats).
- Amounts: at most 13 whole digits and 2 decimals (`AMOUNT_PATTERN`). A calculated amount or a currency total that
  does not fit answers `422 payments.amount_too_large` and nothing is saved.
- Days of a member = `return − departure + 1 − daysSubtracted` (`daysInclusive`). Nights = days − 1 (never below 0).
- Rates: the row effective on the **member's departure date** (`rateOn`, `flatRateOn`); the group advance on the
  agreement's `travelFrom` (`advanceOn`).
- Currency of allowances = the zone's currency (`D`, `OB1` LAK; `OA*`, `OE*` USD). Group advance: the band's
  currency (domestic LAK; border and overseas USD). Fuel: LAK, forms 1, 2 and 4 only.
- Fuel = `ceil(privateCarKm × fuel price ÷ km_per_litre)` to a whole kip. No `fuel_price` on the date ⇒ `422
  payments.fuel_price_missing` for a member with `privateCarKm`.
- Meals: per meal `divCeilWhole(daily, 3)`; deduction = per meal × `hostMeals`, at most the member's daily total.
- Day 8 onward (forms 1 only, between provinces): night `n` is the night after day `n`; nights 1–7 at the rate,
  nights 8…(days−1) from Finance's bill for that night, capped at the rate. A billed night without an amount
  blocks submission (`payments.bills_missing`); Finance may enter `0`.
- Payment statuses: `calculated`, `in_approval`, `approved`, `exported`, `posted`, `void`,
  `cancelled_after_export`. One live payment per agreement (live = not `void`). Only `calculated` is changed
  (bills, recalculate).
- Account string of a GL line: Finance user's HRM branch (six digits, e.g. `888010`) + CCY + GL + SEQ, e.g.
  `888010LAK44087200010001` (22 characters). `BRANCH` of a GL line = that branch; of a member line = the member's
  snapshot `branchCode`.
- Upload columns, in order: `ACCOUNT, BRANCH, NAME, CCY, CHEQUE_NO, AMT, RVS_NO, DR_CR, REMARK`. `AMT` a number cell
  with format `#,##0.00`; `CHEQUE_NO` and `RVS_NO` empty for payments.
- `REMARK`: `<zone code> <leader's Lao name and surname> <header days> <province or country, Lao> <Doc.no> <dd/mm/yyyy>-<dd/mm/yyyy>
  <REF>`, single spaces, e.g. `D ວັນ ໄຊ 4 ຫຼວງພະບາງ 0101.BCEL.888010.2030 02/11/2030-05/11/2030 TA-2030-000004`.
- Errors are `AppError`s with codes `payments.<key>` / `posting.<key>`, en and lo text in the module's `messages`.

## Review Focus

1. **A rate or price missing on the departure date** (a member departing before the seed date, no fuel price yet):
   calculation answers `422` with the member path and the missing key, and no payment row is left. Test in Task 2
   (pure) and Task 4 (`payments.rate_missing` over HTTP, member departing `2025-12-31`).
2. **Two Finance users at once.** A second `POST /payments` for the same agreement answers `409 payments.exists`; a
   second export answers `409 posting.batch_exists`; neither leaves a second row. Test in Tasks 4 and 7.
3. **Cancel during payment.** Agreement cancelled while its payment is `calculated` or `in_approval` ⇒ payment
   `void`, its approval request cancelled; after export ⇒ `cancelled_after_export`, Finance of the branch notified,
   listed by `GET /payments?status=cancelled_after_export`. Test in Task 8.
4. **Branch scope.** A branch-`888020` finance officer gets `404` for an `888010` payment by id, by lookup and by
   batch file download, and cannot create one for an `888010` agreement; head office sees both. Test in Task 4 and 7.
5. **Unbalanced or oversized batch.** Lines whose DR and CR differ in one currency make `posting_create_batch`
   refuse with `posting.unbalanced` and write nothing; a total of 14 whole digits answers
   `payments.amount_too_large`. Test in Task 6 (pure) and Task 7 (procedure called directly).

---

### Task 1: Money helpers for fuel and the 13-digit guard

**Files:**
- Modify: `apps/api/src/modules/travel-master/money.ts`
- Test: `apps/api/test/money.test.ts` (extend)

**Interfaces:**
- Produces:
  - `mulDivCeilWhole(a: Amount, n: number, d: Amount): Amount` — `ceil(a × n ÷ d)` to a whole unit; `n` a
    non-negative integer, `d > 0` (else `TypeError`). Exact on cents (`a_c × n ÷ d_c` units, ceiling).
  - `fitsAmount(a: Amount): boolean` — `a` (as produced by `fromCents`, possibly negative) is non-negative and
    matches `AMOUNT_PATTERN`.

- [ ] **Step 1: Write the failing tests**

```ts
it('fuel: km × price ÷ km per litre, rounded up to a whole unit', () => {
  expect(mulDivCeilWhole('25000.00', 100, '7.00')).toBe('357143.00') // 357142.857…
  expect(mulDivCeilWhole('21000', 70, '7')).toBe('210000.00') // exact
  expect(mulDivCeilWhole('25000', 0, '7')).toBe('0.00')
  expect(() => mulDivCeilWhole('1', 1, '0')).toThrow(TypeError)
  expect(() => mulDivCeilWhole('1', -1, '7')).toThrow(TypeError)
})
it('guards 13 digits', () => {
  expect(fitsAmount('9999999999999.99')).toBe(true)
  expect(fitsAmount(fromCents(10n ** 15n))).toBe(false)
  expect(fitsAmount('-1.00')).toBe(false)
})
```

- [ ] **Step 2–4:** `cd apps/api && pnpm vitest run test/money.test.ts` (FAIL), implement, run again (PASS).
- [ ] **Step 5: Commit** — `feat(travel-master): fuel division and the 13-digit amount guard`

### Task 2: The calculation (pure)

**Files:**
- Create: `apps/api/src/modules/payments/calculate.ts`, `apps/api/src/modules/payments/types.ts`
- Test: `apps/api/test/payment-calc.test.ts` (unit, no database, table-driven)

**Interfaces:**
- Consumes: Task 1 helpers; `addAmounts`, `mulAmount`, `divCeilWhole`, `compareAmounts`; `daysInclusive`;
  `FormType`, `PolicyOption` from `agreements/types.ts`; `Currency`, `ZoneCode`, `ZoneKind` from `lookups.ts`.
- Produces (`types.ts`):
  - `PAYMENT_STATUSES` (Global Constraints order), `PaymentStatus`.
  - `COMPONENTS = ['daily', 'same_day', 'meal_deduction', 'accommodation', 'billed_accommodation', 'fuel',
    'personal', 'advance'] as const`, `Component`.
  - `POSTING_COMPONENT: Record<Component, PostingComponent>` with `PostingComponent = 'daily' | 'accommodation' |
    'fuel' | 'personal' | 'advance'`: `same_day` and `meal_deduction` post as `daily`, `billed_accommodation` as
    `accommodation`.
- Produces (`calculate.ts`):
  - `interface CalcMember { eid; departureDate; returnDate; daysSubtracted; hostMeals; privateCarKm: number | null;
    isAdvanceHolder: boolean }`
  - `interface CalcAgreement { formType; policyOption; overnight: boolean | null; sameDayOver50km: boolean | null;
    hasAdvance: boolean; travelFrom; travelTo; zoneKind: ZoneKind; members: CalcMember[] }`
  - `interface MemberRates { daily; accommodation; personal: Amount | null; currency: Currency; effectiveFrom;
    sameDay: Amount | null; fuelPrice: Amount | null; kmPerLitre: Amount }` (one per member, for that member's
    departure date; `null` entry in the map = no rate row)
  - `interface PaymentItem { eid; component: Component; currency: Currency; rate: Amount; count: number;
    amount: Amount; basis: string }` — `basis` names the source, e.g. `DP3 from 2026-01-01`, `÷3 rounded up`,
    `night 8 bill`; `meal_deduction` has a negative `amount`.
  - `class CalcError extends Error { code: string; path: string }`, codes `payments.rate_missing`,
    `payments.same_day_rate_missing`, `payments.fuel_price_missing`, `payments.fuel_not_overseas`,
    `payments.advance_band_missing`, `payments.amount_too_large`; `path` `members.<n>.<field>` or `agreement`.
  - `calculate(a: CalcAgreement, rates: Map<string, MemberRates | null>, advance: { amount: Amount; currency:
    Currency; effectiveFrom: string } | null, bills: Map<string, Map<number, Amount>>): PaymentItem[]` — items in
    member order, then component order of `COMPONENTS`; zero-amount items are left out. Rules: spec §9 and the
    Global Constraints; policy table of spec §9 (`host_accommodation` drops accommodation and billed nights,
    `host_meals` drops daily and meal deduction, `host_meals_accommodation` both, personal and advance always paid);
    form 2: overnight ⇒ as form 1 without day 8; same day ≥ 50 km ⇒ `same_day` × days; under 50 km ⇒ no
    allowance; form 4 ⇒ zone rates, no personal; `advance` once, on the holder, when `hasAdvance`.

- [ ] **Step 1: Write the failing tests.** Fixture rates in the test: `D` daily `150000`, accommodation
  `200000`; `OA1` daily `100.00` USD, accommodation `120.00`, personal `300.00`; same day `150000`; fuel `25000`,
  km per litre `7`. Cases (`it.each`), each asserting `[eid, component, currency, count, amount]` rows:
  - form 1, 4 days, `bcel_all` ⇒ daily 4 × 150000 = `600000.00`, accommodation 3 × 200000 = `600000.00`.
  - form 1, `daysSubtracted: 1` ⇒ daily count 3, accommodation count 2.
  - every policy option on form 3 (5 rows of spec §9's table): personal `300.00` always present.
  - meals: form 3, 2 host meals ⇒ `meal_deduction` count 2, amount `-68.00` (100 ÷ 3 → 34); form 1, 1 meal ⇒
    `-50000.00`; form 3, 4 days, 12 meals ⇒ `-400.00` (12 × 34 = 408, capped at the daily total).
  - form 2 overnight (DP rates), same day ≥ 50 km (`same_day` 1 × 150000, no accommodation), same day < 50 km
    (no items).
  - form 4 ⇒ `LAK` daily and accommodation, no personal; advance `USD`.
  - fuel 100 km on form 1 ⇒ `fuel` `357143.00` LAK; on form 3 ⇒ `CalcError payments.fuel_not_overseas`; no
    fuel price ⇒ `payments.fuel_price_missing` at `members.0.privateCarKm`.
  - day 8: form 1, 10 days ⇒ accommodation count 7; bills `{8: '150000', 9: '999999'}` ⇒ `billed_accommodation`
    `150000.00` and `200000.00` (capped); form 2 overnight 10 days ⇒ 9 nights at the rate, no billed nights.
  - advance: holder only, `hasAdvance: false` ⇒ none.
  - `rates` entry `null` ⇒ `CalcError payments.rate_missing` at `members.<n>.departureDate`.
  - an amount of `9999999999999.00` daily × 2 days ⇒ `payments.amount_too_large`.
- [ ] **Step 2–4:** `pnpm vitest run test/payment-calc.test.ts` (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(payments): entitlement calculation`

### Task 3: Posting entries as master data

**Files:**
- Modify: `apps/api/src/modules/travel-master/migrations.ts` (new migration
  `202610300100_travel-master_posting_entries`; the plan 2 seed migration is frozen), `seed.ts`
  (`SEED_POSTING_ENTRIES`), `lookups.ts`, `routes.ts`, `schema.ts`, `apps/api/src/shared/db.ts`
- Test: `apps/api/test/travel-master.test.ts` (extend)

**Interfaces:**
- Table `travel_posting_entries`: `id` BINARY(16) PK, `case_key varchar(30)` (`payment` now; plan 5 adds
  settlement cases), `zone_kind varchar(10)` (`domestic` | `border` | `overseas`), `component varchar(30)`,
  `side char(2)` (`DR` | `CR`), `account_kind varchar(10)` (`gl` | `member`), `gl char(10)` null, `seq char(4)`
  null, `sort_order int`; FK (`gl`, `seq`) → `travel_gl_accounts`; check `account_kind = 'member'` ⇔ `gl IS NULL`;
  unique (`case_key`, `zone_kind`, `component`, `side`).
- Seed, case `payment`, for each zone kind: `daily` DR gl 4408720001/0001 + CR member; `accommodation` DR
  4408730001/0001 + CR member; `fuel` DR 4405100001/0001 + CR member (domestic and border only); `advance` DR
  1362220001/0001 + CR member; `personal` DR 4408600002/0001 + CR member (overseas only).
- Produces: `postingEntries(caseKey: string, zoneKind: ZoneKind): Promise<PostingEntry[]>` with `PostingEntry =
  { component: string; side: 'DR' | 'CR'; accountKind: 'gl' | 'member'; gl: string | null; seq: string | null;
  glNameEn: string | null; glNameLo: string | null }`, sorted by `sort_order`; route `GET
  /travel-master/posting-entries` (sign-in only, like the other reference lists), read-only in this plan.

- [ ] **Step 1: Write the failing tests:** `lists the payment entries` — 4 domestic components (8 rows), 4
  border, 4 overseas with `personal` and without `fuel`; the domestic `accommodation` DR is `4408730001`
  (business question 3); signed-out: 401.
- [ ] **Step 2–4:** `RUN_DB_TESTS=1 pnpm vitest run test/travel-master.test.ts` (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(travel-master): posting entries as data`

### Task 4: Payments module: tables, calculate, checking table, bills

**Files:**
- Create: `apps/api/src/modules/payments/module.ts`, `migrations.ts`, `procedures.ts`, `rates.ts`, `queries.ts`,
  `routes.ts`, `schema.ts`, `scope.ts`
- Modify: `apps/api/src/modules/index.ts` (register after `agreementsModule`), `apps/api/src/shared/db.ts`,
  `apps/api/src/modules/agreements/scope.ts` (`callerScope(ctx, c, permission = 'agreement.read')`),
  `apps/api/test/sources/hrm.fixtures.sql`, `apps/api/test/agreement-fixtures.ts`
- Test: `apps/api/test/payments.test.ts`

**Interfaces:**
- Consumes: Task 2 `calculate`, Task 3 lookups; `rateOn`, `flatRateOn`, `advanceOn`, `zoneOf`; agreements
  `findAgreement`, `membersOf`, `findByNumber`, `callerScope`, `caller`; `branchRoleUsers`.
- Tables (migration `202610300200_payments_create`):
  - `payments` (standard columns): `agreement_id` FK, `branch_code char(6)` (the agreement's), `status`,
    `calculated_at`, `submitted_at`, `exported_at`, `posted_at`, `core_ref varchar(50)`, `cancelled_at`; generated
    `agreement_live = IF(status <> 'void', agreement_id, NULL)` stored, unique.
  - `payment_items`: `id`, `payment_id` FK cascade, `sort_order`, `eid`, `component`, `currency char(3)`, `rate`,
    `count int`, `amount`, `basis varchar(200)`.
  - `payment_bills`: (`payment_id`, `eid`, `night`) PK, `amount`.
  - Procedure `payments_transition(id, version, to, stamps…)` like `agreements_transition`; allowed:
    `calculated→in_approval|void`, `in_approval→calculated|approved|void`, `approved→exported|void`,
    `exported→posted|cancelled_after_export`, `posted→cancelled_after_export`; history row as there; errors
    `payments.bad_transition` 409.
  - Permissions `payment: ['read', 'calculate', 'export']`; role `finance_section_head` (new: `payment.read`,
    `agreement.read`); `finance_officer` gains `payment.read`, `payment.calculate`, `payment.export`.
- Produces:
  - `loadCalcInput(agreementId): Promise<{ agreement: CalcAgreement; rates: Map<…>; advance: … }>` in `rates.ts`.
  - `recalculate(paymentId): Promise<void>` — replaces `payment_items` from `calculate`; `CalcError` →
    `AppError` 422 with the `path`.
  - `scopedPayments(ctx, c, qb)` / `mayReadPayment(ctx, c, row)` — `callerScope(…, 'payment.read')` on
    `payments.branch_code`; `own` sees nothing.
  - Routes (tag `Payments`): `POST /payments` `{ agreementId }` (agreement `approved`, `payment.calculate` in scope;
    409 `payments.exists`; 409 `payments.agreement_not_approved`), `GET /payments` (list, `status` filter,
    `paginate`), `GET /payments/{id}` (header, members with their items, flags `{ eid, billedNights: number[] }`,
    totals per currency, bills), `GET /payments/lookup?number=` (REF or Doc.no → `{ agreementId, paymentId |
    null }`), `POST /payments/{id}/recalculate` `{ version }`, `PUT /payments/{id}/bills` `{ version, bills: [{ eid,
    night, amount }] }` (night must be a billed night of that member: 422 `payments.night_invalid`; recalculates).
    The last two: `calculated` only (409 `payments.not_calculated`).
  - Fixtures: head office `10050` (finance officer), `10051` (HR officer), `10052`, `10053` (members, LAK and USD);
    branch `888020` `10060` (finance officer), `10061` (HR officer). Position `12` (PostType 7 ⇒ `P3`).
  - Test helper `approvedAgreement(platform, by: TestClient, body)` in `agreement-fixtures.ts`: creates the draft,
    attaches a PDF, then under `SYSTEM_CONTEXT` runs `prepareSubmission` and `transition` to `in_approval` and
    `approved` (no workflow needed); returns the agreement. Doc.no year `2030` for this file.

- [ ] **Step 1: Write the failing tests:**
  - `calculates an approved agreement` — 2 members, 4 days, D/P3: items match `rateOn('D', 'P3', departure)` ×
    counts; totals `{ LAK: … }`; status `calculated`; history has the create.
  - `refuses a second payment` — 409 `payments.exists`; `refuses a draft agreement` — 409.
  - `refuses a missing rate` — member departing `2025-12-31` (before the seed set): 422 `payments.rate_missing`
    at `members.0.departureDate`; `GET /payments` lists none for the agreement.
  - `day 8 bills` — 10-day trip: flags night 8 and 9; `PUT bills` with night 8 ⇒ `billed_accommodation`; night 3 ⇒
    422 `payments.night_invalid`.
  - `branch scope` — `10060` gets 404 on the 888010 payment by id and lookup, 404 creating one for an 888010
    agreement, and an empty list; head office `10050` sees its own and an 888020 one.
  - `refuses without the right` — HR officer `10051`: 403 on `POST /payments`.
- [ ] **Step 2–4:** `RUN_DB_TESTS=1 pnpm vitest run test/payments.test.ts` (FAIL), implement, PASS; `pnpm run
  openapi`, `cd apps/web && pnpm run api:types`, typecheck.
- [ ] **Step 5: Commit** — `feat(payments): calculate an approved agreement into the checking table`

### Task 5: Payment approval

**Files:**
- Create: `apps/api/src/modules/payments/approval.ts`, `apps/api/src/modules/payments/workflow.json`
- Modify: `module.ts`, `routes.ts`, `apps/api/test/agreement-fixtures.ts` (`createWorkflow(admin, path)` takes the
  workflow file; default stays the agreement's)
- Test: `apps/api/test/payments-approval.test.ts`

**Interfaces:**
- `workflow.json`: key `payment`, entityType `payment`, one stage `finance_section_head` with resolver
  `payment.finance_section_head`, `completion: 'any'`, `allowSelfApproval: false`, `rejectEndsRequest: true`.
  Step 1 of ກ18 (finance officer) is the submission.
- Produces:
  - `paymentApproval` entity (`type: 'payment'`): facts `{ branchCode, headOffice }`; `canView` = `mayReadPayment`;
    `display` `{ label: 'payments.entity', icon: 'i-lucide-banknote', link: '/payments/:id' }`; `onStatusChange`:
    `pending` ⇒ check bills complete, `transition(→in_approval)`; `approved` ⇒ `transition(→approved)` and notify
    the branch's `finance_officer` users (`payments.approved`); `returned` ⇒ `→calculated`; `rejected` |
    `cancelled` ⇒ `→void` unless already `void`.
  - Resolver `payment.finance_section_head` = `branchRoleUsers('finance_section_head', facts.branchCode)`.
  - `POST /payments/{id}/submit` (`SubmitBody`) — `payment.calculate` in scope, `calculated` only; one transaction
    with `APPROVAL.submit('payment', …)`, so `approval.no_approvers` leaves it `calculated`.
  - Notification type `payments.approved`.
- [ ] **Step 1: Write the failing tests** (people `10070` finance officer, `10071` finance section head, `10072` HR
  officer, `10073` member, all 888010; year `2031`):
  - `submits and approves` — status `in_approval`, `10071`'s inbox has it, approve ⇒ `approved`; `10070` notified.
  - `return goes back to calculated, reject voids` — return ⇒ `calculated` and recalculate works; a reject on a
    second submission ⇒ `void`, and a new `POST /payments` for the agreement is accepted.
  - `bills missing` — 10-day trip without bills: submit 422 `payments.bills_missing`; with `0` for each billed
    night: 200.
  - `no approver` — an 888020 payment (no 888020 finance section head in this file): 422 `approval.no_approvers`,
    stays `calculated`.
- [ ] **Step 2–4:** run (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(payments): payment approval (finance officer → finance section head)`

### Task 6: Upload lines (pure)

**Files:**
- Create: `apps/api/src/modules/payments/posting.ts`
- Test: `apps/api/test/posting-lines.test.ts` (unit, no database)

**Interfaces:**
- Consumes: `PaymentItem`, `POSTING_COMPONENT`, `PostingEntry`.
- Produces:
  - `interface UploadLine { account: string; branch: string; name: string; ccy: Currency; chequeNo: string;
    amount: Amount; rvsNo: string; side: 'DR' | 'CR'; remark: string }`
  - `interface PostingMember { eid; name: string; branchCode: string; accountLak: string | null; accountUsd:
    string | null }` — `name` = `NAME_ENG SNAME_ENG` upper-case, else the Lao name.
  - `buildPaymentLines(input: { items: PaymentItem[]; entries: PostingEntry[]; members: PostingMember[];
    branch: string; remark: string }): UploadLine[]` — items summed by posting component and currency; GL lines one
    per (GL, SEQ, CCY, side), named by `glNameEn`; member lines one per (member, CCY, side) on that currency's
    account; order: all DR lines (GL order of the entries), then CR lines (member order). A member without the
    account the currency needs throws `posting.account_missing`. Totals checked with `fitsAmount`.
  - `paymentRemark(input: { zoneCode; leaderName; days; placeLo; docNo; travelFrom; travelTo; ref }): string`
    (format in Global Constraints).
  - `unbalancedCurrencies(lines: UploadLine[]): Currency[]`.
- [ ] **Step 1: Write the failing tests:**
  - domestic, two members ⇒ DR `888010LAK44087200010001` (daily, summed), DR `…44087300010001`, CR one per member
    on `accountLak` with branch `888010`; balanced.
  - overseas ⇒ every line `USD`, account strings `888010USD…`, personal DR `…44086000020001`.
  - border with advance ⇒ allowances LAK, advance DR `888010USD13622200010001` and CR on the holder's `accountUsd`.
  - meal deduction lowers the daily DR line; branch `888020` ⇒ `888020LAK…`; member branch kept on member lines.
  - remark matches the example of Global Constraints; holder without USD account ⇒ `posting.account_missing`.
- [ ] **Step 2–4:** run (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(payments): upload lines from the posting entries`

### Task 7: Batch, export file, posted

**Files:**
- Create: `apps/api/src/modules/payments/xlsx.ts`, `apps/api/src/modules/payments/batches.ts`
- Modify: `migrations.ts` (new migration `202610300300_payments_batches`), `routes.ts`, `module.ts`,
  `apps/api/src/shared/db.ts`, `apps/api/package.json` through `cd apps/api && pnpm add exceljs@4.4.0`
  (never by hand)
- Test: `apps/api/test/payments-export.test.ts`

**Interfaces:**
- Tables: `posting_batches` (`id`, `agreement_id`, `kind varchar(12)` (`payment` now, `settlement` in plan 5),
  `source_id` (the payment), `branch_code char(6)`, `created_at`, `created_by`, `file_name varchar(100)`,
  `cancelled_after_export_at`), unique (`agreement_id`, `kind`); `posting_lines` (`batch_id` FK, `line_no`, the
  `UploadLine` fields, `PK (batch_id, line_no)`).
- Procedure `posting_create_batch(p_id, p_agreement_id, p_kind, p_source_id, p_branch, p_file_name, p_lines JSON,
  stamps…)`: refuses an existing (agreement, kind) with `posting.batch_exists` and DR ≠ CR in any currency
  (`JSON_TABLE` sums) with `posting.unbalanced`, before writing; inserts the batch and lines.
- Produces:
  - `interface UploadWriter { contentType: string; extension: string; write(lines: UploadLine[]): Promise<Uint8Array> }`;
    `xlsxWriter` (sheet `Upload file`, header row, `AMT` number cells `#,##0.00`, text cells elsewhere so leading
    zeros stay). The only place that imports `exceljs`.
  - `POST /payments/{id}/export` `{ version }` — `payment.export` in scope, `approved` only, caller has an HRM
    branch (422 `payments.no_branch`); builds lines (Task 6), creates the batch, `transition(→exported)`, audit
    `payments.exported` `{ ref, batchId, lines }`; returns the payment with its batch.
  - `GET /posting-batches/{id}/file` — `payment.read` in scope; streams the stored lines through `xlsxWriter`,
    `Content-Disposition: attachment; filename="<REF>-payment.xlsx"`. Audit `payments.downloaded`.
  - `POST /payments/{id}/posted` `{ version, coreRef?: string (≤ 50) }` — `payment.export`, `exported` only ⇒
    `posted`; audit `payments.posted`.
- [ ] **Step 1: Write the failing tests** (people `10080` finance officer HO, `10081` HR officer, `10082`
  member, `10083` finance officer 888020; year `2032`; payments approved under `SYSTEM_CONTEXT` with
  `transition` to skip the workflow):
  - `exports a balanced file` — export 200, status `exported`; download: `content-type` xlsx; read back with
    `exceljs`: header row as in Global Constraints, DR rows `888010LAK…`, `AMT` cell `numFmt` `#,##0.00`, sum of DR =
    sum of CR; remark contains the REF and Doc.no.
  - `exports once` — second export 409 (`payments.bad_transition` after the first, and calling
    `posting_create_batch` directly for the same agreement ⇒ `posting.batch_exists`).
  - `refuses an unbalanced batch` — `posting_create_batch` called directly with one DR line ⇒ `posting.unbalanced`,
    no row in `posting_batches`.
  - `marks posted` — `posted` with `coreRef: 'CORE-123'` ⇒ `posted`; again ⇒ 409.
  - `branch scope` — `10083` gets 404 on the 888010 batch file.
- [ ] **Step 2–4:** run (FAIL), implement, PASS; `pnpm run openapi`, web types, typecheck.
- [ ] **Step 5: Commit** — `feat(payments): posting batch, xlsx upload file, posted confirmation`

### Task 8: Cancel during or after payment

**Files:**
- Modify: `apps/api/src/modules/agreements/routes.ts` (cancel route calls the listeners inside its
  transaction), create `apps/api/src/modules/agreements/events.ts`; `apps/api/src/modules/payments/module.ts`
  (`setup` registers the listener), `payments/batches.ts`
- Test: `apps/api/test/payments-export.test.ts` (extend)

**Interfaces:**
- Produces in `agreements/events.ts`: `onAgreementCancelled(listener: (agreementId: string, reason: string) =>
  Promise<void>): void` and `agreementCancelled(agreementId, reason): Promise<void>` (runs every listener in order).
- Payments listener: live payment `calculated` | `in_approval` | `approved` ⇒ `transition(→void)` first, then
  `APPROVAL.cancelForEntity('payment', id)` (so the request's own `cancelled` finds nothing to move); `exported` | `posted` ⇒ `transition(→cancelled_after_export)`, stamp
  `posting_batches.cancelled_after_export_at`, notify the branch's `finance_officer` users
  (`payments.cancelled_after_export`, link `/payments/:id`), audit `payments.cancelled_after_export`. Spec §8: no
  reversal file.
- [ ] **Step 1: Write the failing tests:** `cancel before export voids the payment` (status `void`, a new
  agreement with the same Doc.no can be paid); `cancel after export marks it` (status `cancelled_after_export`,
  listed by `GET /payments?status=cancelled_after_export`, `10080` notified, the file still downloads).
- [ ] **Step 2–4:** run (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(payments): cancelled after export (spec §8, ກ16)`

### Task 9: Web screens

**Files:**
- Create: `apps/web/app/composables/usePayments.ts`, `apps/web/app/pages/payments/index.vue` (REF/Doc.no box ⇒
  open the payment or "Calculate" for an approved agreement; list with status filter, a "Cancelled after export"
  tab), `apps/web/app/pages/payments/[id].vue` (checking table: one row per member with days, nights and each
  component's `rate × count = amount` and basis, the flag and bill inputs for nights 8+, totals per currency;
  Recalculate, Submit, approval card, Export, Download, Mark posted with CORE reference), `apps/web/app/pages/master/posting-entries.vue`
  (read-only table)
- Modify: `apps/web/i18n/locales/app.en.json`, `app.lo.json` (keys `payments.*`, `master.postingEntries.*`);
  `apps/web/app/pages/agreements/[id]/index.vue` (Finance on an approved agreement: "Payment" button); payments
  module `menus` (`/payments`, group `workspace`, `permission: 'payment.read'`); master menu entry
- Interfaces: the Task 4–8 routes through `api.d.ts`; follow `pages/agreements/*` and `useAgreements.ts` for calls,
  errors (`useFormErrors`) and tables (`PlatformDataTable`); dates through `useDates()` / `AppDateInput.vue`.
- [ ] **Step 1: Implement** the pages and strings (every string en and lo; amounts shown with thousands separators
  and the currency).
- [ ] **Step 2: Run** `pnpm run typecheck` and `RUN_DB_TESTS=1 pnpm vitest run test/web-locales.test.ts`: pass.
- [ ] **Step 3: Browser check** on `pnpm dev:api` + `pnpm dev:web`: approve an agreement, calculate, enter a bill,
  submit, approve in `/approvals`, export, open the file in a spreadsheet, mark posted, cancel an exported one; en and lo.
- [ ] **Step 4: Commit** — `feat(web): payment screens`

### Task 10: Docs

**Files:**
- Modify: `HANDOFF.md` (plan 4 built; payment statuses, posting entries as data, working answers still to
  confirm, exceljs), `docs/deploy-testing.md` ("Payment approval": create the `payment` workflow from
  `apps/api/src/modules/payments/workflow.json` and make it default; roles `finance_officer`,
  `finance_section_head`; enter the fuel price), spec v3 §17 assumption list (day-8 night numbering, meal
  deduction capped at the daily total, fuel forms 1, 2, 4 only, REMARK format).
- [ ] **Step 1:** write them; `RUN_DB_TESTS=1 pnpm run test`, `pnpm run typecheck`, `cd apps/api && pnpm run
  openapi:verify` all pass.
- [ ] **Step 2: Commit** — `docs: HANDOFF after plan 4`

## Not in this plan

- **The workflow set-up command.** The approval module creates workflows only through its HTTP routes and does not
  export a service for it; writing its tables from the app is the coupling proposal C6 avoids. Until C6 the
  `payment` workflow is created by hand like the agreement's (Task 10 documents it), and tests post the JSON.
- Editing posting entries on screen (read-only here; a correction is a migration until a second case needs it).
- Settlement and its posting cases, `RVS_NO` (plan 5); dashboard, printable checking table, transit form (plan 6).
- Business questions still open after the working answers: Finance confirming them (HANDOFF), Europe group 1
  (question 2), the `PostType` map (ຂ1).
