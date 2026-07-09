// Pure date/attendance logic for auto-leave reconciliation. Dates are handled as
// calendar dates in UTC (YYYY-MM-DD, parsed at UTC midnight) so weekend and range
// math never drifts with the machine timezone.

export type AbsenceType = 'auto-leave' | 'loss-of-pay'

const MS_PER_DAY = 86_400_000

// A holiday set is a Set of 'YYYY-MM-DD' strings.
export function isWorkingDay(day: string, holidays: Set<string>): boolean {
  if (holidays.has(day)) return false
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay()
  return dow !== 0 && dow !== 6 // 0 = Sunday, 6 = Saturday
}

// Ordered 'YYYY-MM-DD' working days in (startExclusive, endInclusive]. Returns an
// empty array when the window is empty or inverted.
export function workingDaysBetween(
  startExclusive: string,
  endInclusive: string,
  holidays: Set<string>,
): Array<string> {
  const days: Array<string> = []
  let cursor = new Date(`${startExclusive}T00:00:00Z`).getTime() + MS_PER_DAY
  const end = new Date(`${endInclusive}T00:00:00Z`).getTime()
  while (cursor <= end) {
    const day = new Date(cursor).toISOString().slice(0, 10)
    if (isWorkingDay(day, holidays)) days.push(day)
    cursor += MS_PER_DAY
  }
  return days
}

// A whole day of leave is deducted while the balance can cover it; once it can't
// (balance < 1), the absence is loss-of-pay and nothing is deducted, so the
// balance never goes negative.
export function classifyAbsence(balance: number): {
  type: AbsenceType
  deduct: number
} {
  return balance >= 1
    ? { type: 'auto-leave', deduct: 1 }
    : { type: 'loss-of-pay', deduct: 0 }
}
