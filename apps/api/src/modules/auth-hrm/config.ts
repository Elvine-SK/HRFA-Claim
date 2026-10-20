import { z } from '@elvine-sk/platform-server'

/** Config of the HRM sign-in, merged into `loadConfig` in `src/app.ts`. */
export const authHrmConfigSchema = {
  /** HRM's login page: where a visit without a session, and every failed handoff, is sent (`?error=<code>`). */
  HRM_LOGIN_URL: z.string().url(),
  /**
   * HRM's origin (`https://hrm.bcel.com.la`). When set, a handoff is accepted only with a `Referer` from it, so a
   * code cannot be planted from another site. Set it once HRM is checked to send the header (it does by default).
   */
  HRM_ORIGIN: z.string().url().optional(),
}
