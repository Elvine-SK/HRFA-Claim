import { AppError, uuidv7, type ListQuery } from '@elvine-sk/platform-core'
import {
  createdStamp,
  currentDb,
  escapeLike,
  inTransaction,
  paginate,
  scopedBy,
  source,
  updateVersioned,
  uuidBin,
  writeHistory,
} from '@elvine-sk/platform-db'
import { toIso } from '@elvine-sk/platform-server'
import '../../sources/hrm.ts'
import { borderRouteHistory, countryFields, countryHistory, rankMapHistory } from './schema.ts'

export const listRanks = () =>
  currentDb().selectFrom('travelRanks').select(['code', 'nameLo', 'nameEn', 'sortOrder']).orderBy('sortOrder').execute()

export const listZones = () =>
  currentDb()
    .selectFrom('travelZones')
    .select(['code', 'kind', 'currency', 'nameLo', 'nameEn', 'sortOrder'])
    .orderBy('sortOrder')
    .execute()

export const listGlAccounts = () =>
  currentDb()
    .selectFrom('travelGlAccounts')
    .select(['gl', 'seq', 'nameEn', 'nameLo'])
    .orderBy('gl')
    .orderBy('seq')
    .execute()

async function requireRank(code: string) {
  const row = await currentDb().selectFrom('travelRanks').select('code').where('code', '=', code).executeTakeFirst()
  if (!row) throw new AppError('travel_master.unknown_rank', 'Unknown rank', { status: 422 })
}

async function requireZone(code: string) {
  const row = await currentDb().selectFrom('travelZones').select('code').where('code', '=', code).executeTakeFirst()
  if (!row) throw new AppError('travel_master.unknown_zone', 'Unknown zone', { status: 422 })
}

// Rank map

const rankMapRows = () => currentDb().selectFrom('travelRankMap').select(['id', 'postType', 'rankCode', 'version'])

export const listRankMap = () => rankMapRows().orderBy('postType').execute()

const findRankMap = (postType: number) => rankMapRows().where('postType', '=', postType).executeTakeFirst()

export async function putRankMap(postType: number, rankCode: string) {
  await requireRank(rankCode)
  return inTransaction(async () => {
    const before = await findRankMap(postType)
    if (!before) {
      const id = uuidv7()
      await currentDb()
        .insertInto('travelRankMap')
        .values({ ...createdStamp(id), postType, rankCode })
        .execute()
      await writeHistory(rankMapHistory, { entityId: id, version: 1, action: 'create', after: { postType, rankCode } })
    } else {
      const next = await updateVersioned(
        'travel_rank_map',
        before.id,
        before.version,
        { rankCode },
        { softDelete: false },
      )
      await writeHistory(rankMapHistory, {
        entityId: before.id,
        version: next,
        action: 'update',
        before,
        after: { ...before, rankCode },
      })
    }
    return (await findRankMap(postType))!
  })
}

export async function deleteRankMap(postType: number) {
  await inTransaction(async () => {
    const before = await findRankMap(postType)
    if (!before) throw AppError.notFound()
    await currentDb().deleteFrom('travelRankMap').where('id', '=', uuidBin(before.id)).execute()
    await writeHistory(rankMapHistory, { entityId: before.id, version: before.version + 1, action: 'delete', before })
  })
}

/** HRM PostTypes with up to five position names each, and the rank each is mapped to. */
export async function hrmPostTypes() {
  const positions = await source('hrm')
    .selectFrom('hrmPosition')
    .select(['postid', 'postname', 'posttype'])
    .where('posttype', 'is not', null)
    .orderBy('posttype')
    .orderBy('postid')
    .execute()
  const mapped = new Map((await listRankMap()).map((m) => [m.postType, m.rankCode]))
  const byType = new Map<number, string[]>()
  for (const p of positions) {
    const names = byType.get(p.posttype!) ?? []
    const name = p.postname?.trim()
    if (name && names.length < 5 && !names.includes(name)) names.push(name)
    byType.set(p.posttype!, names)
  }
  return [...byType].map(([postType, postNames]) => ({ postType, postNames, mapped: mapped.get(postType) ?? null }))
}

// Countries

interface CountryRow {
  id: string
  iso2: string
  nameLo: string
  nameEn: string
  zoneCode: string
  version: number
  createdAt: Date
  updatedAt: Date
}

const COUNTRY_COLUMNS = ['id', 'iso2', 'nameLo', 'nameEn', 'zoneCode', 'version', 'createdAt', 'updatedAt'] as const

export const toCountry = (row: CountryRow) => ({
  ...row,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
})

/** First letters of the Lao name, the English name or the ISO code; the collation ignores case. */
export async function listCountries(query: ListQuery, term: string | undefined) {
  let qb = currentDb().selectFrom('travelCountries').select(COUNTRY_COLUMNS)
  if (term) {
    const pattern = `${escapeLike(term)}%`
    qb = qb.where((eb) =>
      eb.or([eb('nameLo', 'like', pattern), eb('nameEn', 'like', pattern), eb('iso2', 'like', pattern)]),
    )
  }
  const scoped = scopedBy(qb, 'reference data, every signed-in user')
  const page = await paginate(scoped, { ...query, q: undefined }, countryFields)
  return { data: (page.data as CountryRow[]).map(toCountry), meta: page.meta }
}

async function getCountry(id: string): Promise<CountryRow> {
  const row = await currentDb()
    .selectFrom('travelCountries')
    .select(COUNTRY_COLUMNS)
    .where('id', '=', uuidBin(id))
    .executeTakeFirst()
  if (!row) throw AppError.notFound()
  return row as CountryRow
}

export async function createCountry(input: { iso2: string; nameLo: string; nameEn: string; zoneCode: string }) {
  await requireZone(input.zoneCode)
  const id = uuidv7()
  return inTransaction(async () => {
    const dup = await currentDb()
      .selectFrom('travelCountries')
      .select('id')
      .where('iso2', '=', input.iso2)
      .executeTakeFirst()
    if (dup)
      throw new AppError('travel_master.country_exists', 'A country with this ISO code already exists', {
        status: 409,
      })
    await currentDb()
      .insertInto('travelCountries')
      .values({ ...createdStamp(id), ...input })
      .execute()
    await writeHistory(countryHistory, { entityId: id, version: 1, action: 'create', after: input })
    return getCountry(id)
  })
}

export async function updateCountry(
  id: string,
  version: number,
  patch: { nameLo?: string; nameEn?: string; zoneCode?: string },
) {
  if (patch.zoneCode) await requireZone(patch.zoneCode)
  return inTransaction(async () => {
    const before = await getCountry(id)
    const next = await updateVersioned('travel_countries', id, version, patch, { softDelete: false })
    const after = await getCountry(id)
    await writeHistory(countryHistory, { entityId: id, version: next, action: 'update', before, after })
    return after
  })
}

// Border routes

interface BorderRouteRow {
  id: string
  nameLo: string
  nameEn: string
  active: boolean | number
  version: number
  createdAt: Date
  updatedAt: Date
}

const ROUTE_COLUMNS = ['id', 'nameLo', 'nameEn', 'active', 'version', 'createdAt', 'updatedAt'] as const

const toRoute = (row: BorderRouteRow) => ({
  ...row,
  active: Boolean(row.active),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
})

export async function listBorderRoutes(active?: boolean) {
  let qb = currentDb().selectFrom('travelBorderRoutes').select(ROUTE_COLUMNS)
  if (active !== undefined) qb = qb.where('active', '=', active as never)
  return (await qb.orderBy('nameEn').orderBy('id').execute()).map((r) => toRoute(r as BorderRouteRow))
}

async function getBorderRoute(id: string) {
  const row = await currentDb()
    .selectFrom('travelBorderRoutes')
    .select(ROUTE_COLUMNS)
    .where('id', '=', uuidBin(id))
    .executeTakeFirst()
  if (!row) throw AppError.notFound()
  return row as BorderRouteRow
}

export async function createBorderRoute(input: { nameLo: string; nameEn: string }) {
  const id = uuidv7()
  return inTransaction(async () => {
    await currentDb()
      .insertInto('travelBorderRoutes')
      .values({ ...createdStamp(id), ...input })
      .execute()
    await writeHistory(borderRouteHistory, {
      entityId: id,
      version: 1,
      action: 'create',
      after: { ...input, active: true },
    })
    return toRoute(await getBorderRoute(id))
  })
}

export async function updateBorderRoute(
  id: string,
  version: number,
  patch: { nameLo?: string; nameEn?: string; active?: boolean },
) {
  return inTransaction(async () => {
    const before = await getBorderRoute(id)
    const next = await updateVersioned('travel_border_routes', id, version, patch, { softDelete: false })
    const after = await getBorderRoute(id)
    await writeHistory(borderRouteHistory, {
      entityId: id,
      version: next,
      action: 'update',
      before: { ...before, active: Boolean(before.active) },
      after: { ...after, active: Boolean(after.active) },
    })
    return toRoute(after)
  })
}
