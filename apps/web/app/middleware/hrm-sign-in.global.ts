/**
 * Users sign in through HRM, not here (spec §6): every way to the platform sign-in page (no session, a 401, sign
 * out) goes to HRM's login page instead. `/auth/sign-in?local=1` keeps the platform page for the bootstrap
 * administrator. Without `NUXT_PUBLIC_HRM_LOGIN_URL` the platform page stays, as in a fresh app.
 */
export default defineNuxtRouteMiddleware((to) => {
  const hrmLoginUrl = useRuntimeConfig().public.hrmLoginUrl
  if (to.path !== '/auth/sign-in' || to.query.local === '1' || !hrmLoginUrl) return
  return navigateTo(String(hrmLoginUrl), { external: true })
})
