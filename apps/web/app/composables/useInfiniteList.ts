import type { ListResponse } from '@elvine-sk/platform-core'
import type { ApiError } from '@elvine-sk/platform-nuxt/utils'
import { useInfiniteQuery } from '@tanstack/vue-query'

/**
 * A paged list endpoint read one page at a time, for pickers and long lists: `rows` grows as `loadMore`
 * is called (on scroll), so a list of thousands costs one page until someone scrolls or searches.
 */
export function useInfiniteList<T>(
  key: string,
  path: MaybeRefOrGetter<string | null | undefined>,
  options: {
    q?: MaybeRefOrGetter<string>
    pageSize?: number
    sort?: string
    /** Extra query parameters, e.g. the record a list belongs to. */
    params?: MaybeRefOrGetter<Record<string, string>>
    enabled?: MaybeRefOrGetter<boolean>
  } = {},
) {
  const api = useApi()
  const pageSize = options.pageSize ?? 30
  const term = computed(() => toValue(options.q ?? '').trim())
  const query = useInfiniteQuery<ListResponse<T>, ApiError>({
    queryKey: computed(
      () =>
        [
          key,
          toValue(path),
          'infinite',
          term.value,
          pageSize,
          options.sort,
          JSON.stringify(toValue(options.params ?? {})),
        ] as const,
    ),
    enabled: computed(() => !!toValue(path) && toValue(options.enabled ?? true)),
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => {
      const params = new URLSearchParams({ page: String(pageParam), pageSize: String(pageSize) })
      if (options.sort) params.set('sort', options.sort)
      if (term.value) params.set('q', term.value)
      for (const [k, v] of Object.entries(toValue(options.params ?? {}))) params.set(k, v)
      return api<ListResponse<T>>(`${toValue(path)}?${params}`, { signal })
    },
    getNextPageParam: ({ meta }) => (meta.page * meta.pageSize < meta.total ? meta.page + 1 : undefined),
    staleTime: 30_000,
  })
  const rows = computed(() => query.data.value?.pages.flatMap((page) => page.data) ?? [])
  const total = computed(() => query.data.value?.pages[0]?.meta.total ?? 0)
  function loadMore() {
    if (query.hasNextPage.value && !query.isFetchingNextPage.value) void query.fetchNextPage()
  }
  return { ...query, rows, total, loadMore }
}
