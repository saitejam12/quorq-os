import { createServerFn } from '@tanstack/react-start'
import { requireDb } from '#/db'

export interface OrgEmployee {
  id: number
  name: string
  designation: string
  department: string
  managerId: number | null
}

export interface OrgManager {
  id: number
  name: string
  designation: string
  reports: number
}

export interface OrgDepartment {
  department: string
  head: { id: number; name: string; designation: string }
  directReports: number
  managers: Array<OrgManager>
  total: number
}

export interface Org {
  stats: {
    departments: number
    managers: number
    avgSpan: number
    ics: number
  }
  departments: Array<OrgDepartment>
}

// Pure transformation from a flat employee list to the department tree and
// span-of-control stats. A department head is any employee with no manager;
// a manager is a direct report who themselves has reports. Extracted from the
// server function so it can be unit-tested without a database.
export function buildOrg(rows: Array<OrgEmployee>): Org {
  const reportsByMgr: Record<number, Array<OrgEmployee>> = {}
  for (const e of rows) {
    if (e.managerId != null) (reportsByMgr[e.managerId] ??= []).push(e)
  }

  const deptCounts: Record<string, number> = {}
  for (const e of rows) deptCounts[e.department] = (deptCounts[e.department] ?? 0) + 1

  const heads = rows
    .filter((e) => e.managerId == null)
    .sort((a, b) => a.department.localeCompare(b.department))

  const departments: Array<OrgDepartment> = heads.map((head) => {
    const directs = reportsByMgr[head.id] ?? []
    const managers = directs
      .filter((d) => (reportsByMgr[d.id] ?? []).length > 0)
      .map((m) => ({
        id: m.id,
        name: m.name,
        designation: m.designation,
        reports: reportsByMgr[m.id].length,
      }))
    return {
      department: head.department,
      head: { id: head.id, name: head.name, designation: head.designation },
      directReports: directs.length,
      managers,
      total: deptCounts[head.department] ?? 0,
    }
  })

  const managerCount = Object.keys(reportsByMgr).length
  const totalReports = rows.filter((e) => e.managerId != null).length

  return {
    stats: {
      departments: departments.length,
      managers: managerCount,
      avgSpan: managerCount
        ? Math.round((totalReports / managerCount) * 10) / 10
        : 0,
      ics: rows.length - managerCount,
    },
    departments,
  }
}

export const getOrg = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Org> => {
    const sql = requireDb()
    const rows = await sql`
      SELECT id, name, designation, department, manager_id
      FROM employees
      WHERE status <> 'exited'
    `
    return buildOrg(
      rows.map((r) => ({
        id: r.id as number,
        name: r.name as string,
        designation: r.designation as string,
        department: r.department as string,
        managerId: (r.manager_id as number | null) ?? null,
      })),
    )
  },
)
