# Email notifications — react-email + Resend

**Date:** 2026-07-14 · _Transport revised to Resend 2026-09-28._
**Scope:** react-email as the templating layer, a Resend transport, and wiring for
transactional emails: password reset, signup lifecycle (pending → approved/rejected),
and profile-change decisions. Delivery is best-effort and never blocks the DB action.

## Decisions

- **Templating:** `@react-email/components` + `@react-email/render` — templates are
  React components rendered to HTML and plain text.
- **Transport:** the Resend HTTP API (`POST https://api.resend.com/emails`),
  authenticated with a `Bearer` API key. A plain `fetch`, so it runs on the
  Cloudflare worker runtime with no SDK.
- **Best-effort:** every send is wrapped so a failure (including "not configured")
  is logged and swallowed — the authoritative DB action still succeeds.

## Modules

```
src/server/email/templates/       react-email components (Layout + one per event)
src/server/email/resend.ts        sendEmail({to,subject,html,text}) -> POST to Resend
src/server/email/notifications.ts one function per event: render + sendEmail (best-effort)
src/lib/reset-tokens.ts           single-use, hashed, short-lived reset tokens
src/server/reset.ts               request/consume password-reset server fns
```

`resend.ts` is the only module that talks to the network for email. Callers use
`notifications.ts`; they never touch the transport or template internals.

## Transport — `src/server/email/resend.ts`

- Reads `RESEND_API_KEY` and `RESEND_FROM_EMAIL` from `process.env`; throws a
  `"Resend is not configured"` error (recognized by `isConfigError`) when either is
  missing, so callers distinguish "not set up" from a real send failure.
- POSTs `{ from, to, subject, html, text }` with an `Authorization: Bearer` header.
- Returns `Result<null>`: `ok:true` on HTTP 2xx, `ok:false` with the Resend error
  body otherwise. Values are never logged.

## Notifications facade — `src/server/email/notifications.ts`

One function per event (`sendPasswordResetEmail`, `sendSignupPendingEmail`,
`sendSignupApprovedEmail`, `sendSignupRejectedEmail`, `sendProfileChangeApprovedEmail`,
`sendProfileChangeRejectedEmail`). Each renders its template to HTML + text and calls
`resend.sendEmail`, catching and logging any error. Links use `APP_URL`.

## Reset flow

`src/lib/reset-tokens.ts` issues a random token, stores only its SHA-256 hash
(`password_reset_tokens`), single-use and short-lived. `src/server/reset.ts` emails the
link (`/reset-password?token=…`) and consumes/validates it on submit. Requesting a reset
never reveals whether an email exists (no account enumeration).

## Configuration

| Var | Dev / prod | Required |
|---|---|---|
| `RESEND_API_KEY` | `.dev.vars` (dev), `wrangler secret put` (prod) | yes (to send) |
| `RESEND_FROM_EMAIL` | `.dev.vars` (dev), `wrangler.jsonc` `[vars]` (prod) | yes (to send) |
| `APP_URL` | `.dev.vars` (dev), `wrangler.jsonc` `[vars]` (prod) | no |

Non-secret values go in `wrangler.jsonc` `[vars]`; only `RESEND_API_KEY` uses
`wrangler secret put`. With nothing set, email is simply skipped (best-effort).

### Sending-domain caveat (manual, user-side)

Resend delivers reliably only from a **verified sending domain** — add the SPF, DKIM,
and DMARC DNS records Resend provides and confirm the domain shows "verified". Until
then, use Resend's test sender / a verified address. This is external configuration in
the Resend dashboard; the design documents it but cannot automate it.

## Best-effort contract

Auth/admin/profile server fns call the notification helpers **after** the DB write and
never await success — a user is created / approved / rejected even if Resend is down or
unconfigured. The failure is logged, not propagated.

## Testing

- **Unit:** `src/server/email/notifications.test.ts` (best-effort: a failing/unconfigured
  transport never throws), `src/lib/reset-tokens.test.ts` (hash, single-use, expiry).
- **Live smoke:** with Resend configured and a verified sender, trigger a reset and
  confirm the mail arrives and the link works.

## Pre-production test plan

Referenced from the whole-app plan as module **M20**. Suites A–G, run on the deployed
pre-prod Worker with a real Resend key and verified domain:

- **A. Transport (live):** `sendEmail` to a real inbox → HTTP 2xx, mail arrives.
- **B. Reset e2e:** request → email → reset link → new password works; no enumeration.
- **C. Signup fan-out:** pending notifies masters; approve/reject notifies the applicant.
- **D. Best-effort resilience:** with Resend unconfigured/failing, the DB action still
  succeeds and the failure is logged.
- **E. Deliverability:** SPF/DKIM/DMARC pass; mail lands in inbox, not spam.
- **F. Security:** API key never logged/returned; tokens single-use and expiring.
- **G. Regression:** all templates render valid HTML + plain text.
