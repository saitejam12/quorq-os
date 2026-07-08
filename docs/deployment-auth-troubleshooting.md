# Deployed auth is broken — root cause & fix

**Date:** 2026-07-08
**Symptom:** Sign-in works locally but fails in the deployed (Cloudflare Workers)
version — login returns a generic error and you can never authenticate.

## Root cause

The deployed Worker has **no `AUTH_SECRET` and no `DATABASE_URL`**, so every auth
and database server function throws before it can do any work.

Why they're missing in production:

- Server functions read config from `process.env` — `getAuthSecret()` uses
  `process.env.AUTH_SECRET` and `requireDb()` uses `process.env.DATABASE_URL`.
- On Cloudflare Workers, `process.env` is auto-populated from **vars and secrets**
  because `wrangler.jsonc` sets `nodejs_compat` and `compatibility_date`
  `2025-09-02` (≥ `2025-04-01`, which turns on `nodejs_compat_populate_process_env`).
  **But it only contains secrets that actually exist.**
- The two values live in **`.dev.vars`**, which is **local-dev only** — it is
  gitignored and never uploaded by `wrangler deploy`.
- `wrangler.jsonc` declares **no** `vars`/secrets, and the deploy script is just
  `npm run build && wrangler deploy` — there is **no `wrangler secret put` step**.

So in production `process.env.AUTH_SECRET` and `process.env.DATABASE_URL` are
`undefined` → `getAuthSecret()` / `requireDb()` throw → `login`/`signup` catch it
and return an error. (`.dev.vars.example` already documents this: values are seen
"here (dev) or via `wrangler secret put` (prod)".)

This is the production counterpart of the local-auth gotcha recorded in the
project roadmap memory (`.env`/`.env.local` are not read by the Worker runtime —
only `.dev.vars` in dev and `wrangler secret put` in prod).

## The fix (operational — do this in the deployment)

Set the two secrets on the deployed Worker, using the same values as `.dev.vars`:

```bash
wrangler secret put AUTH_SECRET      # paste the AUTH_SECRET value from .dev.vars
wrangler secret put DATABASE_URL     # paste the DATABASE_URL value from .dev.vars (no quotes)
```

Secrets take effect on the live Worker immediately (no redeploy required). Then
reload the site and sign in. Requires being logged in to the correct Cloudflare
account (`wrangler whoami`).

To make future deploys self-documenting, consider adding a predeploy check or a
note in the deploy script; the secrets themselves must remain out of source
control.

## Code changes shipped alongside this doc (diagnosis & hardening)

These do **not** replace setting the secrets — they make the failure obvious and
stop it from crashing the app:

- **Client console logging** (`src/routes/login.tsx`): the login flow logs the
  attempt, the result, and thrown RPC errors. On a failed login it calls a
  diagnostics probe and logs exactly which secret is missing, e.g.
  `[auth] server misconfigured — missing worker secrets: { AUTH_SECRET: 'MISSING', DATABASE_URL: 'set' }`.
- **Diagnostics probe** (`getAuthDiagnostics` in `src/server/auth.ts`): returns
  `{ hasAuthSecret, hasDatabaseUrl }` — booleans only, never the values.
- **Actionable error** (`login`/`signup`): a configuration failure now returns a
  specific message ("… missing its AUTH_SECRET / DATABASE_URL secrets …") instead
  of the generic "Something went wrong", via the `isConfigError` helper.
- **Hardened `getCurrentUser`**: wrapped so a missing `AUTH_SECRET` returns `null`
  (treated as "not signed in") instead of throwing and crashing every route load,
  so the app still reaches the working login page.

## How to verify

1. In the deployed browser console, attempt a login. Before the fix you now see
   `[auth] login failed:` plus the `missing worker secrets` line naming the
   absent secret(s).
2. Run the two `wrangler secret put` commands.
3. Reload and sign in — the console logs `[auth] login ok — redirecting` and the
   diagnostics report both secrets `set`.
