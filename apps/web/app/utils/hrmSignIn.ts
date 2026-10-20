/** Session-storage key: this browser tab asked for the platform sign-in page (the bootstrap administrator). */
export const LOCAL_SIGN_IN_KEY = 'hrfam.localSignIn'

/**
 * Where a navigation to the platform sign-in page goes. Users sign in through HRM, so `/auth/sign-in` is sent to
 * `hrmLoginUrl`, unless local sign-in was asked for with `?local=1`, in this navigation (`rememberLocal`: store it)
 * or earlier in the tab (`localRemembered`), so the platform's own links and redirects to the bare path (after
 * setup, a reset, a 401, sign-out) keep the administrator on the platform page.
 */
export function hrmSignInDecision(
  path: string,
  query: Record<string, unknown>,
  hrmLoginUrl: string,
  localRemembered: boolean,
): { redirect: string | null; rememberLocal: boolean } {
  if (path !== '/auth/sign-in' || !hrmLoginUrl) return { redirect: null, rememberLocal: false }
  if (query.local === '1') return { redirect: null, rememberLocal: true }
  if (localRemembered) return { redirect: null, rememberLocal: false }
  return { redirect: hrmLoginUrl, rememberLocal: false }
}
