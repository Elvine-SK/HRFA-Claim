import { RANK_CODES, type ZoneKind } from './lookups.ts'

/**
 * Seed values of the travel reference data, from `2. ກຳນົດ code and data.xlsx` (2026-10-16), `4. Format form
 * FA-M.xlsx` (2026-10-20) and the 2026 regulation. Read only by the seed migration: changing a value here never
 * changes a database that already ran it (add a migration or publish a new set instead).
 *
 * FROZEN: each block of this file is frozen once its migration has run on the testing server: the master data
 * and `countries.ts` by 202610220110, `SEED_POSTING_ENTRIES` by 202610300100. A change goes in a new migration,
 * never an edit here.
 */

/** The 2026 regulation's sets take effect from its first day. */
export const SEED_EFFECTIVE_FROM = '2026-01-01'


/** The code file's `position code` sheet. */
export const SEED_RANKS: { code: (typeof RANK_CODES)[number]; nameLo: string; nameEn: string }[] = [
  { code: 'P1', nameLo: 'ຜູ້ອຳນວຍການ', nameEn: 'Director' },
  { code: 'P2', nameLo: 'ຮອງຜູ້ອຳນວຍການ', nameEn: 'Deputy Director' },
  {
    code: 'P3',
    nameLo: 'ຫົວໜ້າພະແນກ, ສູນ, ສາຂາ ແລະ ທຽບເທົ່າ',
    nameEn: 'Head of Department, Centre or Branch and equivalent',
  },
  { code: 'P4', nameLo: 'ຮອງຫົວໜ້າພະແນກ, ສູນ, ສາຂາ', nameEn: 'Deputy Head of Department, Centre or Branch' },
  { code: 'P5', nameLo: 'ຫົວໜ້າຂະແໜງ ແລະ ທຽບເທົ່າ', nameEn: 'Head of Division and equivalent' },
  {
    code: 'P6',
    nameLo: 'ຮອງຫົວໜ້າຂະແໜງ, ຫົວໜ້າໜ່ວຍບໍລິການ ແລະ ທຽບເທົ່າ',
    nameEn: 'Deputy Head of Division, Head of Service Unit and equivalent',
  },
  { code: 'P7', nameLo: 'ຮອງຫົວໜ້າໜ່ວຍບໍລິການ', nameEn: 'Deputy Head of Service Unit' },
  { code: 'P8', nameLo: 'ຫົວໜ້າໜ່ວຍງານ, ຫົວໜ້າຫ້ອງແລກປ່ຽນ', nameEn: 'Head of Unit, Head of Exchange Office' },
  { code: 'P9', nameLo: 'ພະນັກງານວິຊາການເອກລົງມາ', nameEn: 'Officer and below' },
]

/** HRM PostType to rank (spec §5). The other PostTypes wait for the business's answer (ຂ1). */
export const SEED_RANK_MAP: { postType: number; rankCode: string }[] = [{ postType: 7, rankCode: 'P3' }]

export const SEED_ZONES: { code: string; kind: string; currency: string; nameLo: string; nameEn: string }[] = [
  { code: 'D', kind: 'domestic', currency: 'LAK', nameLo: 'ພາຍໃນປະເທດ', nameEn: 'Domestic' },
  { code: 'OB1', kind: 'border', currency: 'LAK', nameLo: 'ເຂດຊາຍແດນ', nameEn: 'Border' },
  { code: 'OA1', kind: 'overseas', currency: 'USD', nameLo: 'ອາຊີ-ປາຊີຟິກ ກຸ່ມ 1', nameEn: 'Asia-Pacific group 1' },
  { code: 'OA2', kind: 'overseas', currency: 'USD', nameLo: 'ອາຊີ-ປາຊີຟິກ ກຸ່ມ 2', nameEn: 'Asia-Pacific group 2' },
  { code: 'OE1', kind: 'overseas', currency: 'USD', nameLo: 'ເອີຣົບ ກຸ່ມ 1', nameEn: 'Europe group 1' },
  { code: 'OE2', kind: 'overseas', currency: 'USD', nameLo: 'ເອີຣົບ ກຸ່ມ 2', nameEn: 'Europe group 2' },
]

/** Daily / accommodation for P1…P9 (LAK); `P5,P6` and `P7,P8` rows of the file apply to both ranks. */
const DOMESTIC: [string, string][] = [
  ['310000', '600000'],
  ['290000', '560000'],
  ['280000', '550000'],
  ['280000', '540000'],
  ['270000', '500000'],
  ['270000', '500000'],
  ['260000', '500000'],
  ['260000', '500000'],
  ['250000', '450000'],
]

/** Daily / accommodation / personal for P1…P9 (USD). */
const OVERSEAS: Record<string, [string, string, string][]> = {
  OA1: [
    ['160', '290', '280'],
    ['150', '280', '260'],
    ['140', '270', '240'],
    ['130', '260', '220'],
    ['120', '250', '200'],
    ['120', '250', '200'],
    ['110', '240', '180'],
    ['110', '240', '180'],
    ['100', '230', '160'],
  ],
  OA2: [
    ['140', '240', '240'],
    ['130', '230', '220'],
    ['120', '220', '200'],
    ['110', '210', '180'],
    ['100', '200', '160'],
    ['100', '200', '160'],
    ['90', '190', '140'],
    ['90', '190', '140'],
    ['80', '180', '120'],
  ],
  OE1: [
    ['180', '430', '320'],
    ['160', '380', '300'],
    ['140', '300', '280'],
    ['140', '280', '260'],
    ['120', '260', '240'],
    ['120', '260', '240'],
    ['120', '250', '220'],
    ['120', '250', '220'],
    ['100', '240', '200'],
  ],
  OE2: [
    ['160', '330', '300'],
    ['150', '310', '280'],
    ['140', '290', '260'],
    ['130', '270', '240'],
    ['120', '250', '220'],
    ['120', '250', '220'],
    ['110', '230', '200'],
    ['110', '230', '200'],
    ['100', '220', '180'],
  ],
}

export interface SeedRate {
  zoneCode: string
  rankCode: string
  daily: string
  accommodation: string
  personal: string | null
}

export const SEED_RATES: SeedRate[] = [
  ...['D', 'OB1'].flatMap((zoneCode) =>
    DOMESTIC.map(([daily, accommodation], i) => ({
      zoneCode,
      rankCode: RANK_CODES[i]!,
      daily,
      accommodation,
      personal: null,
    })),
  ),
  ...Object.entries(OVERSEAS).flatMap(([zoneCode, rows]) =>
    rows.map(([daily, accommodation, personal], i) => ({
      zoneCode,
      rankCode: RANK_CODES[i]!,
      daily,
      accommodation,
      personal,
    })),
  ),
]

/** Same-day rate (LAK, regulation 3.1.6) and km per litre (3.1.3). No fuel price: an administrator enters it. */
export const SEED_FLAT_RATES: { key: string; amount: string }[] = [
  { key: 'same_day', amount: '150000' },
  { key: 'km_per_litre', amount: '7' },
]

/** Domestic by trip days (LAK, spec ກ4), border and overseas by group size (USD per country). `null`: no upper end. */
export const SEED_ADVANCE_BANDS: { kind: string; minCount: number; maxCount: number | null; amount: string }[] = [
  { kind: 'domestic_days', minCount: 1, maxCount: 2, amount: '2000000' },
  { kind: 'domestic_days', minCount: 3, maxCount: 5, amount: '3500000' },
  { kind: 'domestic_days', minCount: 6, maxCount: 10, amount: '5000000' },
  { kind: 'domestic_days', minCount: 11, maxCount: null, amount: '7000000' },
  { kind: 'group_size', minCount: 1, maxCount: 1, amount: '1000' },
  { kind: 'group_size', minCount: 2, maxCount: 5, amount: '1500' },
  { kind: 'group_size', minCount: 6, maxCount: 10, amount: '2000' },
  { kind: 'group_size', minCount: 11, maxCount: null, amount: '2500' },
]

/** The four routes of regulation 4.1. */
export const SEED_BORDER_ROUTES: { nameLo: string; nameEn: string }[] = [
  {
    nameLo: 'ນະຄອນຫຼວງວຽງຈັນ – ໜອງຄາຍ – ອຸດອນ',
    nameEn: 'Vientiane Capital – Nong Khai – Udon Thani',
  },
  { nameLo: 'ຫົວພັນ – ແທ່ງຫົວ', nameEn: 'Houaphanh – Thanh Hoa' },
  { nameLo: 'ສະຫວັນນະເຂດ – ມຸກດາຫານ', nameEn: 'Savannakhet – Mukdahan' },
  { nameLo: 'ຫຼວງນ້ຳທາ – ບໍ່ຫານ', nameEn: 'Luang Namtha – Boten' },
]

/** The FA-M `GL` sheet. */
export const SEED_GL_ACCOUNTS: { gl: string; seq: string; nameEn: string; nameLo: string }[] = [
  {
    gl: '1362220001',
    seq: '0001',
    nameEn: 'Allow.Bcel.Staf',
    nameLo: 'ບັນຊີລ່ວງໜ້າເງິນແຮພະນັກງານໄປເຮັດວຽກຕ່າງແຂວງ, ຕ່າງປະເທດ',
  },
  {
    gl: '2361800001',
    seq: '0001',
    nameEn: 'Admin.external BCEL',
    nameLo: 'ບັນຊີລໍຖ້າຈ່າຍໃຫ້ຜູ້ສະໜອງພາຍນອກຂອງຫ້ອງການ (ທຄຕລ)',
  },
  { gl: '4405100001', seq: '0001', nameEn: 'Expense on Fuel', nameLo: 'ລາຍຈ່າຍຄ່ານ້ຳມັນເຊື້ອໄຟ' },
  {
    gl: '4405200001',
    seq: '0001',
    nameEn: 'Expense on Official Trip (AirPlane or Car ticket)',
    nameLo: 'ລາຍຈ່າຍຄ່າໂດຍສານ (ປີ້ຍົນ, ປີ້ລົດ)',
  },
  {
    gl: '4408720001',
    seq: '0001',
    nameEn: 'Exp.to daily meals on travels to other Provinces, foreign and Guest',
    nameLo: 'ຈ່າຍອັດຕາກິນພະນັກງານໄປວຽກຕ່າງແຂວງ, ຕ່າງປະເທດ ແລະ ແຂກມາເຮັດວຽກ ທຄຕລ ຮັບຜິດຊອບ',
  },
  {
    gl: '4408730001',
    seq: '0001',
    nameEn: 'Expense on Accomodati',
    nameLo: 'ຄ່າພັກເຊົາພະນັກງານໄປວຽກຕ່າງແຂວງ, ຕ່າງປະເທດ ແລະ ແຂກມາເຮັດວຽກ ທຄຕລ ຮັບຜິດຊອບ',
  },
  {
    gl: '4408600002',
    seq: '0001',
    nameEn: 'Expense on Oversea Meeting and Seminar',
    nameLo: 'ຄ່າໃຊ້ຈ່າຍເຂົ້າໃນກອງປະຊຸມ ແລະ ສຳມະນາຢູ່ຕ່າງປະເທດ',
  },
]

/** Which GL account each payment component debits; every component credits the member's own account. */
const PAYMENT_DEBITS: { component: string; gl: string; kinds: ZoneKind[] }[] = [
  { component: 'daily', gl: '4408720001', kinds: ['domestic', 'border', 'overseas'] },
  { component: 'accommodation', gl: '4408730001', kinds: ['domestic', 'border', 'overseas'] },
  { component: 'fuel', gl: '4405100001', kinds: ['domestic', 'border'] },
  { component: 'personal', gl: '4408600002', kinds: ['overseas'] },
  { component: 'advance', gl: '1362220001', kinds: ['domestic', 'border', 'overseas'] },
]

export interface SeedPostingEntry {
  caseKey: string
  zoneKind: ZoneKind
  component: string
  side: 'DR' | 'CR'
  accountKind: 'gl' | 'member'
  gl: string | null
  seq: string | null
}

/** Case `payment`: a DR on the GL account and a CR on the member, per component and zone kind. */
export const SEED_POSTING_ENTRIES: SeedPostingEntry[] = (['domestic', 'border', 'overseas'] as const).flatMap(
  (zoneKind) =>
    PAYMENT_DEBITS.filter((d) => d.kinds.includes(zoneKind)).flatMap((d): SeedPostingEntry[] => [
      { caseKey: 'payment', zoneKind, component: d.component, side: 'DR', accountKind: 'gl', gl: d.gl, seq: '0001' },
      { caseKey: 'payment', zoneKind, component: d.component, side: 'CR', accountKind: 'member', gl: null, seq: null },
    ]),
)
