// Whole-hours difference between two ISO instants, rounded to 2 decimals to
// match the SQL `round(extract(epoch from (out - in)) / 3600, 2)`. Returns 0 when
// `out` is not strictly after `in` (e.g. an open session or an invalid edit).
export function hoursBetween(inISO: string, outISO: string): number {
  const start = Date.parse(inISO)
  const end = Date.parse(outISO)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.round(((end - start) / 3_600_000) * 100) / 100
}
