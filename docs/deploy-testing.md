# Install on the testing server (10.0.7.110)

The bundle `hr-fam-<sha>.tar.gz` holds everything the app runs: the API sources with their production
`node_modules` (platform packages included, no links), the built web (`apps/web/.output`),
`ecosystem.config.cjs` and this file. The server needs no internet access and no `pnpm install`.

The bundle is built on a developer machine with `tooling/deploy/bundle.sh --hrm-login-url <URL>`. The HRM login
URL is fixed in the web build, so a bundle belongs to one environment. Native packages inside it (argon2,
esbuild) are built for the OS that made the bundle: it must be built on Linux x64 to run on the server.

## Prerequisites

- Node.js 22.12 or newer (`node -v`).
- PM2: `npm install -g pm2` (or copy the package in if the server cannot reach npm).
- MariaDB 11.4 with an empty app database and a user that owns it (all privileges on that database only):

  ```sql
  CREATE DATABASE hr_fam CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci;
  CREATE USER 'hr_fam'@'%' IDENTIFIED BY '<password>';
  GRANT ALL PRIVILEGES ON hr_fam.* TO 'hr_fam'@'%';
  ```

- The HRM read-only user (spec item ຂ7): a user with `SELECT` only on the HRM database `bcel_hrm_v3`, reachable
  from this server. `platform doctor` fails on write grants.
- A reverse proxy on the same origin as the app, sending `/api/` to port 3001 and everything else to port 3000
  (see `docs/platform/deployment.md`, "A reverse proxy"). Keep the `/api/v1/events` location unbuffered.

## Install

```sh
mkdir -p /opt/hr-fam && cd /opt/hr-fam
tar -xzf /path/to/hr-fam-<sha>.tar.gz --strip-components=1
cp apps/api/.env.example apps/api/.env
chmod 600 apps/api/.env
```

For an upgrade, unpack a new bundle into a new folder (or over the old one, keeping `apps/api/.env` and the
files folder), then follow "Upgrade".

## Configure `apps/api/.env`

Every variable of `.env.example`; set the ones marked here.

| Variable | Value on the testing server |
| --- | --- |
| `NODE_ENV` | `production` (PM2 also sets it) |
| `PORT` | `3001` |
| `LOG_LEVEL` | `info` |
| `DATABASE_URL` | `mysql://hr_fam:<password>@<db host>:3306/hr_fam` |
| `APP_ORIGIN` | The public address of the app, for example `https://hr-fam.test.example` (no trailing slash) |
| `RATE_LIMIT_STORE` | `database` |
| `DATA_SOURCES` | `hrm` |
| `DATA_SOURCE_HRM_URL` | `mysql://<hrm read-only user>:<password>@<hrm db host>:3306/bcel_hrm_v3` |
| `DATA_SOURCE_HRM_TIMEZONE` | `+07:00` |
| `HRM_LOGIN_URL` | The HRM login page; visits without a session and failed handoffs go there. Use the same URL given to `bundle.sh` |
| `HRM_ORIGIN` | The HRM origin, for example `https://hrm.example`. Set it: handoffs whose `Referer` is not from it are refused |
| `TRUSTED_PROXIES` | The address of the reverse proxy (comma-separated for several) |
| `AUTH_SESSION_IDLE_MINUTES` | `240` |
| `MAIL_TRANSPORT` | `console` until mail is decided; then see `docs/platform/` |
| `MAIL_FROM` | `HR-FAM <no-reply@...>` |
| `BODY_LIMIT_KB` | `11264` (the proxy's `client_max_body_size` must be at least 11m) |
| `FILES_STORAGE` | `local` on one server |
| `FILES_DIR` | An absolute folder that survives upgrades, for example `/var/lib/hr-fam/files` (the PM2 user must write to it) |

Also set the secrets; in production the API refuses to start without the first two:

- `AUTH_CSRF_SECRET`: a random string of at least 32 characters (`openssl rand -base64 48`).
- `AUTH_ENCRYPTION_KEYS`: `kid:base64key`, for example `k1:$(openssl rand -base64 32)` (AES-256-GCM, the first key encrypts).
- `AUTH_JWT_KEYS`: only for API or mobile clients; leave it out unless they are used. `... src/cli.ts auth:jwk <kid>`
  prints a key.

Keep them in `.env` only. Changing the CSRF secret signs everybody out.

## Migrate and start

```sh
cd /opt/hr-fam/apps/api
node --import tsx --env-file-if-exists=.env src/cli.ts migrate
node --import tsx --env-file-if-exists=.env src/cli.ts doctor    # optional: checks the settings and grants

cd /opt/hr-fam
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # once: prints the command that starts PM2 at boot; run what it prints
```

Check: `curl http://localhost:3001/health` answers `{"status":"ok"}`, `curl http://localhost:3001/ready` lists the
database and the `hrm` source, and the web answers on `http://localhost:3000/`.

Processes: `api` (port 3001, one instance, no job worker), `worker` (background jobs, including the one-minute
HRM logout sync) and `web` (port 3000, static single-page app). Logs: `pm2 logs`.

## First administrator

HRM users sign in from HRM with the role `employee`. The bootstrap administrator signs in with a password at
`/auth/sign-in?local=1`:

```sh
cd /opt/hr-fam/apps/api
node --import tsx --env-file-if-exists=.env src/cli.ts admin:create --email admin@example.com --name "Full Name"
```

It prints an invite link: open it to set the password. Then assign roles to HRM users in the web app.

## Upgrade

1. Unpack the new bundle (keep `apps/api/.env` and the files folder).
2. Migrate before the new code serves requests (`... src/cli.ts migrate`, as above).
3. `pm2 reload ecosystem.config.cjs`, then check `/health` and `/ready`.

A migration that has run is never edited; to roll back, restore the database backup taken before the upgrade
and start the previous bundle.
