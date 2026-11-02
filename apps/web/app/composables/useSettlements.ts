import type { DataResponse, ListResponse } from '@elvine-sk/platform-core'
import type { ApiError } from '@elvine-sk/platform-nuxt/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { components } from '~/types/api'

type Schemas = components['schemas']

export type Settlement = Schemas['Settlement']
export type SettlementListItem = Schemas['SettlementListItem']
export type SettlementLine = Schemas['SettlementLine']
export type SettlementLineInput = Schemas['SettlementLineInput']
export type SettlementLookup = Schemas['SettlementLookup']
export type SettlementOverdue = Schemas['SettlementOverdue']
export type SettlementStatus = SettlementListItem['status']
export type CaseKind = NonNullable<SettlementListItem['caseKind']>
export type BatchFileKind = 'settlement' | 'clearing'

export const SETTLEMENTS_KEY = 'settlements'
export const SETTLEMENT_STATUSES: SettlementStatus[] = [
  'draft',
  'in_approval',
  'approved',
  'exported',
  'posted',
  'clearing_exported',
  'cleared',
  'void',
  'cancelled_after_export',
]
export const CASE_KINDS: CaseKind[] = ['unused', 'partly_used', 'fully_used', 'overspent']
export const EXPENSE_TYPES = ['fuel', 'fare'] as const
export const SETTLEMENT_TONE: Record<SettlementStatus, 'neutral' | 'info' | 'success' | 'warning' | 'error'> = {
  draft: 'neutral',
  in_approval: 'info',
  approved: 'success',
  exported: 'warning',
  posted: 'success',
  clearing_exported: 'warning',
  cleared: 'success',
  void: 'neutral',
  cancelled_after_export: 'error',
}

export function useSettlement(id: MaybeRefOrGetter<string | null | undefined>) {
  return useApiItem<Settlement>(SETTLEMENTS_KEY, () => (toValue(id) ? `/settlements/${toValue(id)}` : null))
}

/** The PDFs attached to a settlement, for choosing a line's receipt or proof of rate. */
export function useSettlementFiles(id: MaybeRefOrGetter<string>) {
  const api = useApi()
  return useQuery<{ id: string; filename: string }[], ApiError>({
    queryKey: computed(() => ['files', 'settlement', toValue(id)] as const),
    queryFn: async ({ signal }) =>
      (
        await api<ListResponse<{ id: string; filename: string }>>('/files', {
          params: { entityType: 'settlement', entityId: toValue(id), pageSize: 100 },
          signal,
        })
      ).data,
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

export function useSettlementMutations() {
  const api = useApi()
  const client = useQueryClient()
  const mutation = <V, R>(run: (value: V) => Promise<R>) =>
    useMutation<R, ApiError, V>({
      mutationFn: run,
      onSuccess: () => client.invalidateQueries({ queryKey: [SETTLEMENTS_KEY] }),
    })
  const post = async (path: string, body: Record<string, unknown>) =>
    (await api<DataResponse<Settlement>>(path, { method: 'POST', body })).data
  const versioned = (path: string) => mutation((v: { id: string; version: number }) => post(`/settlements/${v.id}${path}`, { version: v.version }))
  return {
    create: mutation((agreementId: string) => post('/settlements', { agreementId })),
    lookup: mutation(
      async (number: string) =>
        (await api<DataResponse<SettlementLookup>>(`/settlements/lookup?number=${encodeURIComponent(number)}`)).data,
    ),
    save: mutation(
      async (v: { id: string; version: number; caseKind: CaseKind | null; lines: SettlementLineInput[] }) =>
        (
          await api<DataResponse<Settlement>>(`/settlements/${v.id}`, {
            method: 'PUT',
            body: { version: v.version, caseKind: v.caseKind, lines: v.lines },
          })
        ).data,
    ),
    submit: mutation((v: { id: string; version: number; leaderEid?: string; lateReason?: string }) =>
      post(`/settlements/${v.id}/submit`, {
        version: v.version,
        ...(v.leaderEid ? { leaderEid: v.leaderEid } : {}),
        ...(v.lateReason ? { lateReason: v.lateReason } : {}),
      }),
    ),
    exportFile: versioned('/export'),
    markPosted: mutation((v: { id: string; version: number; coreRef?: string; rvsNo?: string }) =>
      post(`/settlements/${v.id}/posted`, {
        version: v.version,
        ...(v.coreRef ? { coreRef: v.coreRef } : {}),
        ...(v.rvsNo ? { rvsNo: v.rvsNo } : {}),
      }),
    ),
    exportClearing: versioned('/clearing'),
    markCleared: mutation((v: { id: string; version: number; coreRef?: string }) =>
      post(`/settlements/${v.id}/clearing/posted`, { version: v.version, ...(v.coreRef ? { coreRef: v.coreRef } : {}) }),
    ),
    /** Fetches an upload file as a blob (the session cookie rides along) and saves it. */
    download: async (id: string, kind: BatchFileKind, fileName: string) => {
      const blob = await api<Blob>(`/settlements/${id}/batches/${kind}/file`, { responseType: 'blob' })
      saveBlob(blob, fileName)
    },
  }
}
