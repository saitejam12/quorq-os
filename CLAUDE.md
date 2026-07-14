# QuorqOS — agent guide

HR portal built on **TanStack Start (React 19) on Cloudflare Workers** with **Neon
serverless Postgres**. This file is the fast path: read it before exploring so you
don't re-derive what's already known. Deeper per-feature detail lives in
`docs/superpowers/specs/` (see [docs/README.md](docs/README.md) for the index).

## Commands

Run these through the **Bash tool** (git-bash). `node`/`pnpm` are nvm shims that
are **not on the PowerShell PATH** — PowerShell/`npx` will fail with "not
recognized". If `pnpm` isn't found, call binaries directly: `./node_modules/.bin/<bin>`.

```bash
pnpm dev                         # Vite dev server on :3000
./node_modules/.bin/vitest run   # tests (a.k.a. pnpm test)
./node_modules/.bin/tsc --noEmit # typecheck
./node_modules/.bin/eslint       # lint (whole repo)
./node_modules/.bin/tsr generate # regenerate src/routeTree.gen.ts after adding/removing a route
node scripts/apply-schema.mjs    # apply db/init.sql to the Neon DB in .env.local
node scripts/seed-people.mjs     # reseed (deterministic, ~142 employees); a.k.a. pnpm seed:people
```

## Architecture essentials

- **Server functions** (`src/server/*.ts`) are `createServerFn({ method })...
.handler()`; the client calls them as RPC. Mutations return the uniform
  `Result<T> = { ok: true; data: T } | { ok: false; error: string }` (defined in
  `src/server/auth.ts`). Expected failures return `ok: false`; only unexpected
  errors are caught + `console.error`'d.
- **Raw SQL, not Drizzle.** Use the Neon tagged-template client from
  `requireDb()` (`src/db.ts`). storeapp (the reference app being ported from) uses
  Drizzle — every port translates Drizzle → raw `sql`.
- **Auth is stateless JWT** (HS256 via Web Crypto — no bcrypt/JWT libs; see
  `src/server/password.ts`, `jwt.ts`). Privileged server fns **re-read tier from
  the DB** rather than trusting the token: `getSessionUser()` (`src/server/session.ts`)
  returns `{ id, name, tier, employeeId }`; `canApprove(user)` = ops+.
- **Three hierarchical tiers** `basic ⊂ ops ⊂ master` (`src/lib/tiers.ts`:
  `hasTier`, `canSetTier`). Route guard: `requireTier(context.user, minTier)` in a
  route's `beforeLoad` (`src/lib/guards.ts`), throws a redirect to `/?denied=1`.
  UI hiding is convenience; the server-fn tier check is the real boundary.
- **Routing** is file-based under `src/routes/`. `_app.tsx` is the pathless
  authed layout (its `beforeLoad` redirects anonymous users to `/login`, injects
  `user` into router context, and runs the daily attendance reconcile). Pages read
  the user via `Route.useRouteContext()` / `useRouteContext({ from: '/_app' })`.
- **Dates/UTC:** timestamps are `timestamptz` (UTC); the UI renders machine-local
  via `new Date(iso).toLocaleTimeString()`. See the neon DATE gotcha below.

## Layout

```
db/init.sql            all schema + idempotent (CREATE IF NOT EXISTS / ALTER ADD COLUMN IF NOT EXISTS); 27 tables
scripts/               apply-schema.mjs, seed-people.mjs (deterministic PRNG, bulk() helper), hash-password.mjs
src/db.ts              requireDb() — memoized Neon client; throws a descriptive error if DATABASE_URL is unset
src/lib/               pure, unit-tested helpers: tiers, guards, time, attendance, profile-fields, postings, mask, pagination, import-export
src/server/            server functions, one file per domain (auth, session, admin, people, org, profile, profile-requests,
                       time, attendance, holidays, leave, expenses, payroll, hiring, postings, onboarding, metrics, import, health)
src/routes/_app/       one file per page; admin/ holds ops+/master screens
src/components/        AppSidebar (tier-filtered NAV), ui.tsx + charts.tsx (shared kit), dashboards/, ClockWidget, etc.
```

Sidebar routes are a typed union + `NAV` array in `src/components/AppSidebar.tsx`;
each leaf's `minTier` gates visibility. (Known: the union still lists `/settings`,
whose route file was deleted — this yields 2 expected `tsc` errors; leave it.)

## Database workflow

- **Local secrets live in `.dev.vars`** (gitignored), NOT `.env`/`.env.local` —
  the workerd runtime only sees worker env bindings. Both `AUTH_SECRET` and
  `DATABASE_URL` must be there; restart `pnpm dev` after editing. In prod they're
  set via `wrangler secret put` (the deploy script does NOT set them — see
  `docs/deployment-auth-troubleshooting.md`).
- `apply-schema.mjs` reads `DATABASE_URL` from `.env.local` (that file is only for
  the scripts, not the runtime) and naively splits `init.sql` on `;`.
- After schema/seed changes, apply then reseed, then verify with a short
  read-only `.mjs` against the DB (pattern: read `DATABASE_URL` from `.env.local`,
  `neon(...)`, run SELECTs). Put such scripts in the repo root (not `/tmp`, or
  ESM resolution breaks) and delete them after.

## Critical gotchas (each has cost real debugging time)

1. **neon returns `DATE` columns as JS `Date` objects, not strings.** Server-side
   `String(dateCol).slice(0,10)` yields `'Mon Jan 26'` (from `Date.toString()`) and
   `.toISOString()` is off-by-one (tz). **Fix: cast in SQL — `col::text`** — for any
   date you build a `YYYY-MM-DD` string from or string-compare. (Returning a raw
   Date to the client is fine; the wire serializer round-trips Date→ISO→Date.)
2. **`apply-schema.mjs` splits on `;`** — a semicolon inside a SQL **comment** or a
   `DO $$…$$` block truncates the statement (error 42601). Keep `;` out of comments;
   no `DO` blocks. Grep before applying: `grep -nE '^\s*--.*;' db/init.sql`.
3. **Lint `no-unnecessary-condition`:** `noUncheckedIndexedAccess` is OFF, so
   `Record[key]` / `(await sql...)[0]` are typed non-nullable and your `?.` / `?? x`
   guards get flagged as "unnecessary." Fix by casting rows to `... | undefined`.
4. **Adding a route** requires regenerating `src/routeTree.gen.ts** (`tsr generate`)
before `tsc`passes — otherwise the new route's path and`context.user`type
aren't known. The dev server regenerates it live; a headless`tsc` won't.
5. **Never edit `src/routeTree.gen.ts` by hand** — it's generated.

## Adding a page/module (checklist)

1. `src/server/<domain>.ts` — server fns (`Result<T>`, `getSessionUser`/`canApprove` for authz).
2. Schema in `db/init.sql` (idempotent; mind gotcha #2), then `apply-schema` + seed.
3. Pure logic → `src/lib/<domain>.ts` with a `.test.ts` (this is where tests live).
4. `src/routes/_app/<page>.tsx` (guard in `beforeLoad` if tier-restricted).
5. Register in `src/components/AppSidebar.tsx` (`RoutePath` union + `NAV` leaf + `minTier`); `tsr generate`.
6. Verify: `vitest run`, `eslint`, `tsc --noEmit` (ignore the 2 `/settings` errors), plus a live DB smoke check.

## Verification & conventions

- Tests: Vitest, node env, `#/` → `src/`. Pure helpers in `src/lib` are unit-tested;
  server fns are thin glue verified by typecheck + live SQL smoke.
- Match surrounding code: comment density, naming, `Result<T>`, the ui.tsx/charts.tsx kit.
- Demo accounts: `basic@quorq.com` / `ops@quorq.com` / `master@quorq.com`, password = `<tier>123`.
- Commit only when asked.

```

```
