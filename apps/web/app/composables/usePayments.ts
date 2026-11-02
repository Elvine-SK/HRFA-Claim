import type { DataResponse } from '@elvine-sk/platform-core'
import type { ApiError } from '@elvine-sk/platform-nuxt/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { components } from '~/types/api'

type Schemas = components['schemas']

export type Payment = Schemas['Payment']
export type PaymentListItem = Schemas['PaymentListItem']
export type PaymentMember = Schemas['PaymentMember']
export type PaymentItem = Schemas['PaymentItem']
export type PaymentLookup = Schemas['PaymentLookup']
export type PaymentStatus = PaymentListItem['status']
export type PaymentComponent = PaymentItem['component']
export type PostingEntry = Schemas['TravelPostingEntry']
export type ZoneKind = 'domestic' | 'border' | 'overseas'

export const PAYMENTS_KEY = 'payments'
export const PAYMENT_STATUSES: PaymentStatus[] = [
  'calculated',
  'in_approval',
  'approved',
  'exported',
  'posted',
  'void',
  'cancelled_after_export',
]
export const ZONE_KINDS: ZoneKind[] = ['domestic', 'border', 'overseas']
export const PAYMENT_TONE: Record<PaymentStatus, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  calculated: 'neutral',
  in_approval: 'info',
  approved: 'success',
  exported: 'warning',
  posted: 'success',
  void: 'neutral',
  cancelled_after_export: 'error',
}

export function usePayment(id: MaybeRefOrGetter<string | null | undefined>) {
  return useApiItem<Payment>(PAYMENTS_KEY, () => (toValue(id) ? `/payments/${toValue(id)}` : null))
}

export type PostingCase = 'payment' | 'settlement' | 'clearing'
export const POSTING_CASES: PostingCase[] = ['payment', 'settlement', 'clearing']

/** Posting entries of a case (payment, settlement, clearing) for one zone kind (read only master page). */
export function usePostingEntries(caseKey: MaybeRefOrGetter<PostingCase>, zoneKind: MaybeRefOrGetter<ZoneKind>) {
  const api = useApi()
  return useQuery<PostingEntry[], ApiError>({
    queryKey: computed(() => ['travel-master', 'posting-entries', toValue(caseKey), toValue(zoneKind)] as const),
    queryFn: async ({ signal }) =>
      (
        await api<DataResponse<PostingEntry[]>>(
          `/travel-master/posting-entries?caseKey=${toValue(caseKey)}&zoneKind=${toValue(zoneKind)}`,
          { signal },
        )
      ).data,
    staleTime: 60_000,
  })
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function usePaymentMutations() {
  const api = useApi()
  const client = useQueryClient()
  const mutation = <V, R>(run: (value: V) => Promise<R>) =>
    useMutation<R, ApiError, V>({
      mutationFn: run,
      onSuccess: () => client.invalidateQueries({ queryKey: [PAYMENTS_KEY] }),
    })
  const post = async (path: string, body: Record<string, unknown>) =>
    (await api<DataResponse<Payment>>(path, { method: 'POST', body })).data
  return {
    create: mutation((agreementId: string) => post('/payments', { agreementId })),
    lookup: mutation(
      async (number: string) =>
        (await api<DataResponse<PaymentLookup>>(`/payments/lookup?number=${encodeURIComponent(number)}`)).data,
    ),
    recalculate: mutation((v: { id: string; version: number }) =>
      post(`/payments/${v.id}/recalculate`, { version: v.version }),
    ),
    saveBills: mutation(
      async (v: { id: string; version: number; bills: { eid: string; night: number; amount: string }[] }) =>
        (
          await api<DataResponse<Payment>>(`/payments/${v.id}/bills`, {
            method: 'PUT',
            body: { version: v.version, bills: v.bills },
          })
        ).data,
    ),
    exportFile: mutation((v: { id: string; version: number }) => post(`/payments/${v.id}/export`, { version: v.version })),
    markPosted: mutation((v: { id: string; version: number; coreRef?: string }) =>
      post(`/payments/${v.id}/posted`, { version: v.version, ...(v.coreRef ? { coreRef: v.coreRef } : {}) }),
    ),
    /** Fetches the upload file as a blob (the session cookie rides along) and saves it. */
    download: async (batchId: string, fileName: string) => {
      const blob = await api<Blob>(`/posting-batches/${batchId}/file`, { responseType: 'blob' })
      saveBlob(blob, fileName)
    },
  }
}
