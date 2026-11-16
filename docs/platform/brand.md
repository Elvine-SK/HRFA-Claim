# Brand

The app's name, short name, slogan, sign-in texts, four images and browser title pattern. The app ships them in
code, and an admin with `brand.manage` can change any of them at runtime on **Administration → Brand**
(`@elvine-sk/platform-brand`, capability `brand`, which needs `files`). The brand applies to the whole app.

## What the app ships

| What                                     | Where                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Name, short name, slogan                 | `brand.name`, `brand.shortName`, `brand.slogan` in `apps/web/i18n/locales/app.<locale>.json` |
| Sign-in panel title, text, feature lines | `brand.signIn.title`, `brand.signIn.text`, `brand.signIn.f1`..`f3` in the same files         |
| Logo, dark logo, mark, favicon, title    | `apps/web/app/brand.config.ts`: paths under `apps/web/public/` and `titlePattern`            |
| Name and mark of the installed app       | `brand: { name, mark }` in `apps/api/src/platform.options.ts` (the API serves the manifest)  |

`brand.config.ts` and the `app.*.json` files are yours: `nelv update` never overwrites them. Without `brand.name` the
name is `name` in `brand.config.ts` (the app title, filled in when the app is created). A missing text key
then falls back to the platform's own (`shell.appName`, `auth.brand.*`); an image left out shows a letter tile made from
the short name. `titlePattern` takes `{page}` and `{name}` (default `{page} · {name}`).

## What an admin changes

- **Texts**, each in English and Lao. An empty box means "as shipped". A reader in Lao sees the admin's Lao text,
  else the admin's English, else the shipped text in Lao.
- **Images**, per slot (`logo`, `logoDark`, `mark`, `favicon`): upload PNG, WebP or JPEG up to 1 MB, then switch
  between _shipped_ and _uploaded_. Switching back to shipped keeps the upload; _Remove upload_ deletes it on save.
  SVG is not accepted for uploads; ship an SVG in `public/` instead.
- **Title pattern**.

Changes show on the next page load. Brand images are public (`GET /api/v1/brand/images/{slot}`), because the
sign-in page needs them before anyone signs in; only the image currently saved for a slot is served.

## Where it shows

- Sidebar header: logo (dark logo in dark mode) and name. The line under the name is the slogan when the person
  has one workspace, and the workspace switcher when they have several. The collapsed rail shows the mark.
- Sign-in pages: logo, name, slogan and the panel texts.
- Browser tab: the title pattern and the favicon; `/api/v1/brand/manifest.webmanifest` for installing the app.

Emails are not branded yet: they use `auth({ appName })` and plain text.
