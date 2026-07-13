# Payroll, Hiring & Onboarding revamp — design

**Date:** 2026-07-13
**Status:** Approved design, pending implementation plan
**Scope:** `src/routes/_app/{payroll,hiring,onboarding}.tsx`, their server functions, two new
DB tables, shared UI primitives, seed extension.

## 1. Goal

Revamp the Payroll, Hiring (Applications), and Onboarding pages with an elevated-but-coherent
visual language, and add the ability to **check and edit an individual employee's payroll** —
their salary breakdown (components) and one-off pay adjustments. Hiring and onboarding get both a
visual refresh and targeted new functionality.

### Decisions locked in (from brainstorming)

1. **Salary breakdowns are stored components**, not derived on the fly. Two new tables.
2. **Individual payroll lives as a roster drill-down on the Payroll page** — no new route.
3. **Visual direction is "elevated, still coherent"** with the existing slate/blue kit.
4. **Hiring and onboarding get visual + functional changes.**
5. **Editing components writes back `employees.net_pay` and `ctc`** so org-wide totals stay
   consistent (confirmed).

## 2. Visual direction — "the payslip as a statement"

One subject-true idea carries the elevation: payroll is a financial statement, so it should read
like one. This is the signature and it stays coherent with the current `Card`/`KpiCard` kit.

- **Palette (extends, does not replace):** keep slate neutrals + `blue-600` as primary. Add a
  semantic money triad used *only on figures* — emerald `#059669` for earnings/credits, rose
  `#e11d48` for deductions, slate-900 "ink" for settled net totals; amber stays for pending.
- **Typography (the signature):** UI text stays system-sans for coherence. Every **monetary
  figure switches to a tabular monospaced face** (JetBrains Mono, `font-variant-numeric:
  tabular-nums`) so rupee columns align digit-for-digit like a pay stub. Loaded app-wide via a
  single `<link>` in `src/routes/__root.tsx`; applied selectively through a `<Money>` component so
  only figures change, not body copy.
- **Structural device:** a thin ruled **"ledger line"** eyebrow (hairline rule + small uppercase
  mono label) marks sections, echoing a payslip's ruled rows. No 01/02 numbering — payroll is not
  a sequence.
- **Hero / the one risk:** a **gross → net waterfall** on each employee's stub — earnings stack up
  in emerald, deductions step down in rose, net lands in ink. Payroll owns the boldness; hiring
  and onboarding get quieter treatments so the payroll stub stays the star.

This is deliberately none of the three current AI-default looks (cream+serif+terracotta /
near-black+acid / broadsheet hairlines). It is a fintech-statement direction grounded in the
subject and coherent with the rest of QuorqOS.

## 3. Data model

Two new tables in `db/init.sql`, idempotent (`CREATE TABLE IF NOT EXISTS`), no destructive
changes. Mind gotcha #2 (no `;` inside comments, no `DO $$` blocks).

### `salary_components` — per-employee monthly salary structure

```
id          SERIAL PRIMARY KEY
employee_id INTEGER NOT NULL REFERENCES employees(id)
kind        VARCHAR(12) NOT NULL   -- 'earning' | 'deduction'
code        VARCHAR(24) NOT NULL   -- 'basic' | 'hra' | 'special' | 'pf' | 'pt' | 'tds'
label       VARCHAR(64) NOT NULL
amount      NUMERIC(12,2) NOT NULL DEFAULT 0   -- monthly
sort_order  INTEGER NOT NULL DEFAULT 0
```

### `pay_adjustments` — one-off items applied to a period's payslip

```
id          SERIAL PRIMARY KEY
employee_id INTEGER NOT NULL REFERENCES employees(id)
period      VARCHAR(7)             -- 'YYYY-MM', nullable = applies to next run
kind        VARCHAR(16) NOT NULL   -- 'bonus' | 'deduction' | 'reimbursement' | 'lop'
label       VARCHAR(64) NOT NULL
amount      NUMERIC(12,2) NOT NULL -- always stored positive; sign implied by kind
note        VARCHAR(300)
created_by  VARCHAR(120)
created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
```

### Reconciliation math (the core invariant)

`net_pay` is monthly in-hand; `ctc` is annual. Existing `runPayroll` already treats monthly gross
as `ctc / 12`, so components decompose that same basis — nothing else in the app shifts.

For an employee with annual `ctc` and monthly `net_pay`:

- Monthly gross `G = round(ctc / 12)`.
- **Earnings** (sum to `G` exactly; the remainder line absorbs rounding):
  - Basic = `round(0.50 * G)`
  - HRA = `round(0.20 * G)`
  - Special Allowance = `G − Basic − HRA`
- Total deductions `D = G − net_pay`.
- **Deductions** (sum to `D` exactly; TDS absorbs rounding):
  - Provident Fund = `round(0.12 * Basic)`
  - Professional Tax = `min(200, D)` (flat)
  - TDS = `D − PF − PT`
- Invariant: `sum(earnings) = G` and `sum(earnings) − sum(deductions) = net_pay`.

Clamp rule for robustness (matters outside the seed range, not within it): the deduction
remainder (TDS) is clamped at `0`; if `PF + PT` alone exceeds `D`, PF is reduced so the deduction
total never exceeds `D`. Within the seeded salary band (net 26k–130k → `ctc = net × 13.5`) all
lines stay positive, so the seed produces clean structures.

### Editing write-back

When ops+ edits an employee's components, the server recomputes `G' = sum(earnings)`,
`D' = sum(deductions)`, `net' = G' − D'`, then writes back `employees.net_pay = net'` and
`employees.ctc = round(G' * 12)`. This keeps org-wide `sum(net_pay)` (payroll KPIs, dashboards)
consistent. Adjustments never change base `net_pay`; they only affect the payslip for their period
during a run.

### Seeding

Extend `scripts/seed-people.mjs` to generate reconciling `salary_components` for every seeded
employee via the math above (deterministic, reuses the existing PRNG). Also seed a handful of
`pay_adjustments` (e.g. an occasional bonus) so the UI has sample data. Insert with the existing
`bulk()` helper. No `pay_adjustments` are required for correctness — they are demo texture.

## 4. Server functions

### `src/server/payroll.ts`

- `getPayroll` (extend): also return a **roster** — active employees with `id, name, department,
  emp_code, net_pay` for the searchable table. Existing KPI/run/history fields stay.
- `getEmployeePayroll({ employeeId })` (new): returns the employee header, `salary_components`
  split into earnings/deductions, computed gross/deductions/net, current + recent
  `pay_adjustments`, and payslip history from `payslips`. ops+ only.
- `updateSalaryComponents({ employeeId, components })` (new): validate each line, recompute totals,
  write back `net_pay`/`ctc`, replace the component rows. `Result<{ net: number }>`, ops+.
- `addAdjustment({ employeeId, period, kind, label, amount, note })` (new): `Result<null>`, ops+.
- `deleteAdjustment({ id })` (new): `Result<null>`, ops+.
- `runPayroll` (upgrade): compute each payslip from stored components (`gross = sum(earnings)`,
  `deductions = sum(deductions)`) plus that period's adjustments (bonus/reimbursement add,
  deduction/lop subtract), keeping the existing approved-expenses roll-in. Payslip storage columns
  are unchanged (aggregates). An `lop` adjustment also populates `payslips.lop_days`.

All new fns gate on `canApprove(getSessionUser())` and return the uniform `Result<T>`.

### `src/server/hiring.ts`

- `getHiring` (extend): add funnel conversion counts and per-candidate detail fields (`source`,
  `applied_date`, `job role`) to the columns payload.
- `declineApplication({ id, reason })` (new): sets `stage='declined'` and `decline_reason` (both
  already exist in the schema and seed data; `getHiring` already filters the board to the five
  pipeline stages, so a declined candidate drops off automatically). `Result<null>`, ops+.
- `moveApplication` unchanged.

### `src/server/onboarding.ts`

- `updateOnboarding({ id, department, startDate })` (new): edit a journey. ops+.
- `addOnboardingTask({ onboardingId, task, category })` (new): append a custom checklist item with
  the next `sort_order`; recompute progress. ops+.
- `deleteOnboardingTask({ taskId })` (new): remove a task; recompute progress/status. ops+.
- Existing create/toggle/notes fns unchanged.

## 5. Pure logic + tests

`src/lib/payroll.ts` (new) with `src/lib/payroll.test.ts`:

- `buildStructure({ ctc, netPay })` → `{ earnings[], deductions[], gross, totalDeductions, net }`
  implementing the reconciliation math + clamp rule.
- `summarize(components)` → totals from an arbitrary edited component set.
- `waterfallSegments(gross, deductions[], net)` → segments for the hero SVG.
- `applyAdjustments(baseNet, adjustments[])` → net after signed adjustments.

Tests assert the invariant (`sum(earnings) = gross`, `net = netPay`) across the seed salary band,
the rounding-remainder behavior, and the low-deduction clamp.

## 6. Pages

### Payroll (`payroll.tsx`) — rewrite

Refined KPI strip → restyled run-payroll control → two-pane **roster + detail drawer** → runs
history. Roster is a searchable table (client-side filter over the loader's roster). Selecting a
row opens the detail panel: gross→net waterfall hero, earnings and deductions as editable ledger
rows, the period's adjustments ledger with add/remove, the net-pay total line, and payslip
history. Editing calls `updateSalaryComponents`; adjustments call `addAdjustment` /
`deleteAdjustment`; each mutation is followed by `router.invalidate()`.

```
[ KPI strip: Monthly payroll · On payroll · Pending reimb. · Last run ]
[ Run payroll  month ▾  ( ▶ Run ) ]
┌ Roster (search) ─────────┬ Detail: <employee> ───────────────────┐
│ ● Name  Dept  Net ₹      │ EARNINGS   Basic/HRA/Special  [water-  │
│ ○ …                      │ DEDUCTIONS PF/PT/TDS (editable) fall]  │
│                          │ ADJUSTMENTS (period)  + Add            │
│                          │ ═ NET PAY ═   ·   Payslip history      │
└──────────────────────────┴───────────────────────────────────────┘
```

### Hiring (`hiring.tsx`) — rewrite

KPI strip + a slim **conversion funnel** header (applied→joined via existing `HBars`) + restyled
kanban. New: **candidate detail drawer** (click a card → source, role, applied date, stage) and a
**Decline** action with reason. Advancing keeps the existing `moveApplication`.

### Onboarding (`onboarding.tsx`) — rewrite

KPI strip + restyled hire list using a **progress ring** instead of the flat bar, category-grouped
checklist. New: **edit department / start date** on a journey (`updateOnboarding`), **add/remove
custom checklist tasks** (`addOnboardingTask` / `deleteOnboardingTask`), and surfacing the
auto-created employee link once a journey reaches 100%.

## 7. Shared UI primitives

Added to `src/components/ui.tsx`:

- `<Money value tone? />` — tabular-mono rupee figure, tone by kind/sign (emerald/rose/ink).
- `<LedgerLine label />` — hairline-ruled uppercase-mono section eyebrow.
- A small progress-ring for onboarding (or extend `charts.tsx`).

The gross→net waterfall is an inline SVG (following `charts.tsx` conventions) — added there or as
a local payroll component.

## 8. Verification

- `./node_modules/.bin/vitest run` — `payroll.test.ts` and existing suites pass.
- `./node_modules/.bin/eslint` — clean (mind gotcha #3: cast rows to `... | undefined`).
- `./node_modules/.bin/tsc --noEmit` — only the 2 known `/settings` errors remain.
- `node scripts/apply-schema.mjs` then `node scripts/seed-people.mjs`, then a short read-only
  `.mjs` smoke check in the repo root confirming components reconcile to `net_pay` for a sample of
  employees; delete the script after.
- Drive the app (`pnpm dev`): edit a component and confirm net updates and persists; add/remove an
  adjustment; run payroll for a period and confirm the run reflects components + adjustments;
  decline a candidate; add an onboarding task.

## 9. Out of scope / guardrails

- No new routes; payroll editing is the roster drill-down.
- No auth/tier changes; all new mutations are ops+ via `canApprove`.
- Raw `sql` only (no Drizzle).
- The 2 known `/settings` tsc errors stay.
- No restyling of other pages this pass — the `<Money>` / `<LedgerLine>` primitives are reusable
  if the direction later rolls out app-wide.
