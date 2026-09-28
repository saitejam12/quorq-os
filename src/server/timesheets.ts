import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { canApprove, getSessionUser } from '#/server/session'
import { weekEnd, weekStart } from '#/lib/week'
import type { Result } from '#/server/auth'

const dateSchema = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v), 'Expected a YYYY-MM-DD date')

// Sum + count of a week's completed entries for one employee.
async function weekTotals(
  sql: ReturnType<typeof requireDb>,
  employeeId: number,
  ws: string,
  we: string,
): Promise<{ hours: number; entries: number }> {
  const row = (
    await sql`select coalesce(sum(hours_worked),0) hours, count(*) entries
      from time_entries
      where employee_id = ${employeeId} and day between ${ws} and ${we}
        and status = 'completed'`
  )[0] as { hours: string; entries: string }
  return { hours: Number(row.hours), entries: Number(row.entries) }
}

export const submitTimesheet = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ weekStart: dateSchema }).parse(d))
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!me?.employeeId) {
        return { ok: false, error: 'Your account is not linked to an employee record' }
      }
      const ws = weekStart(data.weekStart)
      const we = weekEnd(ws)
      const { hours, entries } = await weekTotals(sql, me.employeeId, ws, we)
      if (entries === 0) {
        return { ok: false, error: 'No entries to submit for this week' }
      }
      const emp = (
        await sql`select name, department from employees where id = ${me.employeeId}`
      )[0] as { name: string; department: string }
      await sql`
        insert into timesheets
          (employee_id, employee_name, department, week_start, hours, entries, status)
        values
          (${me.employeeId}, ${emp.name}, ${emp.department}, ${ws}, ${hours}, ${entries}, 'submitted')
        on conflict (employee_id, week_start) do update set
          hours = excluded.hours, entries = excluded.entries, status = 'submitted',
          review_reason = null, submitted_at = now(), reviewed_at = null, reviewed_by = null`
      return { ok: true, data: null }
    } catch (error) {
      console.error('submitTimesheet failed', error)
      return { ok: false, error: 'Failed to submit timesheet' }
    }
  })

export const requestOvertime = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        day: dateSchema,
        hours: z.number().positive().max(24),
        reason: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!me?.employeeId) {
        return { ok: false, error: 'Your account is not linked to an employee record' }
      }
      const emp = (
        await sql`select name, department from employees where id = ${me.employeeId}`
      )[0] as { name: string; department: string }
      const reason = data.reason?.trim() || null
      await sql`
        insert into overtime_requests (employee_id, employee_name, department, day, hours, reason)
        values (${me.employeeId}, ${emp.name}, ${emp.department}, ${data.day}, ${data.hours}, ${reason})`
      return { ok: true, data: null }
    } catch (error) {
      console.error('requestOvertime failed', error)
      return { ok: false, error: 'Failed to request overtime' }
    }
  })

// Loads a reviewable (submitted) timesheet, enforcing ops+ and no self-review.
async function loadForReview(
  sql: ReturnType<typeof requireDb>,
  id: number,
  reviewerEmployeeId: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = (
    await sql`select employee_id, status from timesheets where id = ${id}`
  )[0] as { employee_id: number; status: string } | undefined
  if (!row) return { ok: false, error: 'Timesheet not found' }
  if (row.status !== 'submitted') {
    return { ok: false, error: 'This timesheet has already been reviewed' }
  }
  if (reviewerEmployeeId != null && row.employee_id === reviewerEmployeeId) {
    return { ok: false, error: 'You cannot review your own timesheet' }
  }
  return { ok: true }
}

export const approveTimesheet = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) {
        return { ok: false, error: 'Only ops and master can review timesheets' }
      }
      const guard = await loadForReview(sql, data.id, me?.employeeId ?? null)
      if (!guard.ok) return guard
      await sql`update timesheets
        set status = 'approved', reviewed_at = now(), reviewed_by = ${me?.name ?? null}
        where id = ${data.id}`
      return { ok: true, data: null }
    } catch (error) {
      console.error('approveTimesheet failed', error)
      return { ok: false, error: 'Failed to approve timesheet' }
    }
  })

export const declineTimesheet = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({ id: z.number().int().positive(), reason: z.string().min(1).max(300) })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) {
        return { ok: false, error: 'Only ops and master can review timesheets' }
      }
      const guard = await loadForReview(sql, data.id, me?.employeeId ?? null)
      if (!guard.ok) return guard
      await sql`update timesheets
        set status = 'declined', review_reason = ${data.reason.trim()},
            reviewed_at = now(), reviewed_by = ${me?.name ?? null}
        where id = ${data.id}`
      return { ok: true, data: null }
    } catch (error) {
      console.error('declineTimesheet failed', error)
      return { ok: false, error: 'Failed to decline timesheet' }
    }
  })

export const closeWeek = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({ employeeId: z.number().int().positive(), weekStart: dateSchema })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) {
        return { ok: false, error: 'Only ops and master can close timesheets' }
      }
      const ws = weekStart(data.weekStart)
      const we = weekEnd(ws)
      const emp = (
        await sql`select name, department from employees where id = ${data.employeeId}`
      )[0] as { name: string; department: string } | undefined
      if (!emp) return { ok: false, error: 'Employee not found' }
      const { hours, entries } = await weekTotals(sql, data.employeeId, ws, we)
      await sql`
        insert into timesheets
          (employee_id, employee_name, department, week_start, hours, entries, status, reviewed_at, reviewed_by)
        values
          (${data.employeeId}, ${emp.name}, ${emp.department}, ${ws}, ${hours}, ${entries}, 'closed', now(), ${me?.name ?? null})
        on conflict (employee_id, week_start) do update set
          status = 'closed', hours = excluded.hours, entries = excluded.entries,
          reviewed_at = now(), reviewed_by = excluded.reviewed_by`
      return { ok: true, data: null }
    } catch (error) {
      console.error('closeWeek failed', error)
      return { ok: false, error: 'Failed to close week' }
    }
  })

// Force-finalise every active employee who has no submission for the week.
export const closeAllOverdue = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ weekStart: dateSchema }).parse(d))
  .handler(async ({ data }): Promise<Result<{ closed: number }>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) {
        return { ok: false, error: 'Only ops and master can close timesheets' }
      }
      const ws = weekStart(data.weekStart)
      const we = weekEnd(ws)
      const rows = await sql.query(
        `insert into timesheets
           (employee_id, employee_name, department, week_start, hours, entries, status, reviewed_at, reviewed_by)
         select e.id, e.name, e.department, $1::date,
           coalesce((select sum(hours_worked) from time_entries t
             where t.employee_id = e.id and t.day between $1 and $2 and t.status = 'completed'), 0),
           coalesce((select count(*) from time_entries t
             where t.employee_id = e.id and t.day between $1 and $2 and t.status = 'completed'), 0),
           'closed', now(), $3
         from employees e
         where e.status = 'active'
           and not exists (select 1 from timesheets ts where ts.employee_id = e.id and ts.week_start = $1)
         returning id`,
        [ws, we, me?.name ?? null],
      )
      return { ok: true, data: { closed: rows.length } }
    } catch (error) {
      console.error('closeAllOverdue failed', error)
      return { ok: false, error: 'Failed to close timesheets' }
    }
  })
