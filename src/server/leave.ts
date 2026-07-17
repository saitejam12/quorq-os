import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser, canApprove } from '#/server/session'
import type { Result } from '#/server/auth'

const n = (v: unknown) => Number(v ?? 0)

const LEAVE_TYPES = [
  'casual',
  'sick',
  'earned',
  'maternity',
  'paternity',
  'comp-off',
] as const

export const getLeave = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const me = await getSessionUser()
  const empId = me?.employeeId ?? null
  const approver = canApprove(me)

  let balance = 0
  let used = 0
  let myRequests: Array<any> = []
  if (empId) {
    const emp = (
      await sql`select leave_balance from employees where id = ${empId}`
    )[0] as { leave_balance: number | string } | undefined
    balance = Number(emp?.leave_balance ?? 0)
    used = n(
      (
        await sql`select coalesce(sum(days),0) s from leave_requests where employee_id=${empId} and status='approved'`
      )[0].s,
    )
    myRequests = (await sql`
      select id, type, days, start_date, reason, status, created_at
      from leave_requests where employee_id=${empId} order by created_at desc limit 10`) as Array<any>
  }

  let pending: Array<any> = []
  if (approver) {
    pending = (await sql`
      select id, employee_name, department, type, days, start_date, reason, status
      from leave_requests where status in ('pending','escalated') order by created_at limit 30`) as Array<any>
  }

  return {
    hasProfile: !!empId,
    canApprove: approver,
    balance,
    used,
    entitled: 15,
    myRequests: myRequests.map((r) => ({
      id: r.id,
      type: r.type,
      days: Number(r.days),
      startDate: r.start_date,
      reason: r.reason,
      status: r.status,
    })),
    pending: pending.map((r) => ({
      id: r.id,
      name: r.employee_name,
      department: r.department,
      type: r.type,
      days: Number(r.days),
      startDate: r.start_date,
      reason: r.reason,
      status: r.status,
    })),
  }
})

export const applyLeave = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        type: z.enum(LEAVE_TYPES),
        days: z.number().positive().max(120),
        startDate: z.string().min(1),
        reason: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!me?.employeeId)
        return { ok: false, error: 'No employee profile linked' }

      const emp = (
        await sql`select name, department, leave_balance from employees where id=${me.employeeId}`
      )[0] as
        | { name: string; department: string; leave_balance: number | string }
        | undefined
      if (!emp) return { ok: false, error: 'Employee profile not found' }

      const balance = Number(emp.leave_balance || 0)
      const paidLeave = data.type !== 'maternity' && data.type !== 'paternity'
      if (paidLeave && data.days > balance) {
        return {
          ok: false,
          error: `Insufficient balance — ${balance} days available`,
        }
      }

      const endDate = new Date(
        new Date(data.startDate).getTime() + (data.days - 1) * 86400000,
      )
        .toISOString()
        .split('T')[0]

      await sql`
        insert into leave_requests
          (employee_id, employee_name, department, type, days, start_date, end_date, reason, status)
        values
          (${me.employeeId}, ${emp.name}, ${emp.department}, ${data.type}, ${data.days},
           ${data.startDate}, ${endDate}, ${data.reason || null}, 'pending')`
      return { ok: true, data: null }
    } catch (error) {
      console.error('applyLeave failed', error)
      return { ok: false, error: 'Failed to apply for leave' }
    }
  })

export const decideLeave = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        action: z.enum(['approve', 'reject', 'escalate']),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me))
        return { ok: false, error: 'Not authorised to approve leave' }

      const req = (
        await sql`select id, employee_id, days, status from leave_requests where id=${data.id}`
      )[0] as
        | {
            id: number
            employee_id: number | null
            days: string
            status: string
          }
        | undefined
      if (!req) return { ok: false, error: 'Request not found' }
      if (!['pending', 'escalated'].includes(req.status)) {
        return { ok: false, error: 'Already decided' }
      }

      if (data.action === 'approve') {
        await sql`update leave_requests set status='approved' where id=${data.id}`
        if (req.employee_id) {
          await sql`
            update employees set leave_balance = greatest(0, leave_balance - ${Number(req.days)})
            where id = ${req.employee_id}`
        }
      } else if (data.action === 'reject') {
        await sql`update leave_requests set status='rejected' where id=${data.id}`
      } else {
        await sql`update leave_requests set status='escalated' where id=${data.id}`
      }
      return { ok: true, data: null }
    } catch (error) {
      console.error('decideLeave failed', error)
      return { ok: false, error: 'Failed to update leave request' }
    }
  })
