import { describe, expect, it } from 'vitest'
import { classifyAbsence, isWorkingDay, workingDaysBetween } from './attendance'

// 2026-07-09 is a Thursday. 2026-07-11/12 is Sat/Sun.
const noHolidays = new Set<string>()

describe('isWorkingDay', () => {
  it('is true on a plain weekday', () => {
    expect(isWorkingDay('2026-07-09', noHolidays)).toBe(true) // Thursday
  })

  it('is false on Saturday and Sunday', () => {
    expect(isWorkingDay('2026-07-11', noHolidays)).toBe(false) // Saturday
    expect(isWorkingDay('2026-07-12', noHolidays)).toBe(false) // Sunday
  })

  it('is false on a holiday even when it is a weekday', () => {
    expect(isWorkingDay('2026-07-09', new Set(['2026-07-09']))).toBe(false)
  })
})

describe('workingDaysBetween', () => {
  it('excludes the start boundary and includes the end', () => {
    // (Wed 08 .. Fri 10] → Thu 09, Fri 10
    expect(workingDaysBetween('2026-07-08', '2026-07-10', noHolidays)).toEqual([
      '2026-07-09',
      '2026-07-10',
    ])
  })

  it('skips weekends and holidays inside the window', () => {
    // (Fri 10 .. Tue 14] → Sat/Sun dropped, Mon 13 holiday dropped, Tue 14 kept
    const holidays = new Set(['2026-07-13'])
    expect(workingDaysBetween('2026-07-10', '2026-07-14', holidays)).toEqual([
      '2026-07-14',
    ])
  })

  it('returns empty for an empty or inverted window', () => {
    expect(workingDaysBetween('2026-07-10', '2026-07-10', noHolidays)).toEqual(
      [],
    )
    expect(workingDaysBetween('2026-07-10', '2026-07-08', noHolidays)).toEqual(
      [],
    )
  })
})

describe('classifyAbsence', () => {
  it('deducts a day while the balance covers it', () => {
    expect(classifyAbsence(15)).toEqual({ type: 'auto-leave', deduct: 1 })
    expect(classifyAbsence(1)).toEqual({ type: 'auto-leave', deduct: 1 })
  })

  it('becomes loss-of-pay when the balance is under a day', () => {
    expect(classifyAbsence(0)).toEqual({ type: 'loss-of-pay', deduct: 0 })
    expect(classifyAbsence(0.5)).toEqual({ type: 'loss-of-pay', deduct: 0 })
  })
})
