# Time Tracking — Multi-session, ops Edit, UTC — Design Spec

**Date:** 2026-07-08
**Status:** Approved
**Branch:** fablecode
**Sub-project:** refinement of the Time Tracking module

## Goal

Three changes to `/time`:

1. An employee can **clock in and out any number of times per day** (each in/out
   pair is its own `time_entries` row).
2. **ops+ can edit the clock-in time** of an employee's entry.
3. Timestamps are **stored in UTC**; the UI **displays them in the viewer's
   machine timezone**.

## Timezone: store UTC, display machine-local

`time_entries.clock_in` and `clock_out` become **`TIMESTAMPTZ`** instead of
`TIMESTAMP`. A `timestamptz` column stores an absolute instant (UTC internally);
the Neon driver returns it as an ISO string carrying the offset, and the existing
UI helper `new Date(iso).toLocaleTimeString('en-US', …)` renders it in the
browser's local timezone with no extra code. Writes keep using `now()`, which is
the correct instant.

### Migration (idempotent, apply-schema-safe)

`scripts/apply-schema.mjs` splits `db/init.sql` on `;`, so no `DO $$…$$` blocks
(their inner `;` would break). The change is expressed as:

- `CREATE TABLE` for `time_entries` uses `TIMESTAMPTZ` for the two columns
  (correct for fresh databases).
- Two standalone statements convert an existing table:

  ```sql
  ALTER TABLE time_entries ALTER COLUMN clock_in  TYPE timestamptz USING clock_in::timestamptz;
  ALTER TABLE time_entries ALTER COLUMN clock_out TYPE timestamptz USING clock_out::timestamptz;
  ```

  These are single statements, safe to re-run (a no-op cast once the column is
  already `timestamptz`). Neon's session timezone is UTC and the existing naive
  values were written under it (via `now()` cast to `timestamp`), so
  `::timestamptz` interprets them as UTC — lossless.

The client, when editing a time, sends `new Date(localValue).toISOString()` (a
UTC instant with a `Z`), so the server never does timezone math.

## Multiple clock in/out per day

- **`clockIn`** — drop the "Already clocked in today" check. Reject only when the
  employee has an **open** session (`clock_out IS NULL`) today, with the message
  "You're already clocked in — clock out first." Otherwise insert a new
  `time_entries` row (`status = 'active'`, `clock_in = now()`). The
  attendance-record cascade (first activity marks the day `present`) is unchanged.
- **`clockOut`** — unchanged: closes the open session, sets `clock_out = now()`,
  `hours_worked`, `status = 'completed'`.

A day therefore holds any number of completed sessions plus at most one open one.

## `getTimeTracking` response shape

`myToday` is reshaped from a single latest row to a summary of the day:

```ts
today: {
  active: boolean // an open session exists
  activeSince: string | null // clock_in ISO of the open session
  hoursToday: number // sum of hours_worked for today's entries
  sessions: Array<{
    id: number
    clockIn: string | null
    clockOut: string | null
    hours: number
    status: string
  }>
}
```

`myRecent` (recent days) and `myWeekHours` are unchanged. `team.entries` gains an
`id` field (needed for the ops edit action). `team` still lists today's entries
(now potentially several per employee).

## Server function: `editClockIn` (ops+)

`editClockIn({ entryId: number, clockIn: string })`:

- ops+ only (`canApprove`), else forbidden.
- `clockIn` is an ISO-8601 string (validated with `z.string().datetime()`).
- Loads the entry; if missing → error.
- If the entry has a `clock_out` and the new `clock_in` is **after** it → reject
  ("Clock-in must be before clock-out").
- Updates `clock_in`; if `clock_out` is present, recomputes `hours_worked` from
  the two instants. Returns `Result<null>`.

## Pure helper: `src/lib/time.ts`

- `hoursBetween(inISO: string, outISO: string): number` — whole-hours-to-2-dp
  difference, matching the SQL `round(epoch/3600, 2)`; returns `0` if `out` is not
  after `in`. Used by `editClockIn` for the recompute and unit-tested.

## UI (`src/routes/_app/time.tsx`)

- **Today card:** when `active`, shows "Clocked in since {activeSince}" and a red
  **Clock out** button; otherwise shows "{hoursToday} hrs today" and a green
  **Clock in** button. The button is **always enabled** (no "Day complete" lock).
- **Today's sessions:** a small list under the card — each session's in / out /
  hours (in machine time). Shown only when there is at least one session.
- **Team activity today (ops+):** each row gets an **Edit** button opening a small
  popup (reusing the modal pattern) with a `type="time"` input pre-filled from the
  entry's clock-in in machine time. On save it combines the entry's day with the
  chosen time, converts to an ISO instant, and calls `editClockIn`, then
  `router.invalidate()`. Editing is clock-in only and scoped to today's entries.

The `fmtTime` helper is unchanged (it already renders machine-local time).

## Seed (`scripts/seed-people.mjs`)

Time-entry rows insert `clock_in` / `clock_out` as explicit UTC instants (append
`Z` / use `timestamptz` literals) so seeded demo times are unambiguous. To
exercise the new multi-session behaviour, a subset of employees get **two**
sessions today (a morning and an afternoon block); some remain a single open
session (`status = 'active'`).

## Testing

- Unit-test `hoursBetween` (normal span, sub-hour rounding, `out ≤ in` → 0).
- `pnpm test`, `pnpm lint`, `pnpm generate-routes`, `tsc --noEmit` stay clean;
  SQL validated by `apply-schema` + `seed:people`; a live check confirms the
  columns are `timestamptz`, multi-session insert/close works, and `editClockIn`
  recomputes hours.

## Out of scope

- Editing clock-**out** time, deleting entries, or adding entries manually.
- A per-employee historical timesheet editor beyond today's team table.
- Overtime/break rules or rounding policies beyond hours = out − in.
