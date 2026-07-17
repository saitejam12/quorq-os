# Email notifications — react-email + AWS SES

**Status:** Design approved (pending spec review)
**Date:** 2026-07-14
**Scope:** Set up react-email as the templating layer, an AWS SES transport, and wire
four transactional emails into the existing auth flows: password reset, new-signup
notification to masters, signup approval, and signup rejection.

## Goal

QuorqOS currently sends no email. Two auth journeys have dead ends:

- **Password reset** — [`forgot-password.tsx`](../../../src/routes/forgot-password.tsx)
  renders a "check your email" confirmation but the `requestPasswordReset` call is
  commented out; no server function, token store, or reset-consume page exists.
- **Signup approval** — [`signup()`](../../../src/server/auth.ts) creates a `pending`
  user and [`approveUser`/`rejectUser`](../../../src/server/admin.ts) flip the status,
  but nobody is notified: masters must poll the requests page, and applicants never
  learn the outcome.

This project delivers the missing transport and templates, and closes both loops.

## Decisions (resolved during brainstorming)

- **Transport:** AWS SES v2 `SendEmail` HTTP API, authenticated with a hand-rolled
  SigV4 signature computed via Web Crypto. No `aws-sdk` — this matches the codebase
  grain (stateless HS256 JWT in `jwt.ts`, PBKDF2 password hashing in `password.ts`,
  both hand-rolled on Web Crypto) and keeps the Worker bundle lean.
- **Templating:** react-email. Templates are React components rendered to an HTML
  string at send time with `@react-email/render`. The `react-email` preview CLI is
  included for local authoring (`pnpm email`).
- **Signup emails:** all three directions — notify masters on a new pending signup,
  notify the applicant on approval, notify the applicant on rejection.
- **Reset token TTL:** 30 minutes (matches the copy already in `forgot-password.tsx`),
  single use.

## Architecture

```
src/lib/sigv4.ts              pure AWS SigV4 signer (Web Crypto); unit-tested vs AWS vectors
src/lib/reset-tokens.ts       pure token gen / hash / expiry helpers; unit-tested
src/server/email/ses.ts       sendEmail({to,subject,html,text}) -> SigV4 POST to SES v2
src/server/email/notifications.ts   render template + send; one fn per email; best-effort
src/server/email/templates/   Layout.tsx + 4 react-email components
src/server/reset.ts           requestPasswordReset, resetPassword server fns
src/routes/reset-password.tsx new route: consume token, set new password
db/init.sql                   + password_reset_tokens table
wrangler.jsonc                + [vars] for non-secret config
```

Two clean layers. `src/lib/*` holds pure, testable logic with no I/O (signing math,
token math). `src/server/email/*` holds the I/O: `ses.ts` is the only thing that talks
to the network; `notifications.ts` is the only thing that renders templates and knows
which template maps to which event. Callers (auth.ts, admin.ts, reset.ts) depend only
on `notifications.ts` — they never touch SES or template internals.

### 1. SigV4 signer — `src/lib/sigv4.ts`

Pure module. Given `{ method, url, region, service, headers, body, accessKeyId,
secretAccessKey, timestamp }`, returns the `Authorization` header value plus the
`x-amz-date` header. Steps follow the AWS SigV4 spec:

1. Canonical request (method, canonical URI, canonical query, canonical headers,
   signed headers, SHA-256 hex of the payload).
2. String to sign (`AWS4-HMAC-SHA256`, timestamp, credential scope, SHA-256 of the
   canonical request).
3. Signing key: `HMAC(HMAC(HMAC(HMAC("AWS4"+secret, date), region), service), "aws4_request")`.
4. Signature = `HMAC(signingKey, stringToSign)` as hex.

All HMAC-SHA256 and SHA-256 via `crypto.subtle`. `timestamp` is passed in (not read
from the clock inside the pure fn) so it is deterministic and testable. Unit tests use
the AWS-published SigV4 test-suite vectors to lock correctness.

### 2. SES transport — `src/server/email/ses.ts`

`sendEmail({ to, subject, html, text })`:

- Reads `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `SES_FROM_EMAIL`
  from `process.env`; throws a descriptive "not configured" error if any is missing
  (same pattern as `getAuthSecret()`), so `isConfigError` recognizes it.
- Endpoint: `https://email.<AWS_REGION>.amazonaws.com/v2/email/outbound-emails`.
- Body: SES v2 JSON —
  `{ FromEmailAddress, Destination: { ToAddresses: [...] },
     Content: { Simple: { Subject: { Data }, Body: { Html: { Data }, Text: { Data } } } } }`.
- Signs with `src/lib/sigv4.ts` (service `ses`), POSTs via `fetch`.
- Returns `Result<null>`: `ok:true` on 200, `ok:false` with the SES error body otherwise.
  Never throws for a delivery failure — the caller decides how to treat it.

`to` accepts a single address or an array (masters fan-out).

### 3. Templates — `src/server/email/templates/`

react-email components (`@react-email/components`). A shared `Layout.tsx` provides the
branded shell (logo/wordmark header, container, footer). Four content components:

- `ResetPasswordEmail({ name, resetUrl })` — greeting, primary button to `resetUrl`,
  "expires in 30 minutes", "ignore if you didn't request this".
- `SignupPendingEmail({ applicantName, applicantEmail, requestsUrl })` — sent to masters;
  states who signed up and links to the requests page to approve/decline.
- `SignupApprovedEmail({ name, loginUrl })` — welcome, account is active, sign-in button.
- `SignupRejectedEmail({ name })` — polite decline, no link.

Each is rendered to HTML with `@react-email/render`'s `render()`; a plain-text
fallback is produced with `render(<Template/>, { plainText: true })`.

### 4. Notification helpers — `src/server/email/notifications.ts`

One function per event; each renders the matching template and calls `ses.sendEmail`,
building URLs from `APP_URL`:

- `sendPasswordResetEmail({ to, name, token })` → `${APP_URL}/reset-password?token=${token}`.
- `sendSignupPendingEmail({ masters, applicantName, applicantEmail })` →
  `${APP_URL}/admin/requests`; `masters` is the list of recipient addresses.
- `sendSignupApprovedEmail({ to, name })` → `${APP_URL}/login`.
- `sendSignupRejectedEmail({ to, name })`.

**Best-effort contract:** every helper catches its own errors, `console.error`s, and
returns without throwing. Email is a side effect; it must never fail the authoritative
DB action (a user must be created / approved / rejected even if SES is down or
unconfigured). The one exception is `resetPassword` itself, which is not an email
operation and returns real errors.

### 5. Password reset — DB, lib, server fns, route

**Table (`db/init.sql`, idempotent, mind the `;`-in-comment gotcha):**

```sql
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reset_tokens_hash ON password_reset_tokens (token_hash);
```

Only the SHA-256 **hash** of the token is stored; the plaintext exists only in the
emailed URL, so a DB leak does not yield usable reset links.

**`src/lib/reset-tokens.ts` (pure, tested):**

- `generateToken()` → 32 random bytes (`crypto.getRandomValues`) as base64url.
- `hashToken(token)` → SHA-256 hex (`crypto.subtle`).
- `isExpired(expiresAt, now)` → boolean.

**`src/server/reset.ts`:**

- `requestPasswordReset({ email })` — look up an `active` user by lowercased email. If
  found: generate token, insert `{ user_id, hashToken(token), expires_at = now+30m }`,
  send the reset email. **Always returns `{ ok: true, data: null }`** regardless of
  whether the user exists, to prevent account enumeration. Send failures are logged,
  not surfaced.
- `resetPassword({ token, password })` (password `min(8)`) — hash the token, select a
  row where `token_hash` matches, `used_at IS NULL`, and `expires_at > now`. If none →
  `{ ok:false, error:'This reset link is invalid or has expired.' }`. Otherwise update
  the user's `password_hash`, set `used_at = now` on that token, and invalidate any
  other outstanding tokens for the user (`used_at = now WHERE user_id = ... AND used_at
  IS NULL`). Returns `Result<null>`.

Use `expires_at::text` / compare in SQL against `now()` in the query rather than
round-tripping DATE objects in JS (neon DATE gotcha #1), or compare timestamps in JS
after casting — the query approach is simpler and avoids the gotcha entirely.

**Route `src/routes/reset-password.tsx`:** reads `token` from the search params, shows
a new-password + confirm form, calls `resetPassword`, and on success shows a confirmation
with a link to `/login`. On invalid/expired token surfaces the server error. Register
the route (no sidebar entry — it is a public, unauthenticated page like `login`/`signup`),
then `tsr generate`.

**Wire the request side:** replace the commented call in `forgot-password.tsx` with the
live `requestPasswordReset({ data: { email } })` (behavior of the existing UI is
unchanged — it already shows the generic "if an account exists" confirmation).

### 6. Wire signup approvals

- **`signup()` (`src/server/auth.ts`)** — after the successful `INSERT`, query
  `SELECT email, name FROM users WHERE tier = 'master' AND status = 'active'` and call
  `sendSignupPendingEmail` with those recipients and the new applicant's name/email.
  Wrapped best-effort; signup still returns `ok:true` if the mail fails.
- **`setPendingStatus()` (`src/server/admin.ts`)** — extend the `UPDATE ... RETURNING id`
  to `RETURNING id, email, name`. When the new status is `active`, call
  `sendSignupApprovedEmail`; when `rejected`, call `sendSignupRejectedEmail`. Best-effort;
  the status change is authoritative and already committed before the email is attempted.

### 7. Config & secrets

| Var | Where | Secret? |
| --- | --- | --- |
| `AWS_ACCESS_KEY_ID` | `.dev.vars` (dev), `wrangler secret put` (prod) | yes |
| `AWS_SECRET_ACCESS_KEY` | `.dev.vars` (dev), `wrangler secret put` (prod) | yes |
| `AWS_REGION` | `wrangler.jsonc` `[vars]` + `.dev.vars` | no |
| `SES_FROM_EMAIL` | `wrangler.jsonc` `[vars]` + `.dev.vars` | no |
| `APP_URL` | `wrangler.jsonc` `[vars]` + `.dev.vars` | no |

The workerd runtime only sees worker env bindings, so **all five must be present in
`.dev.vars` for local dev** (restart `pnpm dev` after editing). Non-secret values also
go in `wrangler.jsonc` `[vars]` so prod has them without a secret put; only the two AWS
keys use `wrangler secret put`.

### SES sandbox caveat (manual, user-side)

A fresh SES account is **sandboxed**: the `SES_FROM_EMAIL` identity (or its domain) must
be verified, and while sandboxed SES delivers **only to verified recipient addresses**.
To email arbitrary applicants/masters, request SES production access. This is external
configuration done in the AWS console; the design documents it but cannot automate it.
Local smoke testing works by verifying the test recipient address in SES.

## Failure philosophy

The database is the source of truth; email is a best-effort side effect. Signup,
approval, rejection, and reset-*request* all complete and return their normal result
even if SES is unconfigured or failing — the failure is logged, not propagated. Only
`resetPassword` (a state change driven by the user, not an email) returns real errors.

## Testing & verification

- **Unit:** `src/lib/sigv4.test.ts` against AWS SigV4 test-suite vectors;
  `src/lib/reset-tokens.test.ts` for gen/hash/expiry.
- **Typecheck / lint:** `tsc --noEmit` (ignore the 2 known `/settings` errors),
  `eslint`. Run `tsr generate` after adding the reset route.
- **Live smoke:** with SES configured and a verified recipient, trigger a reset from
  `/forgot-password`, confirm the email arrives, follow the link, reset the password,
  and confirm login with the new password. Sanity-check that a signup fires the master
  notification and that approve/reject fire the applicant emails.

## Pre-production test plan

Environment-level testing on a deployed pre-prod Worker (not local dev), exercising the
real SES integration, real DNS/deliverability, and the full auth wiring end to end. The
goal is to prove every path — including failure paths — before any production traffic.

### Environment setup (prerequisites)

- **Pre-prod Worker.** A separate deploy target so tests never hit prod. Add a
  `[env.preprod]` block in `wrangler.jsonc` (own `name`, own `routes`/`workers.dev`
  subdomain) and deploy with `wrangler deploy --env preprod`. `APP_URL` points at the
  pre-prod URL so every emailed link resolves there.
- **Isolated database.** A dedicated Neon branch/DB for pre-prod, schema applied
  (`apply-schema`) and seeded (`seed-people`). Reset tokens and status changes must not
  touch prod rows.
- **Secrets & vars.** `wrangler secret put AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY --env
  preprod`; `AWS_REGION`, `SES_FROM_EMAIL`, `APP_URL` in the `[env.preprod]` `[vars]`.
- **SES identities & DNS.** Verify the sender identity (domain preferred) and publish
  SPF, DKIM (3 CNAMEs), and DMARC records; confirm all show "verified" in SES.
- **Keep pre-prod in the SES sandbox** and test with:
  - **SES mailbox simulator** addresses — `success@`, `bounce@`, `complaint@`,
    `suppressionlist@simulator.amazonses.com` — which accept mail in sandbox with no
    per-address verification and let us drive bounce/complaint behavior deterministically.
  - **2–3 real inboxes you control** (Gmail + Outlook at minimum), each verified in SES,
    for visual/deliverability checks.
- **Observability.** `wrangler tail --env preprod` for Worker logs during runs; the SES
  sending dashboard / CloudWatch for accepted / bounced / complained counts.

### Test suites

Priority: **P0** = blocks promotion to prod; **P1** = should pass, fix before GA;
**P2** = nice to confirm.

**A. SES transport / SigV4 (live)**

| ID | Case | Expected | Pri |
| --- | --- | --- | --- |
| A1 | Valid `sendEmail` to a verified inbox | HTTP 200, SES `MessageId` returned, mail arrives | P0 |
| A2 | SigV4 signature accepted by live SES | No `403 SignatureDoesNotMatch`; A1 succeeding proves signing, signed headers, and `x-amz-date` are correct | P0 |
| A3 | Invalid AWS keys | SES 403 → `sendEmail` returns `ok:false`; caller does **not** throw | P0 |
| A4 | Missing SES env vars | Descriptive "not configured" error, recognized by `isConfigError`; best-effort callers unaffected | P0 |
| A5 | Send to `bounce@simulator` | 200 accepted; bounce shows in SES dashboard; our Worker does not crash (bounce handling is out of scope) | P1 |
| A6 | Send to `complaint@simulator` | 200 accepted; complaint recorded; no crash | P1 |
| A7 | Rapid fan-out (many masters) | No unhandled error if SES throttles (`454`); throttled sends return `ok:false` gracefully | P1 |
| A8 | Region correctness | Endpoint host uses `AWS_REGION`; identity in that region delivers | P0 |

**B. Password reset end-to-end**

| ID | Case | Expected | Pri |
| --- | --- | --- | --- |
| B1 | Request reset for an active user | `ok:true`; email received; link is `<APP_URL>/reset-password?token=…`, HTTPS | P0 |
| B2 | Request reset for a non-existent email | `ok:true` (no enumeration); **no** email sent; response body/timing indistinguishable from B1 | P0 |
| B3 | Request reset for a `pending`/`rejected` user | `ok:true`; no email (only active users get links) | P1 |
| B4 | Follow valid link, set new password | Reset page loads; success; login with new password works; **old password rejected** | P0 |
| B5 | Reuse the same link after success | "invalid or has expired" | P0 |
| B6 | Expired token (wait >30 min, or backdate `expires_at` in DB) | "invalid or has expired" | P0 |
| B7 | Tampered token (alter characters) | Hash mismatch → "invalid or has expired" | P0 |
| B8 | Token bound to user | A token only resets the user it was issued for | P0 |
| B9 | Multiple outstanding tokens, one consumed | Other outstanding tokens for that user are invalidated after a successful reset | P1 |
| B10 | DB inspection | `token_hash` stored is a SHA-256 hash; plaintext token exists only in the email URL | P0 |
| B11 | New password < 8 chars | Validation error; no password change | P1 |

**C. Signup approval flow**

| ID | Case | Expected | Pri |
| --- | --- | --- | --- |
| C1 | New signup | User created `pending`; every active master receives the pending-notification mail linking to `<APP_URL>/admin/requests` | P0 |
| C2 | Fan-out with one bad master address (`bounce@simulator`) | Other masters still receive theirs; signup unaffected | P1 |
| C3 | Signup with zero active masters | Signup still succeeds; no email; no crash | P1 |
| C4 | Master approves | Applicant receives "account active" mail with login link; applicant can now log in | P0 |
| C5 | Master rejects | Applicant receives "declined" mail; login shows the declined message | P0 |
| C6 | Approve/reject with SES disabled | Status still flips (authoritative); email failure only logged | P0 |
| C7 | Signup with SES disabled | Pending user still created | P0 |

**D. Resilience / best-effort contract**

| ID | Case | Expected | Pri |
| --- | --- | --- | --- |
| D1 | Remove SES creds, run signup / approve / reject / reset-request | All core actions return their normal result; failures logged; **no 500 reaches the user** | P0 |
| D2 | SES returns 5xx (point region/endpoint at a bad value) | Same graceful degradation as D1 | P1 |
| D3 | `resetPassword` (state change, not email) with SES down | Still succeeds — it does not depend on email | P0 |
| D4 | Log inspection on failure | AWS key values never appear in logs; only names/booleans, per the `getAuthDiagnostics` pattern | P0 |

**E. Deliverability & rendering**

| ID | Case | Expected | Pri |
| --- | --- | --- | --- |
| E1 | SPF / DKIM / DMARC | All pass in received-message headers; mail-tester.com score ≥ 9/10 | P0 |
| E2 | Inbox placement | Lands in inbox (not spam) on Gmail and Outlook | P0 |
| E3 | HTML rendering | Correct layout in Gmail (web + mobile), Outlook, Apple Mail | P1 |
| E4 | Plain-text fallback | `multipart/alternative` present; text part readable | P1 |
| E5 | Link/host correctness | All links use the pre-prod `APP_URL` (never localhost/prod); buttons clickable | P0 |
| E6 | From / subject | Correct from-name and address, correct subjects, no broken "via" display | P1 |
| E7 | Dark mode | Templates legible in dark-mode clients | P2 |

**F. Security / privacy**

| ID | Case | Expected | Pri |
| --- | --- | --- | --- |
| F1 | No enumeration | B2/B3 response and timing parity with B1 | P0 |
| F2 | Tokens hashed at rest | B10 confirmed | P0 |
| F3 | Token entropy | 32 random bytes, base64url; not sequential or guessable | P0 |
| F4 | Token not logged | Plaintext token never written to Worker logs | P0 |
| F5 | Reset-request abuse | Repeated requests for one email each return `ok:true` with no resource blowup. **Known gap:** no rate limit (out of scope) — record and track as a follow-up | P1 |
| F6 | Authorization intact | Only masters can approve/reject; the reset page is public but requires a valid token | P0 |

**G. Regression**

| ID | Case | Expected | Pri |
| --- | --- | --- | --- |
| G1 | Existing auth UI | Login / logout / signup behave as before | P0 |
| G2 | `forgot-password.tsx` now calls the live fn | UI behavior unchanged — still shows the generic "if an account exists" confirmation | P0 |
| G3 | Automated suite | `vitest run`, `tsc --noEmit` (ignore the 2 known `/settings` errors), and `eslint` all green | P0 |
| G4 | Routing | `tsr generate` ran; `/reset-password` resolves; other routes unaffected | P0 |

### Exit criteria (gate to production)

1. Every **P0** case passes; no open P1 without a written, accepted follow-up.
2. Deliverability verified (E1/E2) from the real sending domain.
3. Best-effort contract proven (suite D) — email failure never blocks a DB action.
4. No secret leakage (D4) and no enumeration (F1).
5. Automated suite green (G3).
6. **Then** request SES production access to leave the sandbox — this is the final,
   deliberate step before pointing prod at SES, so arbitrary applicant/master addresses
   can receive mail.

## Risks

1. **`@react-email/render` in the Worker runtime.** It relies on `react-dom/server`,
   which TanStack Start already uses for SSR on Workers, so it should run — but verify
   early. Fallback: pre-render templates to HTML with placeholder tokens at build time
   and interpolate dynamic values at send time.
2. **SES sandbox** limits deliverability until production access is granted (documented
   above).
3. **SigV4 correctness** is fiddly; mitigated by testing against AWS's official vectors
   before wiring it to live sending.

## Out of scope (YAGNI)

- Email open/click tracking, retries/queues, bounce handling.
- Localization / multiple languages.
- Configurable per-user email preferences.
- Rate limiting on `requestPasswordReset` (worth a follow-up, but not required for this
  slice; the no-enumeration response already limits its usefulness to an attacker).
