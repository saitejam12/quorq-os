import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireDb } from '#/db'
import { getSessionUser, canApprove } from '#/server/session'
import type { Result } from '#/server/auth'
import { buildStructure, summarize, applyAdjustments } from '#/lib/payroll'
import type { AdjustmentKind } from '#/lib/payroll'

const n = (v: unknown) => Number(v ?? 0)
const currentPeriod = () => new Date().toISOString().slice(0, 7) // YYYY-MM

const componentSchema = z.object({
  code: z.string().min(1).max(24),
  label: z.string().min(1).max(64),
  kind: z.enum(['earning', 'deduction']),
  amount: z.number().nonnegative().max(100_000_000),
  sortOrder: z.number().int().min(0).max(99),
})

export const getPayroll = createServerFn({ method: 'GET' }).handler(
  async () => {
    const sql = requireDb()
    const me = await getSessionUser()

    const runs = (await sql`
    select period, status, employee_count, gross_total, deduction_total,
           reimbursement_total, net_total, processed_at
    from payroll_runs order by period desc limit 12`) as Array<any>

    const orgMonthly = n(
      (
        await sql`select coalesce(sum(net_pay),0) s from employees where status <> 'exited'`
      )[0].s,
    )
    const empCount = n(
      (await sql`select count(*) c from employees where status <> 'exited'`)[0]
        .c,
    )
    const pendingReimb = n(
      (
        await sql`select coalesce(sum(amount),0) s from expenses where status='approved'`
      )[0].s,
    )

    const roster = (await sql`
    select id, name, department, emp_code, net_pay
    from employees where status <> 'exited' order by name`) as Array<any>

    let myPayslips: Array<any> = []
    if (me?.employeeId) {
      myPayslips =
        (await sql`select period, gross, deductions, reimbursements, net, status
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
      roster: roster.map((r) => ({
        id: r.id,
        name: r.name,
        department: r.department,
        empCode: r.emp_code ?? null,
        netPay: Number(r.net_pay),
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
  },
)

export const getEmployeePayroll = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.number().int().positive().parse(d))
  .handler(async ({ data: employeeId }) => {
    const sql = requireDb()
    const me = await getSessionUser()
    if (!canApprove(me)) return null

    const emp = (
      await sql`select id, name, designation, department, emp_code, status, ctc, net_pay
      from employees where id=${employeeId}`
    )[0] as
      | {
          id: number
          name: string
          designation: string
          department: string
          emp_code: string | null
          status: string
          ctc: string
          net_pay: string
        }
      | undefined
    if (!emp) return null

    let comps = (await sql`select code, label, kind, amount, sort_order
      from salary_components where employee_id=${employeeId} order by kind desc, sort_order`) as Array<any>
    // Fallback for employees without a stored structure (e.g. onboarding-created):
    // derive one from ctc/net_pay so the panel is never empty.
    if (!comps.length) {
      const s = buildStructure({
        ctc: Number(emp.ctc),
        netPay: Number(emp.net_pay),
      })
      comps = [...s.earnings, ...s.deductions].map((c) => ({
        code: c.code,
        label: c.label,
        kind: c.kind,
        amount: c.amount,
        sort_order: c.sortOrder,
      }))
    }
    const earnings = comps
      .filter((c) => c.kind === 'earning')
      .map((c) => ({
        code: c.code,
        label: c.label,
        amount: Number(c.amount),
        sortOrder: n(c.sort_order),
      }))
    const deductions = comps
      .filter((c) => c.kind === 'deduction')
      .map((c) => ({
        code: c.code,
        label: c.label,
        amount: Number(c.amount),
        sortOrder: n(c.sort_order),
      }))
    const gross = earnings.reduce((a, c) => a + c.amount, 0)
    const totalDeductions = deductions.reduce((a, c) => a + c.amount, 0)

    const period = currentPeriod()
    const adjustments =
      (await sql`select id, period, kind, label, amount, note, created_at
      from pay_adjustments where employee_id=${employeeId} order by created_at desc`) as Array<any>
    const payslips =
      (await sql`select period, gross, deductions, reimbursements, net, lop_days, status
      from payslips where employee_id=${employeeId} order by period desc limit 12`) as Array<any>

    return {
      employee: {
        id: emp.id,
        name: emp.name,
        designation: emp.designation,
        department: emp.department,
        empCode: emp.emp_code ?? null,
        status: emp.status,
      },
      earnings,
      deductions,
      gross,
      totalDeductions,
      net: gross - totalDeductions,
      currentPeriod: period,
      adjustments: adjustments.map((a) => ({
        id: a.id,
        period: a.period,
        kind: a.kind,
        label: a.label,
        amount: Number(a.amount),
        note: a.note,
        createdAt: a.created_at,
      })),
      payslips: payslips.map((p) => ({
        period: p.period,
        gross: Number(p.gross),
        deductions: Number(p.deductions),
        reimbursements: Number(p.reimbursements),
        net: Number(p.net),
        lopDays: Number(p.lop_days),
        status: p.status,
      })),
    }
  })

export const updateSalaryComponents = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        employeeId: z.number().int().positive(),
        components: z.array(componentSchema).min(1).max(40),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<
      Result<{ gross: number; totalDeductions: number; net: number }>
    > => {
      try {
        const sql = requireDb()
        const me = await getSessionUser()
        if (!canApprove(me))
          return { ok: false, error: 'Only ops and master can edit payroll' }

        const totals = summarize(data.components)
        if (totals.net < 0)
          return {
            ok: false,
            error: 'Deductions exceed earnings — net pay would be negative',
          }

        // Run the delete, inserts, and write-back as one transaction over a single
        // HTTP round-trip so a mid-sequence failure can't leave a partial structure.
        const queries = [
          sql`delete from salary_components where employee_id=${data.employeeId}`,
          ...data.components.map(
            (c) =>
              sql`insert into salary_components (employee_id, kind, code, label, amount, sort_order)
            values (${data.employeeId}, ${c.kind}, ${c.code}, ${c.label}, ${c.amount}, ${c.sortOrder})`,
          ),
          sql`update employees set net_pay=${totals.net}, ctc=${Math.round(totals.gross * 12)} where id=${data.employeeId}`,
        ]
        await sql.transaction(queries)

        return { ok: true, data: totals }
      } catch (error) {
        console.error('updateSalaryComponents failed', error)
        return { ok: false, error: 'Failed to update salary structure' }
      }
    },
  )

export const addAdjustment = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        employeeId: z.number().int().positive(),
        period: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .nullable(),
        kind: z.enum(['bonus', 'deduction', 'reimbursement', 'lop']),
        label: z.string().min(1).max(64),
        amount: z.number().positive().max(100_000_000),
        note: z.string().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me))
        return { ok: false, error: 'Only ops and master can add adjustments' }
      await sql`insert into pay_adjustments (employee_id, period, kind, label, amount, note, created_by)
        values (${data.employeeId}, ${data.period}, ${data.kind}, ${data.label.trim()}, ${data.amount}, ${data.note || null}, ${me?.name ?? 'Unknown'})`
      return { ok: true, data: null }
    } catch (error) {
      console.error('addAdjustment failed', error)
      return { ok: false, error: 'Failed to add adjustment' }
    }
  })

export const deleteAdjustment = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z.object({ id: z.number().int().positive() }).parse(d),
  )
  .handler(async ({ data }): Promise<Result<null>> => {
    try {
      const sql = requireDb()
      const me = await getSessionUser()
      if (!canApprove(me))
        return {
          ok: false,
          error: 'Only ops and master can remove adjustments',
        }
      await sql`delete from pay_adjustments where id=${data.id}`
      return { ok: true, data: null }
    } catch (error) {
      console.error('deleteAdjustment failed', error)
      return { ok: false, error: 'Failed to remove adjustment' }
    }
  })

export const runPayroll = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        period: z
          .string()
          .regex(/^\d{4}-\d{2}$/)
          .optional(),
      })
      .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<Result<{ employees: number; reimbursed: number }>> => {
      try {
        const sql = requireDb()
        const me = await getSessionUser()
        if (!canApprove(me))
          return { ok: false, error: 'Only ops and master can run payroll' }

        const period = data.period || currentPeriod()
        const emps =
          (await sql`select id, name, department, ctc, net_pay from employees where status <> 'exited'`) as Array<any>

        const compRows = (await sql`
        select employee_id,
               coalesce(sum(amount) filter (where kind='earning'),0) gross,
               coalesce(sum(amount) filter (where kind='deduction'),0) ded
        from salary_components group by employee_id`) as Array<any>
        const structByEmp: Record<
          number,
          { gross: number; ded: number } | undefined
        > = {}
        for (const r of compRows)
          structByEmp[n(r.employee_id)] = { gross: n(r.gross), ded: n(r.ded) }

        const adjRows =
          (await sql`select employee_id, kind, amount from pay_adjustments where period=${period}`) as Array<any>
        const adjByEmp: Record<
          number,
          Array<{ kind: AdjustmentKind; amount: number }> | undefined
        > = {}
        for (const r of adjRows)
          (adjByEmp[n(r.employee_id)] ??= []).push({
            kind: r.kind,
            amount: n(r.amount),
          })

        const expRows =
          (await sql`select employee_id, coalesce(sum(amount),0) s from expenses where status='approved' group by employee_id`) as Array<any>
        const reimbByEmp: Record<number, number | undefined> = {}
        for (const r of expRows) reimbByEmp[n(r.employee_id)] = n(r.s)

        const existing = (
          await sql`select id from payroll_runs where period=${period}`
        )[0] as { id: number } | undefined
        if (existing) {
          await sql`delete from payslips where run_id=${existing.id}`
          await sql`delete from payroll_runs where id=${existing.id}`
        }

        let gT = 0
        let dT = 0
        let rT = 0
        let nT = 0
        const slips = emps.map((e) => {
          const struct = structByEmp[e.id] ?? {
            gross: Math.round(Number(e.ctc) / 12),
            ded: Math.max(
              0,
              Math.round(Number(e.ctc) / 12) - Number(e.net_pay),
            ),
          }
          const adjustments = adjByEmp[e.id] ?? []
          const expenseReimb = reimbByEmp[e.id] ?? 0
          const reimbAdj = adjustments
            .filter((a) => a.kind === 'reimbursement')
            .reduce((a, x) => a + x.amount, 0)
          const reimb = expenseReimb + reimbAdj
          const baseNet = struct.gross - struct.ded
          // applyAdjustments handles bonus/deduction/lop; reimbursements are folded into reimb below.
          const nonReimbAdj = adjustments.filter(
            (a) => a.kind !== 'reimbursement',
          )
          const netFinal = applyAdjustments(baseNet, nonReimbAdj) + reimb
          const lopDays = 0
          gT += struct.gross
          dT += struct.ded
          rT += reimb
          nT += netFinal
          return {
            id: e.id,
            name: e.name,
            department: e.department,
            gross: struct.gross,
            deductions: struct.ded,
            reimb,
            netFinal,
            lopDays,
          }
        })

        const run = (
          await sql`
        insert into payroll_runs
          (period, status, employee_count, gross_total, deduction_total, reimbursement_total, net_total)
        values (${period}, 'processed', ${emps.length}, ${gT}, ${dT}, ${rT}, ${nT})
        returning id`
        )[0] as { id: number }

        // chunked multi-row payslip insert
        const cols = [
          'run_id',
          'employee_id',
          'employee_name',
          'department',
          'period',
          'gross',
          'deductions',
          'lop_days',
          'reimbursements',
          'net',
          'status',
        ]
        for (let i = 0; i < slips.length; i += 200) {
          const chunk = slips.slice(i, i + 200)
          const values = chunk
            .map(
              (_, r) =>
                `(${cols.map((__, c) => `$${r * cols.length + c + 1}`).join(',')})`,
            )
            .join(',')
          const params = chunk.flatMap((s) => [
            run.id,
            s.id,
            s.name,
            s.department,
            period,
            s.gross,
            s.deductions,
            s.lopDays,
            s.reimb,
            s.netFinal,
            'paid',
          ])
          await sql.query(
            `insert into payslips (${cols.join(',')}) values ${values}`,
            params,
          )
        }

        // cascade: approved expenses are now paid out via payroll
        await sql`update expenses set status='reimbursed' where status='approved'`

        return { ok: true, data: { employees: emps.length, reimbursed: rT } }
      } catch (error) {
        console.error('runPayroll failed', error)
        return { ok: false, error: 'Payroll processing failed' }
      }
    },
  )
