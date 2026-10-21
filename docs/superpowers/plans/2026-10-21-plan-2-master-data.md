# Plan 2 — Master data with seed, and deployment to the testing server

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The reference data every later calculation reads (ranks, PostType map, zones, countries, border routes,
effective-dated rates, flat rates, advance bands, GL accounts), seeded from the business's files, with lookup
functions for plans 3–5, administrator screens, and a build that runs under PM2 on the testing server.

**Architecture:** One new API module `travel-master` with its own tables in the app database. Read routes are open
to every signed-in user (reference data); writes need `travel_master.manage`. Rates, flat rates and advance bands
are effective-dated sets: a set is published whole with an `effectiveFrom` date, and a set that is already in
effect is never changed or deleted, so past calculations stay reproducible. Amounts are decimal strings handled by
a small money helper (no floats). Web pages under `/master/*`. Deployment is a bundle built on a developer machine.

**Tech Stack:** nelvine-platform 1.0.0 (Hono, Kysely, MariaDB 11.4, Nuxt 4 + Nuxt UI), TypeScript, vitest, pnpm,
Node.js ≥ 22.12, PM2.

**Spec:** [`docs/specs/2026-10-21-travel-payment-design-v3.md`](../../specs/2026-10-21-travel-payment-design-v3.md)
sections 5 (rank map), 7, 14 (master data screens), 15 (build step 2 of §18). Platform guides:
`docs/platform/modules.md`, `authorization.md`, `testing.md`, `web.md`, `deployment.md` ("PM2").

Plan 1 is done ([plan 1](2026-10-20-plan-1-foundation.md)). The posting entries of spec §7/§11 are **not** in
this plan: plan 4 is their first user and many of their open questions (spec §17) are about them.

## Global Constraints

- Follow `AGENTS.md`: module in `apps/api/src/modules/travel-master/`, registered in `modules/index.ts`; query
  with `currentDb()`, write in `inTransaction`, `writeHistory` for record changes; every route checks access;
  UUID columns `BINARY(16)` named `id`/`*_id`/`*_by`; every UI string in en and lo (`app.en.json`, `app.lo.json`);
  a test through the HTTP API per route including a refusal; never edit a migration that has run.
- Migration keys `YYYYMMDDHHmm_travel-master_<change>`.
- Money: `DECIMAL(15,2)` columns; the API sends and takes amounts as strings matching `^\d{1,13}(\.\d{1,2})?$`
  and returns them with exactly two decimals (`"150000.00"`). Never `Number()` an amount.
- Dates: `DATE` columns, `YYYY-MM-DD` strings (the platform pool returns `DATE` as a string).
- Currency by zone: `D` and `OB1` LAK; `OA1`, `OA2`, `OE1`, `OE2` USD. Domestic advance bands LAK, group-size
  bands USD; same-day rate and fuel price LAK.
- Seed sets take effect from `2026-01-01` (the 2026 regulation).
- Errors are `AppError`s with codes `travel_master.<key>` and en/lo texts in the module's `messages`.
- Laos (`LA`) is not a country row: a trip inside Laos is a domestic or border form.

## Review Focus

1. **A set already in effect is edited or deleted.** Publishing over, or deleting, a set whose `effectiveFrom` is
   today or earlier must answer `409 travel_master.set_in_effect`, and the stored rows must be unchanged. Test in
   Task 4.
2. **Lookup on the boundary day.** On the day a new set takes effect the new values apply; the day before, the
   old ones; before the first set, `null`. Test in Task 2 (functions) and Task 4 (through a published set).
3. **Advance bands with a gap or an overlap** (`1–2, 4–5`, `1–3, 3–5`, no open-ended last band, first band not
   starting at 1) are refused with `422 travel_master.bands_invalid`. Test in Task 4.
4. **A PostType without a mapping** returns `null` from `rankForPostType`, never a default rank. Test in Task 2.
5. **Country search in Lao and English** by first letters finds `ຝຣັ່ງ` and `France` alike, and a stale
   `version` on a country edit answers `409`. Test in Task 3.

---

### Task 1: Money helper

**Files:**
- Create: `apps/api/src/modules/travel-master/money.ts`
- Test: `apps/api/test/money.test.ts` (plain unit test, no database)

**Interfaces:**
- Produces (exported from `money.ts`):
  - `type Amount = string`
  - `AMOUNT_PATTERN: RegExp` = `/^\d{1,13}(\.\d{1,2})?$/`
  - `toCents(a: Amount): bigint` — throws `TypeError` on input not matching `AMOUNT_PATTERN`
  - `fromCents(c: bigint): Amount` — always two decimals
  - `addAmounts(...a: Amount[]): Amount`
  - `mulAmount(a: Amount, n: number): Amount` — `n` a non-negative integer, else `TypeError`
  - `divCeilWhole(a: Amount, d: number): Amount` — `a ÷ d` rounded **up** to a whole unit (spec §9, ກ9 item 2)
  - `compareAmounts(a: Amount, b: Amount): -1 | 0 | 1`

- [ ] **Step 1: Write the failing test**

```ts
it('formats with two decimals', () => {
  expect(fromCents(toCents('150000'))).toBe('150000.00')
  expect(addAmounts('0.10', '0.20', '1')).toBe('1.30')
})
it('divides by 3 and rounds up to a whole unit', () => {
  expect(divCeilWhole('100', 3)).toBe('34.00')
  expect(divCeilWhole('310000', 3)).toBe('103334.00')
  expect(divCeilWhole('90', 3)).toBe('30.00')
  expect(divCeilWhole('100.01', 1)).toBe('101.00')
})
it('multiplies by a whole count', () => {
  expect(mulAmount('280000', 4)).toBe('1120000.00')
  expect(() => mulAmount('1', 1.5)).toThrow(TypeError)
})
it('refuses what is not an amount', () => {
  for (const bad of ['-1', '1.234', '1e3', '', ' 1', '12345678901234']) expect(() => toCents(bad)).toThrow(TypeError)
})
it('compares', () => expect([compareAmounts('2', '10'), compareAmounts('10.00', '10'), compareAmounts('3', '2')]).toEqual([-1, 0, 1]))
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd apps/api && pnpm vitest run test/money.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `money.ts`** with `bigint` cents throughout.

- [ ] **Step 4: Run it to make sure it passes** — Step 2 command, PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/travel-master/money.ts apps/api/test/money.test.ts
git commit -m "feat(travel-master): decimal money helper"
```

### Task 2: `travel-master` tables, seed and lookups

**Files:**
- Create: `apps/api/src/modules/travel-master/module.ts`, `migrations.ts`, `seed.ts` (seed data as constants),
  `countries.ts` (country seed list), `lookups.ts`
- Modify: `apps/api/src/modules/index.ts` (add `travelMasterModule` after `authHrmModule`)
- Test: `apps/api/test/travel-master.test.ts`

**Interfaces:**
- Consumes: `Amount` (Task 1).
- Produces:
  - Tables (all `createTable`, InnoDB):
    - `travel_ranks (code varchar(2) PK, name_lo, name_en, sort_order int)` — `P1`…`P9`, read-only.
    - `travel_rank_map (withStandardColumns, post_type int unique not null, rank_code varchar(2) not null FK)`.
    - `travel_zones (code varchar(4) PK, kind in ('domestic','border','overseas'), currency char(3), name_lo, name_en, sort_order)`.
    - `travel_countries (withStandardColumns, iso2 char(2) unique, name_lo, name_en, zone_code FK)`.
    - `travel_border_routes (withStandardColumns, name_lo, name_en, active tinyint(1) default 1)`.
    - `travel_rates (id uuid PK, zone_code, rank_code, effective_from date, daily, accommodation decimal(15,2) not null, personal decimal(15,2) null, created_at, created_by)`, unique `(zone_code, rank_code, effective_from)`.
    - `travel_flat_rates (id, key in ('same_day','fuel_price','km_per_litre'), effective_from date, amount decimal(15,2), created_at, created_by)`, unique `(key, effective_from)`.
    - `travel_advance_bands (id, kind in ('domestic_days','group_size'), effective_from date, min_count int, max_count int null, amount decimal(15,2), created_at, created_by)`, unique `(kind, effective_from, min_count)`.
    - `travel_gl_accounts (gl char(10), seq char(4), name_en, name_lo, PK (gl, seq))`.
  - `lookups.ts`:
    - `type RankCode = 'P1' | … | 'P9'`, `type ZoneCode = 'D' | 'OB1' | 'OA1' | 'OA2' | 'OE1' | 'OE2'`
    - `rankForPostType(postType: number): Promise<RankCode | null>`
    - `zoneOf(code: ZoneCode): Promise<{ code; kind; currency: 'LAK' | 'USD'; nameLo; nameEn }>`
    - `countryByIso2(iso2: string): Promise<{ iso2; nameLo; nameEn; zoneCode: ZoneCode } | null>`
    - `rateOn(zone: ZoneCode, rank: RankCode, on: string): Promise<{ daily: Amount; accommodation: Amount; personal: Amount | null; currency: 'LAK' | 'USD'; effectiveFrom: string } | null>`
    - `flatRateOn(key: 'same_day' | 'fuel_price' | 'km_per_litre', on: string): Promise<{ amount: Amount; effectiveFrom: string } | null>`
    - `advanceOn(kind: 'domestic_days' | 'group_size', count: number, on: string): Promise<{ amount: Amount; currency: 'LAK' | 'USD'; effectiveFrom: string } | null>`
    - Each "On" function uses the set with the greatest `effective_from <= on`.

Seed (migration `202610220110_travel-master_seed`, values in `seed.ts`):

- Ranks `P1`…`P9`, names from the code file's `position code` sheet (P1 ຜູ້ອຳນວຍການ / Director … P9
  ພະນັກງານວິຊາການເອກລົງມາ / Officer and below).
- Rank map: one row, PostType `7` → `P3` (spec §5). The rest waits for ຂ1.
- Zones: `D` ພາຍໃນປະເທດ, `OB1` ເຂດຊາຍແດນ, `OA1`/`OA2` ອາຊີ-ປາຊີຟິກ ກຸ່ມ 1/2, `OE1`/`OE2` ເອີຣົບ ກຸ່ມ 1/2.
- Rates, from `2. ກຳນົດ code and data.xlsx` (2026-10-16), daily / accommodation / personal per rank P1…P9
  (`P5,P6` and `P7,P8` rows of the file apply to both ranks):

  | Zone | P1 | P2 | P3 | P4 | P5 | P6 | P7 | P8 | P9 |
  | ---- | -- | -- | -- | -- | -- | -- | -- | -- | -- |
  | D    | 310000/600000 | 290000/560000 | 280000/550000 | 280000/540000 | 270000/500000 | 270000/500000 | 260000/500000 | 260000/500000 | 250000/450000 |
  | OB1  | same as D | | | | | | | | |
  | OA1  | 160/290/280 | 150/280/260 | 140/270/240 | 130/260/220 | 120/250/200 | 120/250/200 | 110/240/180 | 110/240/180 | 100/230/160 |
  | OA2  | 140/240/240 | 130/230/220 | 120/220/200 | 110/210/180 | 100/200/160 | 100/200/160 | 90/190/140 | 90/190/140 | 80/180/120 |
  | OE1  | 180/430/320 | 160/380/300 | 140/300/280 | 140/280/260 | 120/260/240 | 120/260/240 | 120/250/220 | 120/250/220 | 100/240/200 |
  | OE2  | 160/330/300 | 150/310/280 | 140/290/260 | 130/270/240 | 120/250/220 | 120/250/220 | 110/230/200 | 110/230/200 | 100/220/180 |

- Flat rates: `same_day` 150000, `km_per_litre` 7. No `fuel_price` (an administrator enters the current price).
- Advance bands: `domestic_days` 1–2 2000000, 3–5 3500000, 6–10 5000000, 11–∞ 7000000 (spec ກ4);
  `group_size` 1–1 1000, 2–5 1500, 6–10 2000, 11–∞ 2500.
- Border routes: ນະຄອນຫຼວງວຽງຈັນ – ໜອງຄາຍ – ອຸດອນ / Vientiane Capital – Nong Khai – Udon Thani;
  ຫົວພັນ – ແທ່ງຫົວ / Houaphanh – Thanh Hoa; ສະຫວັນນະເຂດ – ມຸກດາຫານ / Savannakhet – Mukdahan;
  ຫຼວງນ້ຳທາ – ບໍ່ຫານ / Luang Namtha – Boten.
- GL accounts, all SEQ `0001`, names from the FA-M `GL` sheet: 1362220001 Allow.Bcel.Staf / ບັນຊີລ່ວງໜ້າເງິນແຮພະນັກງານໄປເຮັດວຽກຕ່າງແຂວງ, ຕ່າງປະເທດ;
  2361800001 Admin.external BCEL / ບັນຊີລໍຖ້າຈ່າຍໃຫ້ຜູ້ສະໜອງພາຍນອກຂອງຫ້ອງການ (ທຄຕລ); 4405100001 Expense on Fuel /
  ລາຍຈ່າຍຄ່ານ້ຳມັນເຊື້ອໄຟ; 4405200001 Expense on Official Trip (AirPlane or Car ticket) / ລາຍຈ່າຍຄ່າໂດຍສານ (ປີ້ຍົນ, ປີ້ລົດ);
  4408720001 Exp.to daily meals on travels to other Provinces, foreign and Guest / ຈ່າຍອັດຕາກິນພະນັກງານໄປວຽກຕ່າງແຂວງ, ຕ່າງປະເທດ ແລະ ແຂກມາເຮັດວຽກ ທຄຕລ ຮັບຜິດຊອບ;
  4408730001 Expense on Accomodati / ຄ່າພັກເຊົາພະນັກງານໄປວຽກຕ່າງແຂວງ, ຕ່າງປະເທດ ແລະ ແຂກມາເຮັດວຽກ ທຄຕລ ຮັບຜິດຊອບ;
  4408600002 Expense on Oversea Meeting and Seminar / ຄ່າໃຊ້ຈ່າຍເຂົ້າໃນກອງປະຊຸມ ແລະ ສຳມະນາຢູ່ຕ່າງປະເທດ.
- Countries (`countries.ts`): every ISO 3166-1 country except `LA`, plus `HK` and `MO`, each with English and Lao
  name. Zones (regulation article 4, spec §7):
  - `OA1`: IQ, IL, KZ, KW, LB, JP, KR, SG, AU, QA, SA, AE, HK, NZ, BN.
  - `OE1`: BE, FR, RU, CH, GB, NL, ES, GR, NO; every country of North, Central and South America and the
    Caribbean; every country of Africa.
  - `OE2`: every other country of Europe (the regulation names AT, BY, BG, CY, CZ, DK, EE, FI, HU, LV, LT, LU, MT,
    MC, PL, PT, RO, SK, SI, UA, DE, SE; Italy is `OE2` until spec §17 question 2 is answered).
  - `OA2`: every other country of Asia, the Middle East and Oceania (the regulation names BD, IR, NP, PK, LK, TL,
    TR, CN, ID, MY, PH, MN, IN, KP, KH, TH, MM, VN).
  - Lao names: the regulation's spelling for the countries it names (France `ຝຣັ່ງ`), corrected only for clear
    typos (ໂອສຕຣິດ for Austria); the usual Lao names for the others. An administrator can correct names later.

- [ ] **Step 1: Write the failing tests** (DB tests, `describe.skipIf(!dbTestsEnabled)`, functions run inside
  `runWithContext(SYSTEM_CONTEXT, …)` after `bootApp()` from `test/helpers.ts`)

```ts
it('maps PostType 7 to P3 and nothing else yet', async () => {
  expect(await rankForPostType(7)).toBe('P3')
  expect(await rankForPostType(3)).toBeNull()
})
it('seeds the rates of the code file', async () => {
  expect(await rateOn('OE1', 'P1', '2026-10-21')).toMatchObject({ daily: '180.00', accommodation: '430.00', personal: '320.00', currency: 'USD' })
  expect(await rateOn('OA2', 'P9', '2026-10-21')).toMatchObject({ daily: '80.00', accommodation: '180.00', personal: '120.00' })
  expect(await rateOn('OB1', 'P6', '2026-10-21')).toMatchObject({ daily: '270000.00', accommodation: '500000.00', personal: null, currency: 'LAK' })
  expect(await rateOn('D', 'P1', '2025-12-31')).toBeNull()
})
it('puts countries in the regulation zones', async () => {
  const zones = Object.fromEntries(await Promise.all(['RO', 'NL', 'GB', 'BR', 'NG', 'TR', 'JP', 'IT', 'US'].map(async (c) => [c, (await countryByIso2(c))?.zoneCode])))
  expect(zones).toEqual({ RO: 'OE2', NL: 'OE1', GB: 'OE1', BR: 'OE1', NG: 'OE1', TR: 'OA2', JP: 'OA1', IT: 'OE2', US: 'OE1' })
  expect(await countryByIso2('LA')).toBeNull()
})
it('finds advance bands at their boundaries', async () => {
  const d = (n: number) => advanceOn('domestic_days', n, '2026-10-21').then((r) => r?.amount)
  expect(await Promise.all([1, 2, 3, 5, 6, 10, 11, 40].map(d))).toEqual(['2000000.00', '2000000.00', '3500000.00', '3500000.00', '5000000.00', '5000000.00', '7000000.00', '7000000.00'])
  const g = (n: number) => advanceOn('group_size', n, '2026-10-21').then((r) => r?.amount)
  expect(await Promise.all([1, 2, 5, 6, 10, 11].map(g))).toEqual(['1000.00', '1500.00', '1500.00', '2000.00', '2000.00', '2500.00'])
  expect(await advanceOn('group_size', 0, '2026-10-21')).toBeNull()
})
it('has the flat rates and seven GL accounts', async () => {
  expect((await flatRateOn('same_day', '2026-10-21'))?.amount).toBe('150000.00')
  expect((await flatRateOn('km_per_litre', '2026-10-21'))?.amount).toBe('7.00')
  expect(await flatRateOn('fuel_price', '2026-10-21')).toBeNull()
})
it('takes the newer set from its first day', async () => {
  // insert an OE2/P1 row effective 2026-12-01 with daily 170 directly, then:
  expect((await rateOn('OE2', 'P1', '2026-11-30'))?.daily).toBe('160.00')
  expect((await rateOn('OE2', 'P1', '2026-12-01'))?.daily).toBe('170.00')
})
```

The last test inserts its own row in zone `OE2`, which no other test changes, and deletes it at the end of the
test (not in `afterAll`: Task 4's tests in the same file read zone rates by date).

- [ ] **Step 2: Run them to make sure they fail**

Run: `RUN_DB_TESTS=1 pnpm --filter ./apps/api vitest run test/travel-master.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement**

Two migrations: `202610220100_travel-master_create` (tables) and `202610220110_travel-master_seed` (rows from
`seed.ts` and `countries.ts`, `created_by` NULL for seed rows). The seed migration imports constants only; a later
change to the constants never alters a database that already ran it. `module.ts`: `defineModule({ name:
'travel-master', dependsOn: ['authorization', 'hrm'], migrations, permissions: { travel_master: ['manage'] },
messages })`.

- [ ] **Step 4: Run them to make sure they pass** — Step 2 command, PASS; then `pnpm run typecheck`, PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api && git commit -m "feat(travel-master): reference tables, seed from the code file, lookups"
```

### Task 3: Read routes, rank map, countries and border routes

**Files:**
- Create: `apps/api/src/modules/travel-master/schema.ts`, `queries.ts`, `routes.ts`
- Modify: `apps/api/src/modules/travel-master/module.ts` (routes, `lists`, `menus`, messages),
  `apps/api/openapi.json` (generated)
- Test: `apps/api/test/travel-master.test.ts`

**Interfaces:**
- Consumes: Task 2 tables; `source('hrm')` table `hrmPosition` (`postid`, `postname`, `postnameeng`, `posttype`).
- Produces (all under `/api/v1/travel-master`, tag `Travel master`; reads need only sign-in and use
  `scopedBy(qb, 'reference data, every signed-in user')`; writes `requirePermission(…, 'travel_master.manage')`):
  - `GET /ranks`, `GET /zones`, `GET /gl-accounts` — unpaged `{ data: [...] }`.
  - `GET /rank-map` — rows `{ id, postType, rankCode, version }`; `PUT /rank-map/{postType}` body `{ rankCode }`
    (upsert, `writeHistory` entity `travel_rank_map`); `DELETE /rank-map/{postType}`.
  - `GET /post-types` — from HRM: distinct `posttype` with up to five `postname`s each and `mapped: RankCode | null`;
    `503` when HRM is down. Lets the administrator fill the map when ຂ1 arrives.
  - `GET /countries` — `paginate`, list key `travel_countries`, search on `nameLo`, `nameEn`, `iso2` (prefix),
    filter `zoneCode`; `POST /countries` `{ iso2, nameLo, nameEn, zoneCode }`; `PATCH /countries/{id}`
    `{ version, nameLo?, nameEn?, zoneCode? }` (history entity `travel_country`).
  - `GET /border-routes` (`?active=true` default all); `POST /border-routes` `{ nameLo, nameEn }`;
    `PATCH /border-routes/{id}` `{ version, nameLo?, nameEn?, active? }` (history entity `travel_border_route`).
  - Menu item `master` → `/master`, label `master.nav.title`, group `admin`, permission `travel_master.manage`.

- [ ] **Step 1: Write the failing tests** (`admin` = `adminClient`, `manager` = `userWith` a role holding
  `travel_master.manage`, `someone` = `userWith` no role)

```ts
it('lets any signed-in user read reference data', async () => {
  const res = await someone.get(`${API}/travel-master/zones`)
  expect(res.status).toBe(200)
  expect(res.body.data.map((z: { code: string }) => z.code)).toEqual(['D', 'OB1', 'OA1', 'OA2', 'OE1', 'OE2'])
  expect((await new TestClient(platform).get(`${API}/travel-master/zones`)).status).toBe(401)
})
it('refuses writes without travel_master.manage', async () => {
  expect((await someone.put(`${API}/travel-master/rank-map/9`, { rankCode: 'P9' })).status).toBe(403)
  expect((await someone.post(`${API}/travel-master/border-routes`, { nameLo: 'x', nameEn: 'x' })).status).toBe(403)
})
it('maps, remaps and unmaps a PostType', async () => {
  expect((await manager.put(`${API}/travel-master/rank-map/9`, { rankCode: 'P9' })).status).toBe(200)
  expect((await manager.put(`${API}/travel-master/rank-map/9`, { rankCode: 'P8' })).body.data.rankCode).toBe('P8')
  expect((await manager.put(`${API}/travel-master/rank-map/9`, { rankCode: 'P0' })).status).toBe(422)
  expect((await manager.delete(`${API}/travel-master/rank-map/9`)).status).toBe(204)
})
it('lists HRM PostTypes with their mapping', async () => {
  const res = await manager.get(`${API}/travel-master/post-types`)
  expect(res.body.data.find((p: { postType: number }) => p.postType === 7)).toMatchObject({ mapped: 'P3' })
})
it('searches countries by first letters in both languages', async () => {
  for (const q of ['ຝຣັ່ງ', 'fra', 'FR']) {
    const res = await someone.get(`${API}/travel-master/countries?search=${encodeURIComponent(q)}`)
    expect(res.body.data.map((c: { iso2: string }) => c.iso2)).toContain('FR')
  }
})
it('moves a country to another zone, refusing a stale version', async () => {
  const italy = (await someone.get(`${API}/travel-master/countries?search=Italy`)).body.data[0]
  expect((await manager.patch(`${API}/travel-master/countries/${italy.id}`, { version: italy.version, zoneCode: 'OE1' })).status).toBe(200)
  expect((await manager.patch(`${API}/travel-master/countries/${italy.id}`, { version: italy.version, zoneCode: 'OE2' })).status).toBe(409)
  // put it back for other tests
})
it('refuses a duplicate country and an unknown zone', async () => {
  expect((await manager.post(`${API}/travel-master/countries`, { iso2: 'FR', nameLo: 'x', nameEn: 'x', zoneCode: 'OE1' })).status).toBe(409)
  expect((await manager.post(`${API}/travel-master/countries`, { iso2: 'XK', nameLo: 'ໂຄໂຊໂວ', nameEn: 'Kosovo', zoneCode: 'ZZ' })).status).toBe(422)
})
it('adds and deactivates a border route', async () => {
  const created = await manager.post(`${API}/travel-master/border-routes`, { nameLo: 'ບໍ່ແກ້ວ – ຊຽງຂອງ', nameEn: 'Bokeo – Chiang Khong' })
  expect(created.status).toBe(201)
  const { id, version } = created.body.data
  expect((await manager.patch(`${API}/travel-master/border-routes/${id}`, { version, active: false })).body.data.active).toBe(false)
  const active = await someone.get(`${API}/travel-master/border-routes?active=true`)
  expect(active.body.data.map((r: { id: string }) => r.id)).not.toContain(id)
})
```

- [ ] **Step 2: Run them to make sure they fail** — `RUN_DB_TESTS=1 pnpm --filter ./apps/api vitest run test/travel-master.test.ts`, FAIL.

- [ ] **Step 3: Implement** the routes in the shape of the platform's `notes` module (`createRoute`, zod schemas
  in `schema.ts`, `updateVersioned` for PATCH, duplicate `iso2` → `409 travel_master.country_exists`). Country
  search: `like` with `<term>%` on each of the three columns (the collation ignores case).

- [ ] **Step 4: Run them to make sure they pass**, then `pnpm run openapi` and `cd apps/api && pnpm run openapi:verify`, PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api && git commit -m "feat(travel-master): reference routes, rank map, countries, border routes"
```

### Task 4: Effective-dated sets — rates, flat rates, advance bands

**Files:**
- Create: `apps/api/src/modules/travel-master/sets.ts`
- Modify: `routes.ts`, `schema.ts`, `module.ts` (audit actions, messages), `apps/api/openapi.json`
- Test: `apps/api/test/travel-master.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `GET /travel-master/rates?zone=&on=` → the set in effect `on` (default today, HRM time `+07:00`):
    `{ data: { zoneCode, currency, effectiveFrom, rows: [{ rankCode, daily, accommodation, personal }] } | null, sets: string[] }`
    where `sets` lists every `effectiveFrom` of that zone, newest first.
  - `POST /travel-master/rates` `{ zoneCode, effectiveFrom, rows }` — `rows` has exactly the nine ranks; `personal`
    required for overseas zones, `null` for `D` and `OB1`; 201.
  - `DELETE /travel-master/rates/{zoneCode}/{effectiveFrom}` — 204.
  - `GET /travel-master/flat-rates` → per key, the set in effect today and the future ones;
    `POST /travel-master/flat-rates` `{ key, effectiveFrom, amount }`; `DELETE /travel-master/flat-rates/{key}/{effectiveFrom}`.
  - `GET /travel-master/advance-bands?kind=&on=`; `POST /travel-master/advance-bands`
    `{ kind, effectiveFrom, bands: [{ minCount, maxCount | null, amount }] }`; `DELETE /travel-master/advance-bands/{kind}/{effectiveFrom}`.
  - Rules for every POST and DELETE: `effectiveFrom` must be after today (`409 travel_master.set_in_effect`
    otherwise, for publishing over an existing date as for deleting); publishing a date that already has a
    future set replaces it. Bands: sorted, first `minCount` 1, each next `minCount` = previous `maxCount` + 1, only
    the last open (`null`), else `422 travel_master.bands_invalid`.
  - Audit actions `travel_master.set_published`, `travel_master.set_deleted` with
    `details: { table, key, effectiveFrom }`.

- [ ] **Step 1: Write the failing tests** (`setClock` from `@elvine-sk/platform-core` fixes today at
  `2026-10-21T10:00:00+07:00`; reset in `afterEach`)

```ts
const nine = (daily: string) => ['P1','P2','P3','P4','P5','P6','P7','P8','P9'].map((rankCode) => ({ rankCode, daily, accommodation: '500000', personal: null }))
it('publishes a future rate set and uses it from its first day', async () => {
  expect((await manager.post(`${API}/travel-master/rates`, { zoneCode: 'D', effectiveFrom: '2027-01-01', rows: nine('330000') })).status).toBe(201)
  expect((await someone.get(`${API}/travel-master/rates?zone=D&on=2026-12-31`)).body.data.rows[0].daily).toBe('310000.00')
  expect((await someone.get(`${API}/travel-master/rates?zone=D&on=2027-01-01`)).body.data.rows[0].daily).toBe('330000.00')
})
it('refuses to change or delete a set in effect, and leaves it unchanged', async () => {
  expect((await manager.post(`${API}/travel-master/rates`, { zoneCode: 'D', effectiveFrom: '2026-01-01', rows: nine('1') })).status).toBe(409)
  expect((await manager.post(`${API}/travel-master/rates`, { zoneCode: 'D', effectiveFrom: '2026-10-21', rows: nine('1') })).status).toBe(409)
  expect((await manager.delete(`${API}/travel-master/rates/D/2026-01-01`)).status).toBe(409)
  expect((await someone.get(`${API}/travel-master/rates?zone=D&on=2026-10-21`)).body.data.rows[0].daily).toBe('310000.00')
})
it('deletes a future set', async () => {
  expect((await manager.delete(`${API}/travel-master/rates/D/2027-01-01`)).status).toBe(204)
})
it('validates a rate set', async () => {
  expect((await manager.post(`${API}/travel-master/rates`, { zoneCode: 'D', effectiveFrom: '2027-02-01', rows: nine('1').slice(1) })).status).toBe(422)
  expect((await manager.post(`${API}/travel-master/rates`, { zoneCode: 'OE1', effectiveFrom: '2027-02-01', rows: nine('100') })).status).toBe(422) // personal missing
  expect((await manager.post(`${API}/travel-master/rates`, { zoneCode: 'D', effectiveFrom: '2027-02-01', rows: nine('1.234') })).status).toBe(422)
})
it.each([
  [[{ minCount: 1, maxCount: 2, amount: '1' }, { minCount: 4, maxCount: null, amount: '2' }]],
  [[{ minCount: 1, maxCount: 3, amount: '1' }, { minCount: 3, maxCount: null, amount: '2' }]],
  [[{ minCount: 1, maxCount: 2, amount: '1' }, { minCount: 3, maxCount: 5, amount: '2' }]],
  [[{ minCount: 2, maxCount: null, amount: '1' }]],
])('refuses advance bands with a gap, overlap or no open end: %j', async (bands) => {
  const res = await manager.post(`${API}/travel-master/advance-bands`, { kind: 'group_size', effectiveFrom: '2027-01-01', bands })
  expect(res.status).toBe(422)
  expect(res.body.error.code).toBe('travel_master.bands_invalid')
})
it('enters the fuel price for tomorrow and reads it then', async () => {
  expect((await manager.post(`${API}/travel-master/flat-rates`, { key: 'fuel_price', effectiveFrom: '2026-10-22', amount: '32500' })).status).toBe(201)
  expect(await flatRateOn('fuel_price', '2026-10-21')).toBeNull()
  expect((await flatRateOn('fuel_price', '2026-10-22'))?.amount).toBe('32500.00')
})
it('refuses sets without travel_master.manage', async () => {
  expect((await someone.post(`${API}/travel-master/flat-rates`, { key: 'same_day', effectiveFrom: '2027-01-01', amount: '1' })).status).toBe(403)
})
```

- [ ] **Step 2: Run them to make sure they fail** — Task 3's command, FAIL.

- [ ] **Step 3: Implement `sets.ts`**: one generic "replace a future set" in `inTransaction` (check date, delete
  that date's rows, insert the new ones, audit) used by the three tables. "Today" is the date of `now()` in
  `+07:00`, not the server's zone.

- [ ] **Step 4: Run them to make sure they pass**, then `pnpm run openapi`, `openapi:verify`, `typecheck`, PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api && git commit -m "feat(travel-master): effective-dated rates, flat rates and advance bands"
```

### Task 5: Web — master data screens

**Files:**
- Create: `apps/web/app/composables/useTravelMaster.ts`
- Create: `apps/web/app/pages/master/index.vue`, `rank-map.vue`, `countries.vue`, `border-routes.vue`,
  `rates.vue`, `flat-rates.vue`, `advance-bands.vue`, `gl-accounts.vue`
- Modify: `apps/web/i18n/locales/app.en.json`, `app.lo.json`; `apps/web/app/types/api.d.ts` (generated)

**Interfaces:**
- Consumes: the routes of Tasks 3–4 (types from `pnpm run api:types`).

- [ ] **Step 1: Generate the API types** — `cd apps/web && pnpm run api:types`, no error.

- [ ] **Step 2: Build the pages**

| Page | Shows | Actions (only with `canSome('travel_master.manage')`) |
| ---- | ----- | ---------------------------------------------------- |
| `/master` | Links to the seven pages with one line each | — |
| `rank-map` | `/post-types` table: PostType, sample position names, mapped rank; unmapped rows first and marked | Pick a rank per row (select), clear it |
| `countries` | `PlatformDataTable`, list key `travel_countries`, zone filter, search | Add; edit names and zone in a dialog |
| `border-routes` | Table with active flag | Add; edit; activate/deactivate |
| `rates` | Zone tabs; the set in effect today, and a date picker to see another date; list of set dates (future ones marked) | "New set from date": a 9-row form prefilled with the current set; delete a future set (`useConfirm`) |
| `flat-rates` | Same-day rate, fuel price, km per litre: current value, its date, future values | New value from date; delete a future one |
| `advance-bands` | Two tables (domestic by days, LAK; group by size, USD) | New set from date (rows editable, add/remove band); delete a future set |
| `gl-accounts` | Read-only table GL, SEQ, English and Lao names | — |

Amounts are shown with thousands separators and the zone's currency; inputs send the plain decimal string. The
API's error text (`travel_master.set_in_effect`, `bands_invalid`) is shown as it comes; field errors with
`useFormErrors()`.

- [ ] **Step 3: Check by hand** — `pnpm dev:api`, `pnpm dev:web`, signed in as the bootstrap administrator
  (`/auth/sign-in?local=1`): open every page in English and Lao, at 390 px and in dark mode; publish a rate set
  for a future date, see it listed, delete it; try today's date and see the 409 text. No console error.

- [ ] **Step 4: Run checks** — `pnpm typecheck && cd apps/web && pnpm lint`, PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web && git commit -m "feat(web): master data screens"
```

### Task 6: Deployment bundle for the testing server

**Files:**
- Create: `ecosystem.config.cjs`, `tooling/deploy/bundle.sh`, `docs/deploy-testing.md`
- Modify: `.gitignore` (`/build/`), `HANDOFF.md`

**Interfaces:**
- Produces: `build/hr-fam-<git short sha>.tar.gz` containing `apps/api` (sources, production `node_modules` with
  no symbolic links, `.env.example`), `apps/web/.output`, `ecosystem.config.cjs`, `docs/deploy-testing.md`.

The server has limited internet access (spec §15), and the platform packages are linked from
`../nelvine-platform` by absolute `link:` paths, so the bundle must hold real copies of everything it runs.

- [ ] **Step 1: Write `ecosystem.config.cjs`** from `docs/platform/deployment.md` "PM2", one server: `api` one
  instance (`JOBS_WORKER: 'false'`), `worker` one instance (`src/cli.ts worker`), `web` one instance
  (`apps/web/.output/server/index.mjs`, port 3000), all `NODE_ENV=production`, API on 3001.

- [ ] **Step 2: Write `tooling/deploy/bundle.sh`**

Steps in order: refuse a dirty working tree; `pnpm install --frozen-lockfile`; `pnpm run typecheck`; build the
web with `NUXT_PUBLIC_HRM_LOGIN_URL` taken from the required argument `--hrm-login-url` (it is fixed at build
time); `pnpm --filter ./apps/api deploy --prod <tmp>/apps/api` (add `--legacy` if pnpm 10 asks); copy with
symbolic links dereferenced (`cp -rL`); fail if `find <tmp> -type l` prints anything or if any `package.json` in the
bundle still contains `link:`; tar it. `tsx` must be in the bundle (the start command uses it): if it is a dev
dependency of `apps/api`, the script adds it to the bundle's `node_modules` explicitly rather than editing the
generated `package.json`.

- [ ] **Step 3: Check the bundle runs on its own**

Run: `tooling/deploy/bundle.sh --hrm-login-url http://localhost:8080/login`, unpack into a new folder under the
scratchpad, copy `apps/api/.env` into it, then from that folder `node --import tsx src/cli.ts migrate` and
`node --import tsx src/main.ts` in `apps/api`, and `curl http://localhost:3001/health`.
Expected: the script ends without error; migrate reports nothing pending (local DB) or applies plan 2's
migrations; `/health` answers `{"status":"ok"}`.

- [ ] **Step 4: Write `docs/deploy-testing.md`** for whoever installs on `10.0.7.110`: prerequisites (Node 22.12+,
  PM2, MariaDB 11.4 app database and user, the HRM read-only user of ຂ7), copy and unpack, fill `apps/api/.env`
  (list every variable `apps/api/.env.example` has, including `DATA_SOURCE_HRM_*`, `HRM_LOGIN_URL`, `HRM_ORIGIN`,
  `TRUSTED_PROXIES`, `AUTH_SESSION_IDLE_MINUTES=240`), migrate, `pm2 start ecosystem.config.cjs`, `pm2 save`,
  upgrade with `pm2 reload`, and the bootstrap administrator (`platform admin:create`).

- [ ] **Step 5: Update `HANDOFF.md`**: plan 2 done, what it built, the run and deploy commands, plan 3 next; the
  open items that remain for the seed (spec §17 question 2, ຂ1).

- [ ] **Step 6: Commit**

```bash
git add ecosystem.config.cjs tooling/deploy docs/deploy-testing.md .gitignore HANDOFF.md
git commit -m "chore: PM2 bundle for the testing server"
```
