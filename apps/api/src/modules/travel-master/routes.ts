import { requireUser } from '@elvine-sk/platform-auth'
import {
  createRoute,
  dataOf,
  ErrorSchema,
  errorResponses,
  IdParam,
  jsonBody,
  jsonContent,
  listOf,
  listQueryFrom,
  ListQueryParams,
  requirePermission,
  z,
  type ApiRouter,
  type ModuleContext,
} from '@elvine-sk/platform-server'
import {
  createBorderRoute,
  createCountry,
  deleteRankMap,
  hrmPostTypes,
  listBorderRoutes,
  listCountries,
  listGlAccounts,
  listRankMap,
  listRanks,
  listZones,
  putRankMap,
  toCountry,
  updateBorderRoute,
  updateCountry,
} from './queries.ts'
import {
  BorderRouteCreateSchema,
  BorderRouteQuery,
  BorderRouteSchema,
  BandSetInputSchema,
  BandSetParams,
  BandSetQuery,
  BandSetSchema,
  BorderRouteUpdateSchema,
  FlatRateInputSchema,
  FlatRateOverviewSchema,
  FlatRateParams,
  RateSetInputSchema,
  RateSetParams,
  RateSetQuery,
  RateSetSchema,
  CountryCreateSchema,
  CountrySchema,
  CountryUpdateSchema,
  countryFields,
  GlAccountSchema,
  HrmPostTypeSchema,
  PostTypeParam,
  RankMapBodySchema,
  RankMapSchema,
  RankSchema,
  ZoneSchema,
} from './schema.ts'

import {
  bandsOf,
  deleteBands,
  deleteFlatRate,
  deleteRates,
  flatRatesOverview,
  publishBands,
  publishFlatRate,
  publishRates,
  ratesOf,
  todayHrm,
} from './sets.ts'

const tags = ['Travel master']
const MANAGE = 'travel_master.manage'
const unavailable = { 503: jsonContent(ErrorSchema, 'HRM is unavailable') }

export function travelMasterRoutes(api: ApiRouter, ctx: ModuleContext) {
  // Reference data is read by every signed-in user (the agreement and settlement forms need it).
  const read = (path: string, summary: string, schema: z.ZodType, load: () => Promise<unknown>) =>
    api.openapi(
      createRoute({
        method: 'get',
        path,
        tags,
        summary,
        responses: { 200: jsonContent(dataOf(z.array(schema)), summary), ...errorResponses(401) },
      }),
      async (c) => {
        requireUser(c)
        return c.json({ data: (await load()) as never[] }, 200)
      },
    )

  read('/travel-master/ranks', 'Ranks P1 to P9', RankSchema, listRanks)
  read('/travel-master/zones', 'Travel zones', ZoneSchema, listZones)
  read('/travel-master/gl-accounts', 'GL accounts', GlAccountSchema, listGlAccounts)
  read('/travel-master/rank-map', 'HRM PostType to rank map', RankMapSchema, listRankMap)

  api.openapi(
    createRoute({
      method: 'put',
      path: '/travel-master/rank-map/{postType}',
      tags,
      summary: 'Map (or remap) an HRM PostType to a rank',
      request: { params: PostTypeParam, ...jsonBody(RankMapBodySchema) },
      responses: { 200: jsonContent(dataOf(RankMapSchema), 'Mapped'), ...errorResponses(401, 403, 422) },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      const row = await putRankMap(c.req.valid('param').postType, c.req.valid('json').rankCode)
      return c.json({ data: row }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'delete',
      path: '/travel-master/rank-map/{postType}',
      tags,
      summary: 'Unmap an HRM PostType',
      request: { params: PostTypeParam },
      responses: { 204: { description: 'Unmapped' }, ...errorResponses(401, 403, 404) },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      await deleteRankMap(c.req.valid('param').postType)
      return c.body(null, 204)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/travel-master/post-types',
      tags,
      summary: 'HRM PostTypes with sample position names and their rank',
      responses: {
        200: jsonContent(dataOf(z.array(HrmPostTypeSchema)), 'PostTypes'),
        ...errorResponses(401, 403),
        ...unavailable,
      },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      return c.json({ data: await hrmPostTypes() }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/travel-master/countries',
      tags,
      summary: 'List countries (search: first letters of either name or the ISO code)',
      request: { query: ListQueryParams },
      responses: { 200: jsonContent(listOf(CountrySchema), 'Countries'), ...errorResponses(401, 422) },
    }),
    async (c) => {
      requireUser(c)
      const query = listQueryFrom(c, countryFields, { defaultSort: [{ field: 'nameEn', dir: 'asc' }] })
      const term = (c.req.query('search') ?? query.q)?.trim()
      return c.json(await listCountries(query, term || undefined), 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/travel-master/countries',
      tags,
      summary: 'Add a country',
      request: jsonBody(CountryCreateSchema),
      responses: {
        201: jsonContent(dataOf(CountrySchema), 'Created'),
        ...errorResponses(401, 403, 409, 422),
      },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      return c.json({ data: toCountry(await createCountry(c.req.valid('json'))) }, 201)
    },
  )

  api.openapi(
    createRoute({
      method: 'patch',
      path: '/travel-master/countries/{id}',
      tags,
      summary: 'Update a country (optimistic locking)',
      request: { params: IdParam, ...jsonBody(CountryUpdateSchema) },
      responses: {
        200: jsonContent(dataOf(CountrySchema), 'Updated'),
        ...errorResponses(401, 403, 404, 409, 422),
      },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      const { version, ...patch } = c.req.valid('json')
      return c.json({ data: toCountry(await updateCountry(c.req.valid('param').id, version, patch)) }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/travel-master/border-routes',
      tags,
      summary: 'Border routes (active=true for the active ones only)',
      request: { query: BorderRouteQuery },
      responses: {
        200: jsonContent(dataOf(z.array(BorderRouteSchema)), 'Border routes'),
        ...errorResponses(401, 422),
      },
    }),
    async (c) => {
      requireUser(c)
      const { active } = c.req.valid('query')
      return c.json({ data: await listBorderRoutes(active === undefined ? undefined : active === 'true') }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/travel-master/border-routes',
      tags,
      summary: 'Add a border route',
      request: jsonBody(BorderRouteCreateSchema),
      responses: { 201: jsonContent(dataOf(BorderRouteSchema), 'Created'), ...errorResponses(401, 403, 422) },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      return c.json({ data: await createBorderRoute(c.req.valid('json')) }, 201)
    },
  )

  api.openapi(
    createRoute({
      method: 'patch',
      path: '/travel-master/border-routes/{id}',
      tags,
      summary: 'Update or deactivate a border route (optimistic locking)',
      request: { params: IdParam, ...jsonBody(BorderRouteUpdateSchema) },
      responses: {
        200: jsonContent(dataOf(BorderRouteSchema), 'Updated'),
        ...errorResponses(401, 403, 404, 409, 422),
      },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      const { version, ...patch } = c.req.valid('json')
      return c.json({ data: await updateBorderRoute(c.req.valid('param').id, version, patch) }, 200)
    },
  )

  // Effective-dated sets: published whole, a set in effect is never changed or deleted.
  api.openapi(
    createRoute({
      method: 'get',
      path: '/travel-master/rates',
      tags,
      summary: 'The rate set of a zone in effect on a date (default today), and all its start dates',
      request: { query: RateSetQuery },
      responses: { 200: jsonContent(RateSetSchema, 'Rate set'), ...errorResponses(401, 422) },
    }),
    async (c) => {
      requireUser(c)
      const { zone, on } = c.req.valid('query')
      return c.json(await ratesOf(zone, on ?? todayHrm()), 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/travel-master/rates',
      tags,
      summary: 'Publish a rate set (all nine ranks) from a future date, replacing a future set of that date',
      request: jsonBody(RateSetInputSchema),
      responses: { 201: { description: 'Published' }, ...errorResponses(401, 403, 409, 422) },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      const body = c.req.valid('json')
      await publishRates(ctx, body.zoneCode, body.effectiveFrom, body.rows)
      return c.body(null, 201)
    },
  )

  api.openapi(
    createRoute({
      method: 'delete',
      path: '/travel-master/rates/{zoneCode}/{effectiveFrom}',
      tags,
      summary: 'Delete a future rate set',
      request: { params: RateSetParams },
      responses: { 204: { description: 'Deleted' }, ...errorResponses(401, 403, 404, 409, 422) },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      const p = c.req.valid('param')
      await deleteRates(ctx, p.zoneCode, p.effectiveFrom)
      return c.body(null, 204)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/travel-master/flat-rates',
      tags,
      summary: 'Flat rates: the value in effect today and the future ones, per key',
      responses: { 200: jsonContent(dataOf(z.array(FlatRateOverviewSchema)), 'Flat rates'), ...errorResponses(401) },
    }),
    async (c) => {
      requireUser(c)
      return c.json({ data: await flatRatesOverview() }, 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/travel-master/flat-rates',
      tags,
      summary: 'Publish a flat rate from a future date, replacing a future value of that date',
      request: jsonBody(FlatRateInputSchema),
      responses: { 201: { description: 'Published' }, ...errorResponses(401, 403, 409, 422) },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      const body = c.req.valid('json')
      await publishFlatRate(ctx, body.key, body.effectiveFrom, body.amount)
      return c.body(null, 201)
    },
  )

  api.openapi(
    createRoute({
      method: 'delete',
      path: '/travel-master/flat-rates/{key}/{effectiveFrom}',
      tags,
      summary: 'Delete a future flat rate',
      request: { params: FlatRateParams },
      responses: { 204: { description: 'Deleted' }, ...errorResponses(401, 403, 404, 409, 422) },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      const p = c.req.valid('param')
      await deleteFlatRate(ctx, p.key, p.effectiveFrom)
      return c.body(null, 204)
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/travel-master/advance-bands',
      tags,
      summary: 'The advance bands of a kind in effect on a date (default today), and all their start dates',
      request: { query: BandSetQuery },
      responses: { 200: jsonContent(BandSetSchema, 'Advance bands'), ...errorResponses(401, 422) },
    }),
    async (c) => {
      requireUser(c)
      const { kind, on } = c.req.valid('query')
      return c.json(await bandsOf(kind, on ?? todayHrm()), 200)
    },
  )

  api.openapi(
    createRoute({
      method: 'post',
      path: '/travel-master/advance-bands',
      tags,
      summary: 'Publish advance bands from a future date, replacing a future set of that date',
      request: jsonBody(BandSetInputSchema),
      responses: { 201: { description: 'Published' }, ...errorResponses(401, 403, 409, 422) },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      const body = c.req.valid('json')
      await publishBands(ctx, body.kind, body.effectiveFrom, body.bands)
      return c.body(null, 201)
    },
  )

  api.openapi(
    createRoute({
      method: 'delete',
      path: '/travel-master/advance-bands/{kind}/{effectiveFrom}',
      tags,
      summary: 'Delete future advance bands',
      request: { params: BandSetParams },
      responses: { 204: { description: 'Deleted' }, ...errorResponses(401, 403, 404, 409, 422) },
    }),
    async (c) => {
      await requirePermission(ctx, c, MANAGE)
      const p = c.req.valid('param')
      await deleteBands(ctx, p.kind, p.effectiveFrom)
      return c.body(null, 204)
    },
  )
}
