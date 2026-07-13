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
