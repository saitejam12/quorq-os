import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireDb } from '#/db'
import { verifyToken } from '#/server/jwt'
import { SESSION_COOKIE, getAuthSecret } from '#/server/auth'
import { getSessionUser } from '#/server/session'
import { hasTier } from '#/lib/tiers'
import {
  PROFILE_FIELDS,
  getProfileField,
  pickAllowed,
  validateChanges,
} from '#/lib/profile-fields'
import type { Result } from '#/server/auth'

type Sql = ReturnType<typeof requireDb>

const FORBIDDEN = 'You do not have access to perform this action'

// Resolves the signed-in caller's linked employee id from the session cookie,
// reading the DB rather than trusting token fields. Returns null when there is
// no valid session or the account isn't linked to an employee record.
async function getCallerEmployeeId(sql: Sql): Promise<number | null> {
  const token = getCookie(SESSION_COOKIE)
  if (!token) return null
  const payload = await verifyToken(token, getAuthSecret())
  if (!payload) return null
  const rows = await sql`
    SELECT employee_id FROM users WHERE id = ${payload.sub} AND status = 'active'
  `
  const row = rows[0] as { employee_id: number | null } | undefined
  return row?.employee_id ?? null
}

export interface MyEmployeeDetails {
  empCode: string | null
  name: string
  email: string
  department: string
  designation: string
  employmentType: string
  location: string
  status: string
  dateOfJoining: string
}

export interface MyPersonalDetails {
  phone: string | null
  currentAddress: string | null
  permanentAddress: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
}

export interface MyKyc {
  bankName: string | null
  bankAccountNumber: string | null
  bankIfsc: string | null
  aadhaarNumber: string | null
  panNumber: string | null
}

export interface MyProfile {
  employee: MyEmployeeDetails
  personal: MyPersonalDetails
  kyc: MyKyc | null
}

export const getMyProfile = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MyProfile | null> => {
    try {
      const sql = requireDb()
      const employeeId = await getCallerEmployeeId(sql)
      if (employeeId == null) return null

      const e = (
        await sql`
          SELECT *, date_of_joining::text AS date_of_joining_text
          FROM employees WHERE id = ${employeeId}`
      )[0] as Record<string, unknown> | undefined
      if (!e) return null

      const kycRow = (
        await sql`
          SELECT bank_name, bank_account_number, bank_ifsc, aadhaar_number, pan_number
          FROM employee_kyc WHERE employee_id = ${employeeId}
        `
      )[0] as Record<string, unknown> | undefined

      return {
        employee: {
          empCode: (e.emp_code as string | null) ?? null,
          name: e.name as string,
          email: e.email as string,
          department: e.department as string,
          designation: e.designation as string,
          employmentType: e.employment_type as string,
          location: e.location as string,
          status: e.status as string,
          dateOfJoining: (e.date_of_joining_text as string | null) ?? '',
        },
        personal: {
          phone: (e.phone as string | null) ?? null,
          currentAddress: (e.current_address as string | null) ?? null,
          permanentAddress: (e.permanent_address as string | null) ?? null,
          emergencyContactName:
            (e.emergency_contact_name as string | null) ?? null,
          emergencyContactPhone:
            (e.emergency_contact_phone as string | null) ?? null,
        },
        kyc: kycRow
          ? {
              bankName: (kycRow.bank_name as string | null) ?? null,
              bankAccountNumber:
                (kycRow.bank_account_number as string | null) ?? null,
              bankIfsc: (kycRow.bank_ifsc as string | null) ?? null,
              aadhaarNumber: (kycRow.aadhaar_number as string | null) ?? null,
              panNumber: (kycRow.pan_number as string | null) ?? null,
            }
          : null,
      }
    } catch (error) {
      console.error('getMyProfile failed', error)
      return null
    }
  },
)

// ---- Shared profile-field helpers (also used by profile-requests) ----

// Current value of every requestable field, keyed by field key (empty string
// when null). date_of_joining is cast to text to avoid the driver's Date parsing.
export async function currentValues(
  sql: Sql,
  employeeId: number,
): Promise<Record<string, string>> {
  const emp = (
    await sql`
      select name, email, department, designation, employment_type, location,
             date_of_joining::text as date_of_joining, phone, current_address,
             permanent_address, emergency_contact_name, emergency_contact_phone
      from employees where id = ${employeeId}`
  )[0] as Record<string, unknown> | undefined
  const kyc = (
    await sql`
      select bank_name, bank_account_number, bank_ifsc
      from employee_kyc where employee_id = ${employeeId}`
  )[0] as Record<string, unknown> | undefined

  const current: Record<string, string> = {}
  for (const f of PROFILE_FIELDS) {
    const src = f.table === 'employees' ? emp : kyc
    const raw = src?.[f.column]
    current[f.key] = raw == null ? '' : String(raw)
  }
  return current
}

// Apply a set of allow-listed field changes to an employee: one dynamic UPDATE
// for `employees` columns and an upsert for `employee_kyc`. Column names come
// only from the trusted allow-list; values are parameterized. Nullable fields
// with an empty value clear to NULL. Unknown keys are ignored.
export async function applyProfileFields(
  sql: Sql,
  employeeId: number,
  changes: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(changes).filter(([key]) =>
    getProfileField(key),
  )

  const empEntries = entries.filter(
    ([key]) => getProfileField(key)?.table === 'employees',
  )
  if (empEntries.length > 0) {
    const sets: Array<string> = []
    const params: Array<string | null> = []
    empEntries.forEach(([key, value], i) => {
      const field = getProfileField(key)!
      sets.push(`${field.column} = $${i + 1}`)
      params.push(field.nullable && value === '' ? null : value)
    })
    params.push(String(employeeId))
    await sql.query(
      `UPDATE employees SET ${sets.join(', ')} WHERE id = $${empEntries.length + 1}`,
      params,
    )
  }

  const kycEntries = entries.filter(
    ([key]) => getProfileField(key)?.table === 'kyc',
  )
  if (kycEntries.length > 0) {
    const cols = kycEntries.map(([key]) => getProfileField(key)!.column)
    const values = kycEntries.map(([key, value]) => {
      const field = getProfileField(key)!
      return field.nullable && value === '' ? null : value
    })
    const insertCols = ['employee_id', ...cols]
    const placeholders = insertCols.map((_, i) => `$${i + 1}`)
    const updates = cols.map((c) => `${c} = excluded.${c}`)
    await sql.query(
      `INSERT INTO employee_kyc (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')})
       ON CONFLICT (employee_id) DO UPDATE SET ${updates.join(', ')}`,
      [String(employeeId), ...values],
    )
  }
}

// Rejects an employee email that already belongs to a different employee row.
async function isEmployeeEmailFree(
  sql: Sql,
  email: string,
  exceptId?: number,
): Promise<boolean> {
  const rows =
    exceptId != null
      ? await sql`SELECT id FROM employees WHERE lower(email) = lower(${email}) AND id <> ${exceptId}`
      : await sql`SELECT id FROM employees WHERE lower(email) = lower(${email})`
  return rows.length === 0
}

const ChangesSchema = z.object({
  changes: z.record(z.string(), z.string()),
})

// Master self-service: create (when the account has no employee record yet) or
// update the caller's own employee record directly, with no approval step.
export const saveMyProfile = createServerFn({ method: 'POST' })
  .validator((d: unknown) => ChangesSchema.parse(d))
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!me || !hasTier(me.tier, 'master')) {
        return { ok: false, error: FORBIDDEN }
      }

      const proposed = pickAllowed(data.changes)
      const errors = validateChanges(proposed)
      if (errors.length > 0) {
        return { ok: false, error: errors.join('; ') }
      }

      if (me.employeeId != null) {
        if (
          proposed.email &&
          !(await isEmployeeEmailFree(sql, proposed.email, me.employeeId))
        ) {
          return {
            ok: false,
            error: 'An employee with this email already exists',
          }
        }
        await applyProfileFields(sql, me.employeeId, proposed)
        return { ok: true, data: null }
      }

      // Create path: the non-nullable identity/org fields must all be present.
      const required = PROFILE_FIELDS.filter((f) => !f.nullable)
      const missing = required.filter((f) => !(proposed[f.key] ?? '').trim())
      if (missing.length > 0) {
        return {
          ok: false,
          error: `Missing required: ${missing.map((f) => f.label).join(', ')}`,
        }
      }
      if (!(await isEmployeeEmailFree(sql, proposed.email))) {
        return {
          ok: false,
          error: 'An employee with this email already exists',
        }
      }

      const emp = (
        await sql`
          INSERT INTO employees
            (name, email, department, designation, employment_type, location,
             date_of_joining)
          VALUES
            (${proposed.name}, ${proposed.email}, ${proposed.department},
             ${proposed.designation}, ${proposed.employmentType},
             ${proposed.location}, ${proposed.dateOfJoining})
          RETURNING id
        `
      )[0] as { id: number }
      await sql`
        UPDATE employees SET emp_code = ${`QRQ-${String(emp.id).padStart(4, '0')}`}
        WHERE id = ${emp.id}
      `
      // Fill in the personal + bank fields (and harmlessly re-set the employee
      // columns just inserted).
      await applyProfileFields(sql, emp.id, proposed)
      await sql`
        UPDATE users SET employee_id = ${emp.id}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${me.id}
      `
      return { ok: true, data: null }
    } catch (error) {
      console.error('saveMyProfile failed', error)
      return { ok: false, error: 'Failed to save profile' }
    }
  })

// Master-only: current editable field values for any employee, to pre-fill the
// directory edit popup. Includes bank fields, so it must never be exposed below
// the master tier.
export const getEmployeeEditableProfile = createServerFn({ method: 'GET' })
  .validator((id: unknown) => z.number().int().positive().parse(id))
  .handler(async ({ data: id }): Promise<Result<Record<string, string>>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!me || !hasTier(me.tier, 'master')) {
        return { ok: false, error: FORBIDDEN }
      }
      const exists = (
        await sql`SELECT id FROM employees WHERE id = ${id}`
      )[0] as { id: number } | undefined
      if (!exists) return { ok: false, error: 'Employee not found' }
      return { ok: true, data: await currentValues(sql, id) }
    } catch (error) {
      console.error('getEmployeeEditableProfile failed', error)
      return { ok: false, error: 'Failed to load employee details' }
    }
  })

// Master-only: apply personal-detail edits to any employee directly.
export const updateEmployeeProfile = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        employeeId: z.number().int().positive(),
        changes: z.record(z.string(), z.string()),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!me || !hasTier(me.tier, 'master')) {
        return { ok: false, error: FORBIDDEN }
      }
      const exists = (
        await sql`SELECT id FROM employees WHERE id = ${data.employeeId}`
      )[0] as { id: number } | undefined
      if (!exists) return { ok: false, error: 'Employee not found' }

      const proposed = pickAllowed(data.changes)
      const errors = validateChanges(proposed)
      if (errors.length > 0) {
        return { ok: false, error: errors.join('; ') }
      }
      if (
        proposed.email &&
        !(await isEmployeeEmailFree(sql, proposed.email, data.employeeId))
      ) {
        return {
          ok: false,
          error: 'An employee with this email already exists',
        }
      }
      await applyProfileFields(sql, data.employeeId, proposed)
      return { ok: true, data: null }
    } catch (error) {
      console.error('updateEmployeeProfile failed', error)
      return { ok: false, error: 'Failed to update employee' }
    }
  })
