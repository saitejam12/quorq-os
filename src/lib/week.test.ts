import { describe, expect, it } from 'vitest'
import { addDays, isLocked, weekEnd, weekStart } from './week'

// 2026-09-21 is a Monday; 2026-09-27 the Sunday of that week.
describe('weekStart', () => {
  it('returns the same Monday for every day of that week', () => {
    for (const d of [
      '2026-09-21', // Mon
      '2026-09-22', // Tue
      '2026-09-25', // Fri
      '2026-09-27', // Sun
    ]) {
      expect(weekStart(d)).toBe('2026-09-21')
    }
  })

  it('rolls Sunday back to the prior Monday, not forward', () => {
    expect(weekStart('2026-09-20')).toBe('2026-09-14') // Sun → prev Mon
  })

  it('accepts a full ISO instant', () => {
    expect(weekStart('2026-09-25T18:30:00.000Z')).toBe('2026-09-21')
  })
})

describe('weekEnd', () => {
  it('is the Sunday six days after the Monday', () => {
    expect(weekEnd('2026-09-21')).toBe('2026-09-27')
  })
})

describe('addDays', () => {
  it('adds and subtracts across month boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30')
  })
})

describe('isLocked', () => {
  it('locks submitted/approved/closed and frees the rest', () => {
    expect(isLocked('submitted')).toBe(true)
    expect(isLocked('approved')).toBe(true)
    expect(isLocked('closed')).toBe(true)
    expect(isLocked('declined')).toBe(false)
    expect(isLocked(null)).toBe(false)
    expect(isLocked(undefined)).toBe(false)
  })
})
