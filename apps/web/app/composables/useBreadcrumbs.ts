export interface Crumb {
  label: string
  to?: string
}

interface CrumbOverride {
  path: string
  items: Crumb[]
}

/**
 * Pages may replace the trailing crumbs (e.g. a record title). The override is keyed by path so a
 * stale one never leaks onto the next page.
 */
export function useBreadcrumbs() {
  const route = useRoute()
  const override = useState<CrumbOverride | null>('platform:crumbs', () => null)

  function set(items: Crumb[]) {
    override.value = { path: route.path, items }
  }

  const current = computed(() => (override.value?.path === route.path ? override.value.items : null))

  return { set, current }
}
