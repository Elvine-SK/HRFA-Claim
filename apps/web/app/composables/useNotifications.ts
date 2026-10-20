import type { DataResponse } from '@elvine-sk/platform-core'
import type { ApiError } from '@elvine-sk/platform-nuxt/utils'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import type { Notification, NotificationPreference } from '../types/notifications'

export const NOTIFICATIONS_KEY = LIVE_KEYS.notifications
const PAGE_SIZE = 20

const countKey = [NOTIFICATIONS_KEY, 'count'] as const

/** Unread badge, only when the backend has notifications: live, or polled every minute and on window focus. */
export function useUnreadCount() {
  const api = useApi()
  const session = useSession()
  const manifest = useManifest()
  return useQuery<number, ApiError>({
    queryKey: countKey,
    enabled: () => session.isAuthenticated.value && manifest.has('notifications'),
    queryFn: async ({ signal }) =>
      (await api<DataResponse<{ unread: number }>>('/notifications/unread-count', { signal })).data.unread,
    refetchInterval: livePolling(60_000),
    refetchOnWindowFocus: true,
  })
}

/** Newest first, `PAGE_SIZE` per page; the next page starts `before` the last id. */
export function useNotificationList(
  unreadOnly: MaybeRefOrGetter<boolean>,
  enabled: MaybeRefOrGetter<boolean> = true,
) {
  const api = useApi()
  return useInfiniteQuery({
    queryKey: [NOTIFICATIONS_KEY, 'list', () => toValue(unreadOnly)],
    enabled: () => toValue(enabled),
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
      if (toValue(unreadOnly)) params.set('unread', 'true')
      if (pageParam) params.set('before', pageParam)
      return (await api<{ data: Notification[] }>(`/notifications?${params}`, { signal })).data
    },
    getNextPageParam: (page) => (page.length === PAGE_SIZE ? page.at(-1)!.id : undefined),
  })
}

/** Marks some or all read; the response's unread count updates the badge without a refetch. */
export function useMarkRead() {
  const api = useApi()
  const client = useQueryClient()
  return useMutation<{ updated: number; unread: number }, ApiError, { ids: string[] } | { all: true }>({
    mutationFn: async (body) =>
      (
        await api<DataResponse<{ updated: number; unread: number }>>('/notifications/read', {
          method: 'POST',
          body,
        })
      ).data,
    onSuccess: ({ unread }) => {
      client.setQueryData(countKey, unread)
      return client.invalidateQueries({ queryKey: [NOTIFICATIONS_KEY, 'list'] })
    },
  })
}

export function useNotificationPreferences() {
  const api = useApi()
  const client = useQueryClient()
  const key = [NOTIFICATIONS_KEY, 'preferences']
  const query = useQuery<NotificationPreference[], ApiError>({
    queryKey: key,
    queryFn: async ({ signal }) =>
      (await api<DataResponse<NotificationPreference[]>>('/notifications/preferences', { signal })).data,
  })
  const save = useMutation<NotificationPreference[], ApiError, Omit<NotificationPreference, 'label'>>({
    mutationFn: async (body) =>
      (
        await api<DataResponse<NotificationPreference[]>>('/notifications/preferences', {
          method: 'PUT',
          body,
        })
      ).data,
    onSuccess: (data) => client.setQueryData(key, data),
  })
  return { query, save }
}
