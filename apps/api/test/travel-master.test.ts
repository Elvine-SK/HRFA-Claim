import { uuidv7 } from '@elvine-sk/platform-core'
import { currentDb, runWithContext, SYSTEM_CONTEXT, uuidBin } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  advanceOn,
  countryByIso2,
  flatRateOn,
  rankForPostType,
  rateOn,
  zoneOf,
} from '../src/modules/travel-master/lookups.ts'
import { bootApp } from './helpers.ts'

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
