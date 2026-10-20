import { createPlatformApp, loadConfig, type PlatformApp } from '@elvine-sk/platform-server'
import { authHrmConfigSchema } from './modules/auth-hrm/config.ts'
import { appModules } from './modules/index.ts'
import { APP_TITLE, platformConfigSchema, platformModules } from './platform.modules.ts'

export function modules() {
  return [...platformModules(), ...appModules]
}

export async function buildApp(): Promise<PlatformApp> {
  const config = loadConfig({ ...platformConfigSchema, ...authHrmConfigSchema })
  return createPlatformApp({ config, modules: modules(), title: `${APP_TITLE} API`, version: '0.1.0' })
}
