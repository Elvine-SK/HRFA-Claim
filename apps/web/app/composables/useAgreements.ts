import type { DataResponse } from '@elvine-sk/platform-core'
import type { ApiError } from '@elvine-sk/platform-nuxt/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { components } from '~/types/api'

type Schemas = components['schemas']

export type Agreement = Schemas['Agreement']
export type AgreementListItem = Schemas['AgreementListItem']
export type AgreementMember = Schemas['AgreementMember']
export type AgreementInput = Schemas['AgreementInput']
export type AgreementMemberInput = Schemas['AgreementMemberInput']
export type FormType = Agreement['formType']
export type PolicyOption = Agreement['policyOption']
export type AgreementStatus = Agreement['status']
export type HrmPlace = Schemas['HrmPlace']
export type HrmPositionOption = Schemas['HrmPositionOption']

export const AGREEMENTS_KEY = 'agreements'
export const FORM_TYPES: FormType[] = ['domestic', 'district', 'overseas', 'border']
export const POLICY_OPTIONS: PolicyOption[] = [
  'bcel_all',
  'host_travel',
  'host_accommodation',
  'host_meals',
  'host_meals_accommodation',
]
export const STATUS_TONE: Record<AgreementStatus, 'neutral' | 'info' | 'success' | 'error'> = {
  draft: 'neutral',
  in_approval: 'info',
  approved: 'success',
  cancelled: 'error',
}

/** Days from departure to return, both counted; `null` while either date is missing or out of order. */
export function daysInclusive(from: string | undefined, to: string | undefined): number | null {
  if (!from || !to) return null
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1
  return Number.isInteger(days) && days >= 1 ? days : null
}

/** The Lao or English name of an HRM place. */
export function usePlaceName() {
  const { locale } = useI18n()
  return (p: HrmPlace | undefined | null) => (p ? (locale.value === 'lo' ? p.nameLo : (p.nameEn ?? p.nameLo)) : '')
}

export function useAgreement(id: MaybeRefOrGetter<string | null | undefined>) {
  return useApiItem<Agreement>(AGREEMENTS_KEY, () => (toValue(id) ? `/agreements/${toValue(id)}` : null))
}

export function useAgreementHistory(id: MaybeRefOrGetter<string>) {
  return useApiItem<Schemas['AgreementHistoryEntry'][]>(AGREEMENTS_KEY, () => `/agreements/${toValue(id)}/history`)
}

export function useProvinces() {
  return useApiItem<HrmPlace[]>('hrm-places', '/hrm/provinces', { staleTime: 300_000 })
}

export function useDistricts(province: MaybeRefOrGetter<string | null | undefined>) {
  return useApiItem<HrmPlace[]>('hrm-places', () => (toValue(province) ? `/hrm/provinces/${toValue(province)}/districts` : null), {
    staleTime: 300_000,
  })
}

/** HRM positions whose name starts with `q` (two letters at least), for the "ວ່າການ" field. */
export function usePositions(q: MaybeRefOrGetter<string>) {
  const api = useApi()
  return useQuery<HrmPositionOption[], ApiError>({
    enabled: computed(() => toValue(q).trim().length >= 2),
    queryKey: computed(() => ['hrm-positions', toValue(q).trim()] as const),
    queryFn: async ({ signal }) =>
      (await api<DataResponse<HrmPositionOption[]>>(`/hrm/positions?q=${encodeURIComponent(toValue(q).trim())}`, { signal }))
        .data,
    staleTime: 60_000,
  })
}

export function useAgreementMutations() {
  const api = useApi()
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: [AGREEMENTS_KEY] })
  const mutation = <V, R>(run: (value: V) => Promise<R>) =>
    useMutation<R, ApiError, V>({ mutationFn: run, onSuccess: () => invalidate() })
  return {
    create: mutation(
      async (body: AgreementInput) =>
        (await api<DataResponse<Agreement>>('/agreements', { method: 'POST', body })).data,
    ),
    update: mutation(
      async (v: { id: string; version: number; body: AgreementInput }) =>
        (
          await api<DataResponse<Agreement>>(`/agreements/${v.id}`, {
            method: 'PUT',
            body: { ...v.body, version: v.version },
          })
        ).data,
    ),
    cancel: mutation(
      async (v: { id: string; version: number; reason: string }) =>
        (
          await api<DataResponse<Agreement>>(`/agreements/${v.id}/cancel`, {
            method: 'POST',
            body: { version: v.version, reason: v.reason },
          })
        ).data,
    ),
    lookup: mutation(
      async (number: string) =>
        (await api<DataResponse<Agreement>>(`/agreements/lookup?number=${encodeURIComponent(number)}`)).data,
    ),
  }
}
