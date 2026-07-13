# People: Directory, Engagement & Org Structure — Design Spec

**Date:** 2026-07-08
**Status:** Approved
**Sub-project:** part of 2 & 6 (see Roadmap note below)

## Goal

Build the three "People" modules of QuorqOS — **Employee Directory**, **Engagement**, and **Org Structure** — as real, DB-backed screens. The storeapp HR portal (`D:\Project\hr-portalproduct\tanstack-started\storeapp`) is the reference implementation; this spec ports its three features into quorq-os while translating the two foundational differences described below.

The three routes (`/directory`, `/engagement`, `/org`) already exist as placeholders and are already wired into the sidebar under a **People** group at basic tier. This work replaces the placeholders with working screens.

## Roadmap note (scope)

The roadmap (`memory/quorq-hr-portal-roadmap.md`) slots the People directory into sub-project 2 and Engage into sub-project 6. This spec pulls the whole People sidebar group — Directory, Engagement, and Org Structure — forward together, because they share one data model (employees + reporting lines) and are cheaper to build as a unit. Later sub-projects (leave, payroll, attrition) will reuse the `employees` table this spec creates.

## Two translations from the reference

storeapp and quorq-os differ in exactly two ways that every ported line must account for:

1. **Data access.** storeapp uses Drizzle ORM; quorq-os uses raw Neon `sql` tagged-template queries via `requireDb()` from `src/db.ts`. All ported server code uses raw `sql`. No Drizzle, no `src/db/schema.ts`.
2. **Authorization model.** storeapp uses job roles (`employee | manager | hr | admin`); quorq-os uses hierarchical tiers (`basic ⊂ ops ⊂ master`) from `src/lib/tiers.ts`. storeapp's "HR/Admin can edit" maps to **ops+** (`hasTier(tier, 'ops')`). Changing a user's tier reuses the existing `canSetTier(callerTier, targetTier, newTier)` rules (only a master may grant or revoke master).

## Data model

Appended to `db/init.sql` as idempotent `CREATE TABLE IF NOT EXISTS` statements (the file is applied by `scripts/apply-schema.mjs`, which splits on `;`, so no semicolons may appear inside literals). Column sets mirror storeapp's schema in full — even columns the three screens don't yet read — so later sub-projects (payroll, attrition, leave) port in without a migration.

```sql
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    department VARCHAR(64) NOT NULL,
    designation VARCHAR(120) NOT NULL,
    employment_type VARCHAR(24) NOT NULL DEFAULT 'full-time',
    location VARCHAR(64) NOT NULL DEFAULT 'Hyderabad',
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    gender VARCHAR(16) NOT NULL DEFAULT 'male',
    date_of_joining DATE NOT NULL,
    ctc NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
    performance_rating NUMERIC(3,1) NOT NULL DEFAULT 3.0,
    is_top_performer BOOLEAN NOT NULL DEFAULT FALSE,
    last_appraisal_date DATE,
    flight_risk VARCHAR(16) NOT NULL DEFAULT 'none',
    appraisal_overdue BOOLEAN NOT NULL DEFAULT FALSE,
    policy_unsigned BOOLEAN NOT NULL DEFAULT FALSE,
    kyc_missing BOOLEAN NOT NULL DEFAULT FALSE,
    leave_balance NUMERIC(4,1) NOT NULL DEFAULT 15,
    manager_id INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recognitions (
    id SERIAL PRIMARY KEY,
    from_name VARCHAR(120) NOT NULL,
    to_employee_id INTEGER REFERENCES employees(id),
    to_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    value VARCHAR(24) NOT NULL DEFAULT 'teamwork',
    message VARCHAR(400) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(160) NOT NULL,
    body VARCHAR(600) NOT NULL,
    category VARCHAR(24) NOT NULL DEFAULT 'general',
    author VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS survey_responses (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER REFERENCES employees(id),
    department VARCHAR(64) NOT NULL,
    score INTEGER NOT NULL,
    comment VARCHAR(400),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

The existing `users` table gains a nullable link to an employee row:

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES employees(id);
```

`manager_id` is intentionally **not** a self-referencing FK constraint in DDL — it is populated by the seed after all rows exist, and keeping it a plain column avoids ordering constraints during seeding.

### `employees` ↔ `users` relationship

`employees` is the HR record (department, designation, reporting line, status). `users` remains the auth/login record keyed by tier. They are linked one-to-one and optionally via `users.employee_id`. A `users` row is the person who logs in and acts (e.g. the sender of recognition, identified by `user.name`); the `employees` rows are the population the directory and org tree describe. Not every employee has a login, and the three demo logins are linked to three seeded employees so their profile and org context render.

## Seeding

storeapp seeds with faker + Drizzle scripts. quorq-os has no faker dependency and applies schema via a plain script, so seeding is a new **deterministic generator**: `scripts/seed-people.mjs`, exposed as `pnpm seed:people` in `package.json`. It connects with the same `.env.local` `DATABASE_URL` parsing that `apply-schema.mjs` uses.

Requirements:

- **Deterministic** — a fixed PRNG seed and curated first/last-name pools, so repeated runs produce identical data and reviews are reproducible. No faker.
- **Idempotent** — deletes from `survey_responses`, `recognitions`, `announcements`, then `employees` (respecting FK order) before inserting, so re-running refreshes cleanly. Also nulls `users.employee_id` before re-linking.
- **~142 employees** across 7 departments using storeapp's department counts and `designationsByDept` map: Engineering 48, Sales 28, Operations 22, Product 14, Marketing 12, Finance 10, HR 8.
- **A real reporting tree** so Org Structure has depth: each department has exactly one head with `manager_id = NULL`; a handful of managers report to the head; individual contributors report to a manager. `getOrg` treats `manager_id IS NULL` rows as department heads, so this shape is required.
- **Engagement data** — a batch of `recognitions` (varied `value` and `message`, recent `created_at`), a few `announcements` across categories (`policy`/`event`/`general`), and `survey_responses` with 0–10 scores producing a believable eNPS.
- **Demo-account links** — after employees exist, sets `users.employee_id` for `basic@quorq.com`, `ops@quorq.com`, `master@quorq.com` to three seeded employees.

Seeding is a separate step from `apply-schema` (schema DDL is idempotent and safe; seed is destructive-then-insert), matching the existing operational split. The roadmap note in memory (`node scripts/apply-schema.mjs`) is extended with `pnpm seed:people`.

## Shared UI kit

storeapp's screens depend on a small component set that quorq-os doesn't have yet. Porting it once makes sub-projects 3–6 cheaper. Two new files, matching quorq-os's existing Tailwind idioms (`src/components/dashboards/styles.ts`):

- `src/components/ui.tsx` — `Card`, `CardHeader`, `KpiCard`, `Badge`, `Avatar`, `inr` (ported near-verbatim from storeapp `src/components/ui.tsx`; these are presentational and framework-agnostic).
- `src/components/charts.tsx` — `Donut` and `HBars`, the two chart primitives the Engagement screen uses (ported from storeapp `src/components/charts.tsx`; the other chart types there are not needed yet and are omitted per YAGNI).

## Server functions

Two new files using raw `sql` and the `Result<T>` contract from `src/server/auth.ts` for mutations. Authorization re-reads tier from the DB (never trusts the token), reusing the pattern already in `src/server/admin.ts`.

A shared helper mirrors `admin.ts`'s `getCaller`:

```ts
async function getCaller(
  sql,
  minTier: Tier,
): Promise<{ id: number; tier: Tier } | null>
```

It verifies the session cookie, loads the user, and returns `null` unless the user is `active` and `hasTier(row.tier, minTier)`.

### `src/server/people.ts`

- `listEmployeesPaginated({ page, limit })` — offset pagination over non-exited employees, ordered by name; returns `{ data, pagination: { total, totalPages, page, limit } }`. A small pagination helper (page/limit → offset, total → totalPages) is written locally (quorq-os has no `src/lib/pagination`).
- `listEmployees()` — full non-exited list for the recognition recipient picker.
- `getEmployee(id)` — the employee row, their manager (or null), direct reports, up to 5 recent kudos, plus org/access context: `canManage` (caller is ops+), `managerOptions` (all other non-exited employees), and `linkedUserTier` (tier of the `users` row linked to this employee, or null). Reads the caller via `getCaller(sql, 'basic')`.
- `updateEmployeeOrg({ employeeId, managerId, tier })` — **ops+ only**. Reassigns the reporting line and sets the linked user's tier. Guards, returning `Result` errors:
  - caller is not ops+ → forbidden;
  - `managerId === employeeId` → an employee cannot report to themselves;
  - the proposed manager already reports to this employee → would create a reporting loop (the simple one-level cycle guard storeapp uses);
  - tier change obeys `canSetTier(caller.tier, targetCurrentTier, newTier)` (a non-master cannot grant/revoke master), and a caller cannot change **their own** tier (mirrors `setUserTier` in `admin.ts`);
  - if no `users` row is linked to the employee, the reporting line is still saved and the response explains the tier was not changed.
- `getEngagement()` — eNPS breakdown (promoters/passives/detractors from `survey_responses`), recognitions-this-month count, top values, recent recognition feed, and announcements.
- `createRecognition({ fromName, toEmployeeId, value, message })` — inserts a recognition after resolving the recipient's name/department. Zod-validated. Returns `Result`.

### `src/server/org.ts`

- `getOrg()` — builds the department tree and span-of-control stats (departments, people-managers, average span, individual contributors). The pure transformation from flat rows to the department/manager tree is extracted into an exported helper `buildOrg(rows)` so it is unit-testable without a database.

## Routes

Placeholders at `src/routes/_app/{directory,engagement,org}.tsx` are replaced. All three remain **basic tier** — any authenticated user (already enforced by the `_app` layout's `beforeLoad`) may view them; no extra tier guard on the route. Editing is gated inside `updateEmployeeOrg`. The logged-in user is read via quorq-os's `useRouteContext({ from: '/_app' })` (not storeapp's `Route.useRouteContext()`).

To host both the directory list and the per-employee profile without the layout/index ambiguity of a flat `directory.tsx` + `directory.$id.tsx` pair, the flat `directory.tsx` placeholder is **deleted** and replaced with a `directory/` folder (mirroring storeapp exactly):

- `src/routes/_app/directory/index.tsx` (route `/directory`) → directory index: search box, department filter chips, paginated card grid. `staticData.title = 'Employee directory'`.
- `src/routes/_app/directory/$id.tsx` (route `/directory/$id`) → employee profile: identity card, details, direct reports, recognition received, and — when `canManage` — the **Org & access** editor (reporting line + tier). `staticData.title = 'Employee profile'`.
- `src/routes/_app/engagement.tsx` → eNPS KPI cards, give-recognition form, recognition wall, eNPS donut, top-values bars, announcements. On submit, calls `createRecognition` with `user.name` as `fromName`, then invalidates.
- `src/routes/_app/org.tsx` → KPI stats row + per-department cards showing head → managers with report counts. Person boxes link to `/directory/$id`.

The sidebar already links to `/directory`, which resolves to the folder's `index.tsx`, so no `AppSidebar.tsx` change is needed. After restructuring the routes, run `pnpm generate-routes` (`tsr generate`) to refresh `src/routeTree.gen.ts`.

## Testing

Following the existing suite's pattern (`src/lib/tiers.test.ts`, `src/server/jwt.test.ts` are pure-unit; DB-hitting server functions are not unit-tested), tests cover the extracted **pure** logic:

- `buildOrg(rows)` — heads detected by null `manager_id`; managers are directs with their own reports; span/stats math; empty and single-department inputs.
- The pagination helper — offset and totalPages math at boundaries (page 1, last page, empty set).
- The `updateEmployeeOrg` guard predicates (self-manager, one-level cycle, self-tier-change, `canSetTier` interaction), extracted as pure functions if that keeps them testable without a DB.

`pnpm test`, `pnpm lint`, and `pnpm generate-routes` must all pass before the work is considered done.

## Out of scope

- Creating/deleting employees, editing employee HR fields (name, department, designation) — directory is read-only apart from reporting line + tier.
- Editing or deleting recognitions and announcements; survey submission UI (eNPS is seed-only for now).
- A graphical/canvas org chart — Org Structure is the department-card tree storeapp uses, not a drawn node graph.
- Any consumer of the new `employees` columns beyond the three screens (payroll, attrition, etc. are later sub-projects).
