import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireDb } from '#/db'
import { verifyToken } from '#/server/jwt'
import { SESSION_COOKIE, getAuthSecret } from '#/server/auth'
import { TIERS, canSetTier, hasTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'
import type { Result } from '#/server/auth'
import {
  PaginationSchema,
  createPaginatedResult,
  getOffset,
} from '#/lib/pagination'
import type { PaginatedResult } from '#/lib/pagination'

const GENERIC_ERROR = 'Something went wrong'
const FORBIDDEN = 'You do not have access to perform this action'

const RECOGNITION_VALUES = [
  'teamwork',
  'innovation',
  'ownership',
  'customer',
  'leadership',
] as const

type Sql = ReturnType<typeof requireDb>

const num = (v: unknown) => Number(v ?? 0)

// Authorization reads the DB, not the token: a stale token must never retain
// privileges after a tier change or deactivation. Mirrors admin.ts's getCaller.
async function getCaller(
  sql: Sql,
  minTier: Tier,
): Promise<{ id: number; tier: Tier } | null> {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  const payload = await verifyToken(token, getAuthSecret())
  if (!payload) return null
  const rows = await sql`
    SELECT id, tier, status FROM users WHERE id = ${payload.sub}
  `
  const row = rows[0] as { id: number; tier: Tier; status: string } | undefined
  if (!row || row.status !== 'active' || !hasTier(row.tier, minTier)) {
    return null
  }
  return { id: row.id, tier: row.tier }
}

export interface DirectoryEmployee {
  id: number
  name: string
  email: string
  department: string
  designation: string
  location: string
  employmentType: string
  status: string
  gender: string
  flightRisk: string
}

function toDirectoryEmployee(r: Record<string, unknown>): DirectoryEmployee {
  return {
    id: r.id as number,
    name: r.name as string,
    email: r.email as string,
    department: r.department as string,
    designation: r.designation as string,
    location: r.location as string,
    employmentType: r.employment_type as string,
    status: r.status as string,
    gender: r.gender as string,
    flightRisk: r.flight_risk as string,
  }
}

// ---- Directory ----
export const listEmployees = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<DirectoryEmployee>> => {
    const sql = requireDb()
    const rows = await sql`
      SELECT id, name, email, department, designation, location,
             employment_type, status, gender, flight_risk
      FROM employees WHERE status <> 'exited' ORDER BY name
    `
    return rows.map(toDirectoryEmployee)
  },
)

export const listEmployeesPaginated = createServerFn({ method: 'GET' })
  .validator((d: unknown) => PaginationSchema.parse(d))
  .handler(
    async ({ data: params }): Promise<PaginatedResult<DirectoryEmployee>> => {
      try {
        const sql = requireDb()
        const offset = getOffset(params.page, params.limit)

        const totalRows = await sql`
          SELECT COUNT(*)::int AS c FROM employees WHERE status <> 'exited'
        `
        const total = num((totalRows[0] as { c: number }).c)

        const rows = await sql`
          SELECT id, name, email, department, designation, location,
                 employment_type, status, gender, flight_risk
          FROM employees WHERE status <> 'exited' ORDER BY name
          LIMIT ${params.limit} OFFSET ${offset}
        `
        return createPaginatedResult(
          rows.map(toDirectoryEmployee),
          params.page,
          params.limit,
          total,
        )
      } catch (error) {
        console.error('listEmployeesPaginated failed', error)
        return createPaginatedResult([], params.page, params.limit, 0)
      }
    },
  )

export const getEmployee = createServerFn({ method: 'GET' })
  .validator((id: unknown) => z.number().int().positive().parse(id))
  .handler(async ({ data: id }) => {
    try {
      const sql = requireDb()
      const rows = await sql`SELECT * FROM employees WHERE id = ${id}`
      const e = rows[0] as Record<string, unknown> | undefined
      if (!e) return null

      let manager: { id: number; name: string; designation: string } | null =
        null
      const managerId = (e.manager_id as number | null) ?? null
      if (managerId != null) {
        const m = (
          await sql`SELECT id, name, designation FROM employees WHERE id = ${managerId}`
        )[0] as { id: number; name: string; designation: string } | undefined
        if (m) manager = m
      }

      const reports = (await sql`
        SELECT id, name, designation FROM employees
        WHERE manager_id = ${id} ORDER BY name
      `) as Array<{ id: number; name: string; designation: string }>

      const kudos = (await sql`
        SELECT id, from_name, value, message, created_at
        FROM recognitions WHERE to_employee_id = ${id}
        ORDER BY created_at DESC LIMIT 5
      `) as Array<Record<string, unknown>>

      // Org & access management (ops+): the linked user's tier plus the pool of
      // people who can be picked as this employee's manager.
      const caller = await getCaller(sql, 'basic')
      const canManage = !!caller && hasTier(caller.tier, 'ops')
      // Master can edit an employee's personal details directly (in a popup).
      const canEditProfile = !!caller && hasTier(caller.tier, 'master')

      let linkedUserTier: Tier | null = null
      let managerOptions: Array<{
        id: number
        name: string
        designation: string
      }> = []
      if (canManage) {
        const linked = (
          await sql`SELECT tier FROM users WHERE employee_id = ${id}`
        )[0] as { tier: Tier } | undefined
        linkedUserTier = linked?.tier ?? null
        managerOptions = (await sql`
          SELECT id, name, designation FROM employees
          WHERE status <> 'exited' AND id <> ${id} ORDER BY name
        `) as Array<{ id: number; name: string; designation: string }>
      }

      return {
        employee: {
          id: e.id as number,
          name: e.name as string,
          email: e.email as string,
          department: e.department as string,
          designation: e.designation as string,
          location: e.location as string,
          employmentType: e.employment_type as string,
          status: e.status as string,
          gender: e.gender as string,
          flightRisk: e.flight_risk as string,
          dateOfJoining: String(e.date_of_joining),
          performanceRating: String(e.performance_rating),
          managerId,
        },
        manager,
        reports,
        kudos: kudos.map((k) => ({
          id: k.id as number,
          fromName: k.from_name as string,
          value: k.value as string,
          message: k.message as string,
        })),
        canManage,
        canEditProfile,
        linkedUserTier,
        managerOptions,
      }
    } catch (error) {
      console.error('getEmployee failed', error)
      return null
    }
  })

// Pure guard for the reporting line. Extracted so the self-reference and simple
// one-level cycle rules can be unit-tested without a database.
export function reportingLineError(input: {
  employeeId: number
  managerId: number | null
  proposedManagerManagerId: number | null
}): string | null {
  if (input.managerId === input.employeeId) {
    return 'An employee cannot report to themselves'
  }
  if (
    input.managerId != null &&
    input.proposedManagerManagerId === input.employeeId
  ) {
    return 'That would create a reporting loop'
  }
  return null
}

// ops+: reassign an employee's manager (org structure) and/or the linked user's tier.
export const updateEmployeeOrg = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        employeeId: z.number().int().positive(),
        managerId: z.number().int().positive().nullable(),
        tier: z.enum(TIERS),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<{ tierChanged: boolean }>> => {
    try {
      const sql = requireDb()
      const caller = await getCaller(sql, 'ops')
      if (!caller) return { ok: false, error: FORBIDDEN }

      const emp = (
        await sql`SELECT id FROM employees WHERE id = ${data.employeeId}`
      )[0] as { id: number } | undefined
      if (!emp) return { ok: false, error: 'Employee not found' }

      let proposedManagerManagerId: number | null = null
      if (data.managerId != null) {
        const proposed = (
          await sql`SELECT manager_id FROM employees WHERE id = ${data.managerId}`
        )[0] as { manager_id: number | null } | undefined
        if (!proposed) return { ok: false, error: 'Selected manager not found' }
        proposedManagerManagerId = proposed.manager_id ?? null
      }

      const lineError = reportingLineError({
        employeeId: data.employeeId,
        managerId: data.managerId,
        proposedManagerManagerId,
      })
      if (lineError) return { ok: false, error: lineError }

      // Validate the tier change before writing anything.
      const linked = (
        await sql`SELECT id, tier FROM users WHERE employee_id = ${data.employeeId}`
      )[0] as { id: number; tier: Tier } | undefined

      let tierChanged = false
      if (linked && linked.tier !== data.tier) {
        if (linked.id === caller.id) {
          return { ok: false, error: 'You cannot change your own tier' }
        }
        if (!canSetTier(caller.tier, linked.tier, data.tier)) {
          return {
            ok: false,
            error: 'Only a master can grant or revoke master access',
          }
        }
        tierChanged = true
      }

      await sql`
        UPDATE employees SET manager_id = ${data.managerId}
        WHERE id = ${data.employeeId}
      `
      if (tierChanged && linked) {
        await sql`
          UPDATE users SET tier = ${data.tier}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${linked.id}
        `
      }

      return { ok: true, data: { tierChanged } }
    } catch (error) {
      console.error('updateEmployeeOrg failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  })

// ---- Engagement ----
export const getEngagement = createServerFn({ method: 'GET' }).handler(
  async () => {
    const sql = requireDb()
    const feed = (await sql`
      SELECT from_name, to_name, department, value, message, created_at
      FROM recognitions ORDER BY created_at DESC LIMIT 12
    `) as Array<Record<string, unknown>>
    const anns = (await sql`
      SELECT title, body, category, author, created_at
      FROM announcements ORDER BY created_at DESC
    `) as Array<Record<string, unknown>>

    const enpsRows = (await sql`
      SELECT
        COUNT(*)::int total,
        COUNT(*) FILTER (WHERE score >= 9)::int promoters,
        COUNT(*) FILTER (WHERE score BETWEEN 7 AND 8)::int passives,
        COUNT(*) FILTER (WHERE score <= 6)::int detractors
      FROM survey_responses
    `) as Array<Record<string, unknown>>
    const e = enpsRows[0]
    const total = num(e.total) || 1
    const promoters = num(e.promoters)
    const passives = num(e.passives)
    const detractors = num(e.detractors)
    const enps = Math.round(
      (promoters / total) * 100 - (detractors / total) * 100,
    )

    const recThisMonth = num(
      (
        await sql`
          SELECT COUNT(*)::int c FROM recognitions
          WHERE created_at >= date_trunc('month', CURRENT_DATE)
        `
      )[0].c,
    )
    const byValue = (await sql`
      SELECT value, COUNT(*)::int c FROM recognitions
      GROUP BY value ORDER BY c DESC
    `) as Array<Record<string, unknown>>

    return {
      feed: feed.map((r) => ({
        from: r.from_name as string,
        to: r.to_name as string,
        department: r.department as string,
        value: r.value as string,
        message: r.message as string,
        when: String(r.created_at),
      })),
      announcements: anns.map((a) => ({
        title: a.title as string,
        body: a.body as string,
        category: a.category as string,
        author: a.author as string,
        when: String(a.created_at),
      })),
      enps: {
        score: enps,
        promoters: Math.round((promoters / total) * 100),
        passives: Math.round((passives / total) * 100),
        detractors: Math.round((detractors / total) * 100),
        responses: num(e.total),
      },
      recognitionsThisMonth: recThisMonth,
      topValues: byValue.map((v) => ({
        label: v.value as string,
        value: num(v.c),
      })),
    }
  },
)

export const createRecognition = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        fromName: z.string().max(120).optional(),
        toEmployeeId: z.number().int().positive(),
        value: z.enum(RECOGNITION_VALUES),
        message: z.string().min(1).max(400),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const to = (
        await sql`SELECT id, name, department FROM employees WHERE id = ${data.toEmployeeId}`
      )[0] as { id: number; name: string; department: string } | undefined
      if (!to) return { ok: false, error: 'Employee not found' }

      await sql`
        INSERT INTO recognitions
          (from_name, to_employee_id, to_name, department, value, message)
        VALUES
          (${data.fromName || 'Anonymous'}, ${to.id}, ${to.name},
           ${to.department}, ${data.value}, ${data.message})
      `
      return { ok: true, data: null }
    } catch (error) {
      console.error('createRecognition failed', error)
      return { ok: false, error: 'Failed to create recognition' }
    }
  })
