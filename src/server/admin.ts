import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireDb } from '#/db'
import { verifyToken } from '#/server/jwt'
import { SESSION_COOKIE, getAuthSecret } from '#/server/auth'
import {
  sendSignupApprovedEmail,
  sendSignupRejectedEmail,
} from '#/server/email/notifications'
import { TIERS, canSetTier, hasTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'
import type { Result } from '#/server/auth'

export interface AdminUser {
  id: number
  email: string
  name: string
  tier: Tier
  status: 'pending' | 'active' | 'rejected'
  createdAt: string
}

export interface UserStats {
  pending: number
  byTier: Record<Tier, number>
}

const GENERIC_ERROR = 'Something went wrong'
const FORBIDDEN = 'You do not have access to perform this action'

type Sql = ReturnType<typeof requireDb>

// Authorization reads the DB, not the token: a stale token must never
// retain privileges after a tier change or deactivation.
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

export const listUsers = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Result<Array<AdminUser>>> => {
    try {
      const sql = requireDb()
      const caller = await getCaller(sql, 'ops')
      if (!caller) return { ok: false, error: FORBIDDEN }
      const rows = await sql`
        SELECT id, email, name, tier, status, created_at
        FROM users
        ORDER BY created_at DESC
      `
      return {
        ok: true,
        data: rows.map((row) => ({
          id: row.id as number,
          email: row.email as string,
          name: row.name as string,
          tier: row.tier as Tier,
          status: row.status as AdminUser['status'],
          createdAt: String(row.created_at),
        })),
      }
    } catch (error) {
      console.error('listUsers failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  },
)

const UserIdSchema = z.object({ userId: z.number() })

async function setPendingStatus(
  userId: number,
  status: 'active' | 'rejected',
): Promise<Result<null>> {
  try {
    const sql = requireDb()
    const caller = await getCaller(sql, 'master')
    if (!caller) return { ok: false, error: FORBIDDEN }
    const updated = await sql`
      UPDATE users
      SET status = ${status}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${userId} AND status = 'pending'
      RETURNING id, email, name
    `
    if (updated.length === 0) {
      return { ok: false, error: 'Request not found or already handled' }
    }
    // Notify the applicant of the outcome (best-effort — the status change is
    // authoritative and already committed).
    const applicant = updated[0] as { email: string; name: string }
    if (status === 'active') {
      await sendSignupApprovedEmail({
        to: applicant.email,
        name: applicant.name,
      })
    } else {
      await sendSignupRejectedEmail({
        to: applicant.email,
        name: applicant.name,
      })
    }
    return { ok: true, data: null }
  } catch (error) {
    console.error('setPendingStatus failed', error)
    return { ok: false, error: GENERIC_ERROR }
  }
}

export const approveUser = createServerFn({ method: 'POST' })
  .validator(UserIdSchema)
  .handler(async ({ data }) => setPendingStatus(data.userId, 'active'))

export const rejectUser = createServerFn({ method: 'POST' })
  .validator(UserIdSchema)
  .handler(async ({ data }) => setPendingStatus(data.userId, 'rejected'))

// Approve a signup AND create the employee record from the details an ops/master
// reviewer fills in on the approval popup. Fields mirror the employee-information
// route (name…reports-to) plus the profile route's personal + bank/KYC groups.
const ApproveDetailsSchema = z.object({
  userId: z.number().int().positive(),
  name: z.string().min(1).max(120),
  email: z.string().email().max(160),
  department: z.string().min(1).max(64),
  designation: z.string().min(1).max(120),
  employmentType: z.string().min(1).max(24),
  location: z.string().min(1).max(64),
  status: z.enum(['active', 'on_leave', 'notice']),
  gender: z.enum(['male', 'female', 'other']),
  dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  performanceRating: z.number().min(0).max(5),
  managerId: z.number().int().positive().nullable(),
  phone: z.string().max(24),
  currentAddress: z.string().max(400),
  permanentAddress: z.string().max(400),
  emergencyContactName: z.string().max(120),
  emergencyContactPhone: z.string().max(24),
  bankName: z.string().max(120),
  bankAccountNumber: z.string().max(40),
  bankIfsc: z.string().max(20),
  aadhaarNumber: z.string().max(20),
  panNumber: z.string().max(15),
})

// Empty strings from optional inputs become NULL rather than '' in the DB.
const orNull = (v: string): string | null => (v.trim() ? v.trim() : null)

export const approveUserWithDetails = createServerFn({ method: 'POST' })
  .validator((d: unknown) => ApproveDetailsSchema.parse(d))
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const caller = await getCaller(sql, 'master')
      if (!caller) return { ok: false, error: FORBIDDEN }

      const userRow = (
        await sql`SELECT id, email, status, employee_id FROM users WHERE id = ${data.userId}`
      )[0] as
        | {
            id: number
            email: string
            status: string
            employee_id: number | null
          }
        | undefined
      if (!userRow) return { ok: false, error: 'User not found' }
      if (userRow.status !== 'pending') {
        return { ok: false, error: 'Request not found or already handled' }
      }
      if (userRow.employee_id != null) {
        return {
          ok: false,
          error: 'This user is already linked to an employee',
        }
      }

      const existing = await sql`
        SELECT id FROM employees WHERE lower(email) = lower(${data.email})
      `
      if (existing.length > 0) {
        return {
          ok: false,
          error: 'An employee with this email already exists',
        }
      }

      if (data.managerId != null) {
        const manager =
          await sql`SELECT id FROM employees WHERE id = ${data.managerId}`
        if (manager.length === 0) {
          return { ok: false, error: 'Selected manager not found' }
        }
      }

      const noKyc =
        !data.bankName.trim() &&
        !data.bankAccountNumber.trim() &&
        !data.bankIfsc.trim() &&
        !data.aadhaarNumber.trim() &&
        !data.panNumber.trim()

      // Create the employee, then link the login account to it and activate.
      const emp = (
        await sql`
          INSERT INTO employees
            (name, email, department, designation, employment_type, location,
             status, gender, date_of_joining, performance_rating, manager_id,
             phone, current_address, permanent_address,
             emergency_contact_name, emergency_contact_phone, kyc_missing)
          VALUES
            (${data.name.trim()}, ${data.email.trim()}, ${data.department.trim()},
             ${data.designation.trim()}, ${data.employmentType}, ${data.location.trim()},
             ${data.status}, ${data.gender}, ${data.dateOfJoining},
             ${data.performanceRating}, ${data.managerId},
             ${orNull(data.phone)}, ${orNull(data.currentAddress)},
             ${orNull(data.permanentAddress)}, ${orNull(data.emergencyContactName)},
             ${orNull(data.emergencyContactPhone)}, ${noKyc})
          RETURNING id
        `
      )[0] as { id: number }

      await sql`
        UPDATE employees SET emp_code = ${`QRQ-${String(emp.id).padStart(4, '0')}`}
        WHERE id = ${emp.id}
      `

      if (!noKyc) {
        await sql`
          INSERT INTO employee_kyc
            (employee_id, bank_name, bank_account_number, bank_ifsc,
             aadhaar_number, pan_number)
          VALUES
            (${emp.id}, ${orNull(data.bankName)}, ${orNull(data.bankAccountNumber)},
             ${orNull(data.bankIfsc)}, ${orNull(data.aadhaarNumber)},
             ${orNull(data.panNumber)})
        `
      }

      await sql`
        UPDATE users
        SET status = 'active', employee_id = ${emp.id}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${data.userId} AND status = 'pending'
      `

      // Notify the applicant (best-effort — the approval is already committed).
      await sendSignupApprovedEmail({
        to: userRow.email,
        name: data.name.trim(),
      })

      return { ok: true, data: null }
    } catch (error) {
      console.error('approveUserWithDetails failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  })

export const setUserTier = createServerFn({ method: 'POST' })
  .validator(z.object({ userId: z.number(), tier: z.enum(TIERS) }))
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const caller = await getCaller(sql, 'ops')
      if (!caller) return { ok: false, error: FORBIDDEN }
      if (caller.id === data.userId) {
        return { ok: false, error: 'You cannot change your own tier' }
      }
      const rows = await sql`
        SELECT tier FROM users WHERE id = ${data.userId}
      `
      const target = rows[0] as { tier: Tier } | undefined
      if (!target) return { ok: false, error: 'User not found' }
      if (!canSetTier(caller.tier, target.tier, data.tier)) {
        return {
          ok: false,
          error: 'Only a master can grant or revoke master access',
        }
      }
      await sql`
        UPDATE users
        SET tier = ${data.tier}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${data.userId}
      `
      return { ok: true, data: null }
    } catch (error) {
      console.error('setUserTier failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  })

export const getUserStats = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Result<UserStats>> => {
    try {
      const sql = requireDb()
      const caller = await getCaller(sql, 'master')
      if (!caller) return { ok: false, error: FORBIDDEN }
      const rows = await sql`
        SELECT tier, status, COUNT(*)::int AS count
        FROM users
        GROUP BY tier, status
      `
      const stats: UserStats = {
        pending: 0,
        byTier: { basic: 0, ops: 0, master: 0 },
      }
      for (const row of rows) {
        if (row.status === 'pending') stats.pending += row.count as number
        if (row.status === 'active') {
          stats.byTier[row.tier as Tier] += row.count as number
        }
      }
      return { ok: true, data: stats }
    } catch (error) {
      console.error('getUserStats failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  },
)
