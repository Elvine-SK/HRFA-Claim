import { setClock, uuidv7 } from '@elvine-sk/platform-core'
import { currentDb, runWithContext, SYSTEM_CONTEXT, uuidBin } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  advanceOn,
  countryByIso2,
  flatRateOn,
  postingEntries,
  rankForPostType,
  rateOn,
  zoneOf,
} from '../src/modules/travel-master/lookups.ts'
import { adminClient, API, bootApp, DOWN_URL, role, userWith } from './helpers.ts'

describe.skipIf(!dbTestsEnabled)('travel-master reference data', () => {
  let platform: PlatformApp
  const sys = <T>(fn: () => Promise<T>) => runWithContext(SYSTEM_CONTEXT, fn)

  beforeAll(async () => {
    platform = await bootApp()
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('maps PostType 7 to P3 and nothing else yet', async () => {
    await sys(async () => {
      expect(await rankForPostType(7)).toBe('P3')
      expect(await rankForPostType(3)).toBeNull()
    })
  })

  it('gives each zone its currency', async () => {
    await sys(async () => {
      expect(await zoneOf('OB1')).toMatchObject({ code: 'OB1', kind: 'border', currency: 'LAK' })
      expect(await zoneOf('OA2')).toMatchObject({ code: 'OA2', kind: 'overseas', currency: 'USD' })
    })
  })

  it('seeds the rates of the code file', async () => {
    await sys(async () => {
      expect(await rateOn('OE1', 'P1', '2026-10-21')).toMatchObject({
        daily: '180.00',
        accommodation: '430.00',
        personal: '320.00',
        currency: 'USD',
        effectiveFrom: '2026-01-01',
      })
      expect(await rateOn('OA2', 'P9', '2026-10-21')).toMatchObject({
        daily: '80.00',
        accommodation: '180.00',
        personal: '120.00',
      })
      expect(await rateOn('OB1', 'P6', '2026-10-21')).toMatchObject({
        daily: '270000.00',
        accommodation: '500000.00',
        personal: null,
        currency: 'LAK',
      })
      expect(await rateOn('D', 'P1', '2025-12-31')).toBeNull()
    })
  })

  it('puts countries in the regulation zones', async () => {
    await sys(async () => {
      const codes = ['RO', 'NL', 'GB', 'BR', 'NG', 'TR', 'JP', 'IT', 'US']
      const zones = Object.fromEntries(
        await Promise.all(codes.map(async (c) => [c, (await countryByIso2(c))?.zoneCode])),
      )
      expect(zones).toEqual({
        RO: 'OE2',
        NL: 'OE1',
        GB: 'OE1',
        BR: 'OE1',
        NG: 'OE1',
        TR: 'OA2',
        JP: 'OA1',
        IT: 'OE2',
        US: 'OE1',
      })
      expect(await countryByIso2('FR')).toEqual({ iso2: 'FR', nameLo: 'ຝຣັ່ງ', nameEn: 'France', zoneCode: 'OE1' })
      expect(await countryByIso2('LA')).toBeNull()
      expect(await countryByIso2('TW')).toMatchObject({ zoneCode: 'OA2', nameEn: 'Taiwan', nameLo: 'ໄຕ້ຫວັນ' })
      expect((await countryByIso2('CN'))?.nameLo).toBe('ຈີນ')
      const perZone = await currentDb()
        .selectFrom('travelCountries')
        .select(['zoneCode', (eb) => eb.fn.countAll<number>().as('n')])
        .groupBy('zoneCode')
        .orderBy('zoneCode')
        .execute()
      expect(perZone.map((r) => [r.zoneCode, Number(r.n)])).toEqual([
        ['OA1', 15],
        ['OA2', 48],
        ['OE1', 98],
        ['OE2', 36],
      ])
    })
  })

  it('refuses a country in a zone that does not exist', async () => {
    const now = new Date()
    await expect(
      sys(() =>
        currentDb()
          .insertInto('travelCountries')
          .values({
            id: uuidBin(uuidv7()),
            createdAt: now,
            updatedAt: now,
            iso2: 'XX',
            nameLo: 'x',
            nameEn: 'x',
            zoneCode: 'ZZ',
          })
          .execute(),
      ),
    ).rejects.toThrow(/foreign key/i)
  })

  it('finds advance bands at their boundaries', async () => {
    await sys(async () => {
      const d = (n: number) => advanceOn('domestic_days', n, '2026-10-21').then((r) => r?.amount)
      expect(await Promise.all([1, 2, 3, 5, 6, 10, 11, 40].map(d))).toEqual([
        '2000000.00',
        '2000000.00',
        '3500000.00',
        '3500000.00',
        '5000000.00',
        '5000000.00',
        '7000000.00',
        '7000000.00',
      ])
      const g = (n: number) => advanceOn('group_size', n, '2026-10-21').then((r) => r?.amount)
      expect(await Promise.all([1, 2, 5, 6, 10, 11].map(g))).toEqual([
        '1000.00',
        '1500.00',
        '1500.00',
        '2000.00',
        '2000.00',
        '2500.00',
      ])
      expect(await advanceOn('group_size', 0, '2026-10-21')).toBeNull()
      expect(await advanceOn('domestic_days', 3, '2026-10-21')).toMatchObject({ currency: 'LAK' })
      expect(await advanceOn('group_size', 3, '2026-10-21')).toMatchObject({ currency: 'USD' })
    })
  })

  it('has the flat rates and seven GL accounts', async () => {
    await sys(async () => {
      expect((await flatRateOn('same_day', '2026-10-21'))?.amount).toBe('150000.00')
      expect((await flatRateOn('km_per_litre', '2026-10-21'))?.amount).toBe('7.00')
      expect(await flatRateOn('fuel_price', '2026-10-21')).toBeNull()
      const gl = await currentDb().selectFrom('travelGlAccounts').select(['gl', 'seq']).execute()
      expect(gl).toHaveLength(7)
      expect(gl.every((r) => r.seq === '0001')).toBe(true)
    })
  })

  it('takes the newer set from its first day', async () => {
    const id = uuidv7()
    await sys(() =>
      currentDb()
        .insertInto('travelRates')
        .values({
          id: uuidBin(id),
          zoneCode: 'OE2',
          rankCode: 'P1',
          effectiveFrom: '2026-12-01',
          daily: '170.00',
          accommodation: '330.00',
          personal: '300.00',
          createdAt: new Date(),
          createdBy: null,
        })
        .execute(),
    )
    try {
      await sys(async () => {
        expect((await rateOn('OE2', 'P1', '2026-11-30'))?.daily).toBe('160.00')
        expect(await rateOn('OE2', 'P1', '2026-12-01')).toMatchObject({ daily: '170.00', effectiveFrom: '2026-12-01' })
      })
    } finally {
      await sys(() => currentDb().deleteFrom('travelRates').where('id', '=', uuidBin(id)).execute())
    }
  })
})

describe.skipIf(!dbTestsEnabled)('travel-master routes', () => {
  let platform: PlatformApp
  let manager: TestClient
  let someone: TestClient
  const sys = <T>(fn: () => Promise<T>) => runWithContext(SYSTEM_CONTEXT, fn)
  const url = (path: string) => `${API}/travel-master${path}`
  const missing = '01900000-0000-7000-8000-000000000000'

  beforeAll(async () => {
    platform = await bootApp()
    const admin = await adminClient(platform)
    const roleId = await role(admin, 'travel_master_manager', ['travel_master.manage'])
    manager = (await userWith(platform, admin, [roleId])).client
    someone = (await userWith(platform, admin)).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('lets any signed-in user read reference data', async () => {
    const res = await someone.get(url('/zones'))
    expect(res.status).toBe(200)
    expect(res.body.data.map((z: { code: string }) => z.code)).toEqual(['D', 'OB1', 'OA1', 'OA2', 'OE1', 'OE2'])
    expect((await new TestClient(platform).get(url('/zones'))).status).toBe(401)
  })

  it('lists ranks, GL accounts and the rank map', async () => {
    const ranks = await someone.get(url('/ranks'))
    expect(ranks.status).toBe(200)
    expect(ranks.body.data.map((r: { code: string }) => r.code)).toEqual([
      'P1',
      'P2',
      'P3',
      'P4',
      'P5',
      'P6',
      'P7',
      'P8',
      'P9',
    ])
    const gl = await someone.get(url('/gl-accounts'))
    expect(gl.status).toBe(200)
    expect(gl.body.data).toHaveLength(7)
    const map = await someone.get(url('/rank-map'))
    expect(map.status).toBe(200)
    expect(map.body.data).toEqual([expect.objectContaining({ postType: 7, rankCode: 'P3', version: 1 })])
    expect((await new TestClient(platform).get(url('/rank-map'))).status).toBe(401)
  })

  it('lists the payment entries', async () => {
    type Entry = { component: string; side: string; accountKind: string; gl: string | null; glNameEn: string | null }
    const entries = async (zoneKind: string) => {
      const res = await someone.get(url(`/posting-entries?zoneKind=${zoneKind}`))
      expect(res.status).toBe(200)
      return res.body.data as Entry[]
    }
    const domestic = await entries('domestic')
    expect(domestic).toHaveLength(8)
    expect(domestic.map((e) => `${e.component} ${e.side}`)).toEqual([
      'daily DR',
      'daily CR',
      'accommodation DR',
      'accommodation CR',
      'fuel DR',
      'fuel CR',
      'advance DR',
      'advance CR',
    ])
    expect(domestic.find((e) => e.component === 'accommodation' && e.side === 'DR')).toMatchObject({
      gl: '4408730001',
      accountKind: 'gl',
      glNameEn: 'Expense on Accomodati',
    })
    expect(domestic.find((e) => e.side === 'CR')).toMatchObject({ accountKind: 'member', gl: null, glNameEn: null })
    const components = async (zoneKind: string) => [...new Set((await entries(zoneKind)).map((e) => e.component))]
    expect(await components('border')).toEqual(['daily', 'accommodation', 'fuel', 'advance'])
    expect(await components('overseas')).toEqual(['daily', 'accommodation', 'personal', 'advance'])
    expect((await someone.get(url('/posting-entries?zoneKind=moon'))).status).toBe(422)
    expect((await new TestClient(platform).get(url('/posting-entries?zoneKind=domestic'))).status).toBe(401)
  })

  it('looks up posting entries by case and zone kind', async () => {
    await sys(async () => {
      expect(await postingEntries('payment', 'overseas')).toHaveLength(8)
      expect(await postingEntries('settlement', 'overseas')).toEqual([])
    })
  })

  it('refuses writes without travel_master.manage', async () => {
    expect((await someone.put(url('/rank-map/9'), { rankCode: 'P9' })).status).toBe(403)
    expect((await someone.delete(url('/rank-map/7'))).status).toBe(403)
    expect((await someone.post(url('/border-routes'), { nameLo: 'x', nameEn: 'x' })).status).toBe(403)
    const country = { iso2: 'XK', nameLo: 'x', nameEn: 'x', zoneCode: 'OE1' }
    expect((await someone.post(url('/countries'), country)).status).toBe(403)
    expect((await someone.patch(url(`/countries/${missing}`), { version: 1 })).status).toBe(403)
    expect((await someone.patch(url(`/border-routes/${missing}`), { version: 1 })).status).toBe(403)
    expect((await someone.get(url('/post-types'))).status).toBe(403)
  })

  it('maps, remaps and unmaps a PostType', async () => {
    expect((await manager.put(url('/rank-map/9'), { rankCode: 'P9' })).status).toBe(200)
    const remapped = await manager.put(url('/rank-map/9'), { rankCode: 'P8' })
    expect(remapped.body.data).toMatchObject({ postType: 9, rankCode: 'P8', version: 2 })
    expect((await manager.put(url('/rank-map/9'), { rankCode: 'P0' })).status).toBe(422)
    expect((await manager.delete(url('/rank-map/9'))).status).toBe(204)
    const left = (await someone.get(url('/rank-map'))).body.data.map((m: { postType: number }) => m.postType)
    expect(left).toEqual([7])
  })

  it('refuses to unmap a PostType that is not mapped', async () => {
    expect((await manager.delete(url('/rank-map/99'))).status).toBe(404)
  })

  it('lists HRM PostTypes with their mapping', async () => {
    const res = await manager.get(url('/post-types'))
    expect(res.status).toBe(200)
    expect(res.body.data.find((p: { postType: number }) => p.postType === 7)).toMatchObject({ mapped: 'P3' })
  })

  it('searches countries by first letters in both languages', async () => {
    for (const q of ['ຝຣັ່ງ', 'fra', 'FR']) {
      const res = await someone.get(`${url('/countries')}?search=${encodeURIComponent(q)}`)
      expect(res.status).toBe(200)
      expect(res.body.data.map((c: { iso2: string }) => c.iso2)).toContain('FR')
    }
    const byQ = await someone.get(`${url('/countries')}?q=fra`)
    expect(byQ.body.data.map((c: { iso2: string }) => c.iso2)).toContain('FR')
  })

  it('filters countries by zone and pages them', async () => {
    const res = await someone.get(`${url('/countries')}?filter[zoneCode][eq]=OA1&pageSize=5`)
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBeLessThanOrEqual(5)
    expect(res.body.data.every((c: { zoneCode: string }) => c.zoneCode === 'OA1')).toBe(true)
    expect(res.body.meta.total).toBeGreaterThan(0)
  })

  it('moves a country to another zone, refusing a stale version', async () => {
    const find = async () => (await someone.get(`${url('/countries')}?search=Italy`)).body.data[0]
    const italy = await find()
    try {
      const moved = await manager.patch(url(`/countries/${italy.id}`), { version: italy.version, zoneCode: 'OE1' })
      expect(moved.status).toBe(200)
      expect(moved.body.data).toMatchObject({ zoneCode: 'OE1', version: italy.version + 1 })
      const stale = await manager.patch(url(`/countries/${italy.id}`), { version: italy.version, zoneCode: 'OE2' })
      expect(stale.status).toBe(409)
      const unknown = await manager.patch(url(`/countries/${italy.id}`), { version: italy.version + 1, zoneCode: 'ZZ' })
      expect(unknown.status).toBe(422)
    } finally {
      const now = await find()
      if (now.zoneCode !== 'OE2')
        await manager.patch(url(`/countries/${now.id}`), { version: now.version, zoneCode: 'OE2' })
    }
    expect((await find()).zoneCode).toBe('OE2')
  })

  it('answers 404 for a country that does not exist', async () => {
    expect((await manager.patch(url(`/countries/${missing}`), { version: 1, nameEn: 'x' })).status).toBe(404)
  })

  it('refuses a duplicate country and an unknown zone', async () => {
    const fr = { iso2: 'FR', nameLo: 'x', nameEn: 'x', zoneCode: 'OE1' }
    expect((await manager.post(url('/countries'), fr)).status).toBe(409)
    expect((await manager.post(url('/countries'), { ...fr, iso2: 'fr' })).status).toBe(409)
    expect((await manager.post(url('/countries'), { ...fr, iso2: 'XK', zoneCode: 'ZZ' })).status).toBe(422)
  })

  it('adds a country', async () => {
    const created = await manager.post(url('/countries'), {
      iso2: 'xk',
      nameLo: 'ໂຄໂຊໂວ',
      nameEn: 'Kosovo',
      zoneCode: 'OE1',
    })
    try {
      expect(created.status).toBe(201)
      expect(created.body.data).toMatchObject({ iso2: 'XK', nameEn: 'Kosovo', zoneCode: 'OE1', version: 1 })
    } finally {
      await sys(() => currentDb().deleteFrom('travelCountries').where('iso2', '=', 'XK').execute())
    }
  })

  it('adds and deactivates a border route', async () => {
    const created = await manager.post(url('/border-routes'), {
      nameLo: 'ບໍ່ແກ້ວ – ຊຽງຂອງ',
      nameEn: 'Bokeo – Chiang Khong',
    })
    expect(created.status).toBe(201)
    const { id, version } = created.body.data
    try {
      expect(created.body.data.active).toBe(true)
      const off = await manager.patch(url(`/border-routes/${id}`), { version, active: false })
      expect(off.body.data.active).toBe(false)
      expect((await manager.patch(url(`/border-routes/${id}`), { version, active: true })).status).toBe(409)
      expect((await manager.patch(url(`/border-routes/${missing}`), { version: 1, active: true })).status).toBe(404)
      const active = await someone.get(`${url('/border-routes')}?active=true`)
      expect(active.body.data.map((r: { id: string }) => r.id)).not.toContain(id)
      const all = await someone.get(url('/border-routes'))
      expect(all.status).toBe(200)
      expect(all.body.data.find((r: { id: string }) => r.id === id)).toMatchObject({ active: false })
    } finally {
      await sys(() => currentDb().deleteFrom('travelBorderRoutes').where('id', '=', uuidBin(id)).execute())
    }
  })

  it('records history of a new rank mapping', async () => {
    await manager.put(url('/rank-map/8'), { rankCode: 'P7' })
    try {
      const rows = await sys(() =>
        currentDb().selectFrom('recordHistory').select('action').where('entityType', '=', 'travel_rank_map').execute(),
      )
      expect(rows.map((r) => r.action)).toContain('create')
    } finally {
      await manager.delete(url('/rank-map/8'))
    }
  })
})

describe.skipIf(!dbTestsEnabled)('travel-master effective-dated sets', () => {
  let platform: PlatformApp
  let manager: TestClient
  let someone: TestClient
  const sys = <T>(fn: () => Promise<T>) => runWithContext(SYSTEM_CONTEXT, fn)
  const url = (path: string) => `${API}/travel-master${path}`
  const nine = (daily: string, personal: string | null = null) =>
    ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'].map((rankCode) => ({
      rankCode,
      daily,
      accommodation: '500000',
      personal,
    }))

  const today = () => new Date('2026-10-21T10:00:00+07:00')

  beforeAll(async () => {
    setClock(today) // sign in on the same clock the tests run on
    platform = await bootApp()
    const admin = await adminClient(platform)
    const roleId = await role(admin, 'travel_master_sets_manager', ['travel_master.manage'])
    manager = (await userWith(platform, admin, [roleId])).client
    someone = (await userWith(platform, admin)).client
    setClock(null)
  })
  beforeEach(() => setClock(today))
  afterEach(() => setClock(null))
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('publishes a future rate set and uses it from its first day', async () => {
    const set = { zoneCode: 'D', effectiveFrom: '2027-01-01', rows: nine('330000') }
    expect((await manager.post(url('/rates'), set)).status).toBe(201)
    expect((await someone.get(url('/rates?zone=D&on=2026-12-31'))).body.data.rows[0].daily).toBe('310000.00')
    expect((await someone.get(url('/rates?zone=D&on=2027-01-01'))).body.data.rows[0].daily).toBe('330000.00')
    await sys(async () => {
      expect((await rateOn('D', 'P5', '2027-01-01'))?.daily).toBe('330000.00')
    })
  })

  it('lists the sets of a zone, newest first, and defaults to today in HRM time', async () => {
    const res = await someone.get(url('/rates?zone=D'))
    expect(res.status).toBe(200)
    expect(res.body.sets).toEqual(['2027-01-01', '2026-01-01'])
    expect(res.body.data).toMatchObject({ zoneCode: 'D', currency: 'LAK', effectiveFrom: '2026-01-01' })
    expect(res.body.data.rows.map((r: { rankCode: string }) => r.rankCode)).toEqual([
      'P1',
      'P2',
      'P3',
      'P4',
      'P5',
      'P6',
      'P7',
      'P8',
      'P9',
    ])
    expect((await someone.get(url('/rates?zone=D&on=2025-12-31'))).body.data).toBeNull()
    expect((await someone.get(url('/rates?zone=D&on=2026-02-30'))).status).toBe(422)
    expect((await someone.get(url('/rates?zone=D&on=tomorrow'))).status).toBe(422)
    expect((await someone.get(url('/rates?zone=ZZ'))).status).toBe(422)
    expect((await new TestClient(platform).get(url('/rates?zone=D'))).status).toBe(401)
  })

  it('refuses to change or delete a set in effect, and leaves it unchanged', async () => {
    const post = (effectiveFrom: string) =>
      manager.post(url('/rates'), { zoneCode: 'D', effectiveFrom, rows: nine('1') })
    expect((await post('2026-01-01')).status).toBe(409)
    const today = await post('2026-10-21')
    expect(today.status).toBe(409)
    expect(today.body.error.code).toBe('travel_master.set_in_effect')
    expect((await manager.delete(url('/rates/D/2026-01-01'))).status).toBe(409)
    expect((await someone.get(url('/rates?zone=D&on=2026-10-21'))).body.data.rows[0].daily).toBe('310000.00')
  })

  it('replaces a future set of the same date whole', async () => {
    const set = { zoneCode: 'D', effectiveFrom: '2027-01-01', rows: nine('340000') }
    expect((await manager.post(url('/rates'), set)).status).toBe(201)
    const res = await someone.get(url('/rates?zone=D&on=2027-01-01'))
    expect(res.body.data.rows).toHaveLength(9)
    expect(res.body.data.rows.every((r: { daily: string }) => r.daily === '340000.00')).toBe(true)
  })

  it('audits publishing a set', async () => {
    const rows = await sys(() =>
      currentDb()
        .selectFrom('auditEvents')
        .select(['action', 'details'])
        .where('action', '=', 'travel_master.set_published')
        .execute(),
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(JSON.stringify(rows.map((r) => r.details))).toContain('travel_rates')
  })

  it('deletes a future set, and answers 404 for one that is not there', async () => {
    expect((await manager.delete(url('/rates/D/2027-01-01'))).status).toBe(204)
    expect((await someone.get(url('/rates?zone=D'))).body.sets).toEqual(['2026-01-01'])
    expect((await manager.delete(url('/rates/D/2027-01-01'))).status).toBe(404)
  })

  it('validates a rate set', async () => {
    const post = (zoneCode: string, rows: unknown[]) =>
      manager.post(url('/rates'), { zoneCode, effectiveFrom: '2027-02-01', rows })
    expect((await post('D', nine('1').slice(1))).status).toBe(422)
    expect((await post('D', [...nine('1').slice(1), ...nine('1').slice(1, 2)])).status).toBe(422)
    const missing = await post('OE1', nine('100')) // personal missing
    expect(missing.status).toBe(422)
    expect(missing.body.error.code).toBe('travel_master.personal_invalid')
    const onLak = await post('D', nine('1', '5')) // personal on a LAK zone
    expect(onLak.status).toBe(422)
    expect(onLak.body.error.code).toBe('travel_master.personal_invalid')
    expect((await post('D', nine('1').slice(1))).body.error.code).toBe('travel_master.rates_invalid')
    expect((await post('D', nine('1.234'))).status).toBe(422)
    expect((await post('ZZ', nine('1'))).status).toBe(422)
    const badDate = { zoneCode: 'D', effectiveFrom: '2027-02-30', rows: nine('1') }
    expect((await manager.post(url('/rates'), badDate)).status).toBe(422)
    expect((await post('OE1', nine('100', '50'))).status).toBe(201)
    expect((await manager.delete(url('/rates/OE1/2027-02-01'))).status).toBe(204)
  })

  it.each([
    [
      [
        { minCount: 1, maxCount: 2, amount: '1' },
        { minCount: 4, maxCount: null, amount: '2' },
      ],
    ],
    [
      [
        { minCount: 1, maxCount: 3, amount: '1' },
        { minCount: 3, maxCount: null, amount: '2' },
      ],
    ],
    [
      [
        { minCount: 1, maxCount: 2, amount: '1' },
        { minCount: 3, maxCount: 5, amount: '2' },
      ],
    ],
    [[{ minCount: 2, maxCount: null, amount: '1' }]],
    [
      [
        { minCount: 1, maxCount: null, amount: '1' },
        { minCount: 2, maxCount: null, amount: '2' },
      ],
    ],
  ])('refuses advance bands with a gap, overlap or no open end: %j', async (bands) => {
    const res = await manager.post(url('/advance-bands'), { kind: 'group_size', effectiveFrom: '2027-01-01', bands })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('travel_master.bands_invalid')
  })

  it('publishes, reads and deletes advance bands', async () => {
    const bands = [
      { minCount: 1, maxCount: 3, amount: '100' },
      { minCount: 4, maxCount: null, amount: '200' },
    ]
    const post = (effectiveFrom: string) =>
      manager.post(url('/advance-bands'), { kind: 'group_size', effectiveFrom, bands })
    expect((await post('2027-01-01')).status).toBe(201)
    const current = await someone.get(url('/advance-bands?kind=group_size'))
    expect(current.status).toBe(200)
    expect(current.body.sets).toEqual(['2027-01-01', '2026-01-01'])
    expect(current.body.data.effectiveFrom).toBe('2026-01-01')
    const later = await someone.get(url('/advance-bands?kind=group_size&on=2027-01-01'))
    expect(later.body.data).toMatchObject({ kind: 'group_size', currency: 'USD', effectiveFrom: '2027-01-01' })
    expect(later.body.data.bands).toEqual([
      { minCount: 1, maxCount: 3, amount: '100.00' },
      { minCount: 4, maxCount: null, amount: '200.00' },
    ])
    await sys(async () => {
      expect((await advanceOn('group_size', 5, '2027-01-01'))?.amount).toBe('200.00')
    })
    expect((await post('2026-10-21')).status).toBe(409)
    expect((await manager.delete(url('/advance-bands/group_size/2026-01-01'))).status).toBe(409)
    expect((await manager.delete(url('/advance-bands/group_size/2027-01-01'))).status).toBe(204)
    expect((await someone.get(url('/advance-bands?kind=group_size'))).body.sets).toEqual(['2026-01-01'])
    expect((await someone.get(url('/advance-bands?kind=nope'))).status).toBe(422)
  })

  it('lists flat rates, enters the fuel price for tomorrow and reads it then', async () => {
    const post = (key: string, effectiveFrom: string, amount: string) =>
      manager.post(url('/flat-rates'), { key, effectiveFrom, amount })
    expect((await post('fuel_price', '2026-10-22', '32500')).status).toBe(201)
    await sys(async () => {
      expect(await flatRateOn('fuel_price', '2026-10-21')).toBeNull()
      expect((await flatRateOn('fuel_price', '2026-10-22'))?.amount).toBe('32500.00')
    })
    const res = await someone.get(url('/flat-rates'))
    expect(res.status).toBe(200)
    const by = Object.fromEntries(res.body.data.map((r: { key: string }) => [r.key, r]))
    expect(by.same_day).toMatchObject({ current: { effectiveFrom: '2026-01-01', amount: '150000.00' }, future: [] })
    expect(by.fuel_price).toEqual({
      key: 'fuel_price',
      current: null,
      future: [{ effectiveFrom: '2026-10-22', amount: '32500.00' }],
    })
    expect((await post('bogus', '2027-01-01', '1')).status).toBe(422)
    expect((await post('same_day', '2027-01-01', '1.234')).status).toBe(422)
    expect((await manager.delete(url('/flat-rates/same_day/2026-01-01'))).status).toBe(409)
    expect((await manager.delete(url('/flat-rates/fuel_price/2026-10-22'))).status).toBe(204)
    expect((await manager.delete(url('/flat-rates/fuel_price/2026-10-22'))).status).toBe(404)
    expect((await new TestClient(platform).get(url('/flat-rates'))).status).toBe(401)
  })

  it('lets the fuel price start today, and nothing else', async () => {
    const post = (key: string, effectiveFrom: string) =>
      manager.post(url('/flat-rates'), { key, effectiveFrom, amount: '33000' })
    expect((await post('fuel_price', '2026-10-21')).status).toBe(201)
    await sys(async () => expect((await flatRateOn('fuel_price', '2026-10-21'))?.amount).toBe('33000.00'))
    const yesterday = await post('fuel_price', '2026-10-20')
    expect(yesterday.status).toBe(409)
    expect(yesterday.body.error.code).toBe('travel_master.set_in_effect')
    const sameDay = await post('same_day', '2026-10-21')
    expect(sameDay.status).toBe(409)
    expect(sameDay.body.error.code).toBe('travel_master.set_in_effect')
    expect((await post('km_per_litre', '2026-10-21')).status).toBe(409)
    expect((await manager.delete(url('/flat-rates/fuel_price/2026-10-20'))).status).toBe(409)
    expect((await manager.delete(url('/flat-rates/fuel_price/2026-10-21'))).status).toBe(204)
  })

  it('refuses sets without travel_master.manage', async () => {
    const bands = [{ minCount: 1, maxCount: null, amount: '1' }]
    const rates = { zoneCode: 'D', effectiveFrom: '2027-01-01', rows: nine('1') }
    expect((await someone.post(url('/rates'), rates)).status).toBe(403)
    expect((await someone.delete(url('/rates/D/2027-01-01'))).status).toBe(403)
    expect(
      (await someone.post(url('/flat-rates'), { key: 'same_day', effectiveFrom: '2027-01-01', amount: '1' })).status,
    ).toBe(403)
    expect((await someone.delete(url('/flat-rates/same_day/2027-01-01'))).status).toBe(403)
    expect(
      (await someone.post(url('/advance-bands'), { kind: 'group_size', effectiveFrom: '2027-01-01', bands })).status,
    ).toBe(403)
    expect((await someone.delete(url('/advance-bands/group_size/2027-01-01'))).status).toBe(403)
  })
})

describe.skipIf(!dbTestsEnabled)('travel-master today in HRM time', () => {
  let platform: PlatformApp
  let manager: TestClient

  beforeAll(async () => {
    setClock(() => new Date('2026-10-21T16:59:00Z')) // 23:59 on the 21st at +07:00; sign in on this clock
    platform = await bootApp()
    const admin = await adminClient(platform)
    const roleId = await role(admin, 'travel_master_today_manager', ['travel_master.manage'])
    manager = (await userWith(platform, admin, [roleId])).client
  })
  afterAll(async () => {
    setClock(null)
    await platform?.ctx.db.destroy()
  })

  it('counts the day at +07:00, not in UTC', async () => {
    const post = () =>
      manager.post(`${API}/travel-master/flat-rates`, { key: 'same_day', effectiveFrom: '2026-10-22', amount: '1' })
    expect((await post()).status).toBe(201)
    expect((await manager.delete(`${API}/travel-master/flat-rates/same_day/2026-10-22`)).status).toBe(204)
    setClock(() => new Date('2026-10-21T17:01:00Z')) // 00:01 on the 22nd at +07:00
    expect((await post()).status).toBe(409)
  })
})

describe.skipIf(!dbTestsEnabled)('travel-master routes with HRM down', () => {
  let platform: PlatformApp
  let manager: TestClient

  beforeAll(async () => {
    platform = await bootApp({ hrmUrl: DOWN_URL })
    const admin = await adminClient(platform)
    const roleId = await role(admin, 'travel_master_manager_down', ['travel_master.manage'])
    manager = (await userWith(platform, admin, [roleId])).client
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('answers 503 on post-types but still serves the rest', async () => {
    expect((await manager.get(`${API}/travel-master/post-types`)).status).toBe(503)
    expect((await manager.get(`${API}/travel-master/zones`)).status).toBe(200)
  })
})
