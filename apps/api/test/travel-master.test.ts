import { uuidv7 } from '@elvine-sk/platform-core'
import { currentDb, runWithContext, SYSTEM_CONTEXT, uuidBin } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  advanceOn,
  countryByIso2,
  flatRateOn,
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
