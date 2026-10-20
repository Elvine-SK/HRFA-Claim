import { AUDIT } from '@elvine-sk/platform-audit'
import { AUTH, requireUser } from '@elvine-sk/platform-auth'
import { AppError, ErrorCodes, now } from '@elvine-sk/platform-core'
import { currentDb, getContext, inTransaction, isSourceUnavailable, uuidBin } from '@elvine-sk/platform-db'
import {
  createRoute,
  dataOf,
  ErrorSchema,
  errorResponses,
  jsonContent,
  z,
  type ApiRouter,
  type ModuleContext,
} from '@elvine-sk/platform-server'
import { findEmployee } from '../hrm/employees.ts'
import { HrmEmployeeSchema } from '../hrm/schema.ts'
import { hrmError, lookupHandoff, spendHandoff } from './handoff.ts'
import { ensureHrmUser, linkedEid } from './users.ts'

const tags = ['HRM sign-in']
/** Per IP, like the OIDC callback: enough for a busy office behind one address, not for guessing codes. */
const RATE = { limit: 30, windowSeconds: 600 }

const redirectDoc = { description: 'Redirect to the app, or to the HRM login page with `?error=<code>`' }

export function authHrmRoutes(api: ApiRouter, ctx: ModuleContext) {
  const auth = () => ctx.services.get(AUTH)
  const audit = () => ctx.services.get(AUDIT)
  const loginUrl = (code: string) => {
    const url = new URL(String(ctx.config.HRM_LOGIN_URL))
    url.searchParams.set('error', code)
    return url.toString()
  }

  /** Spends the code, provisions the user and opens a session, all or nothing. */
  async function signIn(code: string | undefined) {
    const { eid, hash } = await lookupHandoff(code)
    const employee = await findEmployee(eid)
    if (!employee) throw hrmError('not_selectable', 'Your HRM record does not allow access to this system')
    return inTransaction(async () => {
      await spendHandoff(hash, eid)
      const { userId, created } = await ensureHrmUser(employee)
      const user = await auth().findUserById(userId)
      if (!user || user.status !== 'active') throw hrmError('account_inactive', 'This account is not active')
      const session = await auth().sessions.create(user, 'active', false)
      await currentDb().updateTable('users').set({ lastLoginAt: now() }).where('id', '=', uuidBin(userId)).execute()
      await currentDb().updateTable('hrmUserLinks').set({ lastLoginAt: now() }).where('eid', '=', eid).execute()
      if (created)
        await audit().record({
          action: 'auth.hrm.user_created',
          actor: { type: 'user', id: userId },
          targetType: 'user',
          targetId: userId,
          details: { eid },
        })
      await audit().record({
        action: 'auth.hrm.login',
        actor: { type: 'user', id: userId },
        targetType: 'user',
        targetId: userId,
        details: { eid },
      })
      return session
    })
  }

  api.openapi(
    createRoute({
      method: 'get',
      path: '/auth/hrm',
      tags,
      summary: 'Sign in with a one-time code from the HRM portal tile',
      request: { query: z.object({ code: z.string().optional() }) },
      responses: { 302: redirectDoc },
    }),
    async (c) => {
      try {
        await ctx.rateLimiter.enforce([{ bucket: `hrm-signin:ip:${getContext().ip ?? 'unknown'}`, rule: RATE }])
        const session = await signIn(c.req.valid('query').code)
        // Same attributes as the platform's sign-in and OIDC callback: a session cookie, host-only.
        c.header('Set-Cookie', `${auth().settings.cookieName}=${session.token}; Path=/; HttpOnly; Secure; SameSite=Lax`)
        return c.redirect(`${String(ctx.config.APP_ORIGIN)}/`, 302)
      } catch (err) {
        const code =
          err instanceof AppError && err.code.startsWith('auth_hrm.')
            ? err.code
            : (err instanceof AppError && err.code === ErrorCodes.sourceUnavailable) || isSourceUnavailable(err)
              ? 'auth_hrm.unavailable'
              : err instanceof AppError && err.code === ErrorCodes.rateLimited
                ? 'auth_hrm.rate_limited'
                : 'auth_hrm.failed'
        if (code === 'auth_hrm.failed') c.var.log.error({ err }, 'hrm sign-in failed')
        else if (code === 'auth_hrm.unavailable') c.var.log.warn({ err }, 'hrm sign-in: HRM unavailable')
        await audit()
          .record({ action: 'auth.hrm.failed', actor: { type: 'system', id: null }, details: { code } })
          .catch((e: unknown) => c.var.log.error({ err: e }, 'hrm sign-in: audit failed'))
        return c.redirect(loginUrl(code), 302)
      }
    },
  )

  api.openapi(
    createRoute({
      method: 'get',
      path: '/hrm/me',
      tags: ['HRM'],
      summary: 'The signed-in user as an HRM employee',
      responses: {
        200: jsonContent(dataOf(HrmEmployeeSchema), 'Employee'),
        ...errorResponses(401, 404),
        503: jsonContent(ErrorSchema, 'HRM is unavailable'),
      },
    }),
    async (c) => {
      const { user } = requireUser(c)
      const eid = await linkedEid(user.id)
      const employee = eid ? await findEmployee(eid) : null
      if (!employee) throw AppError.notFound()
      return c.json({ data: employee }, 200)
    },
  )
}
