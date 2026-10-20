# Deployment: several instances, a load balancer, PM2

How to run an app built on the platform with more than one process or server. The API keeps its state in
MariaDB, so any instance can answer any request and no sticky sessions are needed. The rules below are what
makes that hold.

> Written from the code and its tests (jobs run once across two instances, outbox claims, database rate limits).
> A real multi-server PM2 setup has not been run for this guide; try it on a staging pair first.

## The pieces

```
              ┌──────────── load balancer / reverse proxy (nginx, HAProxy, a cloud LB) ────────────┐
 browser ───► │  /api/*  ──►  API instances (Node, src/main.ts)        ┐                            │
              │  /*      ──►  web instances (Nuxt, .output/server)     │                            │
              └────────────────────────────────────────────────────────┼────────────────────────────┘
                                                                       ▼
                         MariaDB (sessions, jobs, outbox, rate limits, audit)   + shared file storage
                         optional: Redis (job delivery only), a separate job worker
```

- The web and the API share one origin: the proxy sends `/api/` to the API and everything else to the web.
  Then cookies, CSRF and `APP_ORIGIN` need nothing special.
- Run migrations once per deploy, before the new instances start: `pnpm run migrate`. Instances do not migrate at start.

## What is already shared

| Concern                          | Where it lives                                                   | Safe with N instances                     |
| -------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| Sign-in sessions                 | `sessions` table                                                 | yes                                       |
| Background jobs, recurring jobs  | `jobs`, `recurring_jobs` (`FOR UPDATE SKIP LOCKED` + lease)      | yes: each job runs once                   |
| Emails, notification emails      | `outbox_events` (claimed the same way)                           | yes: sent once                            |
| Sign-in limits, CAPTCHA counters | `rate_limit_counters` with `RATE_LIMIT_STORE=database` (default) | yes                                       |
| Permission cache                 | per process, keyed by a version in `authz_state`                 | yes: a role change reaches every instance |
| Audit log, record history        | database                                                         | yes                                       |
| Web (Nuxt server)                | no state                                                         | yes                                       |

## Checklist

1. **Same secrets on every API instance.** `AUTH_CSRF_SECRET`, `AUTH_ENCRYPTION_KEYS`, `AUTH_JWT_KEYS`, and
   `CAPTCHA_SECRET` with ALTCHA. In development each process invents its own when they are missing, and a
   session made on one instance then fails on another. Keep them in one `.env` (or the PM2 ecosystem file), not
   per process.
2. **Shared file storage.** `FILES_STORAGE=shared` (a network folder mounted at the same path on every server)
   or `s3`. `local` is fine only when every process runs on the same machine. See [files.md](files.md).
3. **`TRUSTED_PROXIES`** = the proxy's address(es). Without it every request seems to come from the proxy:
   one IP rate limit and one CAPTCHA counter for everybody, and the proxy's IP in the audit log.
4. **`RATE_LIMIT_STORE=database`** (the default). `memory` makes the sign-in limits per instance; the API
   warns about it.
5. **`INSTANCE_COUNT_HINT=<n>`**, so the API warns about settings that only work on one instance.
6. **Jobs:** every API process runs a job worker by default (`JOBS_WORKER`, safe thanks to the locking). To keep
   job load off the API, set `JOBS_WORKER=false` on API instances and run one or more `platform worker`
   processes.
7. **Graceful stop:** the API finishes in-flight work on `SIGTERM` / `SIGINT`; give it time before a hard kill
   (PM2 `kill_timeout`, a container's stop grace period).

### Per instance, by design

- **The general request limit** (`RATE_LIMIT_USER_PER_MINUTE` 600, `RATE_LIMIT_IP_PER_MINUTE` 300) is counted
  in memory, so with N instances the effective limit is up to N times higher. Lower the numbers if that
  matters.
- **A solved ALTCHA challenge** is remembered per instance: it could be used once more on another instance
  within its 5 minutes. Turnstile and hCaptcha do not have this (the provider marks a token as used).

## PM2

`ecosystem.config.cjs` beside the app :

```js
module.exports = {
  apps: [
    {
      name: 'api',
      cwd: './apps/api',
      script: 'src/main.ts',
      interpreter: 'node',
      node_args: '--import tsx --env-file-if-exists=.env',
      exec_mode: 'cluster',
      instances: 2,
      kill_timeout: 15000,
      env: { NODE_ENV: 'production', PORT: 3001, JOBS_WORKER: 'false', INSTANCE_COUNT_HINT: 2 },
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
      exec_mode: 'cluster',
      instances: 2,
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
  ],
}
```

- Build the web first (`nuxt build`), run migrations, then `pm2 start ecosystem.config.cjs` and later
  `pm2 reload ecosystem.config.cjs` for a rolling restart.
- The secrets and database settings stay in `apps/api/.env`, read by every process (`--env-file-if-exists`).
- On several servers, run the same file on each, point all of them at one MariaDB, use shared file storage,
  and put the load balancer in front. One `worker` process in total is enough; more are safe.

## A reverse proxy (nginx)

```nginx
upstream nelv_api { server 10.0.0.11:3001; server 10.0.0.12:3001; }
upstream nelv_web { server 10.0.0.11:3000; server 10.0.0.12:3000; }

server {
  listen 443 ssl;
  server_name app.example.com;
  client_max_body_size 11m;              # at least BODY_LIMIT_KB

  location /api/ {
    proxy_pass http://nelv_api;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  location / {
    proxy_pass http://nelv_web;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

With this proxy on `10.0.0.5`, set `TRUSTED_PROXIES=10.0.0.5` and `APP_ORIGIN=https://app.example.com`. Health
checks: `GET /health` (process up) and `GET /ready` (database reachable, migrations applied) on the API.

## Events and live updates (SSE)

`GET /api/v1/events` is a long-lived Server-Sent Events stream. The proxy must not buffer it or cut it off:

```nginx
location /api/v1/events {
  proxy_pass http://nelv_api;
  proxy_http_version 1.1;
  proxy_set_header Connection '';
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 1h;
}
```

- Enable HTTP/2 at the proxy: browsers allow only 6 HTTP/1.1 connections per site, and every open tab holds one stream.
- `EVENTS_BUS=database` (default) works with several instances; events reach other instances in about 1 s.
  `redis` (with `EVENTS_REDIS_URL`) is instant. `memory` is for a single instance only.
- A tab hidden for 5 minutes closes its stream and reconnects when it is shown again.
- Each stream counts once against the general request limit (`RATE_LIMIT_USER_PER_MINUTE`), which is kept in
  memory per instance. At most 10 streams per user and `EVENTS_MAX_CONNECTIONS` (5000) per instance; over that
  the API answers `503` and the web falls back to polling.
- Settings: `EVENTS_BUS` (`database`), `EVENTS_POLL_MS` (1000), `EVENTS_REDIS_URL`, `EVENTS_REDIS_PREFIX`
  (`nelv`), `EVENTS_MAX_CONNECTIONS` (5000). The `platform_events` table keeps rows for 10 minutes.

## Webhooks

- Outgoing deliveries and incoming events run as jobs (queues `webhooks` and the default one), so they need a
  job worker somewhere: an API process with `JOBS_WORKER` on (the default) or a `platform worker`. Without one,
  deliveries stay pending and received events stay `Received`. Any number of workers is safe: each delivery is
  claimed by one of them.
- The API needs outbound HTTP(S) to the receivers. Receivers on your own network (an ERP on `10.0.0.0/8`, a host
  name that resolves to a private address) are refused until listed in `WEBHOOKS_ALLOWED_HOSTS`
  (comma-separated host names and CIDRs). In production the URL must be `https` unless the host is listed.
- Incoming senders post to `https://<your site>/api/v1/hooks/<source id>`; the `/api/` location above covers it.
  Keep `client_max_body_size` at least 1 MB, and `BODY_LIMIT_KB` at 1024 or more, or large bodies are refused
  before the webhook route sees them. Behind the proxy, set `TRUSTED_PROXIES` so a source's IP allow-list and
  rate limit see the sender's address, not the proxy's.
- Settings: `WEBHOOKS_ALLOWED_HOSTS`, `WEBHOOKS_RETENTION_DAYS` (30; deliveries and received events are deleted
  after it), `WEBHOOKS_HEADER_PREFIX` (`Nelv`; the receiver sees `X-Nelv-Event`, `X-Nelv-Delivery`,
  `X-Nelv-Signature`). Signing and checks: [security.md](security.md), "Webhooks".

## External data sources

Each `DATA_SOURCE_<NAME>_URL` (see [data-sources.md](data-sources.md)) is read by every API instance and every worker that reads the source.

- **A user with `SELECT` only** per source. The read-only session the platform sets is a second guard: an explicit
  read-write transaction overrides it. `platform doctor` fails on write grants on any database.
- **Network access** from each API host (and worker) to the source's host and port; nothing else needs to reach it.
  The app database and the sources use separate pools, so size `DATA_SOURCE_<NAME>_POOL_SIZE` per instance against
  the upstream's connection limit (instances x pool size).
- **`DATA_SOURCE_<NAME>_TIMEZONE`** is an offset such as `+07:00`, the zone the upstream's `DATETIME` values are in.
- A down upstream gives `503 source.unavailable` on the routes that read it; `/ready` lists each source and stays
  `200`, so the load balancer keeps the instance.

## Redis

Optional, and used for one thing: **faster delivery of background jobs** (`platform-jobs-bullmq`,
`JOBS_REDIS_URL`). When a job is queued, its id is also pushed to a BullMQ queue so a worker starts it at once
instead of on its next MariaDB poll (every `JOBS_POLL_MS`, 2 s by default). The `jobs` table stays the source of
truth: the worker still claims the row there, retries and backoff stay in the database, a lost or duplicate
message does nothing, and polling continues every 30 s as a safety net.

Redis is **not** used for sessions, caching, rate limits or pub/sub; all of those are in MariaDB. Add `jobs-bullmq` with `nelv add bullmq`.
