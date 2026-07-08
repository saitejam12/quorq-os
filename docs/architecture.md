# QuorqOS — Architecture & Code Functionality

_Last updated: 2026-07-07 · Covers the RBAC foundation (sub-project 1 of 6)_

QuorqOS is a TanStack Start application being built toward a fully automated HR
portal. The code currently in the repo implements the **authentication and
role-based access control (RBAC) foundation**: real database-backed users,
stateless JWT sessions, a three-tier permission model, a signup-approval
workflow, and tier-gated routes, navigation, and dashboards.

This document describes what the code does today, module by module.

---

## 1. Tech stack

| Concern | Choice |
|---|---|
| Framework | TanStack Start 1.168 (React 19, file-based routing, server functions) |
| Routing | TanStack Router (`src/routeTree.gen.ts` is generated — never hand-edited) |
| Data fetching | TanStack Query (`@tanstack/react-query`) |
| Forms | TanStack React Form (`@tanstack/react-form`) + zod v4 validation |
| Database | Neon serverless PostgreSQL (`@neondatabase/serverless`, tagged-template client) |
| Crypto | Web Crypto (`crypto.subtle`) — Cloudflare Workers-native, zero crypto deps |
| Styling | Tailwind CSS v4 (slate neutrals, `blue-600` primary) + lucide-react icons |
| Runtime / deploy | Cloudflare Workers (`wrangler`, `nodejs_compat`) |
| Tests | Vitest (node environment) |

**Deliberate constraints:** no bcrypt and no JWT library (neither is
Workers-compatible / both would add weight); all hashing and token signing use
Web Crypto directly.

---

## 2. Directory map

```
db/init.sql                     Schema + seed data (todos demo + users)
scripts/hash-password.mjs       CLI: generate a PBKDF2 hash for a seed password
scripts/apply-schema.mjs        Apply db/init.sql to the Neon DB in .env.local

src/db.ts                       requireDb() — Neon client accessor
src/lib/tiers.ts                Tier model: types, ranks, hasTier, canSetTier
src/lib/guards.ts               requireTier() route-guard helper

src/server/password.ts          PBKDF2 hash / verify
src/server/jwt.ts               HS256 JWT sign / verify
src/server/auth.ts              signup, login, logout, getCurrentUser
src/server/admin.ts             listUsers, approve/reject, setUserTier, getUserStats

src/routes/__root.tsx           Root document shell
src/routes/index.tsx            "/" — default TanStack welcome page (NOT wired up)
src/routes/login.tsx            /login
src/routes/signup.tsx           /signup
src/routes/forgot-password.tsx  /forgot-password (UI-only stub)
src/routes/_app.tsx             Authenticated layout + auth guard
src/routes/_app/home.tsx        /home — tiered dashboards
src/routes/_app/admin/requests.tsx   /admin/requests (master only)
src/routes/_app/admin/users.tsx      /admin/users (ops+)

src/components/AppSidebar.tsx        Tier-filtered navigation + profile block
src/components/BrandPanel.tsx        Marketing panel on auth pages
src/components/dashboards/*          Basic / Ops / Master dashboard panels
```

---

## 3. Data model

Defined in `db/init.sql`. The pre-existing `todos` table is unrelated demo data
and untouched by the HR portal. The relevant table:

```sql
CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) NOT NULL UNIQUE,
    name          VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    tier          VARCHAR(10) NOT NULL DEFAULT 'basic'
                    CHECK (tier IN ('basic', 'ops', 'master')),
    status        VARCHAR(10) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'rejected')),
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- **`tier`** — permission level (see §4). New users default to `basic`.
- **`status`** — signup-approval state. New users default to `pending` and
  cannot log in until a master moves them to `active`. `rejected` is terminal.
- `password_hash` stores `salt:iterations:hash` (see §5).

The `INSERT` statements are idempotent (`ON CONFLICT (email) DO NOTHING`), so
re-applying the schema is safe. Three seed accounts, all `active`:

| Email | Password | Tier |
|---|---|---|
| `basic@quorq.com` | `basic123` | basic |
| `ops@quorq.com` | `ops123` | ops |
| `master@quorq.com` | `master123` | master |

`scripts/apply-schema.mjs` reads `DATABASE_URL` from `.env.local` (stripping
surrounding quotes), splits `db/init.sql` on `;`, and executes each statement.
`scripts/hash-password.mjs <password>` prints a fresh PBKDF2 hash for seeding.

---

## 4. Tier model — `src/lib/tiers.ts`

The single source of truth for permissions, imported identically by server
functions, route guards, and the sidebar. Tiers are **hierarchical** — a higher
tier includes everything the lower tiers can do.

```
basic (1)  ⊂  ops (2)  ⊂  master (3)
```

Exports:

- `TIERS` — `['basic', 'ops', 'master'] as const`.
- `Tier` — the union type `'basic' | 'ops' | 'master'`.
- `TIER_RANK` — `{ basic: 1, ops: 2, master: 3 }`.
- **`hasTier(userTier, minTier): boolean`** — `true` when the user's rank is ≥
  the required rank. This is the gate used everywhere.
- **`canSetTier(callerTier, targetCurrentTier, newTier): boolean`** — the tier
  assignment rules:
  - Callers below `ops` cannot change anyone's tier.
  - `master` may set any tier on anyone.
  - `ops` may move users **between `basic` and `ops`**, but may neither grant
    `master` nor modify a user who is already `master`.

`canSetTier` encodes the business rule that only masters mint or revoke masters.

---

## 5. Cryptographic primitives

### Passwords — `src/server/password.ts`

PBKDF2-SHA256, 100,000 iterations, 16-byte random salt, 256-bit derived key,
all via `crypto.subtle`.

- `hashPassword(password): Promise<string>` → `"<saltB64>:100000:<hashB64>"`.
  A fresh random salt per call, so identical passwords yield different strings.
- `verifyPassword(password, stored): Promise<boolean>` — re-derives with the
  stored salt/iterations and compares in **constant time** (XOR accumulation).
  Malformed stored values return `false` rather than throwing.

### Sessions — `src/server/jwt.ts`

Hand-rolled HS256 JWT (HMAC-SHA256) using `crypto.subtle`, base64url encoded.

- `TokenPayload` — `{ sub, email, name, tier, exp }` (`exp` is unix seconds).
- `signToken(payload, secret): Promise<string>`.
- `verifyToken(token, secret): Promise<TokenPayload | null>` — returns `null`
  (never throws) on any failure: wrong shape, bad signature, expired `exp`, or
  malformed input. The payload is re-validated with a zod schema after signature
  verification, so a tampered body is rejected.

---

## 6. Authentication server functions — `src/server/auth.ts`

TanStack Start server functions (they run only on the server; the client calls
them as RPC). Shared types and helpers:

- **`SESSION_COOKIE`** = `'quorq_session'`.
- **`AuthUser`** = `{ id, email, name, tier }`.
- **`Result<T>`** = `{ ok: true; data: T } | { ok: false; error: string }` —
  the uniform return contract. Expected failures never throw; they return
  `ok: false`. Unexpected errors are caught, `console.error`-logged, and
  surfaced as the generic string `'Something went wrong'`.
- **`getAuthSecret()`** — reads `process.env.AUTH_SECRET`, throwing if unset.

Token lifetime is **24 hours**. The cookie is `HttpOnly`, `Secure`,
`SameSite=Lax`, `Path=/`.

| Function | Method | Behavior |
|---|---|---|
| `signup({ name, email, password })` | POST | Validates (name ≥ 1, valid email, password ≥ 8). Rejects duplicate email (`"An account with this email already exists"`). Inserts the user with `status='pending'`, `tier='basic'`. **Does not** log the user in. Returns `Result<null>`. |
| `login({ email, password })` | POST | Looks up by lowercased email, verifies the password. Generic `"Invalid email or password"` on either a missing user or a bad password (no user enumeration). If credentials are valid but `status='pending'` → `"Your account is awaiting approval."`; if `rejected` → `"Your signup request was declined."`. On success, signs a JWT and sets the session cookie. Returns `Result<AuthUser>`. |
| `logout()` | POST | Clears the session cookie. Returns `Result<null>`. |
| `getCurrentUser()` | GET | Reads and verifies the cookie; returns `AuthUser` or `null`. A missing/invalid/expired token is `null`, not an error. |

---

## 7. Admin server functions — `src/server/admin.ts`

All privileged operations. The security-critical detail is **`getCaller`**:

```
getCaller(sql, minTier)  →  { id, tier } | null
```

It verifies the JWT for identity, then **re-reads the caller's row from the
database** and checks `status === 'active'` and `hasTier(row.tier, minTier)`.
Authorization is decided from the live DB tier, **not** the tier baked into the
token. This is what makes the stateless-JWT design safe: if an admin
demotes or deactivates a user, that change takes effect on the user's very next
request even though their existing token still claims the old tier.

| Function | Method | Min tier | Behavior |
|---|---|---|---|
| `listUsers()` | GET | ops | Returns all users (`AdminUser[]`: id, email, name, tier, status, createdAt), newest first. |
| `approveUser({ userId })` | POST | master | Moves a `pending` user to `active`. Errors if the row isn't pending/found. |
| `rejectUser({ userId })` | POST | master | Moves a `pending` user to `rejected`. |
| `setUserTier({ userId, tier })` | POST | ops | Enforces `canSetTier` (see §4). Blocks changing **your own** tier. Errors if the target is missing or the change violates the master rule. |
| `getUserStats()` | GET | master | Aggregates counts: `{ pending, byTier: { basic, ops, master } }` (byTier counts active users only). Powers the master dashboard tiles. |

`approveUser`/`rejectUser` delegate to a shared `setPendingStatus` helper. Every
function follows the `Result<T>` contract and independently enforces its tier —
UI hiding is convenience, these server checks are the actual security boundary.

---

## 8. Routing and guards

Routing is file-based. The `_app` prefix is a **pathless layout route** — it
wraps its children with the authenticated shell and guard without adding a URL
segment (so the child route is `/home`, not `/_app/home`).

### The authenticated boundary — `src/routes/_app.tsx`

`beforeLoad` calls `getCurrentUser()`. If there's no user it throws
`redirect({ to: '/login' })`; otherwise it returns `{ user }`, injecting the
`AuthUser` into **router context**. Every child route and component reads the
user from context via `Route.useRouteContext()` or
`useRouteContext({ from: '/_app' })` — no refetching.

The layout renders a desktop sidebar (`AppSidebar`) and a mobile top bar with a
collapsible menu, with the child route in the main `<Outlet />`.

### Tier guard — `src/lib/guards.ts`

`requireTier(user, minTier)` throws `redirect({ to: '/home', search: { denied: '1' } })`
when `hasTier` fails. Admin routes call it in their own `beforeLoad`:

- `/admin/requests` → `requireTier(context.user, 'master')`
- `/admin/users` → `requireTier(context.user, 'ops')`

`/home` declares a `validateSearch` that accepts an optional `denied: '1'`, which
triggers the "You do not have access to that page" banner.

### Inverse guards

`/login` and `/signup` run `getCurrentUser()` in `beforeLoad` and redirect
already-authenticated users to `/home`.

### Route summary

| Route | Guard | Notes |
|---|---|---|
| `/` | none | Default TanStack welcome page — **not** wired into the app |
| `/login` | redirect if authed | Credential form + demo quick-fill buttons |
| `/signup` | redirect if authed | Registration → pending-approval state |
| `/forgot-password` | none | **UI-only stub** — no server function yet |
| `/home` | requires auth (`_app`) | Stacked tiered dashboards |
| `/admin/users` | ops+ | User management |
| `/admin/requests` | master | Signup approvals |

---

## 9. UI components

### Sidebar — `src/components/AppSidebar.tsx`

Reads the user from router context and filters navigation by `minTier`. The
`NAV` array marks each item (and admin sub-items) with an optional `minTier`
(default `basic`); `hasTier` decides visibility. Only routed items (`/home`,
`/admin/requests`, `/admin/users`) are real links — the rest are placeholder
buttons for modules scaffolded in later sub-projects.

Visible navigation by tier:

- **basic:** Home, Engage, My Worklife, To do, Salary, Leave, Document Center, Helpdesk
- **ops:** the above **+** People, Request Hub, Workflow Delegates, Administration → User Management
- **master:** the above **+** Administration → User Requests

The Administration group appears for ops+, and its children filter individually
(User Management is ops+, User Requests is master-only). The profile block at the
bottom shows the real user name, initial avatar, and a colored **tier badge**.

### Dashboards — `src/components/dashboards/`

`/home` stacks panels so higher tiers see supersets, topmost-first:

- **`MasterDashboard`** (master only) — four stat tiles from `getUserStats`:
  pending requests (links to `/admin/requests`) and active user counts per tier.
  Real DB counts via TanStack Query.
- **`OpsDashboard`** (ops+) — static "Team Overview" and "Approvals Queue"
  placeholders (real content arrives with later modules).
- **`BasicDashboard`** (everyone) — the review / holidays / payslip cards
  (currently static placeholder content).

`styles.ts` holds the shared card class strings. `home.tsx` also renders the top
bar (notifications bell, working logout button), a time-based greeting
(`Good Morning/Afternoon/Evening, <name>`), and the access-denied banner.

Logout calls `logout()`, then `router.invalidate()` to clear the cached context,
then navigates to `/login`.

---

## 10. Auth pages

- **`login.tsx`** — controlled email/password form; on submit calls `login` and
  navigates to `/home` or shows the returned error. A "Demo accounts" panel with
  basic/ops/master buttons quick-fills credentials for testing.
- **`signup.tsx`** — TanStack Form with zod field validation (first/last name,
  email, password ≥ 8, confirm-password match). Submits `firstName + lastName`
  joined as `name`. On success it swaps to a "Request submitted" panel
  explaining a master must approve the account. (The original phone/date-of-birth
  fields were removed — the `users` table has no such columns yet.)
- **`forgot-password.tsx`** — **stub.** The form shows a "check your email"
  confirmation but calls no server function and sends nothing. Left for a future
  sub-project (needs email delivery).
- **`BrandPanel.tsx`** — the dark marketing panel shown beside auth forms.
  Note: it still reads "PeopleOS" rather than "QuorqOS" — a leftover to reconcile.

---

## 11. Configuration & environment

**Critical:** the Cloudflare `workerd` runtime that executes server functions
only sees variables provided as **worker env bindings**, not values in
`.env`/`.env.local`. Both secrets must live in `.dev.vars` locally:

```
AUTH_SECRET=<any long random string in dev>
DATABASE_URL=<Neon connection string, unquoted>
```

`.dev.vars` is gitignored; `.dev.vars.example` documents the format. In
production, set both with `wrangler secret put AUTH_SECRET` and
`wrangler secret put DATABASE_URL`. **Restart `pnpm dev` after editing
`.dev.vars`.**

`src/db.ts` exposes **`requireDb()`**, which returns a memoized Neon query client
and — importantly — **throws a descriptive error** if `DATABASE_URL` is absent
from the worker environment, naming `.dev.vars` as the fix. (An earlier version
returned `undefined` silently, which made every server function collapse into a
generic "Something went wrong" with no clue why; that was the root cause of the
"local auth not working" bug.)

Common commands:

```
pnpm dev              # Vite dev server on :3000
pnpm test             # Vitest suite
pnpm exec tsc --noEmit # Typecheck
pnpm lint             # ESLint
pnpm generate-routes  # Regenerate routeTree.gen.ts after adding/removing routes
node scripts/apply-schema.mjs   # (Re)apply db/init.sql to Neon
```

---

## 12. Tests

Vitest, node environment (`vitest.config.ts` aliases `#/` → `src/`). Current
coverage (27 tests):

- **`src/lib/tiers.test.ts`** — `TIER_RANK` ordering, all 9 `hasTier` pairs, and
  `canSetTier` rules (ops can't grant/revoke master, master can do anything).
- **`src/server/password.test.ts`** — hash/verify round-trip, wrong-password
  rejection, distinct salts, the `salt:100000:hash` format, malformed-input
  handling.
- **`src/server/jwt.test.ts`** — sign/verify round-trip, wrong-secret rejection,
  expiry, payload-tamper (tier-escalation) rejection, garbage input.
- **`src/db.test.ts`** — `requireDb` throws a descriptive error when
  `DATABASE_URL` is missing, and returns a client when it's set.

The server functions in `auth.ts`/`admin.ts` are thin DB/cookie glue over these
tested primitives; they're verified by typecheck plus manual smoke testing
(login as each tier, confirm nav/dashboard/route differences and the
signup → approve → promote loop).

---

## 13. Known stubs, limitations, and out-of-scope

- **Stateless-JWT staleness:** a tier change does not update already-issued
  tokens; privileged endpoints mitigate this by re-reading tier from the DB, but
  a user's *own UI* (sidebar/dashboard) reflects a change only after their next
  login or token expiry (≤24h). There is no server-side session revocation.
- **`/` (index.tsx)** is still the default TanStack starter page.
- **`/forgot-password`** is UI-only; no reset email or token flow.
- **`BrandPanel`** branding says "PeopleOS".
- **Module pages** (My Worklife, Salary, Leave, People, etc.) are sidebar
  placeholders; dashboards for basic/ops are static.
- **No master-side "create user" flow** — accounts are created only via public
  signup + approval (plus DB seeds).

These are intentional per the sub-project 1 scope; sub-projects 2–6 build the
modules (Employee core, Leave & attendance, Payroll, Workflows & requests,
Master administration) on top of this foundation.
```
