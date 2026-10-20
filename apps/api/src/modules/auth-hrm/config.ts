import { z } from '@elvine-sk/platform-server'

/** Config of the HRM sign-in, merged into `loadConfig` in `src/app.ts`. */
export const authHrmConfigSchema = {
  /** HRM's login page: where a visit without a session, and every failed handoff, is sent (`?error=<code>`). */
  HRM_LOGIN_URL: z.string().url(),
}
