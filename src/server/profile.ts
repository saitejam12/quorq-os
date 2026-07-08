import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { requireDb } from '#/db'
import { verifyToken } from '#/server/jwt'
import { SESSION_COOKIE, getAuthSecret } from '#/server/auth'
import type { Result } from '#/server/auth'

type Sql = ReturnType<typeof requireDb>

const GENERIC_ERROR = 'Something went wrong'

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
        await sql`SELECT * FROM employees WHERE id = ${employeeId}`
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
          dateOfJoining: String(e.date_of_joining),
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

// An optional, length-bounded, trimmed string field. Empty becomes null so the
// column is cleared rather than storing a blank string.
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((v) => {
      const t = v?.trim()
      return t ? t : null
    })

export const updateMyPersonalDetails = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        phone: optionalText(24),
        currentAddress: optionalText(400),
        permanentAddress: optionalText(400),
        emergencyContactName: optionalText(120),
        emergencyContactPhone: optionalText(24),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const employeeId = await getCallerEmployeeId(sql)
      if (employeeId == null) {
        return {
          ok: false,
          error: 'Your account is not linked to an employee record',
        }
      }
      await sql`
        UPDATE employees SET
          phone = ${data.phone},
          current_address = ${data.currentAddress},
          permanent_address = ${data.permanentAddress},
          emergency_contact_name = ${data.emergencyContactName},
          emergency_contact_phone = ${data.emergencyContactPhone}
        WHERE id = ${employeeId}
      `
      return { ok: true, data: null }
    } catch (error) {
      console.error('updateMyPersonalDetails failed', error)
      return { ok: false, error: GENERIC_ERROR }
    }
  })
