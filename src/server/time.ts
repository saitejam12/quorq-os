import { createServerFn } from '@tanstack/react-start'
import { requireDb } from '#/db'
import { getSessionUser } from '#/server/session'
import type { Result } from '#/server/auth'

const n = (v: unknown) => Number(v ?? 0)
const todayIso = () => new Date().toISOString().slice(0, 10)

export const getTimeTracking = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const me = await getSessionUser()
  const empId = me?.employeeId ?? null
  const today = todayIso()

  type TodayRow = {
    clock_in: string | null
    clock_out: string | null
    hours_worked: number | string
    status: string
  }
  let myToday: TodayRow | null = null
  let myRecent: Array<any> = []
  let myWeekHours = 0
  if (empId) {
    myToday =
      ((await sql`select clock_in, clock_out, hours_worked, status from time_entries
        where employee_id = ${empId} and day = ${today} order by id desc limit 1`)[0] as
        | TodayRow
        | undefined) ?? null
    myRecent = (await sql`select day, clock_in, clock_out, hours_worked, status from time_entries
      where employee_id = ${empId} order by day desc, id desc limit 8`) as Array<any>
    myWeekHours = n(
      (await sql`select coalesce(sum(hours_worked),0) s from time_entries
        where employee_id = ${empId} and day >= (${today}::date - 6)`)[0].s,
    )
  }

  const teamCounts = (await sql`
    select count(*) total,
      count(*) filter (where status='active') active,
      count(*) filter (where status='completed') completed,
      coalesce(sum(hours_worked),0) hours
    from time_entries where day = ${today}`) as Array<any>
  const team = (await sql`
    select employee_name, department, clock_in, clock_out, hours_worked, status
    from time_entries where day = ${today} order by clock_in desc limit 12`) as Array<any>

  return {
    hasProfile: !!empId,
    myToday: myToday
      ? {
          clockIn: myToday.clock_in,
          clockOut: myToday.clock_out,
          hoursWorked: Number(myToday.hours_worked),
          status: myToday.status,
        }
      : null,
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
        name: t.employee_name,
        department: t.department,
        clockIn: t.clock_in,
        clockOut: t.clock_out,
        hours: Number(t.hours_worked),
        status: t.status,
      })),
    },
  }
})

export const clockIn = createServerFn({ method: 'POST' }).handler(
  async (): Promise<Result<null>> => {
    const sql = requireDb()
    const me = await getSessionUser()
    if (!me?.employeeId) return { ok: false, error: 'No employee profile linked to this account' }
    const today = todayIso()
    const existing = (await sql`select id, clock_in from time_entries
      where employee_id = ${me.employeeId} and day = ${today} limit 1`)[0] as
      | { id: number; clock_in: string | null }
      | undefined
    if (existing?.clock_in) return { ok: false, error: 'Already clocked in today' }

    const emp = (await sql`select name, department from employees where id = ${me.employeeId}`)[0] as {
      name: string
      department: string
    }
    await sql`insert into time_entries (employee_id, employee_name, department, day, clock_in, status)
      values (${me.employeeId}, ${emp.name}, ${emp.department}, ${today}, now(), 'active')`
    // cascade -> attendance_records (analytics) marks present for today
    const att = (await sql`select id from attendance_records where employee_id = ${me.employeeId} and day = ${today} limit 1`)[0] as
      | { id: number }
      | undefined
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
    if (!me?.employeeId) return { ok: false, error: 'No employee profile linked' }
    const today = todayIso()
    const entry = (await sql`select id, clock_in from time_entries
      where employee_id = ${me.employeeId} and day = ${today} and status='active' order by id desc limit 1`)[0] as
      | { id: number; clock_in: string }
      | undefined
    if (!entry) return { ok: false, error: 'You are not clocked in' }
    await sql`update time_entries
      set clock_out = now(),
          hours_worked = round(extract(epoch from (now() - clock_in))/3600.0, 2),
          status = 'completed'
      where id = ${entry.id}`
    return { ok: true, data: null }
  },
)
