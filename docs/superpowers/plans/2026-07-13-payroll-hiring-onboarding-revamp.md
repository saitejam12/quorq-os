# Payroll, Hiring & Onboarding Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revamp the Payroll, Hiring, and Onboarding pages with an elevated "payslip-as-statement" visual language and add the ability to check and edit an individual employee's salary breakdown and one-off pay adjustments.

**Architecture:** Two new DB tables (`salary_components`, `pay_adjustments`) store a reconciling monthly salary structure and adjustments ledger. A pure `src/lib/payroll.ts` module owns the reconciliation math (unit-tested). New ops+-gated server functions read/write structures and adjustments; `runPayroll` is upgraded to compute payslips from stored components. The Payroll page gains a searchable roster + a drill-down detail drawer (gross→net waterfall, editable ledger rows, adjustments). Hiring and onboarding get restyled plus targeted new actions.

**Tech Stack:** TanStack Start (React 19) on Cloudflare Workers, Neon serverless Postgres (raw tagged-template `sql`), Zod validators, Vitest, Tailwind v4, lucide-react.

## Global Constraints

- **Raw SQL only** via `requireDb()` from `#/db` — no Drizzle.
- **Mutations return `Result<T>`** (`{ ok: true; data: T } | { ok: false; error: string }` from `#/server/auth`). Expected failures return `ok: false`; only unexpected errors are caught + `console.error`'d.
- **Authz:** privileged server fns call `getSessionUser()` (`#/server/session`) and gate on `canApprove(me)` (ops+). Never trust the token tier.
- **neon returns `DATE` columns as JS `Date`.** For any date you build a `YYYY-MM-DD` string from or string-compare, cast in SQL: `col::text`. Returning a raw Date to the client is fine.
- **`apply-schema.mjs` splits `init.sql` on `;`.** No `;` inside SQL comments, no `DO $$…$$` blocks. Verify before applying: `grep -nE '^\s*--.*;' db/init.sql`.
- **Lint `no-unnecessary-condition`:** `noUncheckedIndexedAccess` is OFF, so `rows[0]` / `Record[key]` are typed non-nullable. Cast query rows to `... | undefined` before `?.`/`??` guards.
- **Never edit `src/routeTree.gen.ts` by hand.** This plan adds **no new routes**, so no `tsr generate` is required.
- **Known baseline:** `tsc --noEmit` reports exactly 2 pre-existing `/settings` errors — leave them; any *other* error is yours.
- Timestamps are `timestamptz` (UTC); UI renders local via `new Date(iso).toLocaleString()`.
- Match surrounding code: comment density, naming, the `ui.tsx`/`charts.tsx` kit.
- Demo accounts: `basic@quorq.com` / `ops@quorq.com` / `master@quorq.com`, password `<tier>123`.

**Commands (run through the Bash/git-bash tool — `pnpm`/`node` are not on the PowerShell PATH):**
```bash
pnpm dev                          # Vite dev server on :3000
./node_modules/.bin/vitest run    # tests
./node_modules/.bin/tsc --noEmit  # typecheck
./node_modules/.bin/eslint        # lint
node scripts/apply-schema.mjs     # apply db/init.sql to Neon (reads .env.local)
node scripts/seed-people.mjs      # reseed
```

**Source of truth for the design:** `docs/superpowers/specs/2026-07-13-payroll-hiring-onboarding-revamp-design.md`.

---

## File Structure

- `db/init.sql` — **modify**: add `salary_components` + `pay_adjustments` tables (after `payslips`).
- `src/lib/payroll.ts` — **create**: reconciliation math (`buildStructure`, `summarize`, `applyAdjustments`, `adjustmentSign`, `waterfallSegments`) + types.
- `src/lib/payroll.test.ts` — **create**: unit tests for the above.
- `scripts/seed-people.mjs` — **modify**: seed reconciling components + sample adjustments; align historical payslip gross to `ctc/12`.
- `src/styles.css` — **modify**: load JetBrains Mono, add `.tabular` utility.
- `src/components/ui.tsx` — **modify**: add `<Money>`, `<LedgerLine>`, `<Ring>`.
- `src/components/charts.tsx` — **modify**: add `<PayWaterfall>`.
- `src/server/payroll.ts` — **modify**: extend `getPayroll` (roster), add `getEmployeePayroll`, `updateSalaryComponents`, `addAdjustment`, `deleteAdjustment`; upgrade `runPayroll`.
- `src/routes/_app/payroll.tsx` — **rewrite**: KPI strip + run control + roster + detail drawer + runs history.
- `src/server/hiring.ts` — **modify**: extend `getHiring` (funnel + candidate detail), add `declineApplication`.
- `src/routes/_app/hiring.tsx` — **rewrite**: funnel header + restyled kanban + candidate drawer + decline.
- `src/server/onboarding.ts` — **modify**: add `updateOnboarding`, `addOnboardingTask`, `deleteOnboardingTask`.
- `src/routes/_app/onboarding.tsx` — **rewrite**: progress ring + editable/reassignable journeys + custom tasks.

---

## Task 1: Database schema — salary_components + pay_adjustments

**Files:**
- Modify: `db/init.sql` (insert after the `payslips` table block, ~line 321)

**Interfaces:**
- Produces: tables `salary_components(id, employee_id, kind, code, label, amount, sort_order)` and `pay_adjustments(id, employee_id, period, kind, label, amount, note, created_by, created_at)`.

- [ ] **Step 1: Add the two tables to `db/init.sql`**

Insert immediately after the `payslips` table definition (after its closing `);`):

```sql
-- Per-employee monthly salary structure. Amounts are monthly. Invariant:
-- sum(earning) equals ctc/12 and sum(earning) minus sum(deduction) equals net_pay.
CREATE TABLE IF NOT EXISTS salary_components (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    kind VARCHAR(12) NOT NULL DEFAULT 'earning',
    code VARCHAR(24) NOT NULL,
    label VARCHAR(64) NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
);

-- One-off pay adjustments applied to a period's payslip. amount is stored
-- positive, the sign is implied by kind (bonus and reimbursement add, deduction
-- and lop subtract). A null period means the adjustment applies to the next run.
CREATE TABLE IF NOT EXISTS pay_adjustments (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    period VARCHAR(7),
    kind VARCHAR(16) NOT NULL DEFAULT 'bonus',
    label VARCHAR(64) NOT NULL,
    amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    note VARCHAR(300),
    created_by VARCHAR(120),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Verify no semicolons hide in comments**

Run: `grep -nE '^\s*--.*;' db/init.sql`
Expected: no output (empty). If any line prints, reword that comment to drop the `;`.

- [ ] **Step 3: Apply the schema**

Run: `node scripts/apply-schema.mjs`
Expected: completes without error (no `42601` syntax errors).

- [ ] **Step 4: Verify the tables exist**

Create `verify-schema.mjs` in the repo root:

```js
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
const url = readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const sql = neon(url)
const t = await sql`select table_name from information_schema.tables where table_name in ('salary_components','pay_adjustments') order by table_name`
console.log(t.map((r) => r.table_name))
```

Run: `node verify-schema.mjs`
Expected: `[ 'pay_adjustments', 'salary_components' ]`
Then delete it: `rm verify-schema.mjs`

- [ ] **Step 5: Commit**

```bash
git add db/init.sql
git commit -m "feat(payroll): add salary_components and pay_adjustments tables"
```

---

## Task 2: Salary reconciliation library (TDD)

**Files:**
- Create: `src/lib/payroll.ts`
- Test: `src/lib/payroll.test.ts`

**Interfaces:**
- Produces:
  - `type ComponentKind = 'earning' | 'deduction'`
  - `type SalaryComponent = { code: string; label: string; kind: ComponentKind; amount: number; sortOrder: number }`
  - `type SalaryStructure = { earnings: SalaryComponent[]; deductions: SalaryComponent[]; gross: number; totalDeductions: number; net: number }`
  - `type AdjustmentKind = 'bonus' | 'deduction' | 'reimbursement' | 'lop'`
  - `buildStructure({ ctc, netPay }: { ctc: number; netPay: number }): SalaryStructure`
  - `summarize(components: SalaryComponent[]): { gross: number; totalDeductions: number; net: number }`
  - `adjustmentSign(kind: AdjustmentKind): 1 | -1`
  - `applyAdjustments(baseNet: number, adjustments: Array<{ kind: AdjustmentKind; amount: number }>): number`
  - `type WaterfallSegment = { label: string; kind: 'earning' | 'deduction' | 'net'; amount: number; start: number; end: number }`
  - `waterfallSegments(earnings: SalaryComponent[], deductions: SalaryComponent[]): WaterfallSegment[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/payroll.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  buildStructure,
  summarize,
  applyAdjustments,
  waterfallSegments,
} from './payroll'

describe('buildStructure', () => {
  it('reconciles across the seed salary band: earnings sum to gross, net equals netPay', () => {
    for (let netPay = 26000; netPay <= 130000; netPay += 2500) {
      const ctc = netPay * 13.5
      const s = buildStructure({ ctc, netPay })
      const earnSum = s.earnings.reduce((a, c) => a + c.amount, 0)
      const dedSum = s.deductions.reduce((a, c) => a + c.amount, 0)
      expect(earnSum).toBe(s.gross)
      expect(dedSum).toBe(s.totalDeductions)
      expect(s.net).toBe(netPay)
      expect(s.deductions.every((d) => d.amount >= 0)).toBe(true)
    }
  })

  it('lets special allowance and TDS absorb rounding remainders', () => {
    const s = buildStructure({ ctc: 100000, netPay: 6500 }) // gross = round(8333.33) = 8333
    expect(s.gross).toBe(8333)
    expect(s.earnings.reduce((a, c) => a + c.amount, 0)).toBe(8333)
    expect(s.deductions.reduce((a, c) => a + c.amount, 0)).toBe(8333 - 6500)
    expect(s.net).toBe(6500)
  })

  it('clamps deductions so they never exceed gross minus netPay', () => {
    const s = buildStructure({ ctc: 24000, netPay: 1900 }) // gross 2000, deductions 100 < PF
    expect(s.deductions.reduce((a, c) => a + c.amount, 0)).toBe(100)
    expect(s.net).toBe(1900)
    expect(s.deductions.every((d) => d.amount >= 0)).toBe(true)
  })
})

describe('summarize', () => {
  it('totals an arbitrary edited component set', () => {
    const comps = [
      { code: 'basic', label: 'Basic', kind: 'earning' as const, amount: 5000, sortOrder: 0 },
      { code: 'pf', label: 'PF', kind: 'deduction' as const, amount: 600, sortOrder: 0 },
    ]
    expect(summarize(comps)).toEqual({ gross: 5000, totalDeductions: 600, net: 4400 })
  })
})

describe('applyAdjustments', () => {
  it('adds bonuses and reimbursements, subtracts deductions and lop', () => {
    expect(
      applyAdjustments(40000, [
        { kind: 'bonus', amount: 10000 },
        { kind: 'reimbursement', amount: 2000 },
        { kind: 'deduction', amount: 1500 },
        { kind: 'lop', amount: 3000 },
      ]),
    ).toBe(47500)
  })
})

describe('waterfallSegments', () => {
  it('rises through earnings then steps down to a net segment', () => {
    const { earnings, deductions } = buildStructure({ ctc: 600000, netPay: 40000 })
    const segs = waterfallSegments(earnings, deductions)
    expect(segs[0].start).toBe(0)
    const net = segs[segs.length - 1]
    expect(net.kind).toBe('net')
    expect(net.end).toBe(40000)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `./node_modules/.bin/vitest run src/lib/payroll.test.ts`
Expected: FAIL — `Failed to resolve import "./payroll"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/payroll.ts`:

```ts
export type ComponentKind = 'earning' | 'deduction'

export type SalaryComponent = {
  code: string
  label: string
  kind: ComponentKind
  amount: number
  sortOrder: number
}

export type SalaryStructure = {
  earnings: Array<SalaryComponent>
  deductions: Array<SalaryComponent>
  gross: number
  totalDeductions: number
  net: number
}

export type AdjustmentKind = 'bonus' | 'deduction' | 'reimbursement' | 'lop'

// Build a reconciling monthly salary structure from annual CTC + monthly net pay.
// Earnings split Basic 50% / HRA 20% / Special (remainder). Deductions are PF
// (12% of Basic), Professional Tax (flat 200) and TDS (remainder), clamped so the
// deduction total never exceeds gross - netPay. The remainder lines (Special, TDS)
// absorb integer rounding so the invariant holds exactly.
export function buildStructure({ ctc, netPay }: { ctc: number; netPay: number }): SalaryStructure {
  const gross = Math.round(ctc / 12)
  const basic = Math.round(gross * 0.5)
  const hra = Math.round(gross * 0.2)
  const special = gross - basic - hra
  const earnings: Array<SalaryComponent> = [
    { code: 'basic', label: 'Basic', kind: 'earning', amount: basic, sortOrder: 0 },
    { code: 'hra', label: 'House Rent Allowance', kind: 'earning', amount: hra, sortOrder: 1 },
    { code: 'special', label: 'Special Allowance', kind: 'earning', amount: special, sortOrder: 2 },
  ]

  const target = Math.max(0, gross - netPay)
  let pf = Math.round(basic * 0.12)
  let pt = Math.min(200, target)
  if (pf + pt > target) pf = Math.max(0, target - pt)
  const tds = Math.max(0, target - pf - pt)
  const deductions: Array<SalaryComponent> = [
    { code: 'pf', label: 'Provident Fund', kind: 'deduction', amount: pf, sortOrder: 0 },
    { code: 'pt', label: 'Professional Tax', kind: 'deduction', amount: pt, sortOrder: 1 },
    { code: 'tds', label: 'TDS', kind: 'deduction', amount: tds, sortOrder: 2 },
  ]

  const totalDeductions = pf + pt + tds
  return { earnings, deductions, gross, totalDeductions, net: gross - totalDeductions }
}

export function summarize(components: Array<SalaryComponent>): {
  gross: number
  totalDeductions: number
  net: number
} {
  let gross = 0
  let totalDeductions = 0
  for (const c of components) {
    if (c.kind === 'earning') gross += c.amount
    else totalDeductions += c.amount
  }
  return { gross, totalDeductions, net: gross - totalDeductions }
}

export function adjustmentSign(kind: AdjustmentKind): 1 | -1 {
  return kind === 'bonus' || kind === 'reimbursement' ? 1 : -1
}

export function applyAdjustments(
  baseNet: number,
  adjustments: Array<{ kind: AdjustmentKind; amount: number }>,
): number {
  return adjustments.reduce((sum, a) => sum + adjustmentSign(a.kind) * a.amount, baseNet)
}

export type WaterfallSegment = {
  label: string
  kind: 'earning' | 'deduction' | 'net'
  amount: number
  start: number
  end: number
}

// Segments for the gross->net waterfall: earnings rise cumulatively to gross,
// deductions step the running total back down, and a final net segment spans 0..net.
export function waterfallSegments(
  earnings: Array<SalaryComponent>,
  deductions: Array<SalaryComponent>,
): Array<WaterfallSegment> {
  const segs: Array<WaterfallSegment> = []
  let running = 0
  for (const e of earnings) {
    segs.push({ label: e.label, kind: 'earning', amount: e.amount, start: running, end: running + e.amount })
    running += e.amount
  }
  for (const d of deductions) {
    segs.push({ label: d.label, kind: 'deduction', amount: d.amount, start: running - d.amount, end: running })
    running -= d.amount
  }
  segs.push({ label: 'Net pay', kind: 'net', amount: running, start: 0, end: running })
  return segs
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `./node_modules/.bin/vitest run src/lib/payroll.test.ts`
Expected: PASS (all 5 tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payroll.ts src/lib/payroll.test.ts
git commit -m "feat(payroll): add salary reconciliation library with tests"
```

---

## Task 3: Seed reconciling components + sample adjustments

**Files:**
- Modify: `scripts/seed-people.mjs` (reset block ~line 196; payslip block ~line 652; append new seeding after the payslip block ~line 685)

**Interfaces:**
- Consumes: `allEmployees` array (each `{ id, name, department, netPay, ... }`), the `bulk(table, cols, rows)` helper, `rand()`/`randInt()`, `period`.
- Produces: `salary_components` + `pay_adjustments` rows in the DB.

> The seed is a `.mjs` and cannot import the TS lib, so the reconciliation math is
> inlined here mirroring `src/lib/payroll.ts`. Employees carry `ctc = netPay * 13.5`,
> so gross = `round(netPay * 13.5 / 12)`.

- [ ] **Step 1: Add table clears to the reset block**

In the reset section, immediately after the line `await sql\`DELETE FROM payslips\`` (~line 196), add:

```js
await sql`DELETE FROM salary_components`
await sql`DELETE FROM pay_adjustments`
```

(Both FK to `employees`, so they must be cleared before `DELETE FROM employees`.)

- [ ] **Step 2: Align the historical payslip gross to ctc/12**

In the payslip block (~line 653), change the gross basis so seeded history matches the stored structures. Replace:

```js
  const gross = Math.round(emp.netPay * 1.35)
```

with:

```js
  const gross = Math.round((emp.netPay * 13.5) / 12)
```

- [ ] **Step 3: Append component + adjustment seeding after the payslip block**

After the line `console.log(\`Inserted payroll run ${period} with ${payslipRows.length} payslips\`)` (~line 685), add:

```js
// ---- salary components (reconciling monthly structure) -------------------
// Mirrors src/lib/payroll.ts buildStructure. gross = ctc/12 where ctc = netPay*13.5.
const componentRows = []
const ADJ_KINDS = ['bonus', 'reimbursement', 'deduction']
const adjustmentRows = []
for (const emp of allEmployees) {
  const gross = Math.round((emp.netPay * 13.5) / 12)
  const basic = Math.round(gross * 0.5)
  const hra = Math.round(gross * 0.2)
  const special = gross - basic - hra
  const target = Math.max(0, gross - emp.netPay)
  let pf = Math.round(basic * 0.12)
  let pt = Math.min(200, target)
  if (pf + pt > target) pf = Math.max(0, target - pt)
  const tds = Math.max(0, target - pf - pt)
  const lines = [
    { kind: 'earning', code: 'basic', label: 'Basic', amount: basic, sort_order: 0 },
    { kind: 'earning', code: 'hra', label: 'House Rent Allowance', amount: hra, sort_order: 1 },
    { kind: 'earning', code: 'special', label: 'Special Allowance', amount: special, sort_order: 2 },
    { kind: 'deduction', code: 'pf', label: 'Provident Fund', amount: pf, sort_order: 0 },
    { kind: 'deduction', code: 'pt', label: 'Professional Tax', amount: pt, sort_order: 1 },
    { kind: 'deduction', code: 'tds', label: 'TDS', amount: tds, sort_order: 2 },
  ]
  for (const l of lines) componentRows.push({ employee_id: emp.id, ...l })

  // ~15% of employees carry a sample adjustment for the current month.
  if (rand() < 0.15) {
    const kind = pick(ADJ_KINDS)
    const label =
      kind === 'bonus' ? 'Performance bonus' : kind === 'reimbursement' ? 'Travel reimbursement' : 'Salary advance recovery'
    adjustmentRows.push({
      employee_id: emp.id,
      period: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
      kind,
      label,
      amount: randInt(2000, 20000),
      note: null,
      created_by: 'Seed',
    })
  }
}
await bulk('salary_components', ['employee_id', 'kind', 'code', 'label', 'amount', 'sort_order'], componentRows)
console.log(`Inserted ${componentRows.length} salary components`)
await bulk('pay_adjustments', ['employee_id', 'period', 'kind', 'label', 'amount', 'note', 'created_by'], adjustmentRows)
console.log(`Inserted ${adjustmentRows.length} pay adjustments`)
```

- [ ] **Step 4: Reseed**

Run: `node scripts/seed-people.mjs`
Expected: logs include `Inserted <N> salary components` (≈ 6 × employee count) and `Inserted <N> pay adjustments`, no errors.

- [ ] **Step 5: Smoke-check reconciliation against net_pay**

Create `verify-payroll-seed.mjs` in the repo root:

```js
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
const url = readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const sql = neon(url)
const rows = await sql`
  select e.id, e.net_pay,
         coalesce(sum(c.amount) filter (where c.kind='earning'),0) gross,
         coalesce(sum(c.amount) filter (where c.kind='deduction'),0) ded
  from employees e join salary_components c on c.employee_id = e.id
  where e.status <> 'exited'
  group by e.id, e.net_pay limit 500`
const bad = rows.filter((r) => Math.round(r.gross - r.ded) !== Math.round(Number(r.net_pay)))
console.log(`checked ${rows.length}, mismatches ${bad.length}`)
console.log(bad.slice(0, 5))
```

Run: `node verify-payroll-seed.mjs`
Expected: `checked <N>, mismatches 0`
Then delete it: `rm verify-payroll-seed.mjs`

- [ ] **Step 6: Commit**

```bash
git add scripts/seed-people.mjs
git commit -m "feat(payroll): seed reconciling salary components and sample adjustments"
```

---

## Task 4: Shared UI primitives + tabular font

**Files:**
- Modify: `src/styles.css`
- Modify: `src/components/ui.tsx` (add `Money`, `LedgerLine`, `Ring`)
- Modify: `src/components/charts.tsx` (add `PayWaterfall`)

**Interfaces:**
- Produces:
  - `Money({ value: number; tone?: 'ink'|'earning'|'deduction'|'muted'; sign?: boolean; className?: string })`
  - `LedgerLine({ label: string })`
  - `Ring({ value: number; size?: number })`
  - `PayWaterfall({ segments: WaterfallSegment[] })` (imports `WaterfallSegment` from `#/lib/payroll`)

- [ ] **Step 1: Load the mono font + add the `.tabular` utility**

In `src/styles.css`, insert the font import directly **after** `@import "tailwindcss";` (imports must precede rule blocks), and add the utility after the `body` rule:

```css
@import "tailwindcss";
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');
```

Then append at the end of the file:

```css
.tabular {
  font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}
```

- [ ] **Step 2: Add `Money`, `LedgerLine`, `Ring` to `ui.tsx`**

Append to `src/components/ui.tsx`:

```tsx
const moneyTone: Record<string, string> = {
  ink: 'text-slate-900',
  earning: 'text-emerald-600',
  deduction: 'text-rose-600',
  muted: 'text-slate-400',
}

export function Money({
  value,
  tone = 'ink',
  sign = false,
  className = '',
}: {
  value: number
  tone?: keyof typeof moneyTone
  sign?: boolean
  className?: string
}) {
  const prefix = sign ? (value < 0 ? '−' : '+') : ''
  return (
    <span className={`tabular ${moneyTone[tone]} ${className}`}>
      {prefix}₹{Math.abs(value).toLocaleString('en-IN')}
    </span>
  )
}

export function LedgerLine({ label }: { label: string }) {
  return (
    <div className="mb-2 mt-4 flex items-center gap-3">
      <span className="tabular text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  )
}

export function Ring({ value, size = 44 }: { value: number; size?: number }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(100, Math.max(0, value)) / 100)
  const half = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={half} cy={half} r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle
        cx={half}
        cy={half}
        r={r}
        fill="none"
        stroke="#2563eb"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${half} ${half})`}
      />
      <text
        x="50%"
        y="52%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={size * 0.26}
        fontWeight="600"
        fill="#334155"
      >
        {value}%
      </text>
    </svg>
  )
}
```

- [ ] **Step 3: Add `PayWaterfall` to `charts.tsx`**

At the top of `src/components/charts.tsx`, add the import:

```tsx
import type { WaterfallSegment } from '#/lib/payroll'
```

Append the component:

```tsx
// Gross -> net waterfall: earnings rise (emerald), deductions step down (rose),
// net lands (ink). Segment start/end are value ranges from waterfallSegments().
export function PayWaterfall({ segments }: { segments: Array<WaterfallSegment> }) {
  const W = 520
  const H = 176
  const padT = 10
  const padB = 30
  const padX = 8
  const max = Math.max(...segments.map((s) => Math.max(s.start, s.end)), 1)
  const bw = (W - padX * 2) / segments.length
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB)
  const fill: Record<string, string> = {
    earning: '#059669',
    deduction: '#e11d48',
    net: '#0f172a',
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      {segments.map((s, i) => {
        const top = y(Math.max(s.start, s.end))
        const bottom = y(Math.min(s.start, s.end))
        return (
          <g key={i}>
            <rect
              x={padX + i * bw + bw * 0.16}
              y={top}
              width={bw * 0.68}
              height={Math.max(2, bottom - top)}
              rx="3"
              fill={fill[s.kind]}
            />
            <text
              x={padX + i * bw + bw / 2}
              y={H - 10}
              fontSize="9"
              fill="#94a3b8"
              textAnchor="middle"
            >
              {s.label.split(' ')[0]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
```

- [ ] **Step 4: Typecheck**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: only the 2 known `/settings` errors — no errors in `ui.tsx`, `charts.tsx`, or `payroll.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css src/components/ui.tsx src/components/charts.tsx
git commit -m "feat(ui): add Money, LedgerLine, Ring, PayWaterfall primitives"
```

---

## Task 5: Payroll server functions

**Files:**
- Modify: `src/server/payroll.ts`

**Interfaces:**
- Consumes: `buildStructure`, `summarize`, `applyAdjustments` from `#/lib/payroll`; `requireDb`, `getSessionUser`, `canApprove`.
- Produces:
  - `getPayroll` return gains `roster: Array<{ id: number; name: string; department: string; empCode: string | null; netPay: number }>`.
  - `getEmployeePayroll({ data: number })` → `{ employee, earnings, deductions, gross, totalDeductions, net, adjustments, payslips, currentPeriod } | null`
  - `updateSalaryComponents({ data: { employeeId: number; components: Array<{ code: string; label: string; kind: 'earning'|'deduction'; amount: number; sortOrder: number }> } })` → `Result<{ gross: number; totalDeductions: number; net: number }>`
  - `addAdjustment({ data: { employeeId: number; period: string | null; kind: 'bonus'|'deduction'|'reimbursement'|'lop'; label: string; amount: number; note?: string } })` → `Result<null>`
  - `deleteAdjustment({ data: { id: number } })` → `Result<null>`

- [ ] **Step 1: Add imports + a shared Zod schema for components**

At the top of `src/server/payroll.ts`, extend the imports:

```ts
import { buildStructure, summarize, applyAdjustments } from '#/lib/payroll'
import type { AdjustmentKind } from '#/lib/payroll'
```

Below the existing `currentPeriod` helper, add:

```ts
const componentSchema = z.object({
  code: z.string().min(1).max(24),
  label: z.string().min(1).max(64),
  kind: z.enum(['earning', 'deduction']),
  amount: z.number().nonnegative().max(100_000_000),
  sortOrder: z.number().int().min(0).max(99),
})
```

- [ ] **Step 2: Extend `getPayroll` to return the roster**

Inside `getPayroll`, after the `pendingReimb` query, add a roster query:

```ts
  const roster = (await sql`
    select id, name, department, emp_code, net_pay
    from employees where status <> 'exited' order by name`) as Array<any>
```

Add to the returned object (alongside `runs`, `myPayslips`):

```ts
    roster: roster.map((r) => ({
      id: r.id,
      name: r.name,
      department: r.department,
      empCode: r.emp_code ?? null,
      netPay: Number(r.net_pay),
    })),
```

- [ ] **Step 3: Add `getEmployeePayroll`**

Append to `src/server/payroll.ts`:

```ts
export const getEmployeePayroll = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.number().int().positive().parse(d))
  .handler(async ({ data: employeeId }) => {
    const sql = requireDb()
    const me = await getSessionUser()
    if (!canApprove(me)) return null

    const emp = (await sql`select id, name, designation, department, emp_code, status, ctc, net_pay
      from employees where id=${employeeId}`)[0] as
      | { id: number; name: string; designation: string; department: string; emp_code: string | null; status: string; ctc: string; net_pay: string }
      | undefined
    if (!emp) return null

    let comps = (await sql`select code, label, kind, amount, sort_order
      from salary_components where employee_id=${employeeId} order by kind desc, sort_order`) as Array<any>
    // Fallback for employees without a stored structure (e.g. onboarding-created):
    // derive one from ctc/net_pay so the panel is never empty.
    if (!comps.length) {
      const s = buildStructure({ ctc: Number(emp.ctc), netPay: Number(emp.net_pay) })
      comps = [...s.earnings, ...s.deductions].map((c) => ({
        code: c.code, label: c.label, kind: c.kind, amount: c.amount, sort_order: c.sortOrder,
      }))
    }
    const earnings = comps
      .filter((c) => c.kind === 'earning')
      .map((c) => ({ code: c.code, label: c.label, amount: Number(c.amount), sortOrder: n(c.sort_order) }))
    const deductions = comps
      .filter((c) => c.kind === 'deduction')
      .map((c) => ({ code: c.code, label: c.label, amount: Number(c.amount), sortOrder: n(c.sort_order) }))
    const gross = earnings.reduce((a, c) => a + c.amount, 0)
    const totalDeductions = deductions.reduce((a, c) => a + c.amount, 0)

    const period = currentPeriod()
    const adjustments = (await sql`select id, period, kind, label, amount, note, created_at
      from pay_adjustments where employee_id=${employeeId} order by created_at desc`) as Array<any>
    const payslips = (await sql`select period, gross, deductions, reimbursements, net, lop_days, status
      from payslips where employee_id=${employeeId} order by period desc limit 12`) as Array<any>

    return {
      employee: {
        id: emp.id, name: emp.name, designation: emp.designation,
        department: emp.department, empCode: emp.emp_code ?? null, status: emp.status,
      },
      earnings,
      deductions,
      gross,
      totalDeductions,
      net: gross - totalDeductions,
      currentPeriod: period,
      adjustments: adjustments.map((a) => ({
        id: a.id, period: a.period, kind: a.kind, label: a.label,
        amount: Number(a.amount), note: a.note, createdAt: a.created_at,
      })),
      payslips: payslips.map((p) => ({
        period: p.period, gross: Number(p.gross), deductions: Number(p.deductions),
        reimbursements: Number(p.reimbursements), net: Number(p.net), lopDays: Number(p.lop_days), status: p.status,
      })),
    }
  })
```

- [ ] **Step 4: Add `updateSalaryComponents`**

```ts
export const updateSalaryComponents = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({
      employeeId: z.number().int().positive(),
      components: z.array(componentSchema).min(1).max(40),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<{ gross: number; totalDeductions: number; net: number }>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) return { ok: false, error: 'Only ops and master can edit payroll' }

      const totals = summarize(data.components)
      if (totals.net < 0) return { ok: false, error: 'Deductions exceed earnings — net pay would be negative' }

      await sql`delete from salary_components where employee_id=${data.employeeId}`
      for (const c of data.components) {
        await sql`insert into salary_components (employee_id, kind, code, label, amount, sort_order)
          values (${data.employeeId}, ${c.kind}, ${c.code}, ${c.label}, ${c.amount}, ${c.sortOrder})`
      }
      // Write back so org-wide net_pay/ctc totals stay consistent.
      await sql`update employees set net_pay=${totals.net}, ctc=${Math.round(totals.gross * 12)} where id=${data.employeeId}`

      return { ok: true, data: totals }
    } catch (error) {
      console.error('updateSalaryComponents failed', error)
      return { ok: false, error: 'Failed to update salary structure' }
    }
  })
```

- [ ] **Step 5: Add `addAdjustment` and `deleteAdjustment`**

```ts
export const addAdjustment = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({
      employeeId: z.number().int().positive(),
      period: z.string().regex(/^\d{4}-\d{2}$/).nullable(),
      kind: z.enum(['bonus', 'deduction', 'reimbursement', 'lop']),
      label: z.string().min(1).max(64),
      amount: z.number().positive().max(100_000_000),
      note: z.string().max(300).optional(),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) return { ok: false, error: 'Only ops and master can add adjustments' }
      await sql`insert into pay_adjustments (employee_id, period, kind, label, amount, note, created_by)
        values (${data.employeeId}, ${data.period}, ${data.kind}, ${data.label.trim()}, ${data.amount}, ${data.note || null}, ${me?.name ?? 'Unknown'})`
      return { ok: true, data: null }
    } catch (error) {
      console.error('addAdjustment failed', error)
      return { ok: false, error: 'Failed to add adjustment' }
    }
  })

export const deleteAdjustment = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) return { ok: false, error: 'Only ops and master can remove adjustments' }
      await sql`delete from pay_adjustments where id=${data.id}`
      return { ok: true, data: null }
    } catch (error) {
      console.error('deleteAdjustment failed', error)
      return { ok: false, error: 'Failed to remove adjustment' }
    }
  })
```

- [ ] **Step 6: Upgrade `runPayroll` to use components + adjustments**

Replace the body of `runPayroll`'s slip computation. Specifically, replace everything **from** the line `const period = data.period || currentPeriod()` **through** the end of the `const slips = emps.map(...)` block — stop just before `const run = (await sql...insert into payroll_runs`. Do not duplicate `const period`; it is included in the replacement below:

```ts
      const period = data.period || currentPeriod()
      const emps = (await sql`select id, name, department, ctc, net_pay from employees where status <> 'exited'`) as Array<any>

      const compRows = (await sql`
        select employee_id,
               coalesce(sum(amount) filter (where kind='earning'),0) gross,
               coalesce(sum(amount) filter (where kind='deduction'),0) ded
        from salary_components group by employee_id`) as Array<any>
      const structByEmp: Record<number, { gross: number; ded: number } | undefined> = {}
      for (const r of compRows) structByEmp[n(r.employee_id)] = { gross: n(r.gross), ded: n(r.ded) }

      const adjRows = (await sql`select employee_id, kind, amount from pay_adjustments where period=${period}`) as Array<any>
      const adjByEmp: Record<number, Array<{ kind: AdjustmentKind; amount: number }> | undefined> = {}
      for (const r of adjRows) (adjByEmp[n(r.employee_id)] ??= []).push({ kind: r.kind, amount: n(r.amount) })

      const expRows = (await sql`select employee_id, coalesce(sum(amount),0) s from expenses where status='approved' group by employee_id`) as Array<any>
      const reimbByEmp: Record<number, number | undefined> = {}
      for (const r of expRows) reimbByEmp[n(r.employee_id)] = n(r.s)

      const existing = (await sql`select id from payroll_runs where period=${period}`)[0] as { id: number } | undefined
      if (existing) {
        await sql`delete from payslips where run_id=${existing.id}`
        await sql`delete from payroll_runs where id=${existing.id}`
      }

      let gT = 0
      let dT = 0
      let rT = 0
      let nT = 0
      const slips = emps.map((e) => {
        const struct = structByEmp[e.id] ?? {
          gross: Math.round(Number(e.ctc) / 12),
          ded: Math.max(0, Math.round(Number(e.ctc) / 12) - Number(e.net_pay)),
        }
        const adjustments = adjByEmp[e.id] ?? []
        const expenseReimb = reimbByEmp[e.id] ?? 0
        const reimbAdj = adjustments.filter((a) => a.kind === 'reimbursement').reduce((a, x) => a + x.amount, 0)
        const reimb = expenseReimb + reimbAdj
        const baseNet = struct.gross - struct.ded
        // applyAdjustments handles bonus/deduction/lop; reimbursements are folded into reimb below.
        const nonReimbAdj = adjustments.filter((a) => a.kind !== 'reimbursement')
        const netFinal = applyAdjustments(baseNet, nonReimbAdj) + reimb
        const lopDays = 0
        gT += struct.gross
        dT += struct.ded
        rT += reimb
        nT += netFinal
        return { id: e.id, name: e.name, department: e.department, gross: struct.gross, deductions: struct.ded, reimb, netFinal, lopDays }
      })
```

Then in the chunked payslip insert further down, change the `params` mapping's `lop_days` value from the literal `0` to `s.lopDays`:

```ts
        const params = chunk.flatMap((s) => [
          run.id, s.id, s.name, s.department, period, s.gross, s.deductions, s.lopDays, s.reimb, s.netFinal, 'paid',
        ])
```

(The `runPayroll` return, the `payroll_runs` insert, and the `expenses` cascade `update` stay exactly as they are.)

- [ ] **Step 7: Typecheck + lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: only the 2 known `/settings` errors.
Run: `./node_modules/.bin/eslint src/server/payroll.ts`
Expected: clean (if `no-unnecessary-condition` fires on a row access, cast that row to `... | undefined`).

- [ ] **Step 8: Live smoke test the server functions**

Create `verify-emp-payroll.mjs` in the repo root:

```js
import { readFileSync } from 'node:fs'
import { neon } from '@neondatabase/serverless'
const url = readFileSync('.env.local', 'utf8').match(/^DATABASE_URL=(.+)$/m)[1].trim().replace(/^["']|["']$/g, '')
const sql = neon(url)
// pick an employee, read structure, confirm it reconciles to net_pay
const e = (await sql`select id, net_pay from employees where status<>'exited' order by id limit 1`)[0]
const c = await sql`select kind, sum(amount) amt from salary_components where employee_id=${e.id} group by kind`
const gross = Number(c.find((x) => x.kind === 'earning')?.amt ?? 0)
const ded = Number(c.find((x) => x.kind === 'deduction')?.amt ?? 0)
console.log({ id: e.id, net_pay: Number(e.net_pay), computedNet: gross - ded, ok: gross - ded === Number(e.net_pay) })
```

Run: `node verify-emp-payroll.mjs`
Expected: `ok: true`.
Then delete it: `rm verify-emp-payroll.mjs`

- [ ] **Step 9: Commit**

```bash
git add src/server/payroll.ts
git commit -m "feat(payroll): server fns for employee structure, adjustments, component-based runs"
```

---

## Task 6: Payroll page — roster + detail drawer

**Files:**
- Rewrite: `src/routes/_app/payroll.tsx`

**Interfaces:**
- Consumes: `getPayroll` (now with `roster`), `getEmployeePayroll`, `updateSalaryComponents`, `addAdjustment`, `deleteAdjustment` from `#/server/payroll`; `summarize`, `waterfallSegments`, `adjustmentSign` from `#/lib/payroll`; `Money`, `LedgerLine`, `Card`, `CardHeader`, `KpiCard`, `Badge`, `inr` from `#/components/ui`; `PayWaterfall` from `#/components/charts`.

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `src/routes/_app/payroll.tsx`:

```tsx
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Wallet, Users, IndianRupee, Play, Search, X, Plus, Loader2, Trash2 } from 'lucide-react'
import {
  getPayroll,
  runPayroll,
  getEmployeePayroll,
  updateSalaryComponents,
  addAdjustment,
  deleteAdjustment,
} from '#/server/payroll'
import { summarize, waterfallSegments, adjustmentSign } from '#/lib/payroll'
import type { AdjustmentKind } from '#/lib/payroll'
import { Card, CardHeader, KpiCard, Badge, Money, LedgerLine, Avatar, inr } from '#/components/ui'
import { PayWaterfall } from '#/components/charts'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/payroll')({
  staticData: { title: 'Payroll' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getPayroll(),
  component: Payroll,
})

const fmtPeriod = (p: string) => {
  const [y, m] = p.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
const rupee = (a: number) => `₹${a.toLocaleString('en-IN')}`

type EditRow = { code: string; label: string; kind: 'earning' | 'deduction'; amount: number; sortOrder: number }
type EmpPayroll = Awaited<ReturnType<typeof getEmployeePayroll>>

const ADJ_KINDS: Array<AdjustmentKind> = ['bonus', 'reimbursement', 'deduction', 'lop']
const adjLabel: Record<AdjustmentKind, string> = {
  bonus: 'Bonus', reimbursement: 'Reimbursement', deduction: 'Deduction', lop: 'Loss of pay',
}

function AdjustmentForm({ employeeId, period, onDone }: { employeeId: number; period: string; onDone: () => void }) {
  const [kind, setKind] = useState<AdjustmentKind>('bonus')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!label.trim() || !(amt > 0)) return
    setBusy(true)
    await addAdjustment({ data: { employeeId, period, kind, label: label.trim(), amount: amt } })
    setBusy(false)
    setLabel('')
    setAmount('')
    onDone()
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <select value={kind} onChange={(e) => setKind(e.target.value as AdjustmentKind)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
        {ADJ_KINDS.map((k) => <option key={k} value={k}>{adjLabel[k]}</option>)}
      </select>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Amount" className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
      <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
      </button>
    </form>
  )
}

function EmployeeDrawer({ employeeId, onClose, onSaved }: { employeeId: number; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<EmpPayroll>(null)
  const [rows, setRows] = useState<Array<EditRow>>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const res = await getEmployeePayroll({ data: employeeId })
    setD(res)
    if (res) {
      setRows([
        ...res.earnings.map((e) => ({ ...e, kind: 'earning' as const })),
        ...res.deductions.map((x) => ({ ...x, kind: 'deduction' as const })),
      ])
    }
  }, [employeeId])

  useEffect(() => { void load() }, [load])

  if (!d) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        <Loader2 size={18} className="animate-spin" />
      </div>
    )
  }

  const totals = summarize(rows)
  const earnings = rows.filter((r) => r.kind === 'earning')
  const deductions = rows.filter((r) => r.kind === 'deduction')
  const segs = waterfallSegments(earnings, deductions)
  const dirty = JSON.stringify(rows) !== JSON.stringify([
    ...d.earnings.map((e) => ({ ...e, kind: 'earning' })),
    ...d.deductions.map((x) => ({ ...x, kind: 'deduction' })),
  ])

  function setAmount(code: string, kind: string, value: number) {
    setRows((rs) => rs.map((r) => (r.code === code && r.kind === kind ? { ...r, amount: value } : r)))
  }

  async function save() {
    if (totals.net < 0) { setMsg('Net pay would be negative.'); return }
    setSaving(true)
    setMsg('')
    const res = await updateSalaryComponents({ data: { employeeId, components: rows } })
    setSaving(false)
    if (res.ok) {
      setMsg('Saved.')
      await load()
      onSaved()
    } else {
      setMsg(res.error)
    }
  }

  async function removeAdj(id: number) {
    await deleteAdjustment({ data: { id } })
    await load()
    onSaved()
  }

  const adjForPeriod = d.adjustments.filter((a) => a.period === d.currentPeriod)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={d.employee.name} size={40} />
          <div>
            <div className="text-sm font-semibold text-slate-800">{d.employee.name}</div>
            <div className="text-xs text-slate-400">
              {d.employee.designation} · {d.employee.department}
              {d.employee.empCode ? ` · ${d.employee.empCode}` : ''}
            </div>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-slate-300 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <PayWaterfall segments={segs} />

        <LedgerLine label="Earnings" />
        <div className="space-y-1.5">
          {earnings.map((r) => (
            <div key={r.code} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">{r.label}</span>
              <div className="flex items-center gap-1 text-sm">
                <span className="tabular text-slate-400">₹</span>
                <input
                  value={r.amount}
                  onChange={(e) => setAmount(r.code, r.kind, Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  inputMode="numeric"
                  className="tabular w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-emerald-600 focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-sm font-semibold">
            <span className="text-slate-500">Gross</span>
            <Money value={totals.gross} tone="ink" />
          </div>
        </div>

        <LedgerLine label="Deductions" />
        <div className="space-y-1.5">
          {deductions.map((r) => (
            <div key={r.code} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">{r.label}</span>
              <div className="flex items-center gap-1 text-sm">
                <span className="tabular text-slate-400">−₹</span>
                <input
                  value={r.amount}
                  onChange={(e) => setAmount(r.code, r.kind, Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  inputMode="numeric"
                  className="tabular w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-rose-600 focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-sm font-semibold">
            <span className="text-slate-500">Total deductions</span>
            <Money value={totals.totalDeductions} tone="deduction" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-300">Net pay</span>
          <Money value={totals.net} tone="muted" className="!text-white text-lg font-bold" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : null} Save structure
          </button>
          {msg ? <span className={`text-xs ${msg === 'Saved.' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span> : null}
        </div>

        <LedgerLine label={`Adjustments · ${fmtPeriod(d.currentPeriod)}`} />
        {adjForPeriod.length ? (
          <ul className="space-y-1.5">
            {adjForPeriod.map((a) => {
              const signed = adjustmentSign(a.kind) * a.amount
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-600">
                    <Badge tone={signed >= 0 ? 'ok' : 'warn'} label={adjLabel[a.kind]} /> {a.label}
                  </span>
                  <Money value={signed} sign tone={signed >= 0 ? 'earning' : 'deduction'} />
                  <button onClick={() => removeAdj(a.id)} aria-label="Remove" className="text-slate-300 hover:text-rose-500">
                    <Trash2 size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">No adjustments this period.</p>
        )}
        <AdjustmentForm employeeId={employeeId} period={d.currentPeriod} onDone={() => { void load(); onSaved() }} />

        <LedgerLine label="Payslip history" />
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="py-1 font-medium">Period</th>
              <th className="py-1 text-right font-medium">Gross</th>
              <th className="py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {d.payslips.length ? d.payslips.map((p) => (
              <tr key={p.period}>
                <td className="py-1.5 text-slate-600">{fmtPeriod(p.period)}</td>
                <td className="py-1.5 text-right"><Money value={p.gross} tone="muted" /></td>
                <td className="py-1.5 text-right"><Money value={p.net} tone="ink" /></td>
              </tr>
            )) : <tr><td colSpan={3} className="py-2 text-slate-400">No payslips yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Payroll() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [period, setPeriod] = useState(d.currentPeriod)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)

  async function run() {
    setBusy(true)
    setMsg('')
    const res = await runPayroll({ data: { period } })
    setBusy(false)
    if (res.ok) setMsg(`Processed ${res.data.employees} payslips · ${rupee(res.data.reimbursed)} reimbursements rolled in.`)
    else setMsg(res.error)
    router.invalidate()
  }

  const roster = d.roster.filter((r) => {
    const q = query.trim().toLowerCase()
    return !q || r.name.toLowerCase().includes(q) || r.department.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<IndianRupee size={15} />} label="Monthly payroll" value={inr(d.orgMonthlyL)} delta="Net pay run" deltaTone="slate" footer="Sum of net pay" />
        <KpiCard icon={<Users size={15} />} label="Employees on payroll" value={String(d.empCount)} delta="Active" deltaTone="blue" footer="Eligible this cycle" />
        <KpiCard icon={<Wallet size={15} />} label="Pending reimbursements" value={rupee(d.pendingReimb)} delta="Approved expenses" deltaTone="amber" footer="Roll into next run" />
        <KpiCard icon={<Play size={15} />} label="Payroll runs" value={String(d.runs.length)} delta="Processed" deltaTone="green" footer="History below" />
      </div>

      {d.canRun ? (
        <Card>
          <CardHeader title="Run payroll" hint="Generates payslips from salary structures + rolls in approved expenses" />
          <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <button onClick={run} disabled={busy} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              <Play size={15} /> {busy ? 'Processing…' : 'Run payroll'}
            </button>
            {msg ? <span className="text-sm text-emerald-600">{msg}</span> : null}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className={selected ? 'lg:col-span-3' : 'lg:col-span-5'}>
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-sm font-semibold text-slate-800">Employee payroll</h3>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or dept…" className="rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm" />
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto px-5 pb-4 pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Employee</th>
                  <th className="py-2 font-medium">Department</th>
                  <th className="py-2 text-right font-medium">Net / mo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {roster.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r.id)} className={`cursor-pointer ${selected === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.name} size={30} />
                        <span className="font-medium text-slate-700">{r.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-slate-500">{r.department}</td>
                    <td className="py-2.5 text-right"><Money value={r.netPay} tone="ink" /></td>
                  </tr>
                ))}
                {roster.length === 0 ? <tr><td colSpan={3} className="py-4 text-slate-400">No matching employees.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>

        {selected ? (
          <Card className="lg:col-span-2">
            <EmployeeDrawer employeeId={selected} onClose={() => setSelected(null)} onSaved={() => router.invalidate()} />
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader title="Payroll history" />
        <div className="px-5 pb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 font-medium">Period</th>
                <th className="py-2 font-medium">Employees</th>
                <th className="py-2 font-medium">Gross</th>
                <th className="py-2 font-medium">Reimbursements</th>
                <th className="py-2 font-medium">Net</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {d.runs.length ? d.runs.map((r) => (
                <tr key={r.period}>
                  <td className="py-2.5 font-medium text-slate-700">{fmtPeriod(r.period)}</td>
                  <td className="py-2.5 text-slate-500">{r.employees}</td>
                  <td className="py-2.5 text-slate-500">{inr(r.grossL)}</td>
                  <td className="py-2.5 text-slate-500">{rupee(r.reimbursement)}</td>
                  <td className="py-2.5 font-medium text-slate-700">{inr(r.netL)}</td>
                  <td className="py-2.5"><Badge tone="ok" label={r.status[0].toUpperCase() + r.status.slice(1)} /></td>
                </tr>
              )) : <tr><td colSpan={6} className="py-4 text-slate-400">No payroll runs yet — run one above.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: only the 2 known `/settings` errors.
Run: `./node_modules/.bin/eslint src/routes/_app/payroll.tsx`
Expected: clean.

- [ ] **Step 3: Drive the app to verify**

Run `pnpm dev`, log in as `ops@quorq.com` / `ops123`, open `/payroll`:
- Search the roster; click an employee → drawer opens with waterfall + earnings/deductions + net.
- Edit an earning amount → gross/net + waterfall update live; **Save structure** → "Saved."; the roster's Net updates after invalidate.
- Add an adjustment (bonus) → appears in the period list; delete it → removed.
- Run payroll for the current month → success message; the run appears in history.
Confirm no console errors.

- [ ] **Step 4: Commit**

```bash
git add src/routes/_app/payroll.tsx
git commit -m "feat(payroll): roster drill-down with editable structure, adjustments, waterfall"
```

---

## Task 7: Hiring — decline action + funnel + candidate drawer

**Files:**
- Modify: `src/server/hiring.ts`
- Rewrite: `src/routes/_app/hiring.tsx`

**Interfaces:**
- Consumes: `getHiring`, `moveApplication`, `declineApplication`, `STAGES`, `Stage` from `#/server/hiring`.
- Produces:
  - `getHiring` return: each candidate in `columns[].candidates` gains `source`, `appliedDate` (string), `role` (job role or `department`); return gains `funnel: Array<{ label: string; value: number }>`.
  - `declineApplication({ data: { id: number; reason: string } })` → `Result<null>`.

- [ ] **Step 1: Extend `getHiring` and add `declineApplication` in `src/server/hiring.ts`**

Update the candidate query to also select the job role and cast the date, and enrich the pushed candidate object. Replace the `cands` query and the pipeline-building loop:

```ts
  const cands = (await sql`
    select a.id, a.candidate_name, a.department, a.source, a.stage, a.applied_date::text applied_date,
           j.role
    from applications a
    left join job_openings j on j.id = a.job_id
    where a.stage in ('applied','screened','interviewed','offer','joined')
    order by a.applied_date desc`) as Array<any>

  const pipeline: Record<string, Array<any> | undefined> = {
    applied: [], screened: [], interviewed: [], offer: [], joined: [],
  }
  for (const c of cands) {
    const col = pipeline[c.stage]
    if (col && col.length < 12) {
      col.push({
        id: c.id,
        name: c.candidate_name,
        department: c.department,
        source: c.source,
        appliedDate: c.applied_date,
        role: c.role ?? c.department,
      })
    }
  }
```

In the returned object, add a `funnel` array after `columns`:

```ts
    funnel: [
      { label: 'Applied', value: sc('applied') },
      { label: 'Screened', value: sc('screened') },
      { label: 'Interviewed', value: sc('interviewed') },
      { label: 'Offer', value: sc('offer') },
      { label: 'Joined', value: sc('joined') },
    ],
```

Append the new server function:

```ts
export const declineApplication = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({
      id: z.number().int().positive(),
      reason: z.enum(['salary', 'location', 'counter_offer', 'other']),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) return { ok: false, error: 'Not authorised' }
      await sql`update applications set stage='declined', decline_reason=${data.reason} where id=${data.id}`
      return { ok: true, data: null }
    } catch (error) {
      console.error('declineApplication failed', error)
      return { ok: false, error: 'Failed to decline application' }
    }
  })
```

- [ ] **Step 2: Rewrite `src/routes/_app/hiring.tsx`**

Replace the entire file:

```tsx
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Briefcase, Users, FileCheck2, UserPlus, ChevronRight, X, XCircle } from 'lucide-react'
import { getHiring, moveApplication, declineApplication, STAGES } from '#/server/hiring'
import type { Stage } from '#/server/hiring'
import { Card, CardHeader, KpiCard, Avatar, Badge, LedgerLine } from '#/components/ui'
import { HBars } from '#/components/charts'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/hiring')({
  staticData: { title: 'Applications' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getHiring(),
  component: Applications,
})

const stageLabel: Record<string, string> = {
  applied: 'Applied', screened: 'Screened', interviewed: 'Interviewed', offer: 'Offer', joined: 'Joined',
}
const stageColor: Record<string, string> = {
  applied: 'border-t-slate-400', screened: 'border-t-blue-400', interviewed: 'border-t-violet-400',
  offer: 'border-t-amber-400', joined: 'border-t-emerald-500',
}
const sourceLabel: Record<string, string | undefined> = {
  linkedin: 'LinkedIn', referral: 'Referral', job_boards: 'Job boards', agency: 'Agency', direct: 'Direct',
}
const DECLINE_REASONS = ['salary', 'location', 'counter_offer', 'other'] as const
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })

type Candidate = { id: number; name: string; department: string; source: string; appliedDate: string; role: string }

function CandidateDrawer({ candidate, stage, onClose, onChanged }: {
  candidate: Candidate; stage: Stage; onClose: () => void; onChanged: () => void
}) {
  const [reason, setReason] = useState<(typeof DECLINE_REASONS)[number]>('other')
  const [busy, setBusy] = useState(false)

  async function advance() {
    const idx = STAGES.indexOf(stage)
    if (idx >= STAGES.length - 1) return
    setBusy(true)
    await moveApplication({ data: { id: candidate.id, toStage: STAGES[idx + 1] } })
    setBusy(false)
    onChanged()
  }
  async function decline() {
    setBusy(true)
    await declineApplication({ data: { id: candidate.id, reason } })
    setBusy(false)
    onChanged()
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/20" onClick={onClose}>
      <div className="h-full w-full max-w-sm bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={candidate.name} size={44} />
            <div>
              <div className="text-sm font-semibold text-slate-800">{candidate.name}</div>
              <div className="text-xs text-slate-400">{candidate.role} · {candidate.department}</div>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-slate-300 hover:text-slate-600"><X size={18} /></button>
        </div>
        <div className="p-4">
          <LedgerLine label="Candidate" />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Stage</dt><dd><Badge tone="info" label={stageLabel[stage]} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Source</dt><dd className="text-slate-600">{sourceLabel[candidate.source] ?? candidate.source}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Applied</dt><dd className="text-slate-600">{fmtDate(candidate.appliedDate)}</dd></div>
          </dl>

          <LedgerLine label="Actions" />
          {stage !== 'joined' ? (
            <button onClick={advance} disabled={busy} className="mb-3 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              Advance to {stageLabel[STAGES[STAGES.indexOf(stage) + 1]]} <ChevronRight size={14} />
            </button>
          ) : null}
          <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-600"><XCircle size={13} /> Decline candidate</div>
            <div className="flex gap-2">
              <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs capitalize">
                {DECLINE_REASONS.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
              <button onClick={decline} disabled={busy} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50">Decline</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Applications() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [active, setActive] = useState<{ candidate: Candidate; stage: Stage } | null>(null)

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Briefcase size={15} />} label="Open roles" value={String(d.kpis.openRoles)} delta={`${d.kpis.critical} critical`} deltaTone="orange" footer="Active postings" />
        <KpiCard icon={<Users size={15} />} label="In pipeline" value={String(d.kpis.inPipeline)} delta="Active candidates" deltaTone="blue" footer="Applied → interviewed" />
        <KpiCard icon={<FileCheck2 size={15} />} label="At offer stage" value={String(d.kpis.offers)} delta="Pending decision" deltaTone="amber" footer="Offers extended" />
        <KpiCard icon={<UserPlus size={15} />} label="Joined" value={String(d.kpis.joined)} valueTone="green" delta="This quarter" deltaTone="green" footer="Successful hires" />
      </div>

      <Card>
        <CardHeader title="Conversion funnel" hint="Applied → joined" />
        <div className="px-5 pb-5">
          <HBars data={d.funnel} colorByIndex showValue />
        </div>
      </Card>

      <Card>
        <CardHeader title="Candidate pipeline" hint="Click a card to advance or decline" />
        <div className="overflow-x-auto px-5 pb-5">
          <div className="flex min-w-[900px] gap-3">
            {d.columns.map((col) => (
              <div key={col.stage} className="flex-1">
                <div className={`mb-2 rounded-t-lg border-t-4 bg-slate-50 px-3 py-2 ${stageColor[col.stage]}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">{stageLabel[col.stage]}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">{col.count}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {col.candidates.map((c) => (
                    <button key={c.id} onClick={() => setActive({ candidate: c, stage: col.stage })} className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left hover:border-blue-300 hover:shadow-sm">
                      <div className="flex items-center gap-2">
                        <Avatar name={c.name} size={28} />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-700">{c.name}</div>
                          <div className="truncate text-[10px] text-slate-400">{c.role}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">{sourceLabel[c.source] ?? c.source}</span>
                        <span className="text-[10px] text-slate-400">{fmtDate(c.appliedDate)}</span>
                      </div>
                    </button>
                  ))}
                  {col.count > col.candidates.length ? (
                    <div className="py-1 text-center text-[11px] text-slate-400">+{col.count - col.candidates.length} more</div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {active ? (
        <CandidateDrawer
          candidate={active.candidate}
          stage={active.stage}
          onClose={() => setActive(null)}
          onChanged={() => { setActive(null); router.invalidate() }}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: only the 2 known `/settings` errors.
Run: `./node_modules/.bin/eslint src/server/hiring.ts src/routes/_app/hiring.tsx`
Expected: clean.

- [ ] **Step 4: Drive the app to verify**

On `/hiring` as ops: funnel renders; click a candidate card → drawer opens; **Advance** moves them a stage (card re-renders after invalidate); **Decline** with a reason removes them from the board. No console errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/hiring.ts src/routes/_app/hiring.tsx
git commit -m "feat(hiring): funnel, candidate drawer, decline action"
```

---

## Task 8: Onboarding — progress ring + editable journeys + custom tasks

**Files:**
- Modify: `src/server/onboarding.ts`
- Rewrite: `src/routes/_app/onboarding.tsx`

**Interfaces:**
- Consumes: existing onboarding server fns + `updateOnboarding`, `addOnboardingTask`, `deleteOnboardingTask`.
- Produces:
  - `updateOnboarding({ data: { id: number; department: string; startDate: string } })` → `Result<null>`
  - `addOnboardingTask({ data: { onboardingId: number; task: string; category: string } })` → `Result<null>`
  - `deleteOnboardingTask({ data: { taskId: number } })` → `Result<{ progress: number }>`

- [ ] **Step 1: Add the three server fns to `src/server/onboarding.ts`**

Add a small shared progress recompute helper near the top (after `TASK_TEMPLATE`):

```ts
async function recomputeProgress(sql: ReturnType<typeof requireDb>, onbId: number): Promise<number> {
  const counts = (await sql`select count(*) total, count(*) filter (where done) done from onboarding_tasks where onboarding_id=${onbId}`)[0]
  const total = n(counts.total)
  const done = n(counts.done)
  const progress = total ? Math.round((done / total) * 100) : 0
  const status = progress === 100 ? 'completed' : 'in_progress'
  await sql`update onboardings set progress=${progress}, status=${status} where id=${onbId}`
  return progress
}
```

Append the new functions:

```ts
export const updateOnboarding = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({
      id: z.number().int().positive(),
      department: z.string().min(1).max(64),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    const denied = await requireApprover()
    if (denied) return denied
    const sql = requireDb()
    await sql`update onboardings set department=${data.department}, start_date=${data.startDate} where id=${data.id}`
    return { ok: true, data: null }
  })

export const addOnboardingTask = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({
      onboardingId: z.number().int().positive(),
      task: z.string().min(1).max(160),
      category: z.enum(['docs', 'it', 'orientation', 'compliance']),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    const denied = await requireApprover()
    if (denied) return denied
    const sql = requireDb()
    const next = (await sql`select coalesce(max(sort_order),0)+1 so from onboarding_tasks where onboarding_id=${data.onboardingId}`)[0] as { so: number }
    await sql`insert into onboarding_tasks (onboarding_id, task, category, sort_order)
      values (${data.onboardingId}, ${data.task.trim()}, ${data.category}, ${n(next.so)})`
    await recomputeProgress(sql, data.onboardingId)
    return { ok: true, data: null }
  })

export const deleteOnboardingTask = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ taskId: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<Result<{ progress: number }>> => {
    const denied = await requireApprover()
    if (denied) return denied
    const sql = requireDb()
    const task = (await sql`select onboarding_id from onboarding_tasks where id=${data.taskId}`)[0] as { onboarding_id: number } | undefined
    if (!task) return { ok: false, error: 'Task not found' }
    await sql`delete from onboarding_tasks where id=${data.taskId}`
    const progress = await recomputeProgress(sql, task.onboarding_id)
    return { ok: true, data: { progress } }
  })
```

> Note: `toggleOnboardingTask` already inlines the same progress recompute; leave it as-is to
> avoid touching its employee-cascade logic. `recomputeProgress` is used by the new fns only.

- [ ] **Step 2: Rewrite `src/routes/_app/onboarding.tsx`**

Replace the entire file:

```tsx
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { ClipboardList, UserPlus, CheckCircle2, Plus, Loader2, Trash2, Pencil } from 'lucide-react'
import {
  getOnboarding,
  createOnboarding,
  toggleOnboardingTask,
  addOnboardingNote,
  toggleOnboardingNote,
  deleteOnboardingNote,
  updateOnboarding,
  addOnboardingTask,
  deleteOnboardingTask,
} from '#/server/onboarding'
import { Card, KpiCard, Avatar, Badge, Ring, LedgerLine } from '#/components/ui'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/onboarding')({
  staticData: { title: 'Onboarding' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getOnboarding(),
  component: Onboarding,
})

const depts = ['Engineering', 'Sales', 'Operations', 'Product', 'Marketing', 'Finance', 'HR']
const categories = ['docs', 'it', 'orientation', 'compliance'] as const
const catColor: Record<string, string> = {
  docs: 'text-blue-500', it: 'text-violet-500', orientation: 'text-amber-500', compliance: 'text-teal-500',
}
const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

type OnboardingNote = { id: number; note: string; done: boolean; createdAt: string }

function NotesSection({ onboardingId, notes }: { onboardingId: number; notes: Array<OnboardingNote> }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    await addOnboardingNote({ data: { onboardingId, note: text } })
    setText('')
    setBusy(false)
    router.invalidate()
  }
  async function toggle(noteId: number) { await toggleOnboardingNote({ data: { noteId } }); router.invalidate() }
  async function remove(noteId: number) { await deleteOnboardingNote({ data: { noteId } }); router.invalidate() }

  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <div className="mb-2 text-xs font-medium text-slate-600">Notes</div>
      {notes.length ? (
        <ul className="mb-3 space-y-1.5">
          {notes.map((nn) => (
            <li key={nn.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-sm">
              <input type="checkbox" checked={nn.done} onChange={() => toggle(nn.id)} className="mt-1" />
              <div className="min-w-0 flex-1">
                <div className={nn.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{nn.note}</div>
                <div className="text-[11px] text-slate-400">{fmtDateTime(nn.createdAt)}</div>
              </div>
              <button onClick={() => remove(nn.id)} aria-label="Delete note" className="mt-0.5 text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="mb-3 text-xs text-slate-400">No notes yet.</p>}
      <form onSubmit={add} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        <button type="submit" disabled={busy || !text.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add note
        </button>
      </form>
    </div>
  )
}

type Task = { id: number; task: string; category: string; done: boolean }

function ChecklistSection({ onboardingId, tasks }: { onboardingId: number; tasks: Array<Task> }) {
  const router = useRouter()
  const [acting, setActing] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [task, setTask] = useState('')
  const [category, setCategory] = useState<(typeof categories)[number]>('docs')

  async function toggle(taskId: number) {
    setActing(taskId)
    await toggleOnboardingTask({ data: { taskId } })
    setActing(null)
    router.invalidate()
  }
  async function remove(taskId: number) { await deleteOnboardingTask({ data: { taskId } }); router.invalidate() }
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!task.trim()) return
    await addOnboardingTask({ data: { onboardingId, task: task.trim(), category } })
    setTask('')
    setShowAdd(false)
    router.invalidate()
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-slate-100 px-4 py-3 sm:grid-cols-2">
        {tasks.map((t) => (
          <div key={t.id} className="group flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" checked={t.done} disabled={acting === t.id} onChange={() => toggle(t.id)} />
            <span className={t.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{t.task}</span>
            <span className={`ml-auto text-[10px] uppercase ${catColor[t.category]}`}>{t.category}</span>
            <button onClick={() => remove(t.id)} aria-label="Delete task" className="text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <div className="px-4 pb-3">
        {showAdd ? (
          <form onSubmit={add} className="flex flex-wrap items-center gap-2">
            <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="New checklist item…" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
            <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs capitalize">
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Add</button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </form>
        ) : (
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"><Plus size={13} /> Add checklist item</button>
        )}
      </div>
    </>
  )
}

type Journey = {
  id: number; candidateName: string; role: string; department: string; startDate: string
  status: string; progress: number; employeeId: number | null
  notes: Array<OnboardingNote>; tasks: Array<Task>
}

function EditJourney({ journey, onDone }: { journey: Journey; onDone: () => void }) {
  const [dept, setDept] = useState(journey.department)
  // neon DATE round-trips to a JS Date on the client, so normalize via Date, not string.slice.
  const [start, setStart] = useState(new Date(journey.startDate).toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    await updateOnboarding({ data: { id: journey.id, department: dept, startDate: start } })
    setBusy(false)
    onDone()
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
      <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
        {depts.map((dp) => <option key={dp}>{dp}</option>)}
      </select>
      <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
      <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

function Onboarding() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [open, setOpen] = useState<number | null>(d.onboardings[0]?.id ?? null)
  const [editing, setEditing] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [dept, setDept] = useState('Engineering')
  const [start, setStart] = useState('')

  async function create(e: React.FormEvent) {
    e.preventDefault()
    await createOnboarding({ data: { candidateName: name, email, role, department: dept, startDate: start } })
    setName(''); setEmail(''); setRole(''); setStart(''); setShowForm(false)
    router.invalidate()
  }

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<UserPlus size={15} />} label="In onboarding" value={String(d.stats.active)} delta="Active journeys" deltaTone="blue" footer="New hires in progress" />
        <KpiCard icon={<CheckCircle2 size={15} />} label="Completed" value={String(d.stats.completed)} valueTone="green" delta="Fully onboarded" deltaTone="green" footer="Converted to employees" />
        <KpiCard icon={<ClipboardList size={15} />} label="Avg progress" value={`${d.stats.avgProgress}%`} delta="Across journeys" deltaTone="amber" footer="Checklist completion" />
        <KpiCard icon={<ClipboardList size={15} />} label="Total journeys" value={String(d.stats.total)} delta="All time" deltaTone="slate" footer="Onboarding records" />
      </div>

      <Card>
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-sm font-semibold text-slate-800">New hires</h3>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus size={13} /> Start onboarding
          </button>
        </div>
        {showForm ? (
          <form onSubmit={create} className="mx-5 mt-3 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Candidate name" required className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {depts.map((dp) => <option key={dp}>{dp}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700">Add</button>
            </div>
          </form>
        ) : null}

        <div className="space-y-2 px-5 pb-5 pt-3">
          {d.onboardings.length ? d.onboardings.map((o) => (
            <div key={o.id} className="rounded-lg border border-slate-200">
              <div className="flex w-full items-center gap-3 px-4 py-3">
                <Ring value={o.progress} size={46} />
                <button onClick={() => setOpen(open === o.id ? null : o.id)} className="min-w-0 flex-1 text-left">
                  <div className="text-sm font-semibold text-slate-800">{o.candidateName}</div>
                  <div className="text-xs text-slate-400">{o.role} · {o.department} · starts {fmt(o.startDate)}</div>
                </button>
                {o.employeeId ? <Badge tone="ok" label="Employee created" /> : <Badge tone={o.status === 'completed' ? 'ok' : 'in_progress'} label={o.status === 'completed' ? 'Completed' : `${o.progress}%`} />}
                <button onClick={() => setEditing(editing === o.id ? null : o.id)} aria-label="Edit journey" className="text-slate-300 hover:text-blue-500"><Pencil size={15} /></button>
              </div>
              {editing === o.id ? <EditJourney journey={o} onDone={() => { setEditing(null); router.invalidate() }} /> : null}
              {open === o.id ? (
                <>
                  <ChecklistSection onboardingId={o.id} tasks={o.tasks} />
                  <NotesSection onboardingId={o.id} notes={o.notes} />
                </>
              ) : null}
            </div>
          )) : <p className="py-4 text-sm text-slate-400">No onboarding journeys yet — start one above.</p>}
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: only the 2 known `/settings` errors.
Run: `./node_modules/.bin/eslint src/server/onboarding.ts src/routes/_app/onboarding.tsx`
Expected: clean.

- [ ] **Step 4: Drive the app to verify**

On `/onboarding` as ops: each journey shows a progress ring; expand one → checklist with per-item delete + "Add checklist item" (adding recomputes progress/ring after invalidate); the pencil opens the reassign form (department + start date) and saving persists; a 100%-complete journey shows the "Employee created" badge. No console errors.

- [ ] **Step 5: Full verification sweep + commit**

Run: `./node_modules/.bin/vitest run`
Expected: all suites pass (including `payroll.test.ts`).
Run: `./node_modules/.bin/tsc --noEmit`
Expected: only the 2 known `/settings` errors.
Run: `./node_modules/.bin/eslint`
Expected: clean.

```bash
git add src/server/onboarding.ts src/routes/_app/onboarding.tsx
git commit -m "feat(onboarding): progress ring, editable journeys, custom checklist tasks"
```

---

## Self-Review

**1. Spec coverage:**
- Visual direction (Money/tabular font, ledger line, waterfall) → Tasks 4, 6. ✓
- `salary_components` + `pay_adjustments` tables → Task 1. ✓
- Reconciliation math + tests → Task 2. ✓
- Seed reconciling components + adjustments, historical-payslip alignment → Task 3. ✓
- Roster + detail drawer with editable breakdown + adjustments + payslip history → Tasks 5, 6. ✓
- Write-back of `net_pay`/`ctc` on edit → Task 5, `updateSalaryComponents`. ✓
- `runPayroll` upgraded to components + adjustments → Task 5, Step 6. ✓
- Hiring funnel + candidate drawer + decline → Task 7. ✓
- Onboarding ring + editable journeys + custom tasks → Task 8. ✓
- Out-of-scope guardrails (no new routes, ops+ gating, raw sql) → honored throughout. ✓

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code and exact commands. ✓

**3. Type consistency:**
- `SalaryComponent`/`EditRow` shape (`code`, `label`, `kind`, `amount`, `sortOrder`) is consistent between `payroll.ts` (lib), `updateSalaryComponents` validator, and the page. ✓
- `getEmployeePayroll` returns `earnings`/`deductions` as `{ code, label, amount, sortOrder }`; the page re-adds `kind` when building `rows`. ✓
- `AdjustmentKind` union identical in lib, server validator, and page. ✓
- `waterfallSegments`/`WaterfallSegment` shared by lib → `PayWaterfall` → page. ✓
- `declineApplication` sets `stage='declined'`, matching the `getHiring` filter and seed data. ✓

---

## Execution Handoff

Plan complete. Recommended: execute task-by-task with a fresh subagent per task and review between tasks. Tasks are ordered by dependency (schema → lib → seed → primitives → server → pages) and each ends with an independently testable deliverable.
