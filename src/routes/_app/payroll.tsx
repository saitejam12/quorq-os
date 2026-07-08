import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Wallet, Users, IndianRupee, Play } from 'lucide-react'
import { getPayroll, runPayroll } from '#/server/payroll'
import { Card, CardHeader, KpiCard, Badge, inr } from '#/components/ui'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/payroll')({
  staticData: { title: 'Payroll' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getPayroll(),
  component: Payroll,
})

const fmtPeriod = (p: string) => {
  const [y, m] = p.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}
const rupee = (a: number) => `₹${a.toLocaleString('en-IN')}`

function Payroll() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [period, setPeriod] = useState(d.currentPeriod)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function run() {
    setBusy(true)
    setMsg('')
    const res = await runPayroll({ data: { period } })
    setBusy(false)
    if (res.ok) {
      setMsg(
        `Processed ${res.data.employees} payslips · ${rupee(res.data.reimbursed)} reimbursements rolled in.`,
      )
    } else {
      setMsg(res.error)
    }
    router.invalidate()
  }

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
          <CardHeader title="Run payroll" hint="Generates payslips & rolls in approved expenses" />
          <div className="flex flex-wrap items-center gap-3 px-5 pb-5">
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
            <button
              onClick={run}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Play size={15} /> {busy ? 'Processing…' : 'Run payroll'}
            </button>
            {msg ? <span className="text-sm text-emerald-600">{msg}</span> : null}
          </div>
        </Card>
      ) : null}

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
