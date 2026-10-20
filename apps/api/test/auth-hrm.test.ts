import { currentDb, runWithContext, SYSTEM_CONTEXT, uuidBin } from '@elvine-sk/platform-db'
import { dbTestsEnabled } from '@elvine-sk/platform-db/testing'
import type { PlatformApp } from '@elvine-sk/platform-server'
import { TEST_ORIGIN, TestClient } from '@elvine-sk/platform-server/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AUTH } from '@elvine-sk/platform-auth'
import { syncHrmSessions } from '../src/modules/auth-hrm/logout-sync.ts'
import { API, bootApp, DOWN_URL } from './helpers.ts'

const HRM_LOGIN_URL = 'https://hrm.test/login'
const config = { HRM_LOGIN_URL }
const errorAt = (code: string) => `${HRM_LOGIN_URL}?error=auth_hrm.${code}`

describe.skipIf(!dbTestsEnabled)('auth-hrm sign-in', () => {
  let platform: PlatformApp
  const fresh = () => new TestClient(platform)
  const signIn = (client: TestClient, code: string) => client.get(`${API}/auth/hrm?code=${encodeURIComponent(code)}`)

  beforeAll(async () => {
    platform = await bootApp({ config })
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('signs in with a valid code and lands on the app', async () => {
    const client = fresh()
    const res = await signIn(client, 'valid-10001')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(`${TEST_ORIGIN}/`)
    const session = await client.get(`${API}/auth/session`)
    expect(session.body.data).toMatchObject({ authenticated: true, state: 'active' })
    const me = await client.get(`${API}/hrm/me`)
    expect(me.status).toBe(200)
    expect(me.body.data).toMatchObject({ eid: '10001', nameLao: 'ສົມພອນ', branchCode: '888010' })
  })

  it('creates the user once: no password, no e-mail, username = EID, employee role', async () => {
    const rows = await runWithContext(SYSTEM_CONTEXT, () =>
      currentDb()
        .selectFrom('hrmUserLinks')
        .innerJoin('users', 'users.id', 'hrmUserLinks.userId')
        .select(['users.id', 'users.username', 'users.email', 'users.passwordHash', 'users.mfaRequired'])
        .where('hrmUserLinks.eid', '=', '10001')
        .execute(),
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ username: '10001', email: null, passwordHash: null, mfaRequired: false })
    const roles = await runWithContext(SYSTEM_CONTEXT, () =>
      currentDb()
        .selectFrom('userRoles')
        .innerJoin('roles', 'roles.id', 'userRoles.roleId')
        .select('roles.key')
        .where('userRoles.userId', '=', uuidBin(rows[0]!.id))
        .execute(),
    )
    expect(roles.map((r) => r.key)).toEqual(['employee'])
  })

  it('refuses the same code twice', async () => {
    expect((await signIn(fresh(), 'valid-10001')).headers.get('location')).toBe(errorAt('code_used'))
  })

  it('signs in once when the same code arrives twice at the same time', async () => {
    const results = await Promise.all([signIn(fresh(), 'replay-10001'), signIn(fresh(), 'replay-10001')])
    const locations = results.map((r) => r.headers.get('location')).sort()
    expect(locations).toEqual([`${TEST_ORIGIN}/`, errorAt('code_used')].sort())
  })

  it('a second sign-in of the same employee reuses the user', async () => {
    const client = fresh()
    expect((await signIn(client, 'soon-10001')).headers.get('location')).toBe(`${TEST_ORIGIN}/`)
    const links = await runWithContext(SYSTEM_CONTEXT, () =>
      currentDb().selectFrom('hrmUserLinks').select('userId').where('eid', '=', '10001').execute(),
    )
    expect(links).toHaveLength(1)
  })

  it.each([
    ['expired-10001', 'code_invalid'],
    ['past-10001', 'code_invalid'],
    ['no-such-code', 'code_invalid'],
    ['valid-10003', 'not_selectable'],
  ])('refuses %s with %s', async (code, error) => {
    const client = fresh()
    const res = await signIn(client, code)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(errorAt(error))
    expect((await client.get(`${API}/auth/session`)).body.data.authenticated).toBe(false)
  })

  it('refuses a missing or oversized code without a lookup', async () => {
    expect((await fresh().get(`${API}/auth/hrm`)).headers.get('location')).toBe(errorAt('code_invalid'))
    expect((await signIn(fresh(), 'x'.repeat(300))).headers.get('location')).toBe(errorAt('code_invalid'))
  })

  it('refuses an employee who is no longer selectable, even when linked', async () => {
    // 10003 is deleted in HRM: link it to a user as if it had signed in before, then try again.
    await runWithContext(SYSTEM_CONTEXT, async () => {
      const { ensureHrmUser } = await import('../src/modules/auth-hrm/users.ts')
      await ensureHrmUser({ eid: '10003', nameLao: 'ຄຳຫຼ້າ', snameLao: 'ວົງສາ' })
    })
    expect((await signIn(fresh(), 'valid-10003')).headers.get('location')).toBe(errorAt('not_selectable'))
  })

  it('/hrm/me answers 404 for a signed-in user without an HRM link', async () => {
    const { adminClient } = await import('./helpers.ts')
    expect((await (await adminClient(platform)).get(`${API}/hrm/me`)).status).toBe(404)
  })

  it('/hrm/me needs a session', async () => {
    expect((await fresh().get(`${API}/hrm/me`)).status).toBe(401)
  })

  it('a new sign-in ends the session the browser had before', async () => {
    const client = fresh()
    expect((await signIn(client, 'again-10001')).headers.get('location')).toBe(`${TEST_ORIGIN}/`)
    const before = new TestClient(platform)
    before.cookies = new Map(client.cookies)
    expect((await signIn(client, 'swap-10001')).headers.get('location')).toBe(`${TEST_ORIGIN}/`)
    expect((await client.get(`${API}/auth/session`)).body.data.authenticated).toBe(true)
    expect((await before.get(`${API}/auth/session`)).body.data.authenticated).toBe(false)
  })

  it('does not rate-limit a busy office behind one address', async () => {
    const results = []
    for (let i = 0; i < 40; i++) results.push((await signIn(fresh(), `junk-${i}`)).headers.get('location'))
    expect(new Set(results)).toEqual(new Set([errorAt('code_invalid')]))
  })
})

describe.skipIf(!dbTestsEnabled)('auth-hrm sign-in with HRM_ORIGIN set', () => {
  let platform: PlatformApp
  const signIn = (code: string, headers: Record<string, string> = {}) =>
    new TestClient(platform).get(`${API}/auth/hrm?code=${code}`, headers)

  beforeAll(async () => {
    platform = await bootApp({ config: { ...config, HRM_ORIGIN: 'https://hrm.test' } })
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('refuses a handoff that did not come from HRM, without spending the code', async () => {
    expect((await signIn('origin-bad-10001', { referer: 'https://evil.test/page' })).headers.get('location')).toBe(
      errorAt('bad_origin'),
    )
    expect((await signIn('origin-bad-10001')).headers.get('location')).toBe(errorAt('bad_origin'))
  })

  it('accepts a handoff from an HRM page', async () => {
    expect((await signIn('origin-ok-10001', { referer: 'https://hrm.test/portal/home' })).headers.get('location')).toBe(
      `${TEST_ORIGIN}/`,
    )
  })
})

describe.skipIf(!dbTestsEnabled)('auth-hrm logout sync', () => {
  let platform: PlatformApp

  beforeAll(async () => {
    platform = await bootApp({ config })
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('ends the sessions of users who logged out of HRM, and only theirs', async () => {
    // 10001 has a tb_current_login row; 10002 has none (logged out of HRM).
    const stays = new TestClient(platform)
    const leaves = new TestClient(platform)
    expect((await stays.get(`${API}/auth/hrm?code=sync-10001`)).headers.get('location')).toBe(`${TEST_ORIGIN}/`)
    expect((await leaves.get(`${API}/auth/hrm?code=valid-10002`)).headers.get('location')).toBe(`${TEST_ORIGIN}/`)
    const sessions = platform.ctx.services.get(AUTH).sessions
    expect(await runWithContext(SYSTEM_CONTEXT, () => syncHrmSessions(sessions))).toBe(1)
    expect((await stays.get(`${API}/auth/session`)).body.data.authenticated).toBe(true)
    expect((await leaves.get(`${API}/auth/session`)).body.data.authenticated).toBe(false)
    expect(await runWithContext(SYSTEM_CONTEXT, () => syncHrmSessions(sessions))).toBe(0)
  })

  /** An extra active session for the user linked to `eid`, as if they had signed in. */
  async function sessionFor(eid: string) {
    const auth = platform.ctx.services.get(AUTH)
    return runWithContext(SYSTEM_CONTEXT, async () => {
      const { ensureHrmUser } = await import('../src/modules/auth-hrm/users.ts')
      const { userId } = await ensureHrmUser({ eid, nameLao: 'x', snameLao: 'y' })
      return (await auth.sessions.create((await auth.findUserById(userId))!, 'active', false)).id
    })
  }

  it('refuses to revoke when too many signed-in users look logged out at once', async () => {
    const sessions = platform.ctx.services.get(AUTH).sessions
    const id = await sessionFor('10002') // missing from tb_current_login; 10001 is present
    await expect(
      runWithContext(SYSTEM_CONTEXT, () => syncHrmSessions(sessions, { guard: { minUsers: 1, maxMissingShare: 0.3 } })),
    ).rejects.toThrow(/refusing/i)
    expect(await runWithContext(SYSTEM_CONTEXT, () => sessions.isActive(id))).toBe(true)
    expect(await runWithContext(SYSTEM_CONTEXT, () => syncHrmSessions(sessions))).toBe(1)
  })

  it('ends the sessions of users who are no longer selectable in HRM', async () => {
    // 10003 is deleted in HRM but still has a tb_current_login row.
    const sessions = platform.ctx.services.get(AUTH).sessions
    const id = await sessionFor('10003')
    expect(await runWithContext(SYSTEM_CONTEXT, () => syncHrmSessions(sessions))).toBe(1)
    expect(await runWithContext(SYSTEM_CONTEXT, () => sessions.isActive(id))).toBe(false)
  })
})

describe.skipIf(!dbTestsEnabled)('auth-hrm sign-in with HRM down', () => {
  let platform: PlatformApp

  beforeAll(async () => {
    platform = await bootApp({ hrmUrl: DOWN_URL, config })
  })
  afterAll(async () => {
    await platform?.ctx.db.destroy()
  })

  it('redirects to the HRM login with an error', async () => {
    const res = await new TestClient(platform).get(`${API}/auth/hrm?code=valid-10002`)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(errorAt('unavailable'))
  })

  it('logout sync revokes nothing while HRM is unreachable', async () => {
    const sessions = platform.ctx.services.get(AUTH).sessions
    expect(await runWithContext(SYSTEM_CONTEXT, () => syncHrmSessions(sessions))).toBe(0)
  })
})
