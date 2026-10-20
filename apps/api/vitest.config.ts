import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      TEST_DATABASE_SUITE: 'hr_fam',
      // Local compose maps MariaDB to 3308 (3306 is taken on the dev machine); CI sets its own.
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://app:app_dev@localhost:3308/hr_fam_test',
    },
  },
})
