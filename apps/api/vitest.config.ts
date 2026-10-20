import { defineConfig } from 'vitest/config'

// Local compose maps MariaDB to 3308 (3306 is taken on the dev machine); CI sets its own. Set on the process, not in
// `test.env`, so `globalSetup` builds the test databases on the same server the tests use.
process.env.TEST_DATABASE_URL ??= 'mysql://app:app_dev@localhost:3308/hr_fam_test'
process.env.TEST_DATABASE_SUITE ??= 'hr_fam'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    env: { TEST_DATABASE_SUITE: 'hr_fam' },
  },
})
