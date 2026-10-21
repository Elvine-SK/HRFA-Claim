// PM2 on one server (the testing server). Secrets and database settings stay in apps/api/.env,
// read by every process (--env-file-if-exists). See docs/deploy-testing.md and docs/platform/deployment.md.
const { readFileSync } = require('node:fs')
const { join } = require('node:path')

// HRM login page for the web. The web server reads NUXT_PUBLIC_HRM_LOGIN_URL when it starts (not at build
// time); bundle.sh stores the --hrm-login-url argument in apps/web/hrm-login-url.txt. To change it later, edit
// that file (or set the variable) and `pm2 reload ecosystem.config.cjs --update-env`.
function hrmLoginUrl() {
  if (process.env.NUXT_PUBLIC_HRM_LOGIN_URL) return process.env.NUXT_PUBLIC_HRM_LOGIN_URL
  try {
    return readFileSync(join(__dirname, 'apps/web/hrm-login-url.txt'), 'utf8').trim()
  } catch {
    return ''
  }
}

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
      env: { NODE_ENV: 'production', PORT: 3000, NUXT_PUBLIC_HRM_LOGIN_URL: hrmLoginUrl() },
    },
  ],
}
