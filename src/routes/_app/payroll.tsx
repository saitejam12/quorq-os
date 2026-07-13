import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { Wallet, Users, IndianRupee, Play, Search, X, Plus, Loader2, Trash2 } from 'lucide-react'
import {
  getPayroll,
  runPayroll,
  getEmployeePayroll,
  updateSalaryComponents,
  addAdjustment,
  deleteAdjustment,
} from '#/server/payroll'
import { summarize, waterfallSegments, adjustmentSign } from '#/lib/payroll'
import type { AdjustmentKind } from '#/lib/payroll'
import { Card, CardHeader, KpiCard, Badge, Money, LedgerLine, Avatar, inr } from '#/components/ui'
import { PayWaterfall } from '#/components/charts'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/payroll')({
  staticData: { title: 'Payroll' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getPayroll(),
  component: Payroll,
})

const fmtPeriod = (p: string) => {
  const [y, m] = p.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}
const rupee = (a: number) => `₹${a.toLocaleString('en-IN')}`

type EditRow = { code: string; label: string; kind: 'earning' | 'deduction'; amount: number; sortOrder: number }
type EmpPayroll = Awaited<ReturnType<typeof getEmployeePayroll>>

const ADJ_KINDS: Array<AdjustmentKind> = ['bonus', 'reimbursement', 'deduction', 'lop']
const adjLabel: Record<AdjustmentKind, string> = {
  bonus: 'Bonus', reimbursement: 'Reimbursement', deduction: 'Deduction', lop: 'Loss of pay',
}

function AdjustmentForm({ employeeId, period, onDone }: { employeeId: number; period: string; onDone: () => void }) {
  const [kind, setKind] = useState<AdjustmentKind>('bonus')
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(amount)
    if (!label.trim() || !(amt > 0)) return
    setBusy(true)
    await addAdjustment({ data: { employeeId, period, kind, label: label.trim(), amount: amt } })
    setBusy(false)
    setLabel('')
    setAmount('')
    onDone()
  }

  return (
    <form onSubmit={submit} className="mt-2 flex flex-wrap items-center gap-2">
      <select value={kind} onChange={(e) => setKind(e.target.value as AdjustmentKind)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs">
        {ADJ_KINDS.map((k) => <option key={k} value={k}>{adjLabel[k]}</option>)}
      </select>
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
      <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="Amount" className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-xs" />
      <button type="submit" disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Add
      </button>
    </form>
  )
}

function EmployeeDrawer({ employeeId, onClose, onSaved }: { employeeId: number; onClose: () => void; onSaved: () => void }) {
  const [d, setD] = useState<EmpPayroll>(null)
  const [rows, setRows] = useState<Array<EditRow>>([])
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const res = await getEmployeePayroll({ data: employeeId })
    setD(res)
    if (res) {
      setRows([
        ...res.earnings.map((e) => ({ ...e, kind: 'earning' as const })),
        ...res.deductions.map((x) => ({ ...x, kind: 'deduction' as const })),
      ])
    }
  }, [employeeId])

  useEffect(() => { void load() }, [load])

  if (!d) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400">
        <Loader2 size={18} className="animate-spin" />
      </div>
    )
  }

  const totals = summarize(rows)
  const earnings = rows.filter((r) => r.kind === 'earning')
  const deductions = rows.filter((r) => r.kind === 'deduction')
  const segs = waterfallSegments(earnings, deductions)
  const dirty = JSON.stringify(rows) !== JSON.stringify([
    ...d.earnings.map((e) => ({ ...e, kind: 'earning' })),
    ...d.deductions.map((x) => ({ ...x, kind: 'deduction' })),
  ])

  function setAmount(code: string, kind: string, value: number) {
    setRows((rs) => rs.map((r) => (r.code === code && r.kind === kind ? { ...r, amount: value } : r)))
  }

  async function save() {
    if (totals.net < 0) { setMsg('Net pay would be negative.'); return }
    setSaving(true)
    setMsg('')
    const res = await updateSalaryComponents({ data: { employeeId, components: rows } })
    setSaving(false)
    if (res.ok) {
      setMsg('Saved.')
      await load()
      onSaved()
    } else {
      setMsg(res.error)
    }
  }

  async function removeAdj(id: number) {
    await deleteAdjustment({ data: { id } })
    await load()
    onSaved()
  }

  const adjForPeriod = d.adjustments.filter((a) => a.period === d.currentPeriod)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between border-b border-slate-100 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={d.employee.name} size={40} />
          <div>
            <div className="text-sm font-semibold text-slate-800">{d.employee.name}</div>
            <div className="text-xs text-slate-400">
              {d.employee.designation} · {d.employee.department}
              {d.employee.empCode ? ` · ${d.employee.empCode}` : ''}
            </div>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="text-slate-300 hover:text-slate-600">
          <X size={18} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <PayWaterfall segments={segs} />

        <LedgerLine label="Earnings" />
        <div className="space-y-1.5">
          {earnings.map((r) => (
            <div key={r.code} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">{r.label}</span>
              <div className="flex items-center gap-1 text-sm">
                <span className="tabular text-slate-400">₹</span>
                <input
                  value={r.amount}
                  onChange={(e) => setAmount(r.code, r.kind, Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  inputMode="numeric"
                  className="tabular w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-emerald-600 focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-sm font-semibold">
            <span className="text-slate-500">Gross</span>
            <Money value={totals.gross} tone="ink" />
          </div>
        </div>

        <LedgerLine label="Deductions" />
        <div className="space-y-1.5">
          {deductions.map((r) => (
            <div key={r.code} className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">{r.label}</span>
              <div className="flex items-center gap-1 text-sm">
                <span className="tabular text-slate-400">−₹</span>
                <input
                  value={r.amount}
                  onChange={(e) => setAmount(r.code, r.kind, Math.max(0, Math.round(Number(e.target.value) || 0)))}
                  inputMode="numeric"
                  className="tabular w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-rose-600 focus:border-blue-400 focus:outline-none"
                />
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-sm font-semibold">
            <span className="text-slate-500">Total deductions</span>
            <Money value={totals.totalDeductions} tone="deduction" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-slate-900 px-4 py-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-300">Net pay</span>
          <Money value={totals.net} tone="muted" className="!text-white text-lg font-bold" />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <button onClick={save} disabled={saving || !dirty} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 size={15} className="animate-spin" /> : null} Save structure
          </button>
          {msg ? <span className={`text-xs ${msg === 'Saved.' ? 'text-emerald-600' : 'text-rose-600'}`}>{msg}</span> : null}
        </div>

        <LedgerLine label={`Adjustments · ${fmtPeriod(d.currentPeriod)}`} />
        {adjForPeriod.length ? (
          <ul className="space-y-1.5">
            {adjForPeriod.map((a) => {
              const signed = adjustmentSign(a.kind) * a.amount
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-slate-600">
                    <Badge tone={signed >= 0 ? 'ok' : 'warn'} label={adjLabel[a.kind as AdjustmentKind]} /> {a.label}
                  </span>
                  <Money value={signed} sign tone={signed >= 0 ? 'earning' : 'deduction'} />
                  <button onClick={() => removeAdj(a.id)} aria-label="Remove" className="text-slate-300 hover:text-rose-500">
                    <Trash2 size={14} />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="text-xs text-slate-400">No adjustments this period.</p>
        )}
        <AdjustmentForm employeeId={employeeId} period={d.currentPeriod} onDone={() => { void load(); onSaved() }} />

        <LedgerLine label="Payslip history" />
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="py-1 font-medium">Period</th>
              <th className="py-1 text-right font-medium">Gross</th>
              <th className="py-1 text-right font-medium">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {d.payslips.length ? d.payslips.map((p) => (
              <tr key={p.period}>
                <td className="py-1.5 text-slate-600">{fmtPeriod(p.period)}</td>
                <td className="py-1.5 text-right"><Money value={p.gross} tone="muted" /></td>
                <td className="py-1.5 text-right"><Money value={p.net} tone="ink" /></td>
              </tr>
            )) : <tr><td colSpan={3} className="py-2 text-slate-400">No payslips yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Payroll() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [period, setPeriod] = useState(d.currentPeriod)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<number | null>(null)

  async function run() {
    setBusy(true)
    setMsg('')
    const res = await runPayroll({ data: { period } })
    setBusy(false)
    if (res.ok) setMsg(`Processed ${res.data.employees} payslips · ${rupee(res.data.reimbursed)} reimbursements rolled in.`)
    else setMsg(res.error)
    router.invalidate()
  }

  const roster = d.roster.filter((r) => {
    const q = query.trim().toLowerCase()
    return !q || r.name.toLowerCase().includes(q) || r.department.toLowerCase().includes(q)
  })

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<IndianRupee size={15} />} label="Monthly payroll" value={inr(d.orgMonthlyL)} delta="Net pay run" deltaTone="slate" footer="Sum of net pay" />
        <KpiCard icon={<Users size={15} />} label="Employees on payroll" value={String(d.empCount)} delta="Active" deltaTone="blue" footer="Eligible this cycle" />
        <KpiCard icon={<Wallet size={15} />} label="Pending reimbursements" value={rupee(d.pendingReimb)} delta="Approved expenses" deltaTone="amber" footer="Roll into next run" />
        <KpiCard icon={<Play size={15} />} label="Payroll runs" value={String(d.runs.length)} delta="Processed" deltaTone="green" footer="History below" />
      </div>

      {d.canRun ? (
        <Card>
          <CardHeader title="Run payroll" hint="Generates payslips from salary structures + rolls in approved expenses" />
          <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <button onClick={run} disabled={busy} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
              <Play size={15} /> {busy ? 'Processing…' : 'Run payroll'}
            </button>
            {msg ? <span className="text-sm text-emerald-600">{msg}</span> : null}
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className={selected ? 'lg:col-span-3' : 'lg:col-span-5'}>
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-sm font-semibold text-slate-800">Employee payroll</h3>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or dept…" className="rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-sm" />
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto px-5 pb-4 pt-3">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Employee</th>
                  <th className="py-2 font-medium">Department</th>
                  <th className="py-2 text-right font-medium">Net / mo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {roster.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r.id)} className={`cursor-pointer ${selected === r.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <td className="py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={r.name} size={30} />
                        <span className="font-medium text-slate-700">{r.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 text-slate-500">{r.department}</td>
                    <td className="py-2.5 text-right"><Money value={r.netPay} tone="ink" /></td>
                  </tr>
                ))}
                {roster.length === 0 ? <tr><td colSpan={3} className="py-4 text-slate-400">No matching employees.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </Card>

        {selected ? (
          <Card className="lg:col-span-2">
            <EmployeeDrawer employeeId={selected} onClose={() => setSelected(null)} onSaved={() => router.invalidate()} />
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader title="Payroll history" />
        <div className="px-5 pb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 font-medium">Period</th>
                <th className="py-2 font-medium">Employees</th>
                <th className="py-2 font-medium">Gross</th>
                <th className="py-2 font-medium">Reimbursements</th>
                <th className="py-2 font-medium">Net</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {d.runs.length ? d.runs.map((r) => (
                <tr key={r.period}>
                  <td className="py-2.5 font-medium text-slate-700">{fmtPeriod(r.period)}</td>
                  <td className="py-2.5 text-slate-500">{r.employees}</td>
                  <td className="py-2.5 text-slate-500">{inr(r.grossL)}</td>
                  <td className="py-2.5 text-slate-500">{rupee(r.reimbursement)}</td>
                  <td className="py-2.5 font-medium text-slate-700">{inr(r.netL)}</td>
                  <td className="py-2.5"><Badge tone="ok" label={r.status[0].toUpperCase() + r.status.slice(1)} /></td>
                </tr>
              )) : <tr><td colSpan={6} className="py-4 text-slate-400">No payroll runs yet — run one above.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
