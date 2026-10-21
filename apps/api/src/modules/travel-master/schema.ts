import type { FieldMap } from '@elvine-sk/platform-core'
import { IsoDateTime, z } from '@elvine-sk/platform-server'

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
