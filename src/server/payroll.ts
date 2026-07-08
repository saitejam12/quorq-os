import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser, canApprove } from '#/server/session'
import type { Result } from '#/server/auth'

const n = (v: unknown) => Number(v ?? 0)
const currentPeriod = () => new Date().toISOString().slice(0, 7) // YYYY-MM

export const getPayroll = createServerFn({ method: 'GET' }).handler(async () => {
  const sql = requireDb()
  const me = await getSessionUser()

  const runs = (await sql`
    select period, status, employee_count, gross_total, deduction_total,
           reimbursement_total, net_total, processed_at
    from payroll_runs order by period desc limit 12`) as Array<any>

  const orgMonthly = n((await sql`select coalesce(sum(net_pay),0) s from employees where status <> 'exited'`)[0].s)
  const empCount = n((await sql`select count(*) c from employees where status <> 'exited'`)[0].c)
  const pendingReimb = n((await sql`select coalesce(sum(amount),0) s from expenses where status='approved'`)[0].s)

  let myPayslips: Array<any> = []
  if (me?.employeeId) {
    myPayslips = (await sql`select period, gross, deductions, reimbursements, net, status
      from payslips where employee_id=${me.employeeId} order by period desc limit 6`) as Array<any>
  }

  return {
    canRun: canApprove(me),
    currentPeriod: currentPeriod(),
    orgMonthlyL: Math.round((orgMonthly / 100000) * 10) / 10,
    empCount,
    pendingReimb,
    runs: runs.map((r) => ({
      period: r.period,
      status: r.status,
      employees: n(r.employee_count),
      grossL: Math.round((n(r.gross_total) / 100000) * 10) / 10,
      netL: Math.round((n(r.net_total) / 100000) * 10) / 10,
      reimbursement: n(r.reimbursement_total),
      processedAt: r.processed_at,
    })),
    myPayslips: myPayslips.map((p) => ({
      period: p.period,
      gross: Number(p.gross),
      deductions: Number(p.deductions),
      reimbursements: Number(p.reimbursements),
      net: Number(p.net),
      status: p.status,
    })),
  }
})

export const runPayroll = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional() }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<{ employees: number; reimbursed: number }>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me)) return { ok: false, error: 'Only ops and master can run payroll' }

      const period = data.period || currentPeriod()
      const emps = (await sql`select id, name, department, ctc, net_pay from employees where status <> 'exited'`) as Array<any>
      const expRows = (await sql`select employee_id, coalesce(sum(amount),0) s from expenses where status='approved' group by employee_id`) as Array<any>
      const reimbByEmp: Record<number, number | undefined> = {}
      for (const r of expRows) reimbByEmp[n(r.employee_id)] = n(r.s)

      // replace any existing run for the period
      const existing = (await sql`select id from payroll_runs where period=${period}`)[0] as
        | { id: number }
        | undefined
      if (existing) {
        await sql`delete from payslips where run_id=${existing.id}`
        await sql`delete from payroll_runs where id=${existing.id}`
      }

      let gT = 0
      let dT = 0
      let rT = 0
      let nT = 0
      const slips = emps.map((e) => {
        const gross = Math.round(Number(e.ctc) / 12)
        const net = Number(e.net_pay)
        const reimb = reimbByEmp[e.id] ?? 0
        const deductions = Math.max(0, gross - net)
        const netFinal = net + reimb
        gT += gross
        dT += deductions
        rT += reimb
        nT += netFinal
        return { id: e.id, name: e.name, department: e.department, gross, deductions, reimb, netFinal }
      })

      const run = (await sql`
        insert into payroll_runs
          (period, status, employee_count, gross_total, deduction_total, reimbursement_total, net_total)
        values (${period}, 'processed', ${emps.length}, ${gT}, ${dT}, ${rT}, ${nT})
        returning id`)[0] as { id: number }

      // chunked multi-row payslip insert
      const cols = ['run_id', 'employee_id', 'employee_name', 'department', 'period', 'gross', 'deductions', 'lop_days', 'reimbursements', 'net', 'status']
      for (let i = 0; i < slips.length; i += 200) {
        const chunk = slips.slice(i, i + 200)
        const values = chunk
          .map((_, r) => `(${cols.map((__, c) => `$${r * cols.length + c + 1}`).join(',')})`)
          .join(',')
        const params = chunk.flatMap((s) => [
          run.id, s.id, s.name, s.department, period, s.gross, s.deductions, 0, s.reimb, s.netFinal, 'paid',
        ])
        await sql.query(`insert into payslips (${cols.join(',')}) values ${values}`, params)
      }

      // cascade: approved expenses are now paid out via payroll
      await sql`update expenses set status='reimbursed' where status='approved'`

      return { ok: true, data: { employees: emps.length, reimbursed: rT } }
    } catch (error) {
      console.error('runPayroll failed', error)
      return { ok: false, error: 'Payroll processing failed' }
    }
  })
