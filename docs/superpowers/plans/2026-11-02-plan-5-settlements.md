# Plan 5 — Advance settlement, its approval chain and posting

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After an agreement's payment (with a group advance) is exported, a member files the advance settlement
(forms 5–6): expense lines with PDF receipts, the case checked against the totals. The settlement runs its approval
chain (leader or deputy, then Finance in three steps, by branch). Finance exports one balanced `.xlsx` upload file
per settlement and marks it posted. An overseas settlement that used money also passes through the holding account
2361800001: when Finance marks the first file posted, they type CORE's suspense number (`RVS_NO`), and the app writes
a second "clearing" file that carries it.

**Architecture:** A new API module `settlements` (depends on `payments`, which it reads; `payments` never imports
it). Pure functions do the totals and the case (`settlements/totals.ts`) and the upload lines
(`settlements/posting.ts`, reusing `UploadLine`, `PostingMember` and `paymentRemark` from `payments/posting.ts`). The
GL numbers are rows in `travel_posting_entries` (new cases `settlement` and `clearing`). Batches go through plan 4's
`posting_create_batch` with two new kinds, `settlement` and `clearing`. Approval and cancellation copy `payments`:
an approval entity with resolvers, a status procedure, and a listener on `onAgreementCancelled`.

**Tech Stack:** nelvine-platform 1.1.0 (Hono, Kysely, MariaDB 11.4, Nuxt 4 + Nuxt UI), `@elvine-sk/platform-approval`
(step conditions), `-files`, `-audit`, `-notifications`, `exceljs` 4.4.0 (through `payments/xlsx.ts` only),
TypeScript, vitest, pnpm.

**Spec:** [`docs/specs/2026-10-21-travel-payment-design-v3.md`](../../specs/2026-10-21-travel-payment-design-v3.md)
§10 (settlement, chain, deadline), §11 (entries, upload file), §12, §13 (receipts PDF only), §14 (settlement screens),
§16 ("Settlement" tests), §17 assumptions 1 and 5, §18 step 5. Working answers to business questions 5 and 8:
`HANDOFF.md` "Plan 5 working answers". Carry items: `HANDOFF.md` "Carry into plan 5". Platform guides:
`docs/platform/modules.md` ("Stored procedures", "Approval"), `files.md`, `authorization.md`, `testing.md`, `web.md`.

## Global Constraints

- Everything in plans 2–4's Global Constraints still holds (module layout, `currentDb()`/`appDb()`, `inTransaction`,
  `writeHistory`/`announceHistory`, access check per route, `BINARY(16)` UUIDs, en + lo strings, an HTTP test per
  route with a refusal, migration keys `YYYYMMDDHHmm_<module>_<change>`, `DATE` as `YYYY-MM-DD` strings, money as
  decimal strings through `travel-master/money.ts`, never floats, `AMOUNT_PATTERN` and `fitsAmount`).
- Only an agreement with `hasAdvance` gets a settlement, and only once its live payment is `exported` or `posted`
  (409 `settlements.advance_not_paid`). One live settlement per agreement (live = not `void`; 409 `settlements.exists`).
- **Settlement currency** = the currency of the payment's `advance` item (domestic LAK; border and overseas USD).
  **Advance** = that item's amount; it is copied onto the settlement when it is created and cannot be edited (ກ29).
- **Lines:** `description` (free text, 1–300), `currency` (`^[A-Z]{3}$`), `amount` (`AMOUNT_PATTERN`, > 0),
  `crossRate` (`^\d{1,9}(\.\d{1,6})?$`, > 0) only when `currency` differs from the settlement currency, then required
  (422 `settlements.cross_rate_required`). `settledAmount` = `amount` when the currencies are the same, else `amount ÷
  crossRate` rounded half-up to cents (ກ27; the rounding is our call). `expenseType` `fuel` | `fare` is required on
  domestic and border settlements (zone kind `domestic` | `border`) and must be absent overseas.
- **Files on a line:** `receiptFileId` (PDF), or else `noReceiptReason` (1–500): one of the two is required. A line
  with a `crossRate` also needs `rateProofFileId` (PDF). Every file id must be a file attached to this settlement
  (422 `settlements.file_unknown`). Files: PDF only, at most 52,428,800 bytes (spec §13).
- **Totals:** `total` = sum of `settledAmount`; `remaining` = advance − total. Case: `total = 0` ⇒ `unused`; `0 <
  total < advance` ⇒ `partly_used`; `total = advance` ⇒ `fully_used`; `total > advance` ⇒ `overspent`. The filer
  picks `caseKind`. At submit, a choice that differs from the totals answers 422 `settlements.case_mismatch`.
- **Posting amounts:** `returned` = max(remaining, 0) (holder repays); `excess` = max(−remaining, 0) (holder is
  reimbursed); `holding` = min(total, advance), used overseas only. `needsClearing` = zone kind `overseas` and
  `holding > 0`.
- **Deadline:** `dueDate` = the 5th working day after the agreement's `travelTo`, counted from the next day. Working day =
  not Saturday, not Sunday, not a `tb_holiday` date. Skipping weekends is our call; the spec names only
  `tb_holiday`. It is stored when the settlement is created. Submitting after `dueDate` (`todayHrm() > dueDate`)
  needs `lateReason` (1–500), else 422 `settlements.late_reason_required`. Nothing is blocked otherwise.
- **Step 2 (leader or deputy):** candidates = the agreement's members with `isLeader` or `isDeputy`, minus the
  filer. If there are none, step 2 is skipped. Otherwise `leaderEid` is required at submit (422
  `settlements.leader_required`): an EID outside the
  candidates answers 422 `settlements.not_leader`, the filer's own EID 422 `settlements.own_eid`, and a candidate
  with no app account (never signed in) 422 `settlements.leader_no_account`.
- **Statuses:** `draft`, `in_approval`, `approved`, `exported`, `posted`, `clearing_exported`, `cleared`, `void`,
  `cancelled_after_export`. Only `draft` is changed. Returned, rejected or withdrawn ⇒ back to `draft` (the filer
  corrects it, like an agreement). `posted` is final when `needsClearing` is false.
- **Batch kinds:** `payment` (plan 4), `settlement`, `clearing`; one per agreement and kind. Account strings,
  `BRANCH`, `NAME`, `AMT` and the column order are as in plan 4. `REMARK` is plan 4's `paymentRemark`, unchanged.
  `RVS_NO` is filled only on the 2361800001 line of a clearing file. Every other line has it empty.
- Errors are `AppError`s with codes `settlements.<key>` / `posting.<key>`, en and lo text in the module's `messages`.

## Review Focus

1. **A leader who never opened the app.** Step 2 needs a linked user. Submitting with such a leader's EID answers
   422 `settlements.leader_no_account` before any approval request exists, and the settlement stays `draft`. Test in
   Task 5.
2. **Receipt files that belong elsewhere.** A `receiptFileId` attached to another settlement or to an agreement ⇒
   422 `settlements.file_unknown`. Deleting a receipt (`DELETE /files/{id}`) once the settlement has left `draft` ⇒
   409 `settlements.receipt_locked`. Test in Task 4.
3. **Mixed currencies and rounding.** An overseas settlement with a THB line `3500.00` at cross rate `35.123456`
   gives `settledAmount` `99.65`. A THB line without a cross rate ⇒ 422 at `lines.<n>.crossRate`. A USD line with a
   cross rate ⇒ 422 (`settlements.cross_rate_not_allowed`). Test in Task 3 (pure) and Task 4 (HTTP).
4. **Cancel at each stage.** Agreement cancelled while the settlement is `draft` or `in_approval` ⇒ `void` and its
   request cancelled. After the settlement file exists ⇒ `cancelled_after_export`, every settlement and clearing
   batch of the agreement stamped, Finance notified. The payment's own listener still runs in the same transaction.
   Test in Task 7.
5. **Clearing out of order.** `POST /settlements/{id}/clearing` before `posted`, on a domestic one, or twice ⇒ 409
   `settlements.bad_transition` / `settlements.no_clearing` / `posting.batch_exists`. `posted` on an overseas
   settlement with holding but no `rvsNo` ⇒ 422 `settlements.rvs_no_required`. Test in Task 6.

---

### Task 1: Converted amounts, due date, holidays

**Files:**
- Modify: `apps/api/src/modules/travel-master/money.ts`, `apps/api/src/shared/dates.ts`
- Create: `apps/api/src/modules/hrm/holidays.ts`
- Modify: `apps/api/test/sources/hrm.fixtures.sql` (holidays `2033-11-07`, `2035-03-08`)
- Test: `apps/api/test/money.test.ts`, `apps/api/test/dates.test.ts` (extend), `apps/api/test/hrm.test.ts` (extend)

**Interfaces:**
- Produces:
  - `divRoundCents(a: Amount, rate: string): Amount` — `a ÷ rate` rounded half-up to cents. `rate` matches
    `^\d{1,9}(\.\d{1,6})?$` and is > 0, else `TypeError`. Exact (bigint on cents and micro-units).
  - `addWorkingDays(from: string, n: number, holidays: ReadonlySet<string>): string` — the `n`th day after `from`
    that is not Saturday, Sunday or in `holidays` (pure, UTC dates).
  - `holidaysBetween(from: string, to: string): Promise<Set<string>>` in `hrm/holidays.ts` — `tb_holiday.holiday_date`
    in `[from, to]`, read through `source('hrm')` like the other HRM lookups; null dates ignored.
- [ ] **Step 1: Write the failing tests**

```ts
it('converts at a cross rate, half-up to cents', () => {
  expect(divRoundCents('3500.00', '35.123456')).toBe('99.65') // 99.6485…
  expect(divRoundCents('100', '3')).toBe('33.33')
  expect(divRoundCents('0.05', '2')).toBe('0.03') // 0.025 → up
  expect(() => divRoundCents('1', '0')).toThrow(TypeError)
  expect(() => divRoundCents('1', '1.1234567')).toThrow(TypeError)
})
it('counts working days', () => {
  // Friday 2033-11-04 return: Mon 7 is a holiday ⇒ 8, 9, 10, 11, 14
  expect(addWorkingDays('2033-11-04', 5, new Set(['2033-11-07']))).toBe('2033-11-14')
  expect(addWorkingDays('2033-11-01', 5, new Set())).toBe('2033-11-08')
})
// hrm.test.ts
it('reads holidays', async () => {
  expect([...(await holidaysBetween('2033-11-01', '2033-11-30'))]).toEqual(['2033-11-07'])
})
```

- [ ] **Step 2–4:** `cd apps/api && RUN_DB_TESTS=1 pnpm vitest run test/money.test.ts test/dates.test.ts
  test/hrm.test.ts` (FAIL), implement, run again (PASS).
- [ ] **Step 5: Commit** — `feat: cross-rate conversion, working days and HRM holidays`

### Task 2: Settlement posting entries as data

**Files:**
- Modify: `apps/api/src/modules/travel-master/migrations.ts` (new migration
  `202611020100_travel-master_settlement_entries`; earlier seed migrations stay frozen), `seed.ts`
  (`SEED_SETTLEMENT_ENTRIES`; fix the header comment: `SEED_POSTING_ENTRIES` is frozen by 202610300100, the new
  constant by 202611020100), `apps/web/app/pages/master/posting-entries.vue` (a case filter: payment, settlement,
  clearing), `routes.ts` (`caseKey` query, `z.enum(['payment', 'settlement', 'clearing'])`, default `payment`)
- Test: `apps/api/test/travel-master.test.ts` (extend)

**Interfaces:**
- Rows (all GL rows SEQ `0001`). Each row is `component side account`:
  - `settlement`, `domestic` and `border`: `advance CR gl 1362220001`, `fuel DR gl 4405100001`, `fare DR gl
    4405200001`, `returned DR member`, `excess CR member`.
  - `settlement`, `overseas`: `advance CR gl 1362220001`, `fare DR gl 4405200001`, `holding CR gl 2361800001`,
    `returned DR member`, `excess CR member`.
  - `clearing`, `overseas`: `holding DR gl 2361800001`, `advance CR gl 1362220001`.
- Consumes/produces: `postingEntries(caseKey, zoneKind)` unchanged; `GET /travel-master/posting-entries?caseKey=&zoneKind=`.
- [ ] **Step 1: Write the failing tests:** `lists the settlement entries`: domestic has 5 rows with `fuel` DR
  `4405100001`; overseas has `holding` CR `2361800001` and no `fuel`; `clearing` overseas has 2 rows; `clearing`
  domestic has none. The payment rows are unchanged (8 domestic). An unknown `caseKey` answers 400.
- [ ] **Step 2–4:** run (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(travel-master): settlement and clearing posting entries`

### Task 3: Totals, case and upload lines (pure)

**Files:**
- Create: `apps/api/src/modules/settlements/types.ts`, `totals.ts`, `posting.ts`
- Test: `apps/api/test/settlement-calc.test.ts` (unit, no database, table-driven)

**Interfaces:**
- Consumes: `divRoundCents`, `fitsAmount`, `toCents`/`fromCents`; `UploadLine`, `PostingMember`,
  `unbalancedCurrencies` from `payments/posting.ts`; `PostingEntry`, `Currency`, `ZoneKind`.
- Produces (`types.ts`): `SETTLEMENT_STATUSES` (Global Constraints order), `SettlementStatus`; `CASE_KINDS =
  ['unused', 'partly_used', 'fully_used', 'overspent'] as const`, `CaseKind`; `EXPENSE_TYPES = ['fuel', 'fare']`,
  `ExpenseType`.
- Produces (`totals.ts`):
  - `interface LineInput { currency: string; amount: Amount; crossRate: string | null; expenseType: ExpenseType | null }`
  - `settledAmountOf(line: LineInput, settlementCurrency: Currency): Amount`. It throws `LineError` (`code`, `path`
    relative to the line: `crossRate` or `expenseType`) for `settlements.cross_rate_required`,
    `settlements.cross_rate_not_allowed`.
  - `interface Totals { total: Amount; remaining: Amount /* signed */; caseKind: CaseKind; returned: Amount; excess:
    Amount; holding: Amount; byType: Record<ExpenseType, Amount>; needsClearing: boolean }`
  - `totalsOf(input: { advance: Amount; zoneKind: ZoneKind; lines: { settledAmount: Amount; expenseType:
    ExpenseType | null }[] }): Totals`. Overseas lines count as `fare`. `holding` is `0.00` unless overseas. Throws
    `payments.amount_too_large` (the existing `AppError`) when `total` does not fit.
- Produces (`posting.ts`):
  - `buildSettlementLines(input: { zoneKind; currency: Currency; totals: Totals; holder: PostingMember; entries:
    PostingEntry[]; branch: string; remark: string }): UploadLine[]`. GL line amounts: `fuel` and `fare` from
    `byType`; `advance` = advance − holding overseas (= `returned`), the whole advance otherwise; `holding` =
    `holding`. Member lines: `returned` DR and `excess` CR on the holder's account in `currency`. Order: DR GL, DR
    member, CR GL, CR member (as plan 4). Zero amounts left out. A component with money but no entry ⇒
    `posting.entry_missing`. A missing account ⇒ `posting.account_missing`.
  - `buildClearingLines(input: { currency; holding: Amount; entries; branch; remark; rvsNo: string }): UploadLine[]`.
    Two lines; `rvsNo` on the 2361800001 line only.
- [ ] **Step 1: Write the failing tests.** Fixtures: domestic advance `2000000` LAK, overseas `1000.00` USD, branch
  `888010`, holder `accountLak` `0101000000001`, `accountUsd` `0101000000002`, the Task 2 rows inlined as
  `PostingEntry[]`. Assert `[account, side, ccy, amount, rvsNo]` rows and balance (`unbalancedCurrencies` = `[]`):
  - case per total: `0` ⇒ `unused`; `1500000` ⇒ `partly_used`; `2000000` ⇒ `fully_used`; `2300000` ⇒ `overspent`.
  - domestic partly used, fuel `500000` + fare `1000000` ⇒ DR `888010LAK44051000010001` `500000.00`, DR
    `…44052000010001` `1000000.00`, DR holder `500000.00`, CR `888010LAK13622200010001` `2000000.00`.
  - domestic unused ⇒ DR holder `2000000.00` / CR 1362220001 `2000000.00`.
  - domestic overspent `2300000` (all fare) ⇒ DR fare `2300000.00` / CR 1362220001 `2000000.00`, CR holder `300000.00`.
  - overseas partly used `600.00` ⇒ DR `888010USD44052000010001` `600.00`, DR holder `400.00` / CR
    `888010USD13622200010001` `400.00`, CR `888010USD23618000010001` `600.00`; `needsClearing` true. Clearing with
    `rvsNo: 'SUS-1'` ⇒ DR `…23618000010001` `600.00` `SUS-1`, CR `…13622200010001` `600.00` `''`.
  - overseas overspent `1200.00` ⇒ DR fare `1200.00` / CR holding `1000.00`, CR holder `200.00`; no advance CR line in
    file 1; clearing `1000.00`.
  - overseas unused ⇒ `needsClearing` false; DR holder / CR 1362220001 `1000.00`.
  - border (USD, no holding) ⇒ like domestic in `USD`.
  - `settledAmountOf`: THB `3500.00` at `35.123456` ⇒ `99.65`; THB without rate ⇒ `cross_rate_required`; USD with a
    rate ⇒ `cross_rate_not_allowed`.
- [ ] **Step 2–4:** `pnpm vitest run test/settlement-calc.test.ts` (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(settlements): totals, case and upload lines`

### Task 4: Settlements module: tables, draft, lines, receipts

**Files:**
- Create: `apps/api/src/modules/settlements/module.ts`, `migrations.ts`, `procedures.ts`, `queries.ts`, `routes.ts`,
  `schema.ts`, `scope.ts`, `files.ts`
- Modify: `apps/api/src/modules/index.ts` (register after `paymentsModule`), `apps/api/src/shared/db.ts`,
  `apps/api/test/sources/hrm.fixtures.sql` (people below), create `apps/api/test/payment-fixtures.ts`
- Test: `apps/api/test/settlements.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 3; agreements `findAgreement`, `membersOf`, `findByNumber`, `caller`, `callerScope`;
  payments `livePaymentOf`, `findPayment`, `itemsOf`; `zoneOf`; `holidaysBetween`, `addWorkingDays`, `todayHrm`.
- Tables (migration `202611020200_settlements_create`):
  - `settlements` (standard columns): `agreement_id` FK, `payment_id` FK, `branch_code char(6)` (the agreement's),
    `zone_kind varchar(10)`, `currency char(3)`, `advance decimal(15,2)`, `holder_eid`, `filed_by_eid`, `case_kind`
    null, `total`, `remaining` (signed), `due_date DATE`, `leader_eid` null, `late_reason varchar(500)` null,
    `submitted_at`, `approved_at`, `exported_at`, `posted_at`, `core_ref varchar(50)`, `rvs_no varchar(30)`,
    `clearing_exported_at`, `cleared_at`, `clearing_core_ref varchar(50)`, `cancelled_at`; status check; generated
    `agreement_live = IF(status <> 'void', agreement_id, NULL)` stored, unique.
  - `settlement_lines`: `id`, `settlement_id` FK cascade, `sort_order`, `description varchar(300)`, `expense_type`
    null, `currency char(3)`, `amount`, `cross_rate decimal(15,6)` null, `settled_amount`, `receipt_file_id` null,
    `no_receipt_reason varchar(500)` null, `rate_proof_file_id` null; check (`receipt_file_id IS NOT NULL OR
    no_receipt_reason IS NOT NULL`).
  - Procedure `settlements_transition(id, version, to, core_ref, rvs_no, actor, at, request_id, history_id)`, built
    like `payments_transition`. Allowed moves: `draft→in_approval|void`, `in_approval→draft|approved|void`,
    `approved→exported|void`, `exported→posted|cancelled_after_export`,
    `posted→clearing_exported|cancelled_after_export`, `clearing_exported→cleared|cancelled_after_export`,
    `cleared→cancelled_after_export`. It stamps the matching `*_at`. `core_ref` goes to `core_ref` on `posted` and
    to `clearing_core_ref` on `cleared`. `rvs_no` is set on `posted`. Error `settlements.bad_transition` 409.
  - Permissions `settlement: ['read', 'export']`. Grants: `finance_officer` and `finance_section_head` get both /
    `settlement.read`; `management` gets `settlement.read`. New role `finance_department_head` (`settlement.read`,
    `payment.read`, `agreement.read`).
- Produces:
  - `scopedSettlements(ctx, c, qb)` / `maySeeSettlement(ctx, c, row)`: `callerScope(…, 'settlement.read')` on
    `s.branchCode`; `own` sees the settlements of agreements they are a member of.
  - `isMember(agreementId, eid): Promise<boolean>`.
  - Routes (tag `Settlements`):
    - `POST /settlements` `{ agreementId }`: caller is a member (else 404), the agreement `hasAdvance` (409
      `settlements.no_advance`), the advance paid. Copies advance, currency, zone kind, holder and branch; sets
      `filed_by_eid` = caller and `due_date`.
    - `GET /settlements`: `paginate`, filters `status`, `mine` (filed by me).
    - `GET /settlements/{id}`: header, lines, totals (`totalsOf`), files, `candidates` (`{ eid, name }[]` for step
      2), `isLate`.
    - `GET /settlements/lookup?number=`: REF or Doc.no ⇒ `{ agreementId, settlementId | null, canFile }`.
    - `PUT /settlements/{id}` `{ version, caseKind?, lines: LineInput & { description, receiptFileId?,
      noReceiptReason?, rateProofFileId? }[] }`: `draft` only (409 `settlements.not_draft`), any member. Replaces the
      lines and stores `total` / `remaining`. Field errors at `lines.<n>.<field>`.
  - `settlementFiles` (`defineFileEntity` type `settlement`, PDF only, 52,428,800 bytes): view = `maySeeSettlement`,
    attach = a member while `draft`. Middleware `keepReceipts()` refuses `DELETE /files/{id}` of a settlement file
    once it has left `draft` (409 `settlements.receipt_locked`), like `keepSignedCopies`.
  - Fixtures (`hrm.fixtures.sql`), all `888010` unless noted: `10100` finance officer, `10101` HR officer, `10102`
    leader (LAK and USD accounts), `10103` member and holder (LAK and USD), `10104` deputy, `10105` member who never
    signs in, `10106` finance section head, `10107` finance department head; `888020`: `10110` finance officer,
    `10111` member, `10112` office–IT section head (`finance_section_head`), `10113` branch management.
  - `test/payment-fixtures.ts`: `exportedPayment(platform, finance: TestClient, hr: TestClient, body): Promise<{
    agreement, payment }>`. It runs `approvedAgreement` (with `hasAdvance`), then `POST /payments` as `finance`, then
    under `SYSTEM_CONTEXT` `transition` to `in_approval` and `approved`, then `POST /payments/{id}/export`.
- [ ] **Step 1: Write the failing tests** (year `2033`):
  - `a member who is not the holder files it`: `10104` creates; `advance` and `currency` match the payment's
    advance item; `dueDate` is `2033-11-14` for `travelTo` `2033-11-04`.
  - `refuses`: no advance ⇒ 409 `settlements.no_advance`; payment not exported ⇒ 409 `settlements.advance_not_paid`;
    a second settlement ⇒ 409 `settlements.exists`; HR officer `10101`, not a member ⇒ 404.
  - `lines`: domestic fuel + fare with receipts ⇒ totals and case; a line with neither receipt nor reason ⇒ 422 at
    `lines.0.receiptFileId`; overseas THB line `3500.00` at `35.123456` with proof ⇒ `settledAmount` `99.65`; no
    proof ⇒ 422 at `lines.0.rateProofFileId`; a receipt id of another settlement ⇒ 422 `settlements.file_unknown`.
  - `receipts are PDF and stay`: PNG upload ⇒ refused by the files module; after submit (set `in_approval` under
    `SYSTEM_CONTEXT`), `DELETE /files/{id}` ⇒ 409 `settlements.receipt_locked`.
  - `scope`: `10110` (888020) gets 404 on the 888010 settlement and an empty list; `10100` sees it; `10102` (member)
    sees it in `GET /settlements`.
- [ ] **Step 2–4:** `RUN_DB_TESTS=1 pnpm vitest run test/settlements.test.ts` (FAIL), implement, PASS; `pnpm run
  openapi`, `cd apps/web && pnpm run api:types`, typecheck.
- [ ] **Step 5: Commit** — `feat(settlements): settlement draft with lines and PDF receipts`

### Task 5: Settlement approval chain

**Files:**
- Create: `apps/api/src/modules/settlements/approval.ts`, `apps/api/src/modules/settlements/workflow.json`
- Modify: `module.ts`, `routes.ts`
- Test: `apps/api/test/settlements-approval.test.ts`

**Interfaces:**
- `workflow.json`: key `settlement`, entityType `settlement`, `allowSelfApproval: false`, `rejectEndsRequest: true`,
  every step `completion: 'any'`. Stages in order:
  - `leader`, resolver `settlement.leader`, condition `{ "field": "hasLeaderStep", "op": "eq", "value": true }`.
  - `finance_officer`, resolver `settlement.finance_officer`.
  - `finance_section_head`, resolver `settlement.finance_section_head`.
  - `final`, resolver `settlement.final`.
- Resolvers: `settlement.leader` = `linkedUserId(facts.leaderEid)` as a list. `settlement.finance_officer` /
  `settlement.finance_section_head` = `branchRoleUsers('finance_officer' | 'finance_section_head', branchCode)`. At a
  branch, the office–IT officer and section head hold those roles (spec §12). `settlement.final` = head office ⇒
  `branchRoleUsers('finance_department_head', '888010')`, else `branchRoleUsers('management', branchCode)`.
- Produces:
  - `settlementApproval` entity (`type: 'settlement'`). Facts: `{ ref, total, branchCode, headOffice,
    hasLeaderStep, leaderEid }`. `fields` declare `hasLeaderStep` (boolean), `branchCode`, `headOffice`. `display`
    is `{ label: 'settlements.entity', icon: 'i-lucide-receipt', link: '/settlements/:id' }`. `onStatusChange`:
    - `pending`: `assertSubmittable(id)`, then `→in_approval`.
    - `approved`: `→approved`, then notify the branch's `finance_officer` users (`settlements.approved`).
    - `returned`, `rejected` or `cancelled`: `→draft`, then notify the filer (`settlements.returned`).
  - `assertSubmittable(id)`: at least one line, unless the case is `unused`. `caseKind` set and matching the
    totals. Every line valid (Task 4 rules). Late without `lateReason` refused.
  - `POST /settlements/{id}/submit` `{ version, leaderEid?, lateReason?, workflowId? }`: a member, `draft` only.
    Checks the step 2 rules of Global Constraints and stores `leader_eid` and `late_reason`, then runs
    `APPROVAL.submit('settlement', …)`, all in one transaction. Audit `settlements.submitted_late` when late.
  - Notification types `settlements.approved`, `settlements.returned`.
- [ ] **Step 1: Write the failing tests** (workflow from `settlements/workflow.json`; year `2034`; roles granted to
  the fixture people of Task 4):
  - `head office chain`: `10103` files and submits with `leaderEid: '10102'`. `10102` approves, then `10100`, then
    `10106`, then `10107` ⇒ `approved`, and `10100` is notified.
  - `branch chain`: an 888020 agreement with `10111` (filer and only leader, no deputy). Submit without `leaderEid`
    ⇒ the leader step is skipped. Approvals by `10110`, `10112`, `10113` ⇒ `approved`.
  - `step 2 refusals`: `leaderEid` `10101` ⇒ 422 `settlements.not_leader`. The filer's own EID ⇒ 422
    `settlements.own_eid`. Missing while candidates exist ⇒ 422 `settlements.leader_required`. `10105` (deputy, never
    signed in) ⇒ 422 `settlements.leader_no_account`. Each leaves the settlement `draft`.
  - `late`: `travelTo` `2034-01-02`, today later than due ⇒ submit without `lateReason` 422
    `settlements.late_reason_required`; with it, 200.
  - `case mismatch`: `caseKind: 'unused'` with a line ⇒ 422 `settlements.case_mismatch`.
  - `return goes back to draft`: return at step 3 ⇒ `draft`, `PUT` works again, and the filer is notified.
- [ ] **Step 2–4:** run (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(settlements): approval chain (leader or deputy, finance, final by branch)`

### Task 6: Export, posted with `RVS_NO`, clearing file

**Files:**
- Create: `apps/api/src/modules/settlements/batches.ts`
- Modify: `apps/api/src/modules/payments/migrations.ts` (new migration `202611020300_payments_batch_kinds`: check
  `ck_posting_batches_kind` takes `payment`, `settlement`, `clearing`), `payments/batches.ts` (`createBatch` kind
  type; export `placeLo` and `postingMember`), `payments/routes.ts` (`GET /posting-batches/{id}/file` answers 404
  for a kind other than `payment`), settlements `routes.ts`, `module.ts`
- Test: `apps/api/test/settlements-export.test.ts`

**Interfaces:**
- Consumes: Task 3 builders; `createBatch`, `findBatch`, `linesOf`, `placeLo`, `postingMember`, `xlsxWriter`,
  `paymentRemark`; `requireExport`-style check on `settlement.export`.
- Produces:
  - `POST /settlements/{id}/export` `{ version }`: `settlement.export` in scope, `approved` only, the caller has an
    HRM branch (422 `payments.no_branch`). Creates the `settlement` batch (file `<REF>-settlement.xlsx`), then
    `→exported`. Audit `settlements.exported`.
  - `POST /settlements/{id}/posted` `{ version, coreRef?: string (≤ 50), rvsNo?: string (1–30) }`: `exported` only.
    `rvsNo` is required when `needsClearing` (422 `settlements.rvs_no_required`) and refused otherwise (422
    `settlements.rvs_no_not_allowed`). Moves to `posted`. Audit `settlements.posted`.
  - `POST /settlements/{id}/clearing` `{ version }`: `settlement.export`, `posted` and `needsClearing` (else 409
    `settlements.no_clearing`). The `clearing` batch takes the batch branch of the settlement batch and the stored
    `rvs_no` (file `<REF>-clearing.xlsx`). Moves to `clearing_exported`. Audit `settlements.clearing_exported`.
  - `POST /settlements/{id}/clearing/posted` `{ version, coreRef? }`: moves to `cleared`. Audit `settlements.cleared`.
  - `GET /settlements/{id}/batches/{kind}/file` (`kind` `settlement` | `clearing`): `maySeeSettlement`, streams
    through `xlsxWriter`. Audit `settlements.downloaded`.
- [ ] **Step 1: Write the failing tests** (year `2035`; settlements approved under `SYSTEM_CONTEXT`):
  - `domestic`: export, then download. Read back with `exceljs`: DR `888010LAK44051000010001`, CR
    `888010LAK13622200010001`, `RVS_NO` column empty, DR sum = CR sum. `posted` with `coreRef` ⇒ `posted`. Clearing ⇒
    409 `settlements.no_clearing`. `posted` with an `rvsNo` on a fresh one ⇒ 422 `settlements.rvs_no_not_allowed`.
  - `overseas through holding`: partly used. File 1 has CR `888010USD23618000010001`. `posted` without `rvsNo` ⇒
    422. With `rvsNo: 'SUS-2035-1'` ⇒ `posted`. Clearing ⇒ `clearing_exported`. The clearing file has two lines,
    `RVS_NO` `SUS-2035-1` on the 2361800001 DR line. `clearing/posted` ⇒ `cleared`. A second clearing ⇒ 409.
  - `the payment route does not serve settlement files`: `GET /posting-batches/{settlementBatchId}/file` ⇒ 404.
  - `scope`: `10110` gets 404 on export and download of the 888010 settlement; HR officer `10101` gets 403 on export.
- [ ] **Step 2–4:** run (FAIL), implement, PASS; `pnpm run openapi`, web types, typecheck.
- [ ] **Step 5: Commit** — `feat(settlements): upload file, posted with RVS_NO, clearing file`

### Task 7: Cancel during or after settlement

**Files:**
- Modify: `apps/api/src/modules/settlements/batches.ts` (`cancelSettlementOf`), `module.ts` (`setup` registers the
  listener with `onAgreementCancelled`, through the module `ctx()` accessor, not the setup argument)
- Test: `apps/api/test/settlements-export.test.ts` (extend)

**Interfaces:**
- `cancelSettlementOf(agreementId, reason)`:
  - `draft`, `in_approval` or `approved` ⇒ `→void` first, then `APPROVAL.cancelForEntity('settlement', id)`.
  - `exported`, `posted`, `clearing_exported` or `cleared` ⇒ `→cancelled_after_export`, then stamp
    `cancelled_after_export_at` on the agreement's `settlement` and `clearing` batches, notify the branch's
    `finance_officer` users (`settlements.cancelled_after_export`, link `/settlements/:id`), and audit it.
  - Already `void` or `cancelled_after_export` ⇒ nothing.
- [ ] **Step 1: Write the failing tests:**
  - `cancel in approval voids it`: `void`, approval request cancelled, payment `cancelled_after_export` in the same
    cancel.
  - `cancel after clearing marks both batches`: `cancelled_after_export`, both batches stamped, `10100` notified,
    files still download.
  - `a listener error rolls the cancel back`: make the settlement listener throw (vitest spy) ⇒ cancel answers 500,
    agreement still `approved`, payment unchanged.
- [ ] **Step 2–4:** run (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(settlements): cancelled after export`

### Task 8: Overdue list

**Files:**
- Modify: settlements `routes.ts`, `queries.ts`
- Test: `apps/api/test/settlements.test.ts` (extend)

**Interfaces:**
- `GET /settlements/overdue`, for `settlement.read` holders in scope (`own` ⇒ 403). It lists agreements with an
  advance whose payment is `exported` or `posted`, whose settlement is missing or still `draft`, and whose due date
  (`addWorkingDays(travelTo, 5, holidays)`) is before `todayHrm()`. Rows `{ agreementId, ref, docNo, travelTo,
  dueDate, holderName, settlementId | null }`, sorted by `dueDate`. Built on `scopedAgreements` with
  `paginate`. The due-date filter runs on candidates with `travelTo ≤ today − 5 days`, then exactly in TypeScript
  on that page. Our call: such a page can come back short.
- [ ] **Step 1: Write the failing tests:** `lists overdue settlements`: an exported payment with `travelTo`
  `2033-01-03` and no settlement is listed for `10100`; a submitted one is not; `10110` does not see it; the member
  `10102` gets 403.
- [ ] **Step 2–4:** run (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(settlements): overdue list for Finance`

### Task 9: Web screens

**Files:**
- Create: `apps/web/app/composables/useSettlements.ts`, `apps/web/app/pages/settlements/index.vue`,
  `apps/web/app/pages/settlements/[id].vue`
- Modify: `apps/web/i18n/locales/app.en.json`, `app.lo.json` (keys `settlements.*`);
  `apps/web/app/pages/agreements/[id]/index.vue` (a member of an agreement with a paid advance: "Settlement" button,
  opens or creates it); settlements module `menus` (`/settlements`, group `workspace`, no permission: members use it)
- Pages:
  - `index.vue`: REF/Doc.no box ⇒ open, or "File settlement". Tabs "My settlements", "All" (`settlement.read`),
    "Overdue" (`settlement.read`), "Cancelled after export".
  - `[id].vue`: header (advance, currency, due date, a late badge). In `draft`, a lines table: description, expense
    type (domestic and border), currency, amount, cross rate, settled amount, a receipt upload per line or a "no
    receipt" reason, rate proof. Below it the totals, the remaining amount with its meaning (holder repays or is
    reimbursed), and the case select with the computed case beside it. The submit dialog has a leader or deputy
    select from `candidates` and a late reason when late. Lines without receipts are highlighted for Finance. Also:
    approval card, Export, Download, "Mark posted" with a CORE reference and a suspense number when
    `needsClearing`, "Clearing file", "Mark clearing posted", history.
- Interfaces: the Task 4–8 routes through `api.d.ts`; follow `pages/payments/*` and `usePayments.ts`. Receipts through
  the platform `Attachments` / `useUpload`. Confirmations through `useConfirm`.
- [ ] **Step 1: Implement** the pages and strings (every string in en and lo; amounts with thousands separators and
  the currency).
- [ ] **Step 2: Run** `pnpm run typecheck` and `RUN_DB_TESTS=1 pnpm vitest run test/web-locales.test.ts`: pass.
- [ ] **Step 3: Browser check** on `pnpm dev:api` + `pnpm dev:web`, en and lo. Domestic: file it with receipts,
  submit to the leader, run the chain in `/approvals`, export, open the file, mark posted. Overseas: the same, then
  the clearing file with `RVS_NO`.
- [ ] **Step 4: Commit** — `feat(web): settlement screens`

### Task 10: Docs

**Files:**
- Modify:
  - `HANDOFF.md`: plan 5 built, statuses, the clearing flow, the working answers still to confirm, the carry items
    for plan 6.
  - `docs/deploy-testing.md`, section "Settlement approval": create the `settlement` workflow from
    `apps/api/src/modules/settlements/workflow.json`; roles `finance_department_head` and `management`; branch
    office–IT staff get `finance_officer` / `finance_section_head`.
  - Spec v3 §17: assumptions for weekends in the deadline, the cross-rate rounding, `RVS_NO` typed at posted.
- [ ] **Step 1:** write them; `RUN_DB_TESTS=1 pnpm run test`, `pnpm run typecheck`, `cd apps/api && pnpm run
  openapi:verify` all pass.
- [ ] **Step 2: Commit** — `docs: HANDOFF after plan 5`

## Not in this plan

- Reminder notifications for due and overdue settlements, the dashboard, printable views, the transit form (plan 6).
- Plan 4's deferred minors (`HANDOFF.md` "Carry into plan 5"). They stay listed for a clean-up pass. Two are done
  here because this plan touches them: the cancel listener uses the module `ctx()` accessor (Task 7), and the
  `seed.ts` header is fixed (Task 2).
- The workflow set-up command (proposal C6): the `settlement` workflow is created by hand, like the others.
- Editing posting entries on screen.
- Finance confirming the plan 5 working answers (questions 5 and 8). A different answer is a change to the posting
  entries data and to Task 6's flow.
