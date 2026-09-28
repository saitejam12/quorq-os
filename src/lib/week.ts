// Pure week-math for timesheets. Weeks run Monday–Sunday. Dates are handled as
// calendar dates at UTC midnight (YYYY-MM-DD) so the math never drifts with the
// machine timezone.

const MS_PER_DAY = 86_400_000

const at = (dateISO: string) => new Date(`${dateISO.slice(0, 10)}T00:00:00Z`)
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// Monday of the given date's week, as 'YYYY-MM-DD'.
export function weekStart(dateISO: string): string {
  const d = at(dateISO)
  const daysSinceMonday = (d.getUTCDay() + 6) % 7 // Sun=6, Mon=0, … Sat=5
  return iso(d.getTime() - daysSinceMonday * MS_PER_DAY)
}

// The Sunday that ends the week beginning at weekStartISO.
export function weekEnd(weekStartISO: string): string {
  return addDays(weekStartISO, 6)
}

export function addDays(dateISO: string, n: number): string {
  return iso(at(dateISO).getTime() + n * MS_PER_DAY)
}

// A timesheet in one of these states is finalised — its owner can no longer edit
// that week's entries.
export function isLocked(status: string | null | undefined): boolean {
  return (
    status === 'submitted' || status === 'approved' || status === 'closed'
  )
}
