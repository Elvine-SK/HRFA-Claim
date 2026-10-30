# Single sign-on (`platform-auth-oidc`)

Read this before configuring single sign-on.

## Install

- `nelv add oidc` adds the package, the module line and the environment lines.
- By hand: `oidc({ providers })` in the app's module list, with `providers` written out or read from the
  environment by `oidcProvidersFromEnv()`. Pass nothing to `oidcProvidersFromEnv()` to use `process.env`.
- The module `dependsOn` `auth` and `audit`; list both before it.
- Migrations: `pnpm run migrate` creates `oidc_states`. Linked accounts live in `user_identities`, which belongs to `auth` (shared with
  `platform-auth-handoff`).
- The web shows nothing new until the manifest has `oidc.providers` with at least one entry. Then the sign-in
  page gets an "or" divider and a "Continue with {label}" button per provider, and the Security tab of the
  account page gets a "Single sign-on" card. An app without the module, or with no providers, shows neither
  (`GET /auth/oidc/providers` answers 404 without the module and the web ignores it).

## Environment

`OIDC_PROVIDERS=keycloak,entra` lists the keys (lowercase letters, digits, `-`; at most 32 characters). Per
key, upper-cased with `-` as `_`:

| Variable                           | Meaning                                                                |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `OIDC_<KEY>_ISSUER`                | Must equal the `issuer` of the provider's discovery document           |
| `OIDC_<KEY>_CLIENT_ID`             | Client id                                                              |
| `OIDC_<KEY>_CLIENT_SECRET`         | Omit for a public client (PKCE only)                                   |
| `OIDC_<KEY>_LABEL`                 | Button text (default: the key)                                         |
| `OIDC_<KEY>_SCOPES`                | Comma or space list; `openid` is always added (default email, profile) |
| `OIDC_<KEY>_AUTO_CREATE_USERS`     | `true` / `1` / `on`: create an active user when no account matches     |
| `OIDC_<KEY>_ALLOWED_EMAIL_DOMAINS` | Comma list; only these domains may link by email or be created         |

Register this redirect URI at the provider: `<APP_ORIGIN>/api/v1/auth/oidc/<key>/callback`. In production
issuers must be `https`.

## Providers

- **Keycloak**: issuer `https://<host>/realms/<realm>`; a confidential client with the redirect URI above. For
  development, `quay.io/keycloak/keycloak` in `start-dev` mode with an imported realm is enough.
- **Microsoft Entra ID**: issuer `https://login.microsoftonline.com/<tenant>/v2.0`.
- **Google**: issuer `https://accounts.google.com`.

## Sign-in

`GET /auth/oidc/<key>/start?redirect=…` sends the browser to the provider (PKCE, state, nonce, and a
`__Host-oidc` cookie that ties the flow to that browser). The callback then:

- matches the user by the provider's **verified** email and adds the identity; an unverified email is refused
  (`oidc.email_unverified`);
- with no match, creates an active user only when `autoCreateUsers` is on (else `oidc.no_account`);
- sends a user who has 2-step verification to `mfaPath?redirect=…` (default `/auth/mfa`) to finish;
- on any error redirects to `signInPath?error=<code>` (default `/auth/sign-in`), where the page shows the
  code's message.

A user who already has another identity at the same provider is refused with `oidc.already_linked` rather than
getting a second one; they unlink the old one first.

## Linking from the account page

`POST /auth/oidc/{provider}/link` with `{ password?, redirect? }` answers `{ data: { location } }`; the web
navigates to it. The callback then adds the identity to the signed-in user and returns to
`/account?tab=security&linked=<key>` (a failure goes to `…&oidcError=<code>`).

- A user with a password must send it (checked like every re-check; wrong password answers 422). A user
  without one (signed in through a provider) is not asked.
- One identity per provider per user: `oidc.already_linked` (409), settled by the unique key
  `uq_user_identities_user_provider`.
- An account at the provider that belongs to someone else: `oidc.identity_taken`.
- The provider's email need not match the user's and need not be verified; `allowedEmailDomains` still
  applies when the provider sends one (`oidc.domain_not_allowed`).
- The session that finishes the callback must be the one that started the flow; otherwise
  `oidc.state_invalid`. A link opens no new session and does not touch `lastLoginAt`.
- Audit: `auth.oidc.linked` (`details.manual: true`), `auth.oidc.failed`.

## Unlinking

`DELETE /auth/oidc/identities/{id}` (the account card's _Unlink_). Refused with 409
`oidc.last_sign_in_method` when the user has no password and this is their last identity.

## Options

`oidc({ providers, … })`:

| Option                | Default         | Meaning                                            |
| --------------------- | --------------- | -------------------------------------------------- |
| `signInPath`          | `/auth/sign-in` | Where errors go (`?error=<code>`)                  |
| `mfaPath`             | `/auth/mfa`     | Where a user who owes a second factor goes         |
| `callbackBaseUrl`     | the app origin  | Origin used to build the redirect URI              |
| `stateTtlSeconds`     | `600`           | How long a started flow stays valid                |
| `discoveryTtlSeconds` | `3600`          | How long a provider's discovery document is cached |
