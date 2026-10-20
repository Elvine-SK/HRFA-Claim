import { join } from 'node:path'
import { authTestConfig } from '@elvine-sk/platform-auth/testing'
import { dbTestsEnabled, setupTestDatabase, setupTestSource } from '@elvine-sk/platform-db/testing'
import { createTestApp } from '@elvine-sk/platform-server/testing'
import { modules } from '../src/app.ts'

const sourcesDir = join(import.meta.dirname, 'sources')

/**
 * With RUN_DB_TESTS=1: recreate the test database from every module's migrations, and the HRM test source from
 * its schema and fixture files, once per run.
 */
export default async function setup() {
  if (!dbTestsEnabled) return
  const platform = await createTestApp({ modules: modules(), config: authTestConfig() })
  const sources = platform.migrationSources
  await platform.ctx.db.destroy()
  await setupTestDatabase(sources, 'hr_fam')
  await setupTestSource(
    'hrm',
    { schema: join(sourcesDir, 'hrm.schema.sql'), fixtures: join(sourcesDir, 'hrm.fixtures.sql') },
    'hr_fam',
  )
}
