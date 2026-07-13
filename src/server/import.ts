import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser, canApprove } from '#/server/session'
import {
  importEmployees,
  importAttendance,
  parseCSV,
} from '#/lib/import-export'

const CsvInput = z.object({ content: z.string().min(1), fileName: z.string() })

export const importEmployeesFromCSV = createServerFn({ method: 'POST' })
  .validator((d: unknown) => CsvInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const me = await getSessionUser()
      if (!canApprove(me))
        return {
          ok: false as const,
          error: 'Only ops and master can import data',
        }

      const lines = parseCSV(data.content)
      const parsed = importEmployees(lines)
      if (!parsed.success && parsed.errors.length > 0) {
        return {
          ok: false as const,
          error: `Import failed: ${parsed.errors.length} validation errors`,
          details: parsed.errors.slice(0, 5),
        }
      }

      const sql = requireDb()
      let inserted = 0
      let duplicates = 0
      for (const emp of parsed.data) {
        const existing =
          (await sql`select id from employees where email = ${emp.email}`) as Array<any>
        if (existing.length > 0) {
          duplicates++
          continue
        }
        await sql`
          insert into employees
            (name, email, department, designation, location, employment_type, status,
             gender, date_of_joining, ctc, manager_id)
          values (${emp.name}, ${emp.email}, ${emp.department}, ${emp.designation},
                  ${emp.location}, ${emp.employmentType}, ${emp.status}, ${emp.gender},
                  ${emp.dateOfJoining}, ${emp.ctc}, ${emp.managerId ?? null})`
        inserted++
      }

      return {
        ok: true as const,
        summary: { inserted, duplicates, total: parsed.data.length },
      }
    } catch (error) {
      console.error('importEmployeesFromCSV failed', error)
      return { ok: false as const, error: 'Import processing failed' }
    }
  })

export const importAttendanceFromCSV = createServerFn({ method: 'POST' })
  .validator((d: unknown) => CsvInput.parse(d))
  .handler(async ({ data }) => {
    try {
      const me = await getSessionUser()
      if (!canApprove(me))
        return {
          ok: false as const,
          error: 'Only ops and master can import attendance',
        }

      const lines = parseCSV(data.content)
      const parsed = importAttendance(lines)
      if (!parsed.success && parsed.errors.length > 0) {
        return {
          ok: false as const,
          error: `Import failed: ${parsed.errors.length} validation errors`,
          details: parsed.errors.slice(0, 5),
        }
      }

      const sql = requireDb()
      let inserted = 0
      let duplicates = 0
      for (const rec of parsed.data) {
        const existing = (await sql`
          select id from attendance_records
          where employee_id = ${rec.employeeId} and day = ${rec.date} limit 1`) as Array<any>
        if (existing.length > 0) {
          duplicates++
          continue
        }
        const emp =
          (await sql`select department from employees where id = ${rec.employeeId}`) as Array<any>
        if (emp.length === 0) continue
        await sql`
          insert into attendance_records
            (employee_id, department, day, status, late, early_exit, overtime_hours)
          values (${rec.employeeId}, ${emp[0].department}, ${rec.date}, ${rec.status},
                  ${rec.late}, ${rec.earlyExit}, ${rec.overtimeHours})`
        inserted++
      }

      return {
        ok: true as const,
        summary: { inserted, duplicates, total: parsed.data.length },
      }
    } catch (error) {
      console.error('importAttendanceFromCSV failed', error)
      return { ok: false as const, error: 'Import processing failed' }
    }
  })

export const exportEmployees = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const me = await getSessionUser()
      if (!canApprove(me))
        return { ok: false as const, error: 'Not authorized to export' }
      const sql = requireDb()
      const rows = (await sql`
      select name, email, department, designation, location, employment_type,
             status, gender, date_of_joining, ctc, manager_id
      from employees order by name`) as Array<any>
      return {
        ok: true as const,
        data: rows.map((r) => ({
          name: r.name,
          email: r.email,
          department: r.department,
          designation: r.designation,
          location: r.location,
          employmentType: r.employment_type,
          status: r.status,
          gender: r.gender,
          dateOfJoining: r.date_of_joining,
          ctc: r.ctc,
          managerId: r.manager_id,
        })),
      }
    } catch (error) {
      console.error('exportEmployees failed', error)
      return { ok: false as const, error: 'Export failed' }
    }
  },
)

export const exportAttendance = createServerFn({ method: 'GET' }).handler(
  async () => {
    try {
      const me = await getSessionUser()
      if (!canApprove(me))
        return { ok: false as const, error: 'Not authorized to export' }
      const sql = requireDb()
      const rows = (await sql`
      select employee_id, department, day, status, late, early_exit, overtime_hours
      from attendance_records order by day desc, employee_id`) as Array<any>
      return {
        ok: true as const,
        data: rows.map((r) => ({
          employeeId: r.employee_id,
          department: r.department,
          date: r.day,
          status: r.status,
          late: r.late,
          earlyExit: r.early_exit,
          overtimeHours: r.overtime_hours,
        })),
      }
    } catch (error) {
      console.error('exportAttendance failed', error)
      return { ok: false as const, error: 'Export failed' }
    }
  },
)
