// PM2 on one server (the testing server). Secrets and database settings stay in apps/api/.env,
// read by every process (--env-file-if-exists). See docs/deploy-testing.md and docs/platform/deployment.md.
module.exports = {
  apps: [
    {
      name: 'api',
      cwd: './apps/api',
      script: 'src/main.ts',
      interpreter: 'node',
      node_args: '--import tsx --env-file-if-exists=.env',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 15000,
      env: { NODE_ENV: 'production', PORT: 3001, JOBS_WORKER: 'false', INSTANCE_COUNT_HINT: 1 },
    },
    {
      name: 'worker',
      cwd: './apps/api',
      script: 'src/cli.ts',
      args: 'worker',
      interpreter: 'node',
      node_args: '--import tsx --env-file-if-exists=.env',
      exec_mode: 'fork',
      instances: 1,
      kill_timeout: 30000,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'web',
      cwd: './apps/web',
      script: '.output/server/index.mjs',
      exec_mode: 'fork',
      instances: 1,
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
  ],
}
