import type { Condition, DataResponse, ListResponse } from '@elvine-sk/platform-core'
import type { ApiError } from '@elvine-sk/platform-nuxt/utils'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { AuthzCatalog, Group, Role, UserAdmin } from '../types/platform'

export const ADMIN_KEY = 'admin'

/** Calls an admin endpoint and refreshes every admin query afterwards. */
export function useAdminAction() {
  const api = useApi()
  const client = useQueryClient()
  return useMutation<
    unknown,
    ApiError,
    { path: string; method?: 'POST' | 'PATCH' | 'PUT' | 'DELETE'; body?: unknown }
  >({
    mutationFn: async ({ path, method = 'POST', body }) => {
      const res = await api<DataResponse<unknown> | undefined>(path, { method, body: body as never })
      return res?.data
    },
    onSuccess: () => client.invalidateQueries({ queryKey: [ADMIN_KEY] }),
  })
}

export function useAuthzCatalog() {
  return useApiItem<AuthzCatalog>(ADMIN_KEY, '/authz/catalog', { staleTime: 5 * 60_000 })
}

/** Whole reference lists (the access matrix's role columns, names in the workflow diagram), sorted by name. */
function useAllOf<T>(path: string, enabled: MaybeRefOrGetter<boolean> = true) {
  const api = useApi()
  return useQuery<T[], ApiError>({
    queryKey: [ADMIN_KEY, path, 'all'],
    enabled: () => toValue(enabled),
    queryFn: async ({ signal }) => {
      const rows: T[] = []
      for (let page = 1; ; page++) {
        const res = await api<ListResponse<T>>(`${path}?page=${page}&pageSize=100&sort=name`, { signal })
        rows.push(...res.data)
        if (!res.data.length || page * res.meta.pageSize >= res.meta.total) return rows
      }
    },
    staleTime: 60_000,
  })
}

export const useAllRoles = (enabled?: MaybeRefOrGetter<boolean>) => useAllOf<Role>('/authz/roles', enabled)
export const useAllGroups = (enabled?: MaybeRefOrGetter<boolean>) => useAllOf<Group>('/authz/groups', enabled)

/** People search for pickers (members, approvers). */
export function useUserSearch(q: MaybeRefOrGetter<string>, enabled: MaybeRefOrGetter<boolean> = true) {
  const api = useApi()
  return useQuery<UserAdmin[], ApiError>({
    queryKey: [ADMIN_KEY, '/users', 'search', () => toValue(q)],
    enabled: () => toValue(enabled),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ pageSize: '20', sort: 'displayName' })
      const term = toValue(q).trim()
      if (term) params.set('q', term)
      return (await api<ListResponse<UserAdmin>>(`/users?${params}`, { signal })).data
    },
    staleTime: 30_000,
  })
}

/** A policy in plain words: "Allow Editors to read, update Notes when ownerId is Current user." */
export function usePolicySentence() {
  const { t, te } = useI18n()
  const word = (key: string) => t(`admin.condition.${key}`)
  return (
    policy: { effect: 'allow' | 'deny'; resource: string; actions: string[]; condition?: Condition | null },
    roleNames: string[],
    catalog: AuthzCatalog,
  ) => {
    const label = catalog.resources.find((r) => r.resource === policy.resource)?.label ?? policy.resource
    const when = describeCondition(toBuilder(policy.condition), word)
    return t(when ? 'admin.roles.policy.sentence.when' : 'admin.roles.policy.sentence.every', {
      effect: t(`admin.roles.policy.${policy.effect}`),
      roles: roleNames.join(', ') || t('admin.roles.policy.noRole'),
      actions: policy.actions.join(', ') || '…',
      resource: te(label) ? t(label) : label,
      when,
    })
  }
}

export const USER_STATUS_TONES = { invited: 'info', active: 'success', disabled: 'neutral' } as const
export const JOB_STATUS_TONES = {
  queued: 'info',
  running: 'warning',
  succeeded: 'success',
  dead: 'danger',
} as const
export const AUDIT_OUTCOME_TONES = { success: 'success', failure: 'danger', denied: 'warning' } as const
