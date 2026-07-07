import { describe, expect, it } from 'vitest'
import { TIER_RANK, canSetTier, hasTier } from './tiers'
import type { Tier } from './tiers'

describe('TIER_RANK', () => {
  it('orders basic < ops < master', () => {
    expect(TIER_RANK.basic).toBeLessThan(TIER_RANK.ops)
    expect(TIER_RANK.ops).toBeLessThan(TIER_RANK.master)
  })
})

describe('hasTier', () => {
  const cases: Array<[Tier, Tier, boolean]> = [
    ['basic', 'basic', true],
    ['basic', 'ops', false],
    ['basic', 'master', false],
    ['ops', 'basic', true],
    ['ops', 'ops', true],
    ['ops', 'master', false],
    ['master', 'basic', true],
    ['master', 'ops', true],
    ['master', 'master', true],
  ]
  it.each(cases)('hasTier(%s, %s) -> %s', (user, min, expected) => {
    expect(hasTier(user, min)).toBe(expected)
  })
})

describe('canSetTier', () => {
  it('denies basic callers entirely', () => {
    expect(canSetTier('basic', 'basic', 'ops')).toBe(false)
  })
  it('lets ops move users between basic and ops', () => {
    expect(canSetTier('ops', 'basic', 'ops')).toBe(true)
    expect(canSetTier('ops', 'ops', 'basic')).toBe(true)
  })
  it('blocks ops from granting master', () => {
    expect(canSetTier('ops', 'basic', 'master')).toBe(false)
    expect(canSetTier('ops', 'ops', 'master')).toBe(false)
  })
  it('blocks ops from revoking master', () => {
    expect(canSetTier('ops', 'master', 'basic')).toBe(false)
    expect(canSetTier('ops', 'master', 'ops')).toBe(false)
  })
  it('lets master set any tier', () => {
    expect(canSetTier('master', 'basic', 'master')).toBe(true)
    expect(canSetTier('master', 'master', 'basic')).toBe(true)
    expect(canSetTier('master', 'ops', 'ops')).toBe(true)
  })
})
