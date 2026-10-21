import type { FieldMap } from '@elvine-sk/platform-core'
import { IsoDateTime, z } from '@elvine-sk/platform-server'
import { AMOUNT_PATTERN } from './money.ts'
import { RANK_CODES } from './lookups.ts'
import { ADVANCE_KINDS, FLAT_RATE_KEYS } from './sets.ts'

export const RankSchema = z
  .object({
    code: z.string(),
    nameLo: z.string(),
    nameEn: z.string(),
    sortOrder: z.number().int(),
  })
  .openapi('TravelRank')

export const ZoneSchema = z
  .object({
    code: z.string(),
    kind: z.enum(['domestic', 'border', 'overseas']),
    currency: z.enum(['LAK', 'USD']),
    nameLo: z.string(),
    nameEn: z.string(),
    sortOrder: z.number().int(),
  })
  .openapi('TravelZone')

export const GlAccountSchema = z
  .object({ gl: z.string(), seq: z.string(), nameEn: z.string(), nameLo: z.string() })
  .openapi('TravelGlAccount')

export const RankMapSchema = z
  .object({
    id: z.string().uuid(),
    postType: z.number().int(),
    rankCode: z.string(),
    version: z.number().int(),
  })
  .openapi('TravelRankMap')

export const PostTypeParam = z.object({
  postType: z.coerce
    .number()
    .int()
    .min(0)
    .max(1_000_000)
    .openapi({ param: { name: 'postType', in: 'path' } }),
})

export const RankMapBodySchema = z
  .object({ rankCode: z.string().trim().min(1).max(2) })
  .strict()
  .openapi('TravelRankMapInput')

export const HrmPostTypeSchema = z
  .object({
    postType: z.number().int(),
    postNames: z.array(z.string()),
    mapped: z.string().nullable(),
  })
  .openapi('TravelHrmPostType')

export const CountrySchema = z
  .object({
    id: z.string().uuid(),
    iso2: z.string(),
    nameLo: z.string(),
    nameEn: z.string(),
    zoneCode: z.string(),
    version: z.number().int(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .openapi('TravelCountry')

export const CountryCreateSchema = z
  .object({
    iso2: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/, 'Two letters')
      .transform((s) => s.toUpperCase()),
    nameLo: z.string().trim().min(1).max(200),
    nameEn: z.string().trim().min(1).max(200),
    zoneCode: z.string().trim().min(1).max(4),
  })
  .strict()
  .openapi('TravelCountryCreate')

export const CountryUpdateSchema = z
  .object({
    version: z.number().int().min(1),
    nameLo: z.string().trim().min(1).max(200).optional(),
    nameEn: z.string().trim().min(1).max(200).optional(),
    zoneCode: z.string().trim().min(1).max(4).optional(),
  })
  .strict()
  .openapi('TravelCountryUpdate')

export const BorderRouteSchema = z
  .object({
    id: z.string().uuid(),
    nameLo: z.string(),
    nameEn: z.string(),
    active: z.boolean(),
    version: z.number().int(),
    createdAt: IsoDateTime,
    updatedAt: IsoDateTime,
  })
  .openapi('TravelBorderRoute')

export const BorderRouteCreateSchema = z
  .object({
    nameLo: z.string().trim().min(1).max(200),
    nameEn: z.string().trim().min(1).max(200),
  })
  .strict()
  .openapi('TravelBorderRouteCreate')

export const BorderRouteUpdateSchema = z
  .object({
    version: z.number().int().min(1),
    nameLo: z.string().trim().min(1).max(200).optional(),
    nameEn: z.string().trim().min(1).max(200).optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .openapi('TravelBorderRouteUpdate')

export const BorderRouteQuery = z.object({ active: z.enum(['true', 'false']).optional() })

/** Country list: what the web filters, sorts and searches. The route applies its own prefix search. */
export const countryFields: FieldMap = {
  iso2: { type: 'string', sortable: true, searchable: true },
  nameLo: { type: 'string', sortable: true, searchable: true },
  nameEn: { type: 'string', sortable: true, searchable: true },
  zoneCode: { type: 'string', sortable: true, ops: ['eq', 'in'] },
}

export const rankMapHistory = { entityType: 'travel_rank_map', tracked: ['postType', 'rankCode'] } as const
export const countryHistory = {
  entityType: 'travel_country',
  tracked: ['iso2', 'nameLo', 'nameEn', 'zoneCode'],
} as const
export const borderRouteHistory = {
  entityType: 'travel_border_route',
  tracked: ['nameLo', 'nameEn', 'active'],
} as const

// Effective-dated sets

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
const DateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
  .refine(isRealDate, 'Not a real date')
const AmountField = z.string().regex(AMOUNT_PATTERN, 'Decimal with at most 2 decimals')
const ZoneCodeField = z.string().trim().min(1).max(4)
const SetAmount = z.object({ effectiveFrom: z.string(), amount: z.string() })

export const RateSetQuery = z.object({ zone: ZoneCodeField, on: DateOnly.optional() })
export const RateSetSchema = z
  .object({
    data: z
      .object({
        zoneCode: z.string(),
        currency: z.enum(['LAK', 'USD']),
        effectiveFrom: z.string(),
        rows: z.array(
          z.object({
            rankCode: z.string(),
            daily: z.string(),
            accommodation: z.string(),
            personal: z.string().nullable(),
          }),
        ),
      })
      .nullable(),
    sets: z.array(z.string()),
  })
  .openapi('TravelRateSet')
export const RateSetInputSchema = z
  .object({
    zoneCode: ZoneCodeField,
    effectiveFrom: DateOnly,
    rows: z.array(
      z
        .object({
          rankCode: z.enum(RANK_CODES),
          daily: AmountField,
          accommodation: AmountField,
          personal: AmountField.nullable().default(null),
        })
        .strict(),
    ),
  })
  .strict()
  .openapi('TravelRateSetInput')
export const RateSetParams = z.object({
  zoneCode: ZoneCodeField.openapi({ param: { name: 'zoneCode', in: 'path' } }),
  effectiveFrom: DateOnly.openapi({ param: { name: 'effectiveFrom', in: 'path' } }),
})

export const FlatRateOverviewSchema = z
  .object({ key: z.enum(FLAT_RATE_KEYS), current: SetAmount.nullable(), future: z.array(SetAmount) })
  .openapi('TravelFlatRateOverview')
export const FlatRateInputSchema = z
  .object({ key: z.enum(FLAT_RATE_KEYS), effectiveFrom: DateOnly, amount: AmountField })
  .strict()
  .openapi('TravelFlatRateInput')
export const FlatRateParams = z.object({
  key: z.enum(FLAT_RATE_KEYS).openapi({ param: { name: 'key', in: 'path' } }),
  effectiveFrom: DateOnly.openapi({ param: { name: 'effectiveFrom', in: 'path' } }),
})

export const BandSetQuery = z.object({ kind: z.enum(ADVANCE_KINDS), on: DateOnly.optional() })
export const BandSetSchema = z
  .object({
    data: z
      .object({
        kind: z.enum(ADVANCE_KINDS),
        currency: z.enum(['LAK', 'USD']),
        effectiveFrom: z.string(),
        bands: z.array(z.object({ minCount: z.number().int(), maxCount: z.number().int().nullable(), amount: z.string() })),
      })
      .nullable(),
    sets: z.array(z.string()),
  })
  .openapi('TravelAdvanceBandSet')
export const BandSetInputSchema = z
  .object({
    kind: z.enum(ADVANCE_KINDS),
    effectiveFrom: DateOnly,
    bands: z
      .array(
        z
          .object({
            minCount: z.number().int().min(1).max(100000),
            maxCount: z.number().int().min(1).max(100000).nullable(),
            amount: AmountField,
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .openapi('TravelAdvanceBandSetInput')
export const BandSetParams = z.object({
  kind: z.enum(ADVANCE_KINDS).openapi({ param: { name: 'kind', in: 'path' } }),
  effectiveFrom: DateOnly.openapi({ param: { name: 'effectiveFrom', in: 'path' } }),
})
