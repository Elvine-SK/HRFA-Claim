/** Someone in several workspaces who has not chosen one yet picks it first (platform-tenancy). */
export default defineNuxtRouteMiddleware(async (to, from) => {
  if (import.meta.server || to.path === '/workspace') return
  // Only the query changed (a drawer opened or closed): stay, even if a second workspace was just joined.
  if (to.path === from.path && to.fullPath !== from.fullPath) return
  if ((to.meta.auth ?? true) !== true) return
  const info = await useSession()
    .ensure()
    .catch(() => null)
  if (info?.state !== 'active') return
  const mine = await loadWorkspaces().catch(() => null)
  if (mustChooseWorkspace(mine))
    return navigateTo(
      { path: '/workspace', query: to.fullPath !== '/' ? { redirect: to.fullPath } : undefined },
      { replace: true },
    )
})
