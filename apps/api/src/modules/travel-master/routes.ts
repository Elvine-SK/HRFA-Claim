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
  BorderRouteUpdateSchema,
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
}
