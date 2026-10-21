import type { DataResponse } from '@elvine-sk/platform-core'
import type { ApiError } from '@elvine-sk/platform-nuxt/utils'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { components } from '~/types/api'

type Schemas = components['schemas']

export type TravelRank = Schemas['TravelRank']
export type TravelZone = Schemas['TravelZone']
export type TravelGlAccount = Schemas['TravelGlAccount']
export type TravelRankMap = Schemas['TravelRankMap']
export type TravelHrmPostType = Schemas['TravelHrmPostType']
export type TravelCountry = Schemas['TravelCountry']
export type TravelCountryCreate = Schemas['TravelCountryCreate']
export type TravelCountryUpdate = Schemas['TravelCountryUpdate']
export type TravelBorderRoute = Schemas['TravelBorderRoute']
export type TravelBorderRouteCreate = Schemas['TravelBorderRouteCreate']
export type TravelBorderRouteUpdate = Schemas['TravelBorderRouteUpdate']
export type TravelRateSet = Schemas['TravelRateSet']
export type TravelRateSetInput = Schemas['TravelRateSetInput']
export type TravelFlatRateOverview = Schemas['TravelFlatRateOverview']
export type TravelFlatRateInput = Schemas['TravelFlatRateInput']
export type TravelBandSet = Schemas['TravelAdvanceBandSet']
export type TravelBandSetInput = Schemas['TravelAdvanceBandSetInput']
export type AdvanceKind = TravelBandSetInput['kind']
export type FlatRateKey = TravelFlatRateInput['key']

export const TRAVEL_MASTER_KEY = 'travel-master'
export const RANK_CODES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9'] as const
export const FLAT_RATE_KEYS: FlatRateKey[] = ['same_day', 'fuel_price', 'km_per_litre']
export const ADVANCE_KINDS: AdvanceKind[] = ['domestic_days', 'group_size']
/** Currency of an amount that has one; `km_per_litre` is a plain number. */
export const FLAT_RATE_CURRENCY: Record<FlatRateKey, 'LAK' | null> = {
  same_day: 'LAK',
  fuel_price: 'LAK',
  km_per_litre: null,
}
export const ADVANCE_CURRENCY: Record<AdvanceKind, 'LAK' | 'USD'> = { domestic_days: 'LAK', group_size: 'USD' }

/** What the API accepts for an amount: a plain decimal with at most two decimals. */
export const AMOUNT_PATTERN = /^\d{1,13}(\.\d{1,2})?$/
export const isAmount = (value: string) => AMOUNT_PATTERN.test(value)
export const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)

/** Thousands separators on the decimal string itself: amounts never go through `Number`. */
export function formatAmount(amount: string | null | undefined, currency?: string | null): string {
  if (amount === null || amount === undefined || amount === '') return '—'
  const [whole = '', fraction] = amount.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const text = fraction ? `${grouped}.${fraction}` : grouped
  return currency ? `${text} ${currency}` : text
}

/** Today in Laos, as `YYYY-MM-DD`: the date the API treats as "today" for sets in effect. */
export function todayLaos(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Vientiane' }).format(new Date())
}

/** Same rule as the API: only the fuel price may start today; every other set must start after today. */
export function isLockedFlatRate(key: string, effectiveFrom: string): boolean {
  const today = todayLaos()
  return key === 'fuel_price' ? effectiveFrom < today : effectiveFrom <= today
}

/** The name of a reference row in the language of the screen. */
export function useLocalName() {
  const { locale } = useI18n()
  return <T extends { nameEn: string; nameLo: string }>(row: T | undefined | null) =>
    row ? (locale.value === 'lo' ? row.nameLo : row.nameEn) : ''
}

const BASE = '/travel-master'
const reference = <T>(name: string) => () => useApiItem<T[]>(TRAVEL_MASTER_KEY, `${BASE}/${name}`, { staleTime: 60_000 })

export const useTravelRanks = reference<TravelRank>('ranks')
export const useTravelZones = reference<TravelZone>('zones')
export const useTravelGlAccounts = reference<TravelGlAccount>('gl-accounts')
export const useTravelRankMap = reference<TravelRankMap>('rank-map')
export const useTravelPostTypes = reference<TravelHrmPostType>('post-types')
export const useTravelFlatRates = reference<TravelFlatRateOverview>('flat-rates')

export function useTravelBorderRoutes() {
  return useApiItem<TravelBorderRoute[]>(TRAVEL_MASTER_KEY, `${BASE}/border-routes`)
}

/** The rate set of a zone in effect on a date (today without one), and every start date of the zone. */
export function useTravelRateSet(zone: MaybeRefOrGetter<string>, on: MaybeRefOrGetter<string | undefined>) {
  const api = useApi()
  return useQuery<TravelRateSet, ApiError>({
    enabled: computed(() => !!toValue(zone)),
    queryKey: computed(() => [TRAVEL_MASTER_KEY, 'rates', toValue(zone), toValue(on) ?? null] as const),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ zone: toValue(zone) })
      const date = toValue(on)
      if (date) params.set('on', date)
      return api<TravelRateSet>(`${BASE}/rates?${params}`, { signal })
    },
    placeholderData: keepPreviousData,
  })
}

export function useTravelBandSet(kind: MaybeRefOrGetter<AdvanceKind>, on: MaybeRefOrGetter<string | undefined> = undefined) {
  const api = useApi()
  return useQuery<TravelBandSet, ApiError>({
    queryKey: computed(() => [TRAVEL_MASTER_KEY, 'bands', toValue(kind), toValue(on) ?? null] as const),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ kind: toValue(kind) })
      const date = toValue(on)
      if (date) params.set('on', date)
      return api<TravelBandSet>(`${BASE}/advance-bands?${params}`, { signal })
    },
    placeholderData: keepPreviousData,
  })
}

const seg = encodeURIComponent

export function useTravelMasterMutations() {
  const api = useApi()
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: [TRAVEL_MASTER_KEY] })
  const mutation = <V, R = void>(run: (value: V) => Promise<R>) =>
    useMutation<R, ApiError, V>({ mutationFn: run, onSuccess: () => invalidate() })

  return {
    mapRank: mutation(async (v: { postType: number; rankCode: string }) => {
      await api(`${BASE}/rank-map/${v.postType}`, { method: 'PUT', body: { rankCode: v.rankCode } })
    }),
    unmapRank: mutation(async (postType: number) => {
      await api(`${BASE}/rank-map/${postType}`, { method: 'DELETE' })
    }),
    createCountry: mutation(
      async (body: TravelCountryCreate) =>
        (await api<DataResponse<TravelCountry>>(`${BASE}/countries`, { method: 'POST', body })).data,
    ),
    updateCountry: mutation(
      async (v: { id: string; patch: TravelCountryUpdate }) =>
        (await api<DataResponse<TravelCountry>>(`${BASE}/countries/${seg(v.id)}`, { method: 'PATCH', body: v.patch }))
          .data,
    ),
    createBorderRoute: mutation(
      async (body: TravelBorderRouteCreate) =>
        (await api<DataResponse<TravelBorderRoute>>(`${BASE}/border-routes`, { method: 'POST', body })).data,
    ),
    updateBorderRoute: mutation(
      async (v: { id: string; patch: TravelBorderRouteUpdate }) =>
        (
          await api<DataResponse<TravelBorderRoute>>(`${BASE}/border-routes/${seg(v.id)}`, {
            method: 'PATCH',
            body: v.patch,
          })
        ).data,
    ),
    publishRates: mutation(async (body: TravelRateSetInput) => {
      await api(`${BASE}/rates`, { method: 'POST', body })
    }),
    deleteRates: mutation(async (v: { zoneCode: string; effectiveFrom: string }) => {
      await api(`${BASE}/rates/${seg(v.zoneCode)}/${seg(v.effectiveFrom)}`, { method: 'DELETE' })
    }),
    publishFlatRate: mutation(async (body: TravelFlatRateInput) => {
      await api(`${BASE}/flat-rates`, { method: 'POST', body })
    }),
    deleteFlatRate: mutation(async (v: { key: FlatRateKey; effectiveFrom: string }) => {
      await api(`${BASE}/flat-rates/${seg(v.key)}/${seg(v.effectiveFrom)}`, { method: 'DELETE' })
    }),
    publishBands: mutation(async (body: TravelBandSetInput) => {
      await api(`${BASE}/advance-bands`, { method: 'POST', body })
    }),
    deleteBands: mutation(async (v: { kind: AdvanceKind; effectiveFrom: string }) => {
      await api(`${BASE}/advance-bands/${seg(v.kind)}/${seg(v.effectiveFrom)}`, { method: 'DELETE' })
    }),
  }
}

/** Confirm, run, toast: for deleting a future set. Resolves `true` when it was deleted. */
export function useConfirmedRemoval() {
  const { t } = useI18n()
  const confirm = useConfirm()
  const notify = useNotify()
  return async (name: string, run: () => Promise<unknown>) => {
    const ok = await confirm({
      title: t('platform.confirm.deleteTitle', { name }),
      description: t('master.futureOnlyText'),
      confirmLabel: t('platform.actions.delete'),
      danger: true,
    })
    if (!ok) return false
    try {
      await run()
      notify.success(t('master.deleted', { name }))
      return true
    } catch (error) {
      notify.error(error)
      return false
    }
  }
}
