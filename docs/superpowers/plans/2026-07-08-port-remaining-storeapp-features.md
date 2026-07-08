# Port Remaining storeapp Features — Plan

**Date:** 2026-07-08
**Status:** In progress (autonomous execution authorized)
**Branch:** fablecode

## Goal

Make every placeholder route in the quorq-os sidebar a real, DB-backed screen by
porting the remaining storeapp features, applying the same two translations used
for the People modules: **Drizzle → raw Neon `sql`** and **job-roles →
hierarchical tiers** (`basic ⊂ ops ⊂ master`).

## Translation rules (apply to every ported file)

- `getSql()` → `requireDb()` from `#/db`; keep a local `n = (v) => Number(v ?? 0)`.
- Drizzle queries → raw tagged-template `sql`.
- storeapp `requireRole([...])` in `beforeLoad` → `requireTier(context.user, <tier>)`
  from `#/lib/guards` for ops/master pages; basic pages need no guard (the `_app`
  layout already requires login).
- Mutations return the `Result<T>` contract from `#/server/auth`; privileged
  mutations re-verify tier from the DB via the `getCaller(sql, minTier)` helper
  pattern (as in `admin.ts` / `people.ts`).
- Editorial/benchmark constants → `src/server/constants.ts` (ported from storeapp).
- Routes read the user via `useRouteContext({ from: '/_app' })` /
  `Route.useRouteContext()`; page content wrapped in `p-6` to match existing pages.

## Tier assignment (from the sidebar)

- **basic:** leave, time, expenses, help
- **ops:** hiring, onboarding, payroll, overview, workforce, talent, attendance,
  attrition, reports, import-export, alerts, settings
- **master:** monitoring

## Phase A — Schema (`db/init.sql`, idempotent)

Add tables: `attendance_records`, `leave_requests`, `exits`, `job_openings`,
`applications`, `compliance_items`, `statutory_reports`, `scheduled_reports`,
`time_entries`, `expenses`, `payroll_runs`, `payslips`, `onboardings`,
`onboarding_notes`, `onboarding_tasks`, `prebuilt_reports`. Columns mirror
storeapp's `schema.ts`.

## Phase B — Shared

- `src/server/constants.ts` — port `C` and `AI_INSIGHTS`.
- `src/components/charts.tsx` — add `LineChart`, `BarChart`, `ProgressRow`,
  `Heatmap` (Donut/HBars already ported).
- Reuse `src/lib/guards.ts` `requireTier`.

## Phase C — Seed (`scripts/seed-people.mjs`)

Extend the deterministic seeder to populate the new transactional tables from the
existing 142 employees: attendance for the last ~30 working days, leave requests
(incl. pending/escalated), expenses, time entries (today + history), exits
(~12 for an ~8.4% attrition read), job openings + applications (funnel), one
processed payroll run + payslips, onboardings with notes/tasks, and the static
reference rows (compliance_items, statutory/scheduled/prebuilt reports). Reset
order respects FKs.

## Phase D — Analytics suite (server `metrics.ts` + 6 routes)

Port `getExecutive`, `getAttendance`, `getAttrition`, `getTalent`,
`getWorkforce`, `getReports`, `exportCsv`. Routes: `overview`, `attendance`,
`attrition`, `talent`, `workforce`, `reports` (all ops).

## Phase E — Workplace (basic)

- `leave` — server `leave.ts` (balances, apply, list; ops approval queue).
- `expenses` — server `expenses.ts` (submit, list, ops approval).
- `time` — server `time.ts` (clock in/out, history).

## Phase F — Payroll (ops)

- `payroll.ts` — runs + payslip roll-up. Route `payroll`.

## Phase G — Hiring & Onboarding (ops)

- `hiring.ts` — openings + application pipeline. Route `hiring`.
- `onboarding.ts` — onboarding list, tasks/notes checklist. Route `onboarding`.

## Phase H — Remaining

- `import-export` (ops) — CSV export (via `exportCsv`) + import summary.
- `alerts` (ops), `settings` (ops), `monitoring` (master, DB health), `help`
  (static).

## Testing / verification per phase

`pnpm test` + `pnpm lint` stay green; `apply-schema` + `seed:people` run clean;
new pure helpers (metric shaping, validators) get unit tests where they exist as
pure functions. Live SQL smoke-checked after seeding.

## Execution order

A → B → C → D → (E, F, G, H). Commit after each coherent phase.
