import { createServerFn } from '@tanstack/react-start'
import { requireDb } from '#/db'
import { getSessionUser } from '#/server/session'
import { classifyAbsence, workingDaysBetween } from '#/lib/attendance'
import type { Result } from '#/server/auth'

const RECONCILE_KEY = 'attendance_last_reconciled'
const MS_PER_DAY = 86_400_000
// Every employee starts the year with this many days (employees.leave_balance
// DEFAULT in db/init.sql). Reimbursing auto-leave never pushes a balance above it.
const STARTING_LEAVE_BALANCE = 15

const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// UTC calendar date of yesterday (today's workday isn't over, so it's never
// reconciled).
function yesterdayUtc(): string {
  const todayMidnight = new Date(`${isoDate(Date.now())}T00:00:00Z`).getTime()
  return isoDate(todayMidnight - MS_PER_DAY)
}

async function getSetting(
  sql: ReturnType<typeof requireDb>,
  key: string,
): Promise<string | null> {
  const row = (
    await sql`select value from app_settings where key = ${key}`
  )[0] as { value: string } | undefined
  return row?.value ?? null
}

async function setSetting(
  sql: ReturnType<typeof requireDb>,
  key: string,
  value: string,
): Promise<void> {
  await sql`
    insert into app_settings (key, value, updated_at) values (${key}, ${value}, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()`
}

interface EmpState {
  id: number
  name: string
  department: string
  joining: string
  balance: number
}

// Converts working days with no clock-in (and no existing leave) into leave —
// auto-leave while balance lasts, then loss-of-pay. Idempotent: the marker only
// moves forward and each day is guarded by existence checks. Cheap on the common
// path (marker already at yesterday → early return before any scan).
export const reconcileAttendance = createServerFn({ method: 'POST' }).handler(
  async (): Promise<
    Result<{ daysProcessed: number; entriesCreated: number; reimbursed: number }>
  > => {
    try {
      const me = await getSessionUser()
      if (!me)
        return {
          ok: true,
          data: { daysProcessed: 0, entriesCreated: 0, reimbursed: 0 },
        }

      const sql = requireDb()
      const yesterday = yesterdayUtc()

      const marker = await getSetting(sql, RECONCILE_KEY)
      if (!marker) {
        // First run in this environment: start the clock at yesterday rather than
        // backfilling the entire seeded history.
        await setSetting(sql, RECONCILE_KEY, yesterday)
        return {
          ok: true,
          data: { daysProcessed: 0, entriesCreated: 0, reimbursed: 0 },
        }
      }
      if (marker >= yesterday) {
        return {
          ok: true,
          data: { daysProcessed: 0, entriesCreated: 0, reimbursed: 0 },
        }
      }

      // Master-tier employees are exempt from the auto-leave policy.
      const masterRows = (await sql`
        select employee_id from users where tier = 'master' and employee_id is not null`) as Array<{
        employee_id: number
      }>
      const masterIds = new Set(masterRows.map((r) => r.employee_id))

      // Reimbursement pass: reverse an auto-leave once the day now has a
      // completed time entry (the employee filed/edited their timesheet), or the
      // employee is now master-exempt. Restore the deducted balance, drop the
      // auto row, and mark the day present.
      const reimburseRows = (await sql`
        select le.id, le.employee_id, le.type, le.days, le.start_date::text as day
        from leave_requests le
        left join users u on u.employee_id = le.employee_id
        where le.source = 'auto' and le.status = 'approved'
          and (
            u.tier = 'master'
            or exists (
              select 1 from time_entries t
              where t.employee_id = le.employee_id and t.day = le.start_date and t.status = 'completed'
            )
          )`) as Array<{
        id: number
        employee_id: number
        type: string
        days: string
        day: string
      }>
      let reimbursed = 0
      for (const r of reimburseRows) {
        const restore = r.type === 'auto-leave' ? Number(r.days) : 0
        if (restore > 0) {
          await sql`update employees
            set leave_balance = least(leave_balance + ${restore}, ${STARTING_LEAVE_BALANCE})
            where id = ${r.employee_id}`
        }
        await sql`delete from leave_requests where id = ${r.id}`
        await sql`update attendance_records set status = 'present'
          where employee_id = ${r.employee_id} and day = ${r.day}`
        reimbursed++
      }

      const holidayRows =
        (await sql`select holiday_date::text as holiday_date from holidays`) as Array<{
          holiday_date: string
        }>
      const holidays = new Set(holidayRows.map((h) => h.holiday_date))
      const days = workingDaysBetween(marker, yesterday, holidays)

      const empRows = (await sql`
        select id, name, department, date_of_joining::text as date_of_joining, leave_balance
        from employees where status = 'active'`) as Array<any>
      const employees: Array<EmpState> = empRows.map((e) => ({
        id: e.id as number,
        name: e.name as string,
        department: e.department as string,
        joining: e.date_of_joining as string,
        balance: Number(e.leave_balance),
      }))

      let entriesCreated = 0
      for (const day of days) {
        const clockedRows = (await sql`
          select distinct employee_id from time_entries where day = ${day}`) as Array<{
          employee_id: number
        }>
        const clocked = new Set(clockedRows.map((r) => r.employee_id))
        const leaveRows = (await sql`
          select distinct employee_id from leave_requests
          where status = 'approved'
            and start_date <= ${day}
            and coalesce(end_date, start_date) >= ${day}`) as Array<{
          employee_id: number
        }>
        const onLeave = new Set(leaveRows.map((r) => r.employee_id))

        for (const emp of employees) {
          if (emp.joining > day) continue
          if (masterIds.has(emp.id)) continue // master exempt from auto-leave
          if (clocked.has(emp.id) || onLeave.has(emp.id)) continue

          const cls = classifyAbsence(emp.balance)
          await sql`
            insert into leave_requests
              (employee_id, employee_name, department, type, days, start_date, end_date, reason, status, source)
            values
              (${emp.id}, ${emp.name}, ${emp.department}, ${cls.type}, 1, ${day}, ${day}, 'Auto: no clock-in', 'approved', 'auto')`
          if (cls.deduct > 0) {
            emp.balance = Math.max(emp.balance - cls.deduct, 0)
            await sql`update employees set leave_balance = greatest(leave_balance - ${cls.deduct}, 0) where id = ${emp.id}`
          }

          const attStatus = cls.deduct > 0 ? 'leave' : 'absent'
          const existing = (
            await sql`
            select id from attendance_records where employee_id = ${emp.id} and day = ${day} limit 1`
          )[0] as { id: number } | undefined
          if (existing) {
            await sql`update attendance_records set status = ${attStatus} where id = ${existing.id}`
          } else {
            await sql`insert into attendance_records (employee_id, department, day, status)
              values (${emp.id}, ${emp.department}, ${day}, ${attStatus})`
          }
          entriesCreated++
        }
      }

      await setSetting(sql, RECONCILE_KEY, yesterday)
      return {
        ok: true,
        data: { daysProcessed: days.length, entriesCreated, reimbursed },
      }
    } catch (error) {
      console.error('reconcileAttendance failed', error)
      return { ok: false, error: 'Attendance reconciliation failed' }
    }
  },
)
