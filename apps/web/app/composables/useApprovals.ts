import type { DataResponse, ListResponse } from '@elvine-sk/platform-core'
import type { ApiError } from '@elvine-sk/platform-nuxt/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type {
  Decision,
  DelegateCandidate,
  Delegation,
  InboxItem,
  RequestDetail,
  RequestSummary,
} from '../types/approval'

export const APPROVAL_KEY = LIVE_KEYS.approvals

export const requestPath = (id: string) => `/approval/requests/${encodeURIComponent(id)}`

export function useInboxCount() {
  const api = useApi()
  const session = useSession()
  const manifest = useManifest()
  return useQuery<number, ApiError>({
    queryKey: [APPROVAL_KEY, 'inbox', 'count'],
    enabled: () => session.isAuthenticated.value && manifest.has('approval'),
    queryFn: async ({ signal }) =>
      (await api<ListResponse<InboxItem>>('/approval/inbox?pageSize=1', { signal })).meta.total,
    refetchInterval: livePolling(60_000),
  })
}

export function useApprovalRequest(id: MaybeRefOrGetter<string | null | undefined>) {
  return useApiItem<RequestDetail>(APPROVAL_KEY, () => {
    const value = toValue(id)
    return value ? requestPath(value) : null
  })
}

/**
 * Latest approval request per record for a list page, in one call (`entityId in [...]`). Only requests
 * the user may see: their own, or all with `approval_request.read_all`.
 */
export function useApprovalStatuses(entityType: string, entityIds: MaybeRefOrGetter<string[]>) {
  const api = useApi()
  const manifest = useManifest()
  const ids = computed(() => [...new Set(toValue(entityIds))].sort())
  const query = useQuery<RequestSummary[], ApiError>({
    queryKey: [APPROVAL_KEY, 'statuses', entityType, ids],
    enabled: () => ids.value.length > 0 && manifest.has('approval'),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        'filter[entityType][eq]': entityType,
        'filter[entityId][in]': ids.value.join(','),
        sort: '-submittedAt',
        pageSize: '100',
      })
      return (await api<ListResponse<RequestSummary>>(`/approval/requests?${params}`, { signal })).data
    },
  })
  const latest = computed(() => {
    const byEntity = new Map<string, RequestSummary>()
    for (const r of query.data.value ?? []) if (!byEntity.has(r.entityId)) byEntity.set(r.entityId, r)
    return byEntity
  })
  return { latest, query }
}

/** Approval requests for one record (newest first), e.g. a note's approval status. */
export function useEntityApprovals(
  entityType: string,
  entityId: MaybeRefOrGetter<string | null | undefined>,
) {
  const api = useApi()
  return useQuery<RequestSummary[], ApiError>({
    queryKey: [APPROVAL_KEY, 'entity', entityType, () => toValue(entityId)],
    enabled: () => !!toValue(entityId),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        'filter[entityType][eq]': entityType,
        'filter[entityId][eq]': toValue(entityId)!,
        sort: '-submittedAt',
        pageSize: '10',
      })
      return (await api<ListResponse<RequestSummary>>(`/approval/requests?${params}`, { signal })).data
    },
  })
}

/** Active colleagues matching a 2+ character term, to hand approvals to. */
export function useDelegateSearch(q: MaybeRefOrGetter<string>) {
  const api = useApi()
  const term = computed(() => toValue(q).trim())
  return useQuery<DelegateCandidate[], ApiError>({
    queryKey: [APPROVAL_KEY, 'delegates', term],
    enabled: () => term.value.length >= 2,
    queryFn: async ({ signal }) =>
      (
        await api<DataResponse<DelegateCandidate[]>>(
          `/approval/delegates?${new URLSearchParams({ q: term.value })}`,
          { signal },
        )
      ).data,
    staleTime: 30_000,
  })
}

export type RequestAction = Decision | 'resubmit' | 'cancel' | 'comment'

export function useApprovalActions() {
  const api = useApi()
  const client = useQueryClient()
  const invalidate = () => client.invalidateQueries({ queryKey: [APPROVAL_KEY] })

  const act = useMutation<
    RequestDetail | undefined,
    ApiError,
    { id: string; action: RequestAction; comment?: string }
  >({
    mutationFn: async ({ id, action, comment }) => {
      const body = comment?.trim() ? { comment: comment.trim() } : {}
      const res = await api<DataResponse<RequestDetail> | undefined>(`${requestPath(id)}/${action}`, {
        method: 'POST',
        body,
      })
      return res?.data
    },
    onSuccess: () => invalidate(),
  })

  const bulk = useMutation<
    { requestId: string; ok: boolean; status?: string; error?: { code: string; message: string } }[],
    ApiError,
    { requestIds: string[]; decision: Decision; comment?: string }
  >({
    mutationFn: async (body) =>
      (
        await api<
          DataResponse<
            { requestId: string; ok: boolean; status?: string; error?: { code: string; message: string } }[]
          >
        >('/approval/inbox/bulk', {
          method: 'POST',
          body: { ...body, comment: body.comment?.trim() || undefined },
        })
      ).data,
    onSuccess: () => invalidate(),
  })

  const delegate = useMutation<RequestDetail, ApiError, { id: string; userId: string; comment?: string }>({
    mutationFn: async ({ id, userId, comment }) =>
      (
        await api<DataResponse<RequestDetail>>(`${requestPath(id)}/delegate`, {
          method: 'POST',
          body: { userId, ...(comment?.trim() ? { comment: comment.trim() } : {}) },
        })
      ).data,
    onSuccess: () => invalidate(),
  })

  // Re-resolves the approvers of a waiting request against the current organisation.
  const recalculate = useMutation<
    { changed: boolean; stuck: boolean; reason?: string },
    ApiError,
    { id: string }
  >({
    mutationFn: async ({ id }) =>
      (
        await api<DataResponse<{ changed: boolean; stuck: boolean; reason?: string }>>(
          `${requestPath(id)}/recalculate`,
          { method: 'POST' },
        )
      ).data,
    onSuccess: () => invalidate(),
  })

  return { act, bulk, delegate, recalculate }
}

export const REQUEST_STATUS_TONES = {
  pending: 'info',
  approved: 'success',
  rejected: 'danger',
  returned: 'warning',
  cancelled: 'neutral',
} as const

export interface NewDelegation {
  delegateId: string
  entityType: string | null
  startsAt?: string
  endsAt: string
  reason: string | null
}

/** Out-of-office delegations I gave or received that are still in effect or scheduled. */
export function useApprovalDelegations() {
  const api = useApi()
  const client = useQueryClient()
  const queryKey = [APPROVAL_KEY, 'delegations']
  const refresh = () => client.invalidateQueries({ queryKey })

  const list = useQuery<Delegation[], ApiError>({
    queryKey,
    queryFn: async ({ signal }) =>
      (await api<DataResponse<Delegation[]>>('/approval/delegations', { signal })).data,
  })
  const create = useMutation<Delegation, ApiError, NewDelegation>({
    mutationFn: async (body) =>
      (await api<DataResponse<Delegation>>('/approval/delegations', { method: 'POST', body })).data,
    onSuccess: refresh,
  })
  const update = useMutation<
    Delegation,
    ApiError,
    { id: string; body: Partial<Omit<NewDelegation, 'delegateId'>> }
  >({
    mutationFn: async ({ id, body }) =>
      (
        await api<DataResponse<Delegation>>(`/approval/delegations/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body,
        })
      ).data,
    onSuccess: refresh,
  })
  const revoke = useMutation<void, ApiError, string>({
    mutationFn: async (id) => {
      await api(`/approval/delegations/${encodeURIComponent(id)}`, { method: 'DELETE' })
    },
    onSuccess: refresh,
  })
  return { list, create, update, revoke }
}
