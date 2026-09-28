import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser, canApprove } from '#/server/session'
import type { Result } from '#/server/auth'
import { hoursBetween } from '#/lib/time'
import { isLocked, weekEnd, weekStart } from '#/lib/week'

const n = (v: unknown) => Number(v ?? 0)
const todayIso = () => new Date().toISOString().slice(0, 10)

// Auto clock-out after 8h: close any of the employee's still-open sessions that
// have been running 8 hours or more, at clock_in + 8h. Lazy — runs on read and
// before a new clock-in.
async function autoCloseStale(
  sql: ReturnType<typeof requireDb>,
  employeeId: number,
): Promise<void> {
  await sql`update time_entries
    set clock_out = clock_in + interval '8 hours', hours_worked = 8, status = 'completed'
    where employee_id = ${employeeId} and status = 'active' and clock_out is null
      and now() - clock_in >= interval '8 hours'`
}

export const getTimeTracking = createServerFn({ method: 'GET' }).handler(
  async () => {
    const sql = requireDb()
    const me = await getSessionUser()
    const empId = me?.employeeId ?? null
    const today = todayIso()
    const ws = weekStart(today)
    const we = weekEnd(ws)

    let sessions: Array<any> = []
    let weekEntries: Array<any> = []
    let history: Array<any> = []
    let overtime: Array<any> = []
    let submission: { status: string; review_reason: string | null } | undefined
    let myWeekHours = 0
    if (empId) {
      await autoCloseStale(sql, empId)
      sessions =
        (await sql`select id, clock_in, clock_out, hours_worked, status from time_entries
      where employee_id = ${empId} and day = ${today} order by id`) as Array<any>
      weekEntries =
        (await sql`select id, day::text as day, clock_in, clock_out, hours_worked, status
      from time_entries where employee_id = ${empId} and day between ${ws} and ${we}
      order by day, id`) as Array<any>
      history =
        (await sql`select day::text as day, clock_in, clock_out, hours_worked
      from time_entries where employee_id = ${empId} and status = 'completed'
      order by day desc, id desc limit 43`) as Array<any>
      overtime =
        (await sql`select day::text as day, hours, reason, status
      from overtime_requests where employee_id = ${empId}
      order by created_at desc limit 30`) as Array<any>
      submission = (
        await sql`select status, review_reason from timesheets
      where employee_id = ${empId} and week_start = ${ws}`
      )[0] as { status: string; review_reason: string | null } | undefined
      myWeekHours = n(
        (
          await sql`select coalesce(sum(hours_worked),0) s from time_entries
        where employee_id = ${empId} and day between ${ws} and ${we} and status = 'completed'`
        )[0].s,
      )
    }

    const openSession =
      sessions.find((s) => s.clock_out == null && s.status === 'active') ?? null
    const hoursToday = sessions.reduce(
      (sum, s) => sum + Number(s.hours_worked),
      0,
    )
    const weekHours = weekEntries.reduce((sum, e) => sum + Number(e.hours_worked), 0)

    const teamCounts = (await sql`
    select count(*) total,
      count(*) filter (where status='active') active,
      count(*) filter (where status='completed') completed,
      coalesce(sum(hours_worked),0) hours
    from time_entries where day = ${today}`) as Array<any>
    const team = (await sql`
    select id, employee_name, department, clock_in, clock_out, hours_worked, status
    from time_entries where day = ${today} order by clock_in desc limit 20`) as Array<any>

    // ops+ review data: submitted timesheets awaiting review + this week's non-submitters.
    let review: {
      toReview: Array<{
        id: number
        employeeName: string
        department: string
        weekStart: string
        hours: number
        entries: number
      }>
      notSubmitted: Array<{
        employeeId: number
        employeeName: string
        department: string
        weekStart: string
        hoursLogged: number
      }>
      overdueCount: number
    } | null = null
    if (canApprove(me)) {
      const toReview = (await sql`
      select id, employee_name, department, week_start::text as week_start, hours, entries
      from timesheets where status = 'submitted' order by submitted_at`) as Array<any>
      const notSubmitted = (await sql`
      select e.id, e.name, e.department, coalesce(sum(t.hours_worked),0) hours_logged
      from employees e
      left join time_entries t
        on t.employee_id = e.id and t.day between ${ws} and ${we} and t.status = 'completed'
      where e.status = 'active'
        and not exists (select 1 from timesheets ts where ts.employee_id = e.id and ts.week_start = ${ws})
      group by e.id, e.name, e.department
      order by e.name limit 50`) as Array<any>
      review = {
        toReview: toReview.map((r) => ({
          id: r.id as number,
          employeeName: r.employee_name,
          department: r.department,
          weekStart: r.week_start,
          hours: Number(r.hours),
          entries: Number(r.entries),
        })),
        notSubmitted: notSubmitted.map((r) => ({
          employeeId: r.id as number,
          employeeName: r.name,
          department: r.department,
          weekStart: ws,
          hoursLogged: Math.round(Number(r.hours_logged) * 10) / 10,
        })),
        overdueCount: notSubmitted.length,
      }
    }

    return {
      hasProfile: !!empId,
      today: {
        active: !!openSession,
        activeSince: openSession
          ? (openSession.clock_in as string | null)
          : null,
        hoursToday: Math.round(hoursToday * 10) / 10,
        sessions: sessions.map((s) => ({
          id: s.id as number,
          clockIn: s.clock_in as string | null,
          clockOut: s.clock_out as string | null,
          hours: Number(s.hours_worked),
          status: s.status as string,
        })),
      },
      myWeekHours: Math.round(myWeekHours * 10) / 10,
      week: {
        weekStart: ws,
        weekEnd: we,
        editable: !isLocked(submission?.status),
        submission: submission
          ? { status: submission.status, reviewReason: submission.review_reason }
          : null,
        hours: Math.round(weekHours * 10) / 10,
        entries: weekEntries.map((e) => ({
          id: e.id as number,
          day: e.day as string,
          clockIn: e.clock_in as string | null,
          clockOut: e.clock_out as string | null,
          hours: Number(e.hours_worked),
          status: e.status as string,
        })),
      },
      history: history.map((r) => ({
        day: r.day as string,
        clockIn: r.clock_in as string | null,
        clockOut: r.clock_out as string | null,
        hours: Number(r.hours_worked),
      })),
      myOvertime: overtime.map((r) => ({
        day: r.day as string,
        hours: Number(r.hours),
        reason: (r.reason as string | null) ?? '',
        status: r.status as string,
      })),
      team: {
        total: n(teamCounts[0].total),
        active: n(teamCounts[0].active),
        completed: n(teamCounts[0].completed),
        hours: Math.round(n(teamCounts[0].hours) * 10) / 10,
        entries: team.map((t) => ({
          id: t.id as number,
          name: t.employee_name,
          department: t.department,
          clockIn: t.clock_in,
          clockOut: t.clock_out,
          hours: Number(t.hours_worked),
          status: t.status,
        })),
      },
      review,
    }
  },
)

// Just the signed-in user's own clock state for today — powers the embeddable
// ClockWidget, which can live on any page (no team/analytics queries needed).
export const getMyClock = createServerFn({ method: 'GET' }).handler(
  async () => {
    const sql = requireDb()
    const me = await getSessionUser()
    const empId = me?.employeeId ?? null
    const today = todayIso()

    if (!empId) {
      return {
        hasProfile: false,
        active: false,
        activeSince: null as string | null,
        hoursToday: 0,
        sessions: [] as Array<{
          id: number
          clockIn: string | null
          clockOut: string | null
          hours: number
          status: string
        }>,
      }
    }

    const sessions =
      (await sql`select id, clock_in, clock_out, hours_worked, status from time_entries
    where employee_id = ${empId} and day = ${today} order by id`) as Array<any>
    const openSession =
      sessions.find((s) => s.clock_out == null && s.status === 'active') ?? null
    const hoursToday = sessions.reduce(
      (sum, s) => sum + Number(s.hours_worked),
      0,
    )

    return {
      hasProfile: true,
      active: !!openSession,
      activeSince: openSession ? (openSession.clock_in as string | null) : null,
      hoursToday: Math.round(hoursToday * 10) / 10,
      sessions: sessions.map((s) => ({
        id: s.id as number,
        clockIn: s.clock_in as string | null,
        clockOut: s.clock_out as string | null,
        hours: Number(s.hours_worked),
        status: s.status as string,
      })),
    }
  },
)

export const clockIn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<Result<null>> => {
    const sql = requireDb()
    const me = await getSessionUser()
    if (!me?.employeeId)
      return { ok: false, error: 'No employee profile linked to this account' }
    const today = todayIso()
    await autoCloseStale(sql, me.employeeId)

    // Only one session may be open at a time; completed sessions don't block a new one.
    const open = (
      await sql`select id from time_entries
      where employee_id = ${me.employeeId} and day = ${today} and clock_out is null and status = 'active' limit 1`
    )[0] as { id: number } | undefined
    if (open)
      return { ok: false, error: "You're already clocked in — clock out first" }

    const emp = (
      await sql`select name, department from employees where id = ${me.employeeId}`
    )[0] as {
      name: string
      department: string
    }
    await sql`insert into time_entries (employee_id, employee_name, department, day, clock_in, status)
      values (${me.employeeId}, ${emp.name}, ${emp.department}, ${today}, now(), 'active')`
    // cascade -> attendance_records (analytics) marks present for today
    const att = (
      await sql`select id from attendance_records where employee_id = ${me.employeeId} and day = ${today} limit 1`
    )[0] as { id: number } | undefined
    if (att) {
      await sql`update attendance_records set status='present' where id = ${att.id}`
    } else {
      await sql`insert into attendance_records (employee_id, department, day, status)
        values (${me.employeeId}, ${emp.department}, ${today}, 'present')`
    }
    return { ok: true, data: null }
  },
)

export const clockOut = createServerFn({ method: 'POST' }).handler(
  async (): Promise<Result<null>> => {
    const sql = requireDb()
    const me = await getSessionUser()
    if (!me?.employeeId)
      return { ok: false, error: 'No employee profile linked' }
    const today = todayIso()
    const entry = (
      await sql`select id from time_entries
      where employee_id = ${me.employeeId} and day = ${today} and status='active' order by id desc limit 1`
    )[0] as { id: number } | undefined
    if (!entry) return { ok: false, error: 'You are not clocked in' }
    await sql`update time_entries
      set clock_out = now(),
          hours_worked = round(extract(epoch from (now() - clock_in))/3600.0, 2),
          status = 'completed'
      where id = ${entry.id}`
    return { ok: true, data: null }
  },
)

// ops+: correct the clock-in and clock-out of a time entry. The client sends
// absolute ISO instants, so the timestamptz columns store the correct UTC values
// directly; `clockOut` is null for a still-open entry. `day` follows the
// clock-in's UTC date so an entry moved to another date lands there.
export const editTimeEntry = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        entryId: z.number().int().positive(),
        clockIn: z
          .string()
          .refine((v) => Number.isFinite(Date.parse(v)), 'Invalid timestamp'),
        clockOut: z
          .string()
          .refine((v) => Number.isFinite(Date.parse(v)), 'Invalid timestamp')
          .nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me))
        return { ok: false, error: 'Only ops and master can edit time entries' }

      const entry = (
        await sql`select id from time_entries where id = ${data.entryId}`
      )[0] as { id: number } | undefined
      if (!entry) return { ok: false, error: 'Time entry not found' }

      const day = new Date(data.clockIn).toISOString().slice(0, 10)

      if (data.clockOut != null) {
        if (Date.parse(data.clockIn) >= Date.parse(data.clockOut)) {
          return { ok: false, error: 'Clock-in must be before clock-out' }
        }
        const hours = hoursBetween(data.clockIn, data.clockOut)
        await sql`update time_entries
          set clock_in = ${data.clockIn}, clock_out = ${data.clockOut},
              hours_worked = ${hours}, status = 'completed', day = ${day}
          where id = ${data.entryId}`
      } else {
        await sql`update time_entries
          set clock_in = ${data.clockIn}, clock_out = null,
              hours_worked = 0, status = 'active', day = ${day}
          where id = ${data.entryId}`
      }
      return { ok: true, data: null }
    } catch (error) {
      console.error('editTimeEntry failed', error)
      return { ok: false, error: 'Failed to update time entry' }
    }
  })

// True when the employee's timesheet for the week containing `dayISO` is locked
// (submitted/approved/closed) — self edits to that week are then refused.
async function weekLocked(
  sql: ReturnType<typeof requireDb>,
  employeeId: number,
  dayISO: string,
): Promise<boolean> {
  const row = (
    await sql`select status from timesheets
      where employee_id = ${employeeId} and week_start = ${weekStart(dayISO)}`
  )[0] as { status: string } | undefined
  return isLocked(row?.status)
}

// Self-service: an employee edits their OWN entry's clock-in/out (date + time),
// as long as that week isn't submitted/approved/closed. `clockOut` null reopens it.
export const editOwnEntry = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        entryId: z.number().int().positive(),
        clockIn: z
          .string()
          .refine((v) => Number.isFinite(Date.parse(v)), 'Invalid timestamp'),
        clockOut: z
          .string()
          .refine((v) => Number.isFinite(Date.parse(v)), 'Invalid timestamp')
          .nullable(),
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
      const entry = (
        await sql`select id, employee_id, day::text as day from time_entries where id = ${data.entryId}`
      )[0] as { id: number; employee_id: number; day: string } | undefined
      if (!entry) return { ok: false, error: 'Time entry not found' }
      if (entry.employee_id !== me.employeeId) {
        return { ok: false, error: 'You can only edit your own entries' }
      }
      const newDay = new Date(data.clockIn).toISOString().slice(0, 10)
      if (
        (await weekLocked(sql, me.employeeId, entry.day)) ||
        (await weekLocked(sql, me.employeeId, newDay))
      ) {
        return { ok: false, error: 'This week is locked — the timesheet is submitted or finalised' }
      }

      if (data.clockOut != null) {
        if (Date.parse(data.clockIn) >= Date.parse(data.clockOut)) {
          return { ok: false, error: 'Clock-in must be before clock-out' }
        }
        const hours = hoursBetween(data.clockIn, data.clockOut)
        await sql`update time_entries
          set clock_in = ${data.clockIn}, clock_out = ${data.clockOut},
              hours_worked = ${hours}, status = 'completed', day = ${newDay}
          where id = ${data.entryId}`
      } else {
        await sql`update time_entries
          set clock_in = ${data.clockIn}, clock_out = null,
              hours_worked = 0, status = 'active', day = ${newDay}
          where id = ${data.entryId}`
      }
      return { ok: true, data: null }
    } catch (error) {
      console.error('editOwnEntry failed', error)
      return { ok: false, error: 'Failed to update entry' }
    }
  })

// Self-service: file a missing (completed) entry for a past/current day in an
// unlocked week. Both instants required; `day` follows the clock-in date.
export const fileEntry = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        clockIn: z
          .string()
          .refine((v) => Number.isFinite(Date.parse(v)), 'Invalid timestamp'),
        clockOut: z
          .string()
          .refine((v) => Number.isFinite(Date.parse(v)), 'Invalid timestamp'),
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
      if (Date.parse(data.clockIn) >= Date.parse(data.clockOut)) {
        return { ok: false, error: 'Clock-in must be before clock-out' }
      }
      const day = new Date(data.clockIn).toISOString().slice(0, 10)
      if (await weekLocked(sql, me.employeeId, day)) {
        return { ok: false, error: 'This week is locked — the timesheet is submitted or finalised' }
      }
      const emp = (
        await sql`select name, department from employees where id = ${me.employeeId}`
      )[0] as { name: string; department: string }
      const hours = hoursBetween(data.clockIn, data.clockOut)
      await sql`insert into time_entries
        (employee_id, employee_name, department, day, clock_in, clock_out, hours_worked, status)
        values (${me.employeeId}, ${emp.name}, ${emp.department}, ${day}, ${data.clockIn}, ${data.clockOut}, ${hours}, 'completed')`
      return { ok: true, data: null }
    } catch (error) {
      console.error('fileEntry failed', error)
      return { ok: false, error: 'Failed to file entry' }
    }
  })
