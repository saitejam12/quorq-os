import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { canApprove, getSessionUser } from '#/server/session'
import {
  sendProfileChangeApprovedEmail,
  sendProfileChangeRejectedEmail,
} from '#/server/email/notifications'
import {
  diffChanges,
  labelFor,
  pickAllowed,
  validateChanges,
} from '#/lib/profile-fields'
import { applyProfileFields, currentValues } from '#/server/profile'
import type { Result } from '#/server/auth'

// Employee email + display name for change-request notifications.
async function employeeContact(
  sql: Sql,
  employeeId: number,
): Promise<{ email: string; name: string } | null> {
  const row = (
    await sql`select email, name from employees where id = ${employeeId}`
  )[0] as { email: string | null; name: string } | undefined
  if (!row?.email) return null
  return { email: row.email, name: row.name }
}

type Sql = ReturnType<typeof requireDb>

export interface MyChangeRequest {
  id: number
  status: string
  reviewReason: string | null
  changedLabels: Array<string>
}

export interface ReviewItem {
  key: string
  label: string
  current: string
  requested: string
}

export interface PendingChangeRequest {
  id: number
  employeeName: string
  department: string
  requestedAt: string
  items: Array<ReviewItem>
}

export const submitProfileChangeRequest = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ changes: z.record(z.string(), z.string()) }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!me?.employeeId) {
        return {
          ok: false,
          error: 'Your account is not linked to an employee record',
        }
      }

      const proposed = pickAllowed(data.changes)
      const current = await currentValues(sql, me.employeeId)
      const changes = diffChanges(current, proposed)
      if (Object.keys(changes).length === 0) {
        return { ok: false, error: 'No changes to submit' }
      }
      const errors = validateChanges(changes)
      if (errors.length > 0) {
        return { ok: false, error: errors.join('; ') }
      }

      const pending = (
        await sql`select id from profile_change_requests
          where employee_id = ${me.employeeId} and status = 'pending' limit 1`
      )[0] as { id: number } | undefined
      if (pending) {
        return {
          ok: false,
          error: 'You already have a change request awaiting review',
        }
      }

      const emp = (
        await sql`select name, department from employees where id = ${me.employeeId}`
      )[0] as { name: string; department: string }
      await sql`
        insert into profile_change_requests (employee_id, employee_name, department, changes)
        values (${me.employeeId}, ${emp.name}, ${emp.department}, ${JSON.stringify(changes)}::jsonb)`
      return { ok: true, data: null }
    } catch (error) {
      console.error('submitProfileChangeRequest failed', error)
      return { ok: false, error: 'Failed to submit change request' }
    }
  })

export const getMyProfileChangeRequest = createServerFn({
  method: 'GET',
}).handler(async (): Promise<MyChangeRequest | null> => {
  try {
    const sql = requireDb()
    const me = await getSessionUser()
    if (!me?.employeeId) return null
    const row = (
      await sql`select id, changes, status, review_reason
          from profile_change_requests
          where employee_id = ${me.employeeId}
          order by requested_at desc, id desc limit 1`
    )[0] as
      | {
          id: number
          changes: Record<string, string>
          status: string
          review_reason: string | null
        }
      | undefined
    if (!row) return null
    return {
      id: row.id,
      status: row.status,
      reviewReason: row.review_reason,
      changedLabels: Object.keys(row.changes).map(labelFor),
    }
  } catch (error) {
    console.error('getMyProfileChangeRequest failed', error)
    return null
  }
})

export const listProfileChangeRequests = createServerFn({
  method: 'GET',
}).handler(async (): Promise<Result<Array<PendingChangeRequest>>> => {
  try {
    const sql = requireDb()
    const me = await getSessionUser()
    if (!canApprove(me)) {
      return {
        ok: false,
        error: 'Only ops and master can review change requests',
      }
    }
    const rows = (await sql`
        select id, employee_id, employee_name, department, changes, requested_at::text as requested_at
        from profile_change_requests where status = 'pending'
        order by requested_at`) as Array<{
      id: number
      employee_id: number
      employee_name: string
      department: string
      changes: Record<string, string>
      requested_at: string
    }>

    const requests: Array<PendingChangeRequest> = []
    for (const r of rows) {
      const current = await currentValues(sql, r.employee_id)
      const items: Array<ReviewItem> = Object.entries(r.changes).map(
        ([key, requested]) => ({
          key,
          label: labelFor(key),
          current: current[key] ?? '',
          requested,
        }),
      )
      requests.push({
        id: r.id,
        employeeName: r.employee_name,
        department: r.department,
        requestedAt: r.requested_at,
        items,
      })
    }
    return { ok: true, data: requests }
  } catch (error) {
    console.error('listProfileChangeRequests failed', error)
    return { ok: false, error: 'Failed to load change requests' }
  }
})

async function loadReviewable(
  sql: Sql,
  id: number,
  reviewerEmployeeId: number | null,
): Promise<
  | { ok: true; employeeId: number; changes: Record<string, string> }
  | { ok: false; error: string }
> {
  const row = (
    await sql`select employee_id, changes, status from profile_change_requests where id = ${id}`
  )[0] as
    | { employee_id: number; changes: Record<string, string>; status: string }
    | undefined
  if (!row) return { ok: false, error: 'Change request not found' }
  if (row.status !== 'pending') {
    return { ok: false, error: 'This request has already been reviewed' }
  }
  if (reviewerEmployeeId != null && row.employee_id === reviewerEmployeeId) {
    return { ok: false, error: 'You cannot review your own change request' }
  }
  return { ok: true, employeeId: row.employee_id, changes: row.changes }
}

export const approveProfileChangeRequest = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ id: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) {
        return {
          ok: false,
          error: 'Only ops and master can approve change requests',
        }
      }
      const loaded = await loadReviewable(sql, data.id, me?.employeeId ?? null)
      if (!loaded.ok) return loaded

      await applyProfileFields(sql, loaded.employeeId, loaded.changes)

      await sql`update profile_change_requests
        set status = 'approved', reviewed_at = now(), reviewed_by = ${me?.name ?? null}
        where id = ${data.id}`

      // Notify the employee (best-effort — the change is already applied).
      const contact = await employeeContact(sql, loaded.employeeId)
      if (contact) {
        await sendProfileChangeApprovedEmail({
          to: contact.email,
          name: contact.name,
          fields: Object.keys(loaded.changes).map(labelFor),
        })
      }
      return { ok: true, data: null }
    } catch (error) {
      console.error('approveProfileChangeRequest failed', error)
      return { ok: false, error: 'Failed to approve change request' }
    }
  })

export const rejectProfileChangeRequest = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        reason: z.string().min(1).max(300),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) {
        return {
          ok: false,
          error: 'Only ops and master can reject change requests',
        }
      }
      const loaded = await loadReviewable(sql, data.id, me?.employeeId ?? null)
      if (!loaded.ok) return loaded

      await sql`update profile_change_requests
        set status = 'rejected', review_reason = ${data.reason.trim()},
            reviewed_at = now(), reviewed_by = ${me?.name ?? null}
        where id = ${data.id}`

      // Notify the employee with the reason (best-effort).
      const contact = await employeeContact(sql, loaded.employeeId)
      if (contact) {
        await sendProfileChangeRejectedEmail({
          to: contact.email,
          name: contact.name,
          fields: Object.keys(loaded.changes).map(labelFor),
          reason: data.reason.trim(),
        })
      }
      return { ok: true, data: null }
    } catch (error) {
      console.error('rejectProfileChangeRequest failed', error)
      return { ok: false, error: 'Failed to reject change request' }
    }
  })
