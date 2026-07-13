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
