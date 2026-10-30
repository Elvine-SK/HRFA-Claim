# HR-FAM

Built on the Nelvine platform 1.1.0.

## Develop

```sh
pnpm install
podman compose up -d        # MariaDB (docker compose works too)
pnpm run migrate
nelv admin:create           # first administrator (prints an invite link)
pnpm run dev:api
pnpm run dev:web
```

## Layout

- `apps/api/src/platform.modules.ts`: platform modules, generated from `.nelvrc.json`. Change them with `nelv add <capability>`.
- `apps/api/src/platform.options.ts`: options for the platform modules (yours; checked against the installed packages).
- `apps/api/src/modules/`: your modules (routes, migrations, permissions). Register them in `src/modules/index.ts`.
- `apps/web/app/pages/`: your pages. Platform components, layouts and composables are copied from the template.

## Platform updates

- `nelv upgrade` bumps every `@elvine-sk/platform-*` package together and prints the release notes.
- `nelv diff` shows upstream changes to copied files. `nelv update` applies them, with a 3-way merge for files you edited.
- `nelv doctor` checks configuration, versions, registry access and the database.
