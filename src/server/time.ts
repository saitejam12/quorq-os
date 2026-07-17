import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser, canApprove } from '#/server/session'
import type { Result } from '#/server/auth'
import { hoursBetween } from '#/lib/time'

const n = (v: unknown) => Number(v ?? 0)
const todayIso = () => new Date().toISOString().slice(0, 10)

export const getTimeTracking = createServerFn({ method: 'GET' }).handler(
  async () => {
    const sql = requireDb()
    const me = await getSessionUser()
    const empId = me?.employeeId ?? null
    const today = todayIso()

    let sessions: Array<any> = []
    let myRecent: Array<any> = []
    let myWeekHours = 0
    if (empId) {
      sessions =
        (await sql`select id, clock_in, clock_out, hours_worked, status from time_entries
      where employee_id = ${empId} and day = ${today} order by id`) as Array<any>
      myRecent =
        (await sql`select day, clock_in, clock_out, hours_worked, status from time_entries
      where employee_id = ${empId} order by day desc, id desc limit 8`) as Array<any>
      myWeekHours = n(
        (
          await sql`select coalesce(sum(hours_worked),0) s from time_entries
        where employee_id = ${empId} and day >= (${today}::date - 6)`
        )[0].s,
      )
    }

    const openSession =
      sessions.find((s) => s.clock_out == null && s.status === 'active') ?? null
    const hoursToday = sessions.reduce(
      (sum, s) => sum + Number(s.hours_worked),
      0,
    )

    const teamCounts = (await sql`
    select count(*) total,
      count(*) filter (where status='active') active,
      count(*) filter (where status='completed') completed,
      coalesce(sum(hours_worked),0) hours
    from time_entries where day = ${today}`) as Array<any>
    const team = (await sql`
    select id, employee_name, department, clock_in, clock_out, hours_worked, status
    from time_entries where day = ${today} order by clock_in desc limit 20`) as Array<any>

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
      myRecent: myRecent.map((r) => ({
        day: r.day,
        clockIn: r.clock_in,
        clockOut: r.clock_out,
        hours: Number(r.hours_worked),
        status: r.status,
      })),
      myWeekHours: Math.round(myWeekHours * 10) / 10,
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
