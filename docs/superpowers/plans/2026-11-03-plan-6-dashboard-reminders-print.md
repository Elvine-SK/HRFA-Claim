# Plan 6 — Dashboard, settlement reminders, PDF forms, carried fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People see their work on the dashboard: documents waiting for them, agreements without a payment, overdue
settlements, settlements they still have to file. Members get in-app reminders before and after the settlement
deadline. The agreement (forms 1–4) and the settlement (forms 5–6) download as PDF files laid out like the paper
forms in `3. Format form HRM.xlsx`, with the signers filled in from the approval history. The real defects carried
from plans 4 and 5 are fixed.

**Architecture:** Reminders are a recurring job in `settlements` that writes one row per sent reminder
(`settlement_reminders`, unique per agreement, kind and date), so a rerun or a restart sends nothing twice. The
overdue list and the reminders share one exact SQL cutoff on `travelTo` computed from the holidays. Dashboard numbers
are `dashboardStats` of the `payments` and `settlements` modules, and the lists are app widgets on the web, gated by
`widget.<id>` permissions granted in a migration. PDFs are drawn on the API with `pdfkit` in a new module `print`:
pure "print model" builders per form (tested without a database), one renderer, and bundled Noto fonts.

**Tech Stack:** nelvine-platform 1.1.0 (Hono, Kysely, MariaDB 11.4, Nuxt 4 + Nuxt UI), `@elvine-sk/platform-jobs`
(`recurringJobs`), `-notifications`, `-dashboard` (`dashboardStats`, `dashboardWidgets`), `-approval` (tables read
for signers), `pdfkit` 0.17.2 (new, exact version), Noto Sans Lao and Noto Sans (SIL OFL 1.1), TypeScript, vitest,
pnpm.

**Spec:** [`docs/specs/2026-10-21-travel-payment-design-v3.md`](../../specs/2026-10-21-travel-payment-design-v3.md)
§10 (deadline, "the app reminds the members"), §13 (notifications: settlement due and overdue), §14 (dashboard,
printable views), §17 assumption 15, §18 step 6. Choices by the project owner on 2026-11-03: the transit form is left
out (plan 7, it waits for business question 13); printable views are **server PDF files**; reminders are "due, last
day, overdue, then every 5 working days"; the carried minors that change what a person gets are fixed, housekeeping
stays deferred. Carry items: `HANDOFF.md` "Carry into plan 6". Platform guides: `docs/platform/modules.md` ("Jobs",
"Dashboard stats and widgets"), `authorization.md`, `testing.md`, `web.md`.

## Global Constraints

- Everything in plans 2–5's Global Constraints still holds (module layout, `currentDb()`/`appDb()`, `inTransaction`,
  `writeHistory`, an access check per route, `BINARY(16)` UUIDs, en + lo strings, an HTTP test per route with a
  refusal, migration keys `YYYYMMDDHHmm_<module>_<change>`, `DATE` as `YYYY-MM-DD` strings, money through
  `travel-master/money.ts`, never floats). Never edit a migration that has run: add one.
- **Today** is `todayHrm()` everywhere (the deadline, the reminders, the overdue list). Working days are plan 5's:
  not Saturday, not Sunday, not a `tb_holiday` date with status `Y`.
- **Who is due:** an agreement with `hasAdvance`, a payment `exported` or `posted`, and no live settlement or a live
  one still `draft` (the `overdueRows` conditions of plan 5). `dueDate` = `addWorkingDays(travelTo, 5, holidays)`.
- **Reminder kinds and days** (per agreement):
  - `due`: today is after `travelTo` and before `dueDate`. Sent once.
  - `due_today`: today = `dueDate`. Sent once.
  - `overdue`: today > `dueDate`. Its occurrence date is the latest of `dueDate + 1, 6, 11, …` working days that is
    ≤ today. Sent once per occurrence date.
  - Only the kind and occurrence of today are sent; missed days are not caught up (a restart after a week sends one
    `overdue`, not five). Rows key on `(agreement_id, kind, occurrence)`; `due` and `due_today` use `dueDate` as the
    occurrence.
  - Recipients: the linked app users of all the agreement's members. A member who never signed in is skipped. No
    recipient ⇒ the row is still written (nothing to retry).
- **Job:** `settlements.reminders`, `recurringJobs` `every: '1h'`, `maxAttempts: 1`, runs as the system actor, one
  transaction per agreement. Returns `{ sent: number }`.
- **Dashboard widgets** (ids, `a-z0-9_`): `settlements_to_file` (my agreements due for a settlement, member view),
  `settlements_overdue` (Finance, branch scope as the overdue list), `agreements_without_payment` (Finance: agreements
  `approved` with no live payment, branch scope as the payments list). The platform's `approvals` widget is "documents
  waiting for me".
- **PDF:** A4 portrait, 40 pt margins, pdfkit 0.17.2. Lao text in Noto Sans Lao, everything else in Noto Sans:
  **Noto Sans Lao has no Latin letters, digits, `-` or `/`** (seen in the spike on 2026-11-03), so every string is
  split into runs by script before drawing. Lao run = code points U+0E80–U+0EFF plus combining marks that follow
  them; a space stays in the run it is inside. Dates `dd/mm/yyyy`; amounts `#,##0.00`; Doc.no in the Lao display
  form (`formatDocNo(d, 'lo')`). Labels are the sheet's bilingual labels, verbatim. A document before `approved`
  carries the header mark "ຮ່າງ / DRAFT".
- **Who may download a PDF:** exactly who may `GET` the record (`/agreements/{id}`, `/settlements/{id}`); everyone
  else gets 404, like the detail. Downloads are audited (`agreements.printed`, `settlements.printed`).
- New dependency: `pnpm --filter ./apps/api add pdfkit@0.17.2` and `add -D @types/pdfkit` (exact versions, as
  `exceljs` was in plan 4). The fonts are files under `apps/api/src/modules/print/fonts/` with `OFL.txt`, so the PM2
  bundle (which copies `src`) carries them.
- Errors are `AppError`s with codes `<module>.<key>`, en and lo text in the module's `messages`.

## Review Focus

1. **First run on a database with old trips.** Every old unsettled agreement gets one `overdue` notice, not one per
   missed day; a second run in the same hour sends nothing. Test in Task 2.
2. **Mixed scripts.** `ນາງ ສົມໃຈ - Doc 0001.BCEL.888010.2026 (LAK)` draws Lao in the Lao font and every Latin, digit
   and punctuation run in Noto Sans: no missing glyphs. Test `scriptRuns` in Task 5.
3. **Long forms.** 40 members, or 30 settlement lines with 300-character descriptions: the table breaks across pages
   with its header row repeated, and the signature block never splits across a page. Test in Tasks 6 and 7 (page
   count > 1, no throw).
4. **A holiday at the cutoff.** Return Friday 2033-11-04 with Monday 2033-11-07 a holiday: due 2033-11-14, `due_today`
   on 14, the first `overdue` on 15, the second on 22. The overdue list on 2033-11-14 does not show it; on 15 it does.
   Tests in Tasks 1 and 2.
5. **Another branch asks for a PDF.** A finance officer of 888050 asking for an 888010 agreement's PDF gets 404; a
   member of that agreement from 888050 gets the file. Tests in Tasks 6 and 7.

---

### Task 1: Exact overdue cutoff

**Files:**
- Modify: `apps/api/src/shared/dates.ts`, `apps/api/src/modules/settlements/queries.ts`, `routes.ts`
  (`GET /settlements/overdue`)
- Test: `apps/api/test/dates.test.ts` (extend), `apps/api/test/settlements.test.ts` (extend)

**Interfaces:**
- Produces:
  - `latestReturnFor(today: string, n: number, holidays: ReadonlySet<string>): string` in `shared/dates.ts` — the
    latest date `r` with `addWorkingDays(r, n, holidays) < today`. `addWorkingDays` is non-decreasing in its start
    date, so walk back from `today` one day at a time (at most `n` working days plus the weekends and holidays in
    between).
  - `overdueCutoff(today = todayHrm()): Promise<string>` in `settlements/queries.ts` — `latestReturnFor(today,
    DUE_WORKING_DAYS, holidays)` with one `holidaysBetween(today − 60 days, today)` call.
  - `overdueRows(cutoff)` is unchanged; `overdueOf` no longer filters (every row it gets is overdue) and takes the
    holidays set instead of reading them per row.
- [ ] **Step 1: Write the failing tests**

```ts
it('finds the latest overdue return date', () => {
  const h = new Set(['2033-11-07'])
  expect(latestReturnFor('2033-11-15', 5, h)).toBe('2033-11-04') // due 14 < 15
  expect(latestReturnFor('2033-11-14', 5, h)).toBe('2033-11-03') // 4 is due on 14, not overdue
})
```

  In `settlements.test.ts`: `the overdue list pages exactly` — with three overdue agreements and one not yet due,
  `GET /settlements/overdue?pageSize=2` answers 2 rows with `total` 3, and page 2 has 1 row.
- [ ] **Step 2–4:** `cd apps/api && RUN_DB_TESTS=1 pnpm vitest run test/dates.test.ts test/settlements.test.ts` (FAIL),
  implement, run again (PASS).
- [ ] **Step 5: Commit** — `fix(settlements): exact overdue cutoff, paged in SQL`

### Task 2: Settlement reminders

**Files:**
- Create: `apps/api/src/modules/settlements/reminders.ts`
- Modify: `settlements/migrations.ts` (new migration `202611030100_settlements_reminders`), `module.ts` (`jobs`,
  `recurringJobs`, `notificationTypes`, en + lo messages), `apps/api/src/shared/db.ts` (`SettlementRemindersTable`)
- Test: `apps/api/test/settlements-reminders.test.ts` (new; own EIDs and Doc.no year)

**Interfaces:**
- Table `settlement_reminders`: `id` BINARY(16) PK, `agreement_id` BINARY(16), `kind` `varchar(16)` (check `due`,
  `due_today`, `overdue`), `occurrence` DATE, `recipients` `smallint unsigned`, `sent_at` DATETIME; unique
  (`agreement_id`, `kind`, `occurrence`).
- Produces:
  - `reminderFor(today: string, travelTo: string, holidays: ReadonlySet<string>): { kind: ReminderKind; occurrence:
    string } | null` (pure; Global Constraints rules).
  - `sendReminders(today = todayHrm()): Promise<number>` — the due agreements (Global Constraints) with `travelTo <
    today`, one holidays read, `reminderFor` each, insert the row (skip on duplicate key), then notify
    `settlements.due` | `settlements.due_today` | `settlements.overdue` with `params: { ref, dueDate }`, `link`
    `/settlements/<id>` when a live draft exists, else `/agreements/<agreementId>`, `subject: { type: 'agreement',
    id }`. Returns the number of rows written.
  - Messages: `notify.settlements.due.title` "Settlement of {ref} is due by {dueDate}" / lo "ກະລຸນາສະສາງເງິນແຮ {ref}
    ພາຍໃນ {dueDate}"; `due_today` "Settlement of {ref} is due today" / "ມື້ນີ້ແມ່ນມື້ສຸດທ້າຍ ສະສາງເງິນແຮ {ref}";
    `overdue` "Settlement of {ref} is overdue since {dueDate}" / "ການສະສາງເງິນແຮ {ref} ກາຍກຳນົດແລ້ວ ແຕ່ {dueDate}";
    bodies "Open the agreement and file the settlement." / "ເປີດຂໍ້ຕົກລົງ ແລະ ສະສາງເງິນແຮ.".
- [ ] **Step 1: Write the failing tests**
  - `reminderFor` table (holiday 2033-11-07, return 2033-11-04): 2033-11-04 ⇒ null; 05 ⇒ `due`/`2033-11-14`; 14 ⇒
    `due_today`/`2033-11-14`; 15 ⇒ `overdue`/`2033-11-15`; 21 ⇒ `overdue`/`2033-11-15`; 22 ⇒ `overdue`/`2033-11-22`.
  - `sendReminders('2033-11-05')` writes one `due` row and notifies each linked member (count the notifications for a
    member's user); a second call returns 0.
  - `sendReminders('2034-02-01')` on an agreement returned 2033-11-04 writes one `overdue` row (Review Focus 1).
  - A submitted settlement (`in_approval`) ⇒ nothing sent. A member with no app account is skipped and the others get it.
  - The job is declared: `GET /api/v1/jobs` as an administrator lists `settlements.reminders` as recurring (or the
    module definition test, whichever the platform exposes; refusal: an employee gets 403 on the jobs route).
- [ ] **Step 2–4:** `RUN_DB_TESTS=1 pnpm vitest run test/settlements-reminders.test.ts` (FAIL), implement, PASS.
- [ ] **Step 5: Commit** — `feat(settlements): due, due-today and overdue reminders`

### Task 3: Dashboard numbers and lists (API)

**Files:**
- Modify: `apps/api/src/modules/payments/routes.ts` (`GET /payments/agreements-without-payment`), `payments/module.ts`,
  `settlements/routes.ts` (`GET /settlements/to-file`), `settlements/module.ts`, `settlements/migrations.ts` (new
  migration `202611030200_settlements_widget_grants`)
- Test: `apps/api/test/dashboard.test.ts` (new)

**Interfaces:**
- `GET /payments/agreements-without-payment` (permission `payment.read`, the payments list's branch scope): agreements
  `approved` with no live payment, paginated, items `{ id, ref, docNo, formType, travelFrom, travelTo, branchCode,
  approvedAt }`, oldest first.
- `GET /settlements/to-file` (any signed-in employee): the caller's agreements (as a member) that are due (Global
  Constraints), items `{ agreementId, ref, docNo, travelTo, dueDate, settlementId, isLate }`, earliest due first.
- `dashboardStats` (`dependsOn` gains `dashboard`):
  - `payments.agreements_without_payment` (`payment.read`, tone `warning`, icon `i-lucide-receipt`),
  - `settlements.overdue` (`settlement.export`, tone `danger`, icon `i-lucide-alarm-clock`),
  - `settlements.to_file` (no permission, tone `info`, icon `i-lucide-file-pen`).
  Each counts with the same query as its list.
- `dashboardWidgets`: `['agreements_without_payment']` on payments, `['settlements_overdue', 'settlements_to_file']` on
  settlements.
- Migration grants (idempotent: insert only missing `role_permissions` rows): `employee` ⇒ `widget.stats`,
  `widget.approvals`, `widget.settlements_to_file`; `finance_officer`, `finance_section_head`,
  `finance_department_head` ⇒ those plus `widget.agreements_without_payment`, `widget.settlements_overdue`; HR roles
  and `management` ⇒ `widget.stats`, `widget.approvals`.
- [ ] **Step 1: Write the failing tests:** each list answers its rows for an allowed caller and is empty or 403 for
  others (an employee on `/payments/agreements-without-payment` ⇒ 403; a finance officer of 888050 sees no 888010
  row); `GET /dashboard/stats` as a finance officer includes the three keys with the right counts; as a plain member
  only `settlements.to_file`. The grant migration leaves `widget.approvals` on `employee`.
- [ ] **Step 2–4:** `RUN_DB_TESTS=1 pnpm vitest run test/dashboard.test.ts` (FAIL), implement, PASS. Then
  `pnpm run openapi && cd ../web && pnpm run api:types`.
- [ ] **Step 5: Commit** — `feat: dashboard numbers and lists for Finance and members`

### Task 4: Dashboard widgets (web)

**Files:**
- Create: `apps/web/app/plugins/app-widgets.ts`, `apps/web/app/components/dashboard/AgreementsWithoutPaymentWidget.vue`,
  `SettlementsOverdueWidget.vue`, `SettlementsToFileWidget.vue`
- Modify: `apps/web/i18n/locales/app.en.json`, `app.lo.json` (`dashboard.widgets.<id>.title|description|empty`,
  stat labels `payments.stats.withoutPayment`, `settlements.stats.overdue`, `settlements.stats.toFile`)

**Interfaces:**
- Each widget registers with `useWidgetRegistry().register({ id, title, description, icon, sizes: ['s','m','l'],
  defaultSize: 'm', order: 50–70, module, permission, component })`, draws in `PlatformDashboardWidgetFrame`, shows
  up to 5 rows (`s`: 3) with a link to the full list (`/settlements?view=overdue`, `/payments`, `/settlements`), and
  an empty state.
- [ ] **Step 1:** `pnpm run typecheck` passes; `cd apps/web && pnpm run build` passes.
- [ ] **Step 2:** In the browser (if the dev stack runs): the finance officer's dashboard shows the three new widgets
  after "Customise"; an employee sees only "To file". If the stack cannot run, say so in the ledger.
- [ ] **Step 3: Commit** — `feat(web): dashboard widgets`

### Task 5: PDF renderer and fonts

**Files:**
- Create: `apps/api/src/modules/print/pdf.ts`, `print/fonts/NotoSansLao-Regular.ttf`, `NotoSansLao-Bold.ttf`,
  `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf`, `print/fonts/OFL.txt` (from
  `github.com/notofonts/notofonts.github.io`, `fonts/<family>/hinted/ttf/`)
- Modify: `apps/api/package.json` (through `pnpm add`, Global Constraints)
- Test: `apps/api/test/pdf.test.ts` (unit, no database)

**Interfaces:**
- `scriptRuns(text: string): { lao: boolean; text: string }[]` — Global Constraints rule; joining the runs gives the
  input back.
- `type Block` = `{ kind: 'title'; text } | { kind: 'fields'; rows: [label: string, value: string][] } | { kind:
  'checks'; label: string; options: { text: string; checked: boolean }[] } | { kind: 'table'; columns: { header:
  string; width: number; align?: 'left' | 'right' }[]; rows: string[][]; footer?: string[][] } | { kind: 'signatures';
  boxes: { role: string; name: string; date: string }[] } | { kind: 'note'; text }`.
- `interface PrintModel { title: string; draft: boolean; date: string; blocks: Block[] }`.
- `renderPdf(model: PrintModel): Promise<Uint8Array>` — draws blocks top to bottom; a table repeats its header on each
  new page; a `signatures` block moves whole to the next page when it does not fit; text through `scriptRuns` with
  the two font families; footer "page n / m".
- [ ] **Step 1: Write the failing tests**

```ts
it('splits text by script', () => {
  expect(scriptRuns('ນາງ ສົມໃຈ - 0001.BCEL (LAK)')).toEqual([
    { lao: true, text: 'ນາງ ສົມໃຈ' },
    { lao: false, text: ' - 0001.BCEL (LAK)' },
  ])
  expect(scriptRuns('ເງິນແຮ/ADV').map((r) => r.text).join('')).toBe('ເງິນແຮ/ADV')
})
it('renders a PDF over several pages', async () => {
  const rows = Array.from({ length: 60 }, (_, i) => [String(i + 1), 'ຄ່າເດີນທາງ '.repeat(20), '1,000.00'])
  const pdf = await renderPdf({ title: 'ໃບສະຫຼຸບເງິນແຮເດີນທາງ', draft: true, date: '03/11/2026', blocks: [
    { kind: 'table', columns: [{ header: 'No.', width: 40 }, { header: 'ລາຍການ', width: 360 }, { header: 'Amount', width: 115, align: 'right' }], rows },
    { kind: 'signatures', boxes: [{ role: 'ຜູ້ກວດສອບ', name: 'A', date: '03/11/2026' }] },
  ] })
  expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe('%PDF-')
  expect(pageCount(pdf)).toBeGreaterThan(1) // count `/Type /Page` objects; test helper
})
```

- [ ] **Step 2–4:** `pnpm vitest run test/pdf.test.ts` (FAIL), implement, PASS. Open one rendered file (write it to
  the scratchpad) and look at it: Lao marks sit on their bases, no empty boxes.
- [ ] **Step 5: Commit** — `feat(print): PDF renderer with Lao and Latin fonts`

### Task 6: Signers and the agreement PDF (forms 1–4)

**Files:**
- Create: `apps/api/src/modules/print/signers.ts`, `print/agreement.ts`
- Modify: `apps/api/src/modules/agreements/routes.ts` (`GET /agreements/{id}/pdf`), `agreements/module.ts` (audit
  action, `dependsOn` unchanged: `print` is a folder of plain functions, not a module), web
  `apps/web/app/pages/agreements/[id]/index.vue` ("PDF" button), locales
- Test: `apps/api/test/print-agreement.test.ts` (new)

**Interfaces:**
- `signersOf(entityType: string, entityId: string): Promise<{ submittedBy: Signer | null; steps: Record<string,
  Signer> }>` with `Signer = { name: string; date: string /* dd/mm/yyyy */ }` — the latest `approved` request of the
  entity: `submitted_by`/`submitted_at`, and per `step_key` its `approved` assignment of that round (`user_id`,
  `decided_at`). Name = the HRM employee linked to the user (`employeeOfUser`, Lao name), else the user's display name.
  Read with SQL on `approval_requests`, `approval_steps`, `approval_assignments`, like plan 5's requester check.
- `agreementPrintModel(input: { agreement: ReturnType<typeof toAgreement>; placeLo: string; signers }): PrintModel`
  (pure) — sheet `1.ພາຍໃນ update` for `domestic` and `district`, `3.ຕ່າງປະເທດ` for `overseas`, `4.ຊາຍແດນ` for `border`:
  title "ຂໍ້ຕົກລົງ ຫຼື ແຈ້ງການ"; fields Subject (with the form kind ticked and the place), Doc No., Date, Reference,
  Title, Travel Details (From/To, days), Policy Details; members table No., User ID, Full Name, Position, Department,
  Code Rank, Account Number, departure, return, days (the last three on forms 1, 2 and 4; overseas has the header's
  days instead), Advance Holder; Attach File checks; signatures Approved By (the last approved stage of
  `management`, `department_head`, `section_head`), Checked By (`section_head`), Prepared By (submitter). `draft` =
  status before `approved`.
- `GET /agreements/{id}/pdf` — 200 `application/pdf`, `content-disposition: attachment; filename="<REF>.pdf"`; 404
  like the detail.
- [ ] **Step 1: Write the failing tests:** model of a domestic agreement with 2 members: the members table has 2 rows
  with `dd/mm/yyyy` dates and the holder marked; Doc.no in the Lao form; `draft` true for `draft`, false for
  `approved`. Model with 40 members renders (Review Focus 3). HTTP: the creator gets 200 and `%PDF-`; a finance
  officer of 888050 on an 888010 agreement gets 404; a member from 888050 gets 200 (Review Focus 5). An approved
  agreement's model names the approvers from the workflow run of the fixtures.
- [ ] **Step 2–4:** `RUN_DB_TESTS=1 pnpm vitest run test/print-agreement.test.ts` (FAIL), implement, PASS; openapi and
  web types again.
- [ ] **Step 5: Commit** — `feat(print): agreement PDF (forms 1–4)`

### Task 7: The settlement PDF (forms 5–6)

**Files:**
- Create: `apps/api/src/modules/print/settlement.ts`
- Modify: `settlements/routes.ts` (`GET /settlements/{id}/pdf`), `settlements/module.ts` (audit action),
  `apps/web/app/pages/settlements/[id].vue` ("PDF" button), locales
- Test: `apps/api/test/print-settlement.test.ts` (new)

**Interfaces:**
- `settlementPrintModel(input: { settlement: Awaited<ReturnType<typeof loadSettlement>>; agreement; placeLo; signers
  }): PrintModel` (pure) — sheet `5.ເງິນແຮພາຍໃນ` (domestic, border) or `6.ເງິນແຮຕ່າງປະເທດ` (overseas): title
  "ໃບສະຫຼຸບເງິນແຮເດີນທາງ"; Advance Status checks (the four cases, the settlement's `caseKind` ticked); Doc No.;
  Advance Holder (and department on form 6); travel place; Travel Period and days; Advance Amount Received; lines
  table No., Expense Description, Amount (form 5: settlement currency; form 6: Amount, Cross Rate, Amount (USD)); footer
  rows Total Expenses and Remaining / Balance Due; on form 6 a Note with the late reason when there is one; signatures
  ຄະນະເດີນທາງ (`leader` step, or the filer when step 2 was skipped), ຜູ້ສະຫຼຸບ (submitter), ພະແນກຫ້ອງການບໍລິຫານ-ການເງິນ
  (`final`), ຂະແໜງການເງິນ (`finance_section_head`), ຜູ້ກວດສອບ (`finance_officer`).
- `GET /settlements/{id}/pdf` — as Task 6, filename `<REF>-settlement.pdf`.
- [ ] **Step 1: Write the failing tests:** domestic partly used: `partly_used` ticked, footer total and remaining match
  `totals`; overseas THB line: the cross rate column shows `35.123456` and USD `99.65`; 30 lines of 300 characters
  render on more than one page. HTTP: a member gets 200; an employee who is not a member and not Finance of the branch
  gets 404.
- [ ] **Step 2–4:** `RUN_DB_TESTS=1 pnpm vitest run test/print-settlement.test.ts` (FAIL), implement, PASS; openapi and
  web types.
- [ ] **Step 5: Commit** — `feat(print): settlement PDF (forms 5–6)`

### Task 8: Carried fixes

Only the carried items that change what a person gets. Each starts with its failing test.

**Files:**
- Modify: `apps/api/src/modules/payments/posting.ts`, `payments/batches.ts`, `settlements/posting.ts`,
  `settlements/routes.ts`, `apps/web/app/pages/settlements/[id].vue`, `apps/web/app/pages/payments/[id].vue` (or the
  lookup page that shows "no payment")
- Test: `apps/api/test/payment-calc.test.ts` (or the posting test file of plan 4), `settlement-calc.test.ts`,
  `settlements.test.ts`, `payments.test.ts`

**Fixes:**
1. `paymentRemark` leaves out empty parts: no double space (`leaderName: ''` ⇒ `D 3 ແຂວງ...`, single spaces).
2. A GL entry with a null `gl` or `seq`, or no `glNameEn`, ⇒ 422 `posting.entry_invalid` naming the component, in
   both `buildPaymentLines` and `buildSettlementLines`/`buildClearingLines`, instead of a malformed account string.
3. A negative GL or member total ⇒ `posting.entry_invalid` (not `amount_too_large`).
4. A payment whose lines net to zero for every currency cannot be exported: 409 `payments.nothing_to_pay` (en + lo).
5. `PUT /settlements/{id}` and `POST /settlements/{id}/submit` by someone who may read the settlement but is not a
   member ⇒ 403 `settlements.not_member` (today 404).
6. Web: the submit modal shows its errors inside the modal; settlement editor lines get a stable client key (a
   counter) instead of the index; the payments lookup's "no payment" answer is an info message, not an error.
- [ ] **Step 1:** write the tests for 1–5 (FAIL). **Step 2:** fix. **Step 3:** full suite `RUN_DB_TESTS=1 pnpm run
  test` and `pnpm run typecheck` (PASS).
- [ ] **Step 4: Commit** — `fix: carried defects from plans 4 and 5`

### Task 9: Docs

**Files:**
- Modify: `HANDOFF.md` (plan 6 row Done, what plan 6 built, test count, "Carry into plan 7": the transit form, the
  housekeeping minors still open, the deferred minors of this plan), `docs/specs/2026-10-21-travel-payment-design-v3.md`
  (§17 assumptions 19 "reminders: due, due today, overdue then every 5 working days, members only" and 20 "printable
  views are PDF files drawn by the API with Noto fonts"; §18 step 6 Done except the transit form),
  `docs/deploy-testing.md` (the widget grants, the reminder job, the fonts in the bundle).
- [ ] **Step 1:** `RUN_DB_TESTS=1 pnpm run test`, `pnpm run typecheck`, `pnpm run openapi:verify` all pass; bundle
  check: `tooling/deploy/bundle.sh` output contains `apps/api/src/modules/print/fonts/NotoSansLao-Regular.ttf`.
- [ ] **Step 2: Commit** — `docs: HANDOFF and spec after plan 6`
