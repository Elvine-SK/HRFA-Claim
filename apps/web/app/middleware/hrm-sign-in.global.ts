import { hrmSignInDecision, LOCAL_SIGN_IN_KEY } from '../utils/hrmSignIn'

function storage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * Users sign in through HRM, not here (spec §6): every way to the platform sign-in page (no session, a 401, sign
 * out) goes to HRM's login page instead. `/auth/sign-in?local=1` keeps the platform page for the bootstrap
 * administrator, for the rest of the tab. Without `NUXT_PUBLIC_HRM_LOGIN_URL` the platform page stays.
 */
export default defineNuxtRouteMiddleware((to) => {
  const store = storage()
  const decision = hrmSignInDecision(
    to.path,
    to.query,
    String(useRuntimeConfig().public.hrmLoginUrl ?? ''),
    store?.getItem(LOCAL_SIGN_IN_KEY) === '1',
  )
  if (decision.rememberLocal) store?.setItem(LOCAL_SIGN_IN_KEY, '1')
  if (decision.redirect) return navigateTo(decision.redirect, { external: true })
})
