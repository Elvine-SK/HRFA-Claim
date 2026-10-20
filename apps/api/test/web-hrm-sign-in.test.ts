import { describe, expect, it } from 'vitest'
// The web app has no test runner; this pure helper is tested here.
import { hrmSignInDecision } from '../../web/app/utils/hrmSignIn.ts'

const HRM = 'https://hrm.test/login'

describe('web: HRM sign-in redirect', () => {
  it('sends the platform sign-in page to HRM', () => {
    expect(hrmSignInDecision('/auth/sign-in', {}, HRM, false)).toEqual({ redirect: HRM, rememberLocal: false })
  })

  it('keeps the platform page with ?local=1 and remembers it', () => {
    expect(hrmSignInDecision('/auth/sign-in', { local: '1' }, HRM, false)).toEqual({
      redirect: null,
      rememberLocal: true,
    })
  })

  it('keeps the platform page on later visits once local sign-in was asked for (setup, reset, 401, sign-out)', () => {
    expect(hrmSignInDecision('/auth/sign-in', { redirect: '/admin' }, HRM, true)).toEqual({
      redirect: null,
      rememberLocal: false,
    })
  })

  it('leaves other pages and an unset HRM URL alone', () => {
    expect(hrmSignInDecision('/auth/setup', {}, HRM, false).redirect).toBeNull()
    expect(hrmSignInDecision('/me', {}, HRM, false).redirect).toBeNull()
    expect(hrmSignInDecision('/auth/sign-in', {}, '', false).redirect).toBeNull()
  })
})
