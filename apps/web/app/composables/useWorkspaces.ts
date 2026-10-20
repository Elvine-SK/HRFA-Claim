import type { DataResponse } from '@elvine-sk/platform-core'
import { useQueryClient } from '@tanstack/vue-query'
import type { MyTenants } from '../types/platform'

const STATE_KEY = 'platform:workspaces'
const useWorkspaceState = () => useState<{ userId: string; data: MyTenants } | null>(STATE_KEY, () => null)

/**
 * Loads my workspaces once per signed-in user (again with `force`); `null` when the API has no tenancy.
 * Usable in route middleware, which has no query client.
 */
export async function loadWorkspaces(force = false): Promise<MyTenants | null> {
  const state = useWorkspaceState()
  const userId = useSession().user.value?.id
  if (!userId) return null
  const manifest = useManifest()
  await manifest.load()
  if (!manifest.has('tenancy')) return null
  if (!force && state.value?.userId === userId) return state.value.data
  const { data } = await useApi()<DataResponse<MyTenants>>('/tenancy/me')
  state.value = { userId, data }
  return data
}

/** Several workspaces and none chosen: the person has to pick one. */
export const mustChooseWorkspace = (mine: MyTenants | null) =>
  !!mine && mine.tenants.length > 1 && !mine.current

/**
 * My workspaces (platform-tenancy) and the one the server uses for my requests. Switching sets the server's
 * cookie and reloads every query, since lists and records depend on the workspace.
 */
export function useWorkspaces() {
  const api = useApi()
  const session = useSession()
  const manifest = useManifest()
  const client = useQueryClient()
  const nuxtApp = useNuxtApp()
  const state = useWorkspaceState()

  const mine = computed(() =>
    state.value && state.value.userId === session.user.value?.id ? state.value.data : null,
  )
  const tenants = computed(() => mine.value?.tenants ?? [])

  return {
    enabled: computed(() => manifest.has('tenancy')),
    tenants,
    current: computed(() => tenants.value.find((t) => t.id === mine.value?.current) ?? null),
    load: loadWorkspaces,
    async switchTo(tenantId: string) {
      await api('/tenancy/switch', { method: 'POST', body: { tenantId } })
      await loadWorkspaces(true)
      // The live stream is bound to the workspace it connected in.
      await nuxtApp.callHook('platform:workspace-switched')
      await client.invalidateQueries()
    },
  }
}
