# RBAC Foundation — Design Spec

**Date:** 2026-07-07
**Status:** Approved
**Sub-project:** 1 of 6 (see Roadmap below)

## Goal

Establish role-based access as the baseline for a fully automated HR portal (QuorqOS). Three hierarchical access tiers — **basic ⊂ ops ⊂ master** — with real DB-backed users, stateless JWT authentication, tier-gated routes, a tier-filtered sidebar, tier-specific dashboards, and master/ops admin screens for signup approval and tier management.

## Roadmap (decomposition)

Each sub-project gets its own spec → plan → implementation cycle. All modules will ultimately be DB-backed.

1. **Foundation: auth + RBAC core** — this spec.
2. **Employee core (basic tier)** — People directory, My Worklife (profile, attendance, shifts, assets).
3. **Leave & attendance ops** — apply leave, balances, holidays, ops approval queues.
4. **Payroll** — payslips, IT statements, YTD reports, loans.
5. **Workflows & requests** — To-do/approvals, Request Hub, Helpdesk, Workflow Delegates, Document Center.
6. **Master administration** — org settings, module configuration, Engage, expanded user management.

## Tier model

Tiers are hierarchical permission levels, not job roles. A higher tier sees everything lower tiers see, plus more.

| Tier | Rank | Meaning |
|---|---|---|
| `basic` | 1 | Employee self-service |
| `ops` | 2 | HR/manager operations |
| `master` | 3 | Full administration |

A pure helper module (`src/lib/tiers.ts`) exports the rank map and `hasTier(userTier, minTier): boolean`. It is the single source of truth, used identically in server functions, route guards, and the sidebar.

## Data model

Added to `db/init.sql` (the existing `todos` table is unrelated demo data and left alone):

```sql
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    tier VARCHAR(10) NOT NULL DEFAULT 'basic'
        CHECK (tier IN ('basic', 'ops', 'master')),
    status VARCHAR(10) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'active', 'rejected')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Seed accounts** (all `active`): `basic@quorq.com` / `basic123` (basic), `ops@quorq.com` / `ops123` (ops), `master@quorq.com` / `master123` (master). These replace the current 4-role demo list on the login page.

`password_hash` format: `salt:iterations:hash` (base64 fields), PBKDF2-SHA256 (100k iterations) via Web Crypto — Cloudflare Workers-native, no dependencies. bcrypt is deliberately avoided (not Workers-compatible).

## Authentication: stateless JWT

- **Token:** HS256 JWT signed with `AUTH_SECRET` (env var: `.dev.vars` locally, `wrangler secret` in production). Payload: `{ sub, email, name, tier, exp }`. Expiry: **24 hours**.
- **Transport:** HttpOnly, Secure, SameSite=Lax cookie. Never exposed to client JS.
- **Only `active` users get tokens.** Login rejects `pending` and `rejected` accounts with distinct messages.
- **Staleness trade-off (accepted):** a tier change does not update already-issued tokens. Mitigations: (a) every privileged server function re-verifies the caller's tier **from the DB**, so stale tokens confer no real privilege; (b) UI reflects a tier change on next login or token expiry (≤24h). Session revocation is not possible server-side; this was an explicit, accepted trade-off in favor of no sessions table and no per-request DB lookup for identity.

## Server functions

TanStack Start server functions, thin and typed. All expected failures return a discriminated union `{ ok: true, data } | { ok: false, error: string }` — no thrown exceptions for expected cases.

`src/server/auth.ts`:
- `signup({ name, email, password })` — creates user with `status='pending'`, `tier='basic'`. Duplicate email → friendly error. No auto-login.
- `login({ email, password })` — verifies credentials; checks status; on success sets JWT cookie and returns user summary.
- `logout()` — clears the cookie.
- `getCurrentUser()` — verifies the JWT cookie; returns `{ id, email, name, tier }` or `null`. Invalid/expired/missing token is `null`, never an error.

`src/server/admin.ts` (every function re-reads the **caller's** row from the DB and checks tier before acting — never trusts the JWT tier for authorization):
- `listUsers()` — ops+. Returns all users with tier and status.
- `approveUser({ userId })` / `rejectUser({ userId })` — **master only**. Moves a `pending` user to `active`/`rejected`.
- `setUserTier({ userId, tier })` — ops+. Ops may assign `basic` or `ops`; only master may grant **or revoke** `master`. Violations return a 403-style `ok: false`.

## Routing & guards

- **`_app` layout `beforeLoad`:** calls `getCurrentUser()`. Null → `redirect({ to: '/login' })`. Otherwise the user is placed in **router context**, so all child routes/components read `{ id, name, email, tier }` without refetching.
- **Auth pages inverse guard:** `/login` and `/signup` redirect authenticated users to `/home`.
- **`requireTier(min)` guard helper:** for tier-gated routes' `beforeLoad`; insufficient rank → redirect to `/home` with an "insufficient access" notice.
- **New routes:**
  - `/_app/admin/requests` — master only. Pending signups with Approve / Reject actions.
  - `/_app/admin/users` — ops+. All users listed with a tier dropdown (constrained per the setUserTier rules above).

## Sidebar & dashboards

- **`NAV` items gain `minTier`** (default `basic`). `SidebarNav` reads the user from router context and renders only items where `hasTier(user.tier, item.minTier)`. The profile block at the bottom shows the real user name and tier badge.
  - **basic:** Home, Engage, My Worklife, To do, Salary, Leave, Document Center, Helpdesk
  - **ops:** + People, Request Hub, Workflow Delegates, Administration (showing only User Management → `/admin/users`)
  - **master:** Administration additionally shows User Requests → `/admin/requests`

  Child items carry their own `minTier`, so the Administration section appears for ops+ and its children filter individually.
- **Single `/home` route** renders stacked tier dashboards (supersets, matching the tier model): `BasicDashboard` (today's cards: review, holidays, payslip) always; `OpsDashboard` panels (team/approvals summary — static placeholders for now) stacked above for ops+; `MasterDashboard` panels (pending-request count and user totals by tier — real DB counts, cheap queries) topmost for master.

## Error handling

- Expected failures (bad credentials, duplicate email, insufficient tier, pending account) → `{ ok: false, error }` rendered inline in forms/screens.
- Bad credentials use a generic "Invalid email or password" (no user enumeration). Pending/rejected statuses give specific messages **after** correct credentials.
- Unexpected errors (DB down, crypto failure) → generic "Something went wrong", logged server-side.
- Missing/invalid JWT is not an error; it means "not logged in" and is handled by redirect.
- Admin server functions enforce tier independently of the UI hiding screens — hiding is UX, the server check is the security boundary.

## Out of scope (future work)

- Forgot-password flow (requires email delivery) — the existing `/forgot-password` page stays a stub.
- Token refresh/sliding sessions; session revocation.
- User profile editing, avatars.
- All module content beyond scaffolded placeholders (sub-projects 2–6).
- Master-side user creation (signup + approval covers account creation for now).

## Testing

Vitest (already configured):
- `tiers.ts`: `hasTier` across all 9 tier-pair combinations.
- Password hashing: hash/verify round-trip; wrong password rejected; distinct salts per hash.
- JWT: sign/verify round-trip; expired token rejected; tampered signature rejected.
- Admin rules with a mocked DB client: ops cannot grant/revoke master; non-admin callers rejected; master can approve/reject pending users.
- Route guards: verified via type-checked `beforeLoad` wiring plus a manual smoke test logging in as each of the three seeded accounts and confirming nav/dashboard/route access differences.
