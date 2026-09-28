# Time tracking → self-service weekly timesheets, overtime & approval

**Date:** 2026-09-26
**Branch:** feat/timesheets (off payroll)
**Status:** approved (scope: full clone of the deployed /time)

## Summary

Recreate, in code, the full `/time` timesheet subsystem that exists on the
deployed app (a manual Cloudflare upload) but was never committed to git. It
extends today's clock in/out with: a **self-service weekly editable timesheet**
(any user edits their **own** entries for the week, files missing entries, and
requests overtime), **submit-for-approval**, an **ops+ review queue**
(approve/decline), **close-week** finalisation for non-submitters, an **auto
clock-out after 8h**, and **time-entry history**.

Stack note: this branch uses **node-postgres** via the `SqlClient` adapter in
`src/db.ts` — same tagged-template `sql` surface as before, plus
`sql.query(text, params)` and `sql.transaction([...])`. Coding model unchanged.

## Data model (`db/init.sql`, idempotent; no `;` in comments, no `DO` blocks)

```sql
-- One submission per employee per ISO week (Mon-anchored week_start).
CREATE TABLE IF NOT EXISTS timesheets (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    employee_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    week_start DATE NOT NULL,
    hours NUMERIC(6,2) NOT NULL DEFAULT 0,
    entries INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(16) NOT NULL DEFAULT 'submitted', -- submitted|approved|declined|closed
    review_reason VARCHAR(300),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(120),
    UNIQUE (employee_id, week_start)
);

CREATE TABLE IF NOT EXISTS overtime_requests (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id),
    employee_name VARCHAR(120) NOT NULL,
    department VARCHAR(64) NOT NULL,
    day DATE NOT NULL,
    hours NUMERIC(4,1) NOT NULL,
    reason VARCHAR(300),
    status VARCHAR(16) NOT NULL DEFAULT 'pending', -- pending|approved|declined
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by VARCHAR(120)
);
```

`time_entries` is unchanged (id, employee_id, employee_name, department, day,
clock_in/out timestamptz, hours_worked, status).

**Week = Monday–Sunday.** `week_start` is the Monday (UTC calendar date).

**Editability:** a week is editable by its owner unless its timesheet status is
`submitted`, `approved`, or `closed`. `declined` (or no row) → editable again.

## Pure logic (`src/lib/week.ts`, unit-tested)

- `weekStart(dateISO): string` — Monday of that date's week, `YYYY-MM-DD` (UTC).
- `weekEnd(weekStartISO): string` — the Sunday.
- `addDays(dateISO, n): string`.
- `isLocked(status): boolean` — true for submitted|approved|closed.

Reuses `hoursBetween` from `src/lib/time.ts`.

## Server functions

**`src/server/time.ts` (extend):**
- Keep `getMyClock`, `clockIn`, `clockOut`, `editTimeEntry` (ops team edit).
- **Auto clock-out after 8h:** a helper `autoCloseStale(sql, employeeId)` closes
  any of the caller's active sessions where `now - clock_in >= 8h`, setting
  `clock_out = clock_in + interval '8 hours'`, `hours_worked = 8`,
  `status = 'completed'`. Called at the top of `getTimeTracking` and before
  `clockIn` opens a new session.
- **`editOwnEntry({ entryId, clockIn, clockOut })`** — self. Entry must belong to
  the caller's `employeeId` and its week must be unlocked; otherwise reject. Same
  in<out validation + `hours_worked`/`day` recompute as `editTimeEntry`.
- **`fileEntry({ day, clockIn, clockOut })`** — self. Insert a completed
  `time_entries` row for the caller (week must be unlocked); `clockIn`/`clockOut`
  are ISO instants, `day` from `clockIn`.
- **`getTimeTracking` (expand)** returns, in addition to today/team/myWeekHours:
  - `week`: `{ weekStart, weekEnd, editable, submission: {status, reviewReason}|null,
    hours, entries: [{ id, day, clockIn, clockOut, hours, status }] }`
  - `history`: last ~43 completed entries `{ day, clockIn, clockOut, hours }`
  - `myOvertime`: last 30 `{ day, hours, reason, status }`
  - `review` (ops+ only): `{ toReview: [{id, employeeName, department, weekStart,
    hours, entries}], notSubmitted: [{employeeId, employeeName, department,
    weekStart, hoursLogged}], overdueCount }`

**`src/server/timesheets.ts` (new):**
- `submitTimesheet({ weekStart })` — self. Aggregate the week's entries
  (sum hours, count); reject if none; upsert `timesheets` to `submitted`
  (`ON CONFLICT (employee_id, week_start)` → reset to submitted, clear review).
- `requestOvertime({ day, hours, reason })` — self. Insert `overtime_requests`.
- `approveTimesheet({ id })` / `declineTimesheet({ id, reason })` — ops+, not the
  caller's own; set status + reviewer + timestamp; decline stores reason and
  reopens editing.
- `closeWeek({ employeeId, weekStart })` — ops+. Upsert a `closed` timesheet for a
  non-submitter (force finalise), snapshotting hours/entries.
- `closeAllOverdue({ weekStart })` — ops+. Close every active employee with no
  submission for that week (the banner "Close timesheets"); runs as one
  `sql.transaction`.

All return `Result<T>`, resolve caller via `getSessionUser()`, gate ops actions
on `canApprove`.

## UI (`src/routes/_app/time.tsx`, rewrite to match deployed)

Loader stays `getTimeTracking()`. Sections, top→bottom:
1. Two banners: self "timesheet due → Submit for approval" (when current week
   unlocked & has entries), and ops "N haven't submitted → Close timesheets".
2. KPI row: Today (ClockWidget), My hours this week (+ "Auto clock-out after 8h"),
   Team sessions today.
3. **This week · editable** card: per-entry rows with a self **Edit** (reuses the
   datetime-local modal, now calling `editOwnEntry`), plus **Submit for approval**,
   **Request overtime** (modal: day/hours/reason), **File entry** (modal:
   day + in/out). Locked weeks show a status badge and hide edit controls.
4. **Time entry history** + **My overtime requests** (two-column).
5. Ops+: **Timesheets to review** (Approve / Decline-with-reason), **Not submitted
   this week** (Close week per row), **Team activity today** (existing, ops Edit).

Modals follow the existing `EditClockInOutModal` pattern; mutations call the server
fn then `router.invalidate()`.

## Seed (`scripts/seed-people.mjs`)

Clear `timesheets` + `overtime_requests`. Seed a few submitted timesheets (past
weeks) for a couple of employees, one declined, and 1–2 pending overtime requests,
so the review queue and history are populated.

## Testing & verification

- `src/lib/week.test.ts` — weekStart across weekdays incl. Sunday/Monday edges,
  weekEnd, addDays, isLocked.
- `vitest run`, `eslint`, `tsc --noEmit` clean (expect the known `/settings`
  sidebar errors only if present on this branch).
- Live SQL smoke via a root `.mjs` (resolve DATABASE_URL like `db-url.mjs`):
  submit → appears in review → approve applies status; file entry + editOwnEntry
  respect the lock; close-week finalises a non-submitter. Delete the script after.

## Out of scope

- Overtime approval affecting payroll totals (just tracked/listed).
- Per-session (multi-clock) rollup in the weekly row — one row per `time_entries`
  entry (seed is one/day).
- Notifications beyond on-page banners.
