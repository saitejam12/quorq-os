import { describe, expect, it } from 'vitest'
import { hoursBetween } from './time'

describe('hoursBetween', () => {
  it('computes a whole-hour span', () => {
    expect(hoursBetween('2026-07-08T09:00:00Z', '2026-07-08T17:00:00Z')).toBe(8)
  })

  it('rounds partial hours to 2 decimals', () => {
    expect(hoursBetween('2026-07-08T09:00:00Z', '2026-07-08T09:45:00Z')).toBe(0.75)
    expect(hoursBetween('2026-07-08T09:00:00Z', '2026-07-08T10:20:00Z')).toBe(1.33)
  })

  it('is timezone-agnostic (compares absolute instants)', () => {
    // 09:00+05:30 == 03:30Z, to 05:30Z == 2h
    expect(hoursBetween('2026-07-08T09:00:00+05:30', '2026-07-08T05:30:00Z')).toBe(2)
  })

  it('returns 0 when out is not after in', () => {
    expect(hoursBetween('2026-07-08T17:00:00Z', '2026-07-08T09:00:00Z')).toBe(0)
    expect(hoursBetween('2026-07-08T09:00:00Z', '2026-07-08T09:00:00Z')).toBe(0)
  })

  it('returns 0 for unparseable input', () => {
    expect(hoursBetween('nope', '2026-07-08T09:00:00Z')).toBe(0)
  })
})
