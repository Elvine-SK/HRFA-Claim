# Sign-in protection, request limits, live updates and webhooks

What the platform does against password guessing, bots and floods, how live updates and webhooks are kept safe,
and the settings an app can change. All settings are environment variables of the API, read at start.

## Lockout and its alerts (`platform-auth`)

- `AUTH_LOCKOUT_THRESHOLD` (5) wrong passwords lock the account for `AUTH_LOCKOUT_MINUTES` (15), doubling on
  repeats up to 64×. The answer is the same as for an unknown user or a wrong password.
- On each lock the owner gets an email (how many wrong passwords, until when in their time zone, from which IP),
  and every active holder of `user.update` gets the notification `auth.account_locked` (in-app; email by their
  notification preferences) with a link to the user. The locked person is not notified in-app. Holders are
  found with `AccessControl.usersWith('user.update')` (roles direct or through groups, super administrators;
  policies are not applied).
- An alert that fails is logged and never changes the sign-in answer.

## CAPTCHA (`platform-auth`)

Off unless `CAPTCHA_PROVIDER` is set:

| Value       | What runs                                                                                 | Settings                                            |
| ----------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `turnstile` | Cloudflare Turnstile; the browser loads Cloudflare's script, the API calls its siteverify | `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET`                |
| `hcaptcha`  | hCaptcha; same shape                                                                      | `CAPTCHA_SITE_KEY`, `CAPTCHA_SECRET`                |
| `altcha`    | ALTCHA, self-hosted proof of work: no third party, works without internet                 | `CAPTCHA_SECRET` (HMAC key, at least 32 characters) |

- Asked on sign-in (browser and `POST /auth/token`) after `CAPTCHA_AFTER_FAILURES` (3) failed sign-ins for that
  name, or `CAPTCHA_IP_AFTER_FAILURES` (20) from one IP address, within 15 minutes; `CAPTCHA_AFTER_FAILURES=0`
  asks every time. Forgot-password asks when the address is over its limit.
- The check runs before the password is looked at. The API answers `400 auth.captcha_required` with
  `details: { provider, siteKey, invalid }`; the web shows the widget (`PlatformAuthCaptcha`) and sends its token
  as `captcha` with the next try. A token is good for one try.
- Turnstile and hCaptcha fail closed: while siteverify cannot be reached, a person who is asked cannot sign in.
- ALTCHA challenges come from `GET /auth/captcha/challenge` (public, `no-store`), expire after 5 minutes and are
  accepted once per API instance (with several instances, a solved challenge could be replayed on another one
  within those 5 minutes).
- Counters live in the rate-limit store (`RATE_LIMIT_STORE`), so with `database` they hold across instances.

## General request limit (`platform-server`)

- Every `/api/v1` request counts against a per-minute budget: per signed-in user or API client
  (`RATE_LIMIT_USER_PER_MINUTE`, 600) and per client IP for requests that end without a signed-in actor
  (`RATE_LIMIT_IP_PER_MINUTE`, 300). People behind one office address do not share a budget once signed in.
- Counted in memory per instance, with no database write per request: with N instances behind a load balancer
  the real limit is up to N times higher. `0` turns a limit off; test apps (`createTestApp`) default both to 0.
- A spent IP is refused before authentication when the request carries no `Authorization` or `Cookie` header.
- Answers `429 rate_limit.exceeded` with `Retry-After`. The client IP comes from `X-Forwarded-For` only behind
  `TRUSTED_PROXIES`.

The narrower limits on sign-in, 2-step codes, password reset, tokens and uploads still apply on top.

The live stream `GET /events` counts once per connection, so a reconnect costs one request. Like every other
request it is counted per instance.

## Live updates (`platform-events`)

- `GET /events` sends hints, not data: the event type, the subject's type and id, the time, small `data` (changed
  field names) and `byMe`. Never field values and never the actor's id. The page then reloads through the normal
  API, so permissions, policies and the workspace fence apply as on any request.
- `record.*` hints go to everyone connected in the same workspace, without a per-person check: someone who may not
  read a record still learns that a record of that type with that id changed.
- The route needs a full session (`403` for `mfa_pending` and a pending password change). The session is
  checked again every 60 s; sign-out, revocation, a disabled account or leaving the stream's workspace closes the
  stream. At most 10 streams per
  user (the oldest is closed) and `EVENTS_MAX_CONNECTIONS` (5000) per instance (then `503 events.unavailable`,
  and the web polls instead).

## Webhooks (`platform-webhooks`)

Permissions `webhook.read` (see subscriptions, sources and their logs) and `webhook.manage` (change them, send
again, run again); no role holds them at first.

### Secrets

- Each subscription and source has its own secret, encrypted at rest with the auth key ring (`AuthService`
  `encryptSecret`). It is shown once (on create and on _Rotate secret_) and never logged or returned again.
- _Rotate secret_ keeps the old one for 24 hours: outgoing deliveries carry two `v1=` signatures, and a source
  accepts either secret. A source can take a pasted secret (the sender's) instead of a generated one.

### Outgoing: signing

Every delivery is a `POST` with `Content-Type: application/json`, `User-Agent: <prefix>-Webhooks/1`,
`X-<prefix>-Event`, `X-<prefix>-Delivery` (the same on every retry: deduplicate on it) and
`X-<prefix>-Signature: t=<unix>,v1=<hex>`, where `<prefix>` is `WEBHOOKS_HEADER_PREFIX` (`Nelv`) and the
digest is HMAC-SHA256 of `"<t>.<raw body>"` with the secret. A receiver recomputes it on the bytes as received,
compares in constant time against any `v1=`, and refuses a `t` more than 5 minutes off.

### Outgoing: address guard

- The URL's host is resolved and the request connects to that checked address (no second lookup a DNS answer
  could change). Loopback, private (RFC 1918, ULA), link-local, CGNAT, benchmark and cloud metadata addresses
  are refused unless the host name or a CIDR is in `WEBHOOKS_ALLOWED_HOSTS` (comma-separated, e.g.
  `erp.internal,10.0.0.0/8`). In production the URL must be `https` unless its host is allowed.
- Checked on save (the editor names the reason) and again on every send. A refused `scheme`, `https_required`
  or `blocked_address` gives up the delivery at once; a host that does not resolve (`unresolvable`) is retried on
  the normal schedule, since DNS outages pass.
- No redirects are followed, the timeout is 10 s and only 1 KB of the answer is kept.
- Allow-list CIDRs in IPv4 form: an IPv6-mapped or NAT64 address is compared as the IPv4 address it carries, so
  an IPv6-form CIDR for such a range never matches. TEST-NET ranges are not blocked; Teredo and local NAT64
  addresses are not unwrapped.

### Outgoing: retries and turning off

- A 2xx is delivered. Anything else retries after 1 min, 5 min, 30 min, 2 h, 6 h, 12 h and 24 h, then the delivery
  is given up (`dead`). `410 Gone` turns the subscription off at once; so do three days with only failures.
- When a subscription is turned off, the notification `webhooks.disabled` goes to its creator and last editor
  for a workspace subscription (`webhook.manage` is not per workspace, so other workspaces' administrators are
  not told), and to super administrators for an all-workspaces one (only they can open it).
- A `full` payload adds the record from the event's `load`, in its API shape, without the receiver's
  permissions: only `webhook.manage` holders can choose it.
- Don't put secrets in a subscription URL's query string: the URL is shown in the editor. The audit event of its
  creation records only its origin and path.

### Workspaces

Subscriptions and sources belong to the workspace they were created in: members see and manage only their
workspace's, and the others answer `404`. Super administrators may create all-workspaces ones (events from every
workspace; a source whose handler runs outside any workspace) and see them beside their workspace's.

### Incoming

`POST /api/v1/hooks/{sourceId}` is public; in order:

1. Unknown, deleted or turned-off source: `404`.
2. 120 requests a minute per source and sender IP (`429`), in the rate-limit store (`RATE_LIMIT_STORE`).
3. Sender IP outside the source's allowed ranges, when it has some: `403`. The IP comes from `X-Forwarded-For`
   only behind `TRUSTED_PROXIES`.
4. Body over 1 MB: `413`. The general `BODY_LIMIT_KB` applies first: set below 1024 it lowers the cap and answers
   `413` before steps 1–3.
5. The check, on the raw body bytes (not decoded text) in constant time: `platform` (another platform app: `X-<its prefix>-Signature`,
   5 minutes), `hmac-sha256` (a named header, hex or base64, an optional prefix such as `sha256=`, an optional
   timestamp header that makes the digest cover `<timestamp>.<body>` within 5 minutes), or `token` (the secret in
   `X-Webhook-Token` or a named header; a `Bearer ` in front is ignored). `Authorization` and `Cookie` cannot be
   named: the platform reads them itself. A failure answers `401`, stores no body and writes the audit event
   `webhooks.inbound.rejected` (`denied`).
6. A delivery id seen before (the sender's delivery header, `X-<prefix>-Delivery` for `platform`, or the body's
   SHA-256) answers `200 { duplicate: true }` while the earlier event is kept (30 days).
7. Stored with the kept headers (the signature or token as `<present>`) and queued: `202 { id }`. The handler runs
   later in a job as the system actor.

Known gaps: a _Run again_ while a retry is still queued can run the handler twice; the log shows `Failed` while a
retry is still queued; a delivery of a deleted subscription stays pending, and one left pending by a crash is not
picked up again.

## Not built

- A check of passwords against a breach list (Have I Been Pwned's range API); only the built-in list of common
  passwords is refused.
- Letting a locked person in with a valid 2-step code, or locking per (account, IP) first.
