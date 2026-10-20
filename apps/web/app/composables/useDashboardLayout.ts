import type { DataResponse } from '@elvine-sk/platform-core'
import {
  DASHBOARD_LAYOUT_VERSION,
  keepHidden,
  lockedWidgets,
  missingAccess,
  moveItem,
  resizeItem,
  resolveLayout,
  visibleWidgets,
  type ApiError,
  type DashboardWidget,
  type LayoutItem,
  type SavedLayout,
  type WidgetSize,
} from '@elvine-sk/platform-nuxt/utils'
import { useQuery, useQueryClient } from '@tanstack/vue-query'

export const DASHBOARD_KEY = 'dashboard'
const SAVE_DELAY = 600
let saveTimer: ReturnType<typeof setTimeout> | undefined
let pending: (() => Promise<void>) | undefined
let saving: Promise<void> = Promise.resolve()

/** Sends the waiting change now, after any save already on its way, so saves reach the server in order. */
export function flushDashboardLayout(): Promise<void> {
  clearTimeout(saveTimer)
  const send = pending
  pending = undefined
  if (send) saving = saving.then(send)
  return saving
}

function dropPendingSave(): Promise<void> {
  clearTimeout(saveTimer)
  pending = undefined
  return saving
}

/** The person's dashboard: what to draw, and changes that show at once and save once they pause. */
export function useDashboardLayout() {
  const api = useApi()
  const client = useQueryClient()
  const registry = useWidgetRegistry()
  const access = useAccess()
  const manifest = useManifest()
  const notify = useNotify()
  const confirm = useConfirm()
  const { t } = useI18n()

  const queryKey = [DASHBOARD_KEY, 'layout']
  const saved = useQuery<SavedLayout | null, ApiError>({
    queryKey,
    queryFn: async ({ signal }) =>
      (await api<DataResponse<SavedLayout | null>>('/dashboard/layout', { signal })).data,
    staleTime: Infinity,
  })

  // Widgets the server gates also need the role grant `widget.<id>` (access matrix, "Dashboard widgets").
  const widgetAccess = computed(() => ({
    can: (p: string) => access.canSome(p),
    has: (m: string) => manifest.has(m),
    gated: manifest.data.value?.dashboardWidgets ?? [],
  }))
  const visible = computed(() => visibleWidgets(registry.list(), widgetAccess.value))
  const locked = computed(() => lockedWidgets(registry.list(), widgetAccess.value))
  const items = computed(() => resolveLayout(saved.data.value, visible.value))

  async function put(layout: SavedLayout) {
    try {
      await api('/dashboard/layout', { method: 'PUT', body: layout })
    } catch (error) {
      notify.error(error, {
        title: t('dashboard.saveFailed'),
        actions: [{ label: t('platform.actions.retry'), onClick: retry }],
      })
    }
  }

  // The layout on screen now: a later change, a reset or a sign-out may have replaced the one that failed.
  function retry() {
    const layout = client.getQueryData<SavedLayout | null>(queryKey)
    if (!layout) return
    pending = () => put(layout)
    void flushDashboardLayout()
  }

  function save(next: LayoutItem[]) {
    const layout = {
      version: DASHBOARD_LAYOUT_VERSION,
      items: keepHidden(saved.data.value, next, visible.value),
    }
    client.setQueryData(queryKey, layout)
    clearTimeout(saveTimer)
    pending = () => put(layout)
    saveTimer = setTimeout(() => void flushDashboardLayout(), SAVE_DELAY)
  }

  const indexOf = (id: string) => items.value.findIndex((item) => item.id === id)

  return {
    saved,
    items,
    visible,
    locked,
    widget: (id: string) => registry.get(id),
    /** Why a locked widget is locked, for the catalog. */
    missing: (widget: DashboardWidget) => missingAccess(widget, widgetAccess.value),
    move: (id: string, to: number) => save(moveItem(items.value, indexOf(id), to)),
    resize: (id: string, size: WidgetSize) =>
      save(resizeItem(items.value, indexOf(id), size, registry.get(id)?.sizes ?? [])),
    remove: (id: string) => save(items.value.filter((item) => item.id !== id)),
    add: (id: string) => {
      const widget = registry.get(id)
      if (widget && indexOf(id) < 0) save([...items.value, { id, size: widget.defaultSize }])
    },
    async reset() {
      const ok = await confirm({
        title: t('dashboard.resetTitle'),
        description: t('dashboard.resetText'),
        confirmLabel: t('dashboard.reset'),
      })
      if (!ok) return
      await dropPendingSave()
      try {
        await api('/dashboard/layout', { method: 'DELETE' })
        client.setQueryData(queryKey, null)
        notify.success(t('dashboard.resetDone'))
      } catch (error) {
        notify.error(error)
      }
    },
  }
}
