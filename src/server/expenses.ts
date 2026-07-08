import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser, canApprove } from '#/server/session'
import type { Result } from '#/server/auth'

const n = (v: unknown) => Number(v ?? 0)

const EXPENSE_CATS = ['travel', 'food', 'software', 'equipment', 'training', 'other'] as const

export const getExpenses = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const me = await getSessionUser()
  const empId = me?.employeeId ?? null
  const approver = canApprove(me)

  let mine: Array<any> = []
  if (empId) {
    mine = (await sql`
      select id, category, amount, spent_on, description, status, created_at
      from expenses where employee_id=${empId} order by created_at desc limit 12`) as Array<any>
  }
  const myReimbursed = empId
    ? n((await sql`select coalesce(sum(amount),0) s from expenses where employee_id=${empId} and status='reimbursed'`)[0].s)
    : 0
  const myPending = empId
    ? n((await sql`select coalesce(sum(amount),0) s from expenses where employee_id=${empId} and status in ('pending','approved')`)[0].s)
    : 0

  let queue: Array<any> = []
  if (approver) {
    queue = (await sql`
      select id, employee_name, department, category, amount, spent_on, description, status
      from expenses where status in ('pending','approved') order by created_at limit 40`) as Array<any>
  }
  const orgPending = n((await sql`select coalesce(sum(amount),0) s from expenses where status='pending'`)[0].s)

  return {
    hasProfile: !!empId,
    canApprove: approver,
    mine: mine.map((r) => ({
      id: r.id,
      category: r.category,
      amount: Number(r.amount),
      spentOn: r.spent_on,
      description: r.description,
      status: r.status,
    })),
    myReimbursed,
    myPending,
    queue: queue.map((r) => ({
      id: r.id,
      name: r.employee_name,
      department: r.department,
      category: r.category,
      amount: Number(r.amount),
      spentOn: r.spent_on,
      description: r.description,
      status: r.status,
    })),
    orgPending,
  }
})

export const submitExpense = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        category: z.enum(EXPENSE_CATS),
        amount: z.number().positive().max(1000000),
        spentOn: z.string().min(1),
        description: z.string().max(300),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!me?.employeeId) return { ok: false, error: 'No employee profile linked' }

      const emp = (await sql`select name, department from employees where id=${me.employeeId}`)[0] as
        | { name: string; department: string }
        | undefined
      if (!emp) return { ok: false, error: 'Employee profile not found' }

      await sql`
        insert into expenses
          (employee_id, employee_name, department, category, amount, spent_on, description, status)
        values
          (${me.employeeId}, ${emp.name}, ${emp.department}, ${data.category}, ${data.amount},
           ${data.spentOn}, ${data.description}, 'pending')`
      return { ok: true, data: null }
    } catch (error) {
      console.error('submitExpense failed', error)
      return { ok: false, error: 'Failed to submit expense' }
    }
  })

export const decideExpense = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        id: z.number().int().positive(),
        action: z.enum(['approve', 'reject', 'reimburse']),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) return { ok: false, error: 'Not authorised for this action' }

      const next =
        data.action === 'approve'
          ? 'approved'
          : data.action === 'reject'
            ? 'rejected'
            : 'reimbursed'
      await sql`update expenses set status=${next} where id=${data.id}`
      return { ok: true, data: null }
    } catch (error) {
      console.error('decideExpense failed', error)
      return { ok: false, error: 'Failed to update expense' }
    }
  })
