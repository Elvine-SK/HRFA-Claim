import type { DataResponse } from '@elvine-sk/platform-core'
import type { ViewQuery } from '@elvine-sk/platform-nuxt/utils'
import { useQueryClient } from '@tanstack/vue-query'
import type { SavedView, ViewList } from '../types/platform'

export const VIEWS_KEY = 'views'

/** A person's saved views of a list and the list's built-in ones; nothing is requested without platform-views. */
export function useSavedViews(listKey: MaybeRefOrGetter<string>) {
  const api = useApi()
  const client = useQueryClient()
  const manifest = useManifest()
  const enabled = computed(() => manifest.data.value?.views === true)
  const query = useApiItem<ViewList>(VIEWS_KEY, () =>
    enabled.value ? `/views?list=${encodeURIComponent(toValue(listKey))}` : null,
  )
  const views = computed<SavedView[]>(() => [
    ...(query.data.value?.builtIn ?? []),
    ...(query.data.value?.personal ?? []),
  ])
  const refresh = () => client.invalidateQueries({ queryKey: [VIEWS_KEY] })

  return {
    enabled,
    query,
    views,
    async create(name: string, view: ViewQuery) {
      const res = await api<DataResponse<SavedView>>('/views', {
        method: 'POST',
        body: { list: toValue(listKey), name, query: view },
      })
      await refresh()
      return res.data
    },
    async update(id: string, patch: { name?: string; query?: ViewQuery }) {
      const res = await api<DataResponse<SavedView>>(`/views/${id}`, { method: 'PATCH', body: patch })
      await refresh()
      return res.data
    },
    async remove(id: string) {
      await api(`/views/${id}`, { method: 'DELETE' })
      await refresh()
    },
  }
}
