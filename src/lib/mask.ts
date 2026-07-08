// Masks all but the last `visible` characters of a value with bullets, for
// displaying sensitive data (account numbers, Aadhaar) to their own owner.
// Returns an em-dash placeholder for empty values. Values no longer than the
// visible window are returned unchanged (nothing meaningful to hide).
export function mask(value: string | null | undefined, visible = 4): string {
  if (!value) return '—'
  if (value.length <= visible) return value
  const shown = value.slice(-visible)
  return '•'.repeat(value.length - visible) + shown
}
