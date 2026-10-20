/** A single route-query key as reactive state, e.g. `?record=` for drawers or `?tab=` for detail tabs. */
export function useQueryParam(key: string, fallback?: string) {
  const route = useRoute()
  const router = useRouter()

  return computed<string | undefined>({
    get: () => {
      const raw = route.query[key]
      const value = Array.isArray(raw) ? raw[0] : raw
      return value ?? fallback
    },
    set: (value) => {
      const query = { ...route.query }
      if (value === undefined || value === null || value === '' || value === fallback) delete query[key]
      else query[key] = value
      void router.replace({ query })
    },
  })
}

/** `true` only once `source` has been true for `delay` ms; then stays true at least `minVisible` ms (spec §6.4). */
export function useDelayedFlag(source: () => boolean, delay = 200, minVisible = 300) {
  const shown = ref(false)
  let showTimer: ReturnType<typeof setTimeout> | undefined
  let shownAt = 0

  watch(
    source,
    (on) => {
      clearTimeout(showTimer)
      if (on) {
        showTimer = setTimeout(() => {
          shown.value = true
          shownAt = Date.now()
        }, delay)
      } else if (shown.value) {
        showTimer = setTimeout(() => (shown.value = false), Math.max(0, minVisible - (Date.now() - shownAt)))
      }
    },
    { immediate: true },
  )
  onScopeDispose(() => clearTimeout(showTimer))
  return readonly(shown)
}
