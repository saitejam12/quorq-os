# Holiday calendar, auto-leave reconciliation & full clock editing

**Date:** 2026-07-09
**Branch:** fablecode
**Status:** approved

## Summary

Four related time-and-attendance capabilities:

1. **Holiday calendar editor** — a master-only route where holidays for the year
   can be added, edited, and removed.
2. **Upcoming holidays on the landing page** — the currently-static "Upcoming
   Holidays" card becomes data-driven, showing holidays in the next two months.
3. **Auto-leave reconciliation** — working days on which an employee never clocks
   in are automatically converted to leave (loss-of-pay once their balance is
   exhausted), skipping weekends and holidays.
4. **Full clock editing for ops+** — ops and master can edit both the date and
   time of an employee's clock-in and clock-out, not just the clock-in time.

All timestamps remain stored in UTC (`timestamptz`) and are displayed in the
viewer's machine timezone, consistent with the existing time-tracking rule.

## Decisions (locked)

- **Reconciliation trigger:** daily lazy catch-up. A global reconcile job runs
  when any user loads the app, guarded so the expensive scan happens at most once
  per day; plus a manual "Run now" button for master. No Cloudflare cron
  infrastructure. (Chosen over a scheduled Worker, which only runs in production
  and is hard to test, and over manual-only, which isn't automatic.)
- **Zero-balance behavior:** loss of pay, floored at 0. `leave_balance` never
  goes negative; further absences are logged as `loss-of-pay` entries.
- **Non-working days:** Saturday and Sunday, plus any holiday in the calendar.

## Schema changes (`db/init.sql`)

All additions are idempotent (`CREATE TABLE IF NOT EXISTS` /
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`). Per the recurring apply-schema
gotcha, no semicolons in comments and no `DO $$ ... $$` blocks.

```sql
-- Company-wide public holidays, maintained by master on /calendar.
CREATE TABLE IF NOT EXISTS holidays (
    id SERIAL PRIMARY KEY,
    holiday_date DATE NOT NULL UNIQUE,
    name VARCHAR(120) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Generic key/value store for app singletons (first use: reconciliation marker).
CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(64) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Distinguish auto-generated leave rows from manually-created ones.
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'manual';
```

The reconciliation marker is stored as `app_settings('attendance_last_reconciled')`
holding an ISO date string (the last fully-processed working day boundary).

New `leave_requests.type` values used by reconciliation: `auto-leave` (deducted
from balance) and `loss-of-pay` (balance already 0). `source` is `'auto'` for
both.

## Component 1 — Holiday calendar editor

**Route:** `src/routes/_app/calendar.tsx`, master-only via
`beforeLoad: ({ context }) => requireTier(context.user, 'master')`.

**Sidebar:** add `/calendar` to the `RoutePath` union in `AppSidebar.tsx` and a
"Holiday Calendar" leaf under the **Administration** group with `minTier: 'master'`.

**Server** (`src/server/holidays.ts`, all master-guarded except the two reads):

- `getHolidays({ year })` → holidays for the given calendar year, ordered by date.
- `getUpcomingHolidays()` → holidays from today through today + 2 months, ordered
  by date. Readable by any signed-in user (used by the landing card).
- `addHoliday({ date, name })` — master only; upserts on `holiday_date`
  (`ON CONFLICT (holiday_date) DO UPDATE`) so a re-add edits the name.
- `updateHoliday({ id, date, name })` — master only.
- `deleteHoliday({ id })` — master only.

All mutating fns return `Result<T>` and re-verify tier from the session
(`getSessionUser` + `hasTier(..., 'master')`), matching the existing server-fn
contract.

**UI:** a year selector (defaults to the current year), an "Add holiday" form
(date + name), and the year's holidays grouped by month in a simple list/table
with edit and delete actions per row. A master-only **"Run reconciliation now"**
button lives here too (calls `reconcileAttendance()` and reports how many days /
entries it processed).

## Component 2 — Upcoming holidays card

`src/components/dashboards/BasicDashboard.tsx` currently renders a static
"Upcoming Holidays" placeholder. It becomes a client component that calls
`getUpcomingHolidays()` via `useQuery` (mirroring `MasterDashboard`) and lists
each holiday's name and formatted date. When the list is empty it keeps the
existing palm-tree empty state. The "Review" card in the same section is
unchanged.

## Component 3 — Auto-leave reconciliation

**Pure logic** (`src/lib/attendance.ts`, unit-tested, no DB):

- `isWorkingDay(date, holidaySet)` → `false` for Saturday/Sunday or any date in
  `holidaySet` (a `Set<string>` of `YYYY-MM-DD`), else `true`.
- `workingDaysBetween(startExclusive, endInclusive, holidaySet)` → ordered array
  of `YYYY-MM-DD` working days. Dates handled as calendar dates (UTC midnight) to
  avoid timezone drift.
- `classifyAbsence(balance)` → `{ type: 'auto-leave', deduct: 1 }` when
  `balance >= 1`, else `{ type: 'loss-of-pay', deduct: 0 }`. (Fractional balances
  below 1 are treated as exhausted → LOP, keeping balance ≥ 0.)

**Server** (`src/server/attendance.ts`):

`reconcileAttendance()` — `Result<{ daysProcessed: number; entriesCreated: number }>`:

1. Read `app_settings('attendance_last_reconciled')`. If missing, initialize the
   marker to yesterday and process nothing (avoids a first-run backfill over the
   entire seeded history). Store the initialized marker.
2. Compute the target window: `(marker, yesterday]` — the day after the marker
   through yesterday inclusive. Today is never processed (the workday isn't over).
   If the window is empty, return early `{ daysProcessed: 0, entriesCreated: 0 }`
   without scanning employees — this is the cheap guard hit on every app load.
3. Load the holiday set (all holidays; the window is small). Compute working days
   in the window via `workingDaysBetween`.
4. For each working day, for each **active** employee
   (`status = 'active'`) whose `date_of_joining <= day`:
   - Skip if a `time_entries` row exists for that employee+day (they clocked in).
   - Skip if an approved `leave_requests` row already covers that day
     (`start_date <= day <= coalesce(end_date, start_date)` and
     `status = 'approved'`).
   - Otherwise record an absence:
     - `classifyAbsence(current balance)` → type + deduct.
     - Insert a `leave_requests` row: `source='auto'`, the classified `type`,
       `days = 1`, `start_date = end_date = day`, `status = 'approved'`,
       `reason = 'Auto: no clock-in'`.
     - `UPDATE employees SET leave_balance = GREATEST(leave_balance - deduct, 0)`.
     - Upsert `attendance_records` for employee+day: `status = 'leave'` when
       deducted, `status = 'absent'` when LOP (insert if missing, else update).
5. Advance the marker to `yesterday` and return the counts.

Idempotency comes from (a) the marker only moving forward, and (b) the per-day
existence checks, so a partially-completed or repeated run cannot double-deduct.

**Trigger:** in `src/routes/_app.tsx` `beforeLoad`, after resolving the user,
`await reconcileAttendance()` (fire-and-forget semantics are not needed; the
early-return guard makes it a single cheap query on all but the first load of the
day). Any thrown error is caught and ignored so reconciliation can never block
app access. Master's manual button on `/calendar` calls the same fn.

## Component 4 — Full clock editing for ops+

**Server** (`src/server/time.ts`): replace `editClockIn` with
`editTimeEntry`:

```ts
editTimeEntry({ entryId: number, clockIn: string, clockOut: string | null })
```

- ops+ only (`canApprove`), returns `Result<null>`.
- Both `clockIn` and `clockOut` are absolute ISO instants; `clockOut` null for a
  still-open entry.
- Validates `clockIn < clockOut` when `clockOut` is present.
- Sets `clock_in`, `clock_out`, recomputes `hours_worked` via `hoursBetween` (or
  leaves it 0 and status `active` when `clockOut` is null), and sets `day` to the
  UTC date of `clockIn` so an entry moved to another date lands on the right day.

**UI** (`src/routes/_app/time.tsx`): the `EditClockInOutModal`'s two time-only
inputs become two `datetime-local` inputs (clock-in and clock-out), pre-filled
from the entry's instants in machine-local time. On save, each value is converted
to a UTC ISO instant (`new Date(value).toISOString()`) and sent to
`editTimeEntry`. Clock-out may be cleared to reopen an entry. Existing
invalidation (`router.invalidate()`) refreshes the page.

## Seed data (`scripts/seed-people.mjs`)

- Seed ~10–12 `holidays` across the current year (a mix of past and upcoming,
  including at least one within the next two months so the landing card is
  non-empty).
- Initialize `app_settings('attendance_last_reconciled')` to yesterday so the
  seeded environment doesn't trigger a large first-run backfill.
- Add a few `source='auto'` leave rows (`auto-leave` and one `loss-of-pay`) so the
  leave and attendance screens show realistic auto-generated entries.

## Testing & verification

- Unit tests (`src/lib/attendance.test.ts`): `isWorkingDay` (weekend + holiday),
  `workingDaysBetween` (range boundaries, weekend/holiday exclusion, empty
  window), `classifyAbsence` (balance ≥ 1 vs 0 vs fractional).
- Unit test for the clock-in < clock-out validation used by `editTimeEntry`.
- `pnpm test`, `pnpm lint`, and `tsc --noEmit` clean on touched files.
- Live SQL smoke checks: apply schema, run a reconcile over a seeded gap, confirm
  leave_requests/attendance/leave_balance update once and are idempotent on a
  second run.

## Out of scope

- Per-location or per-employee holiday calendars (company-wide only).
- Configurable weekly-off patterns (fixed Saturday+Sunday).
- Cloudflare cron / scheduled Workers.
- Notifying employees when an absence is auto-converted.
