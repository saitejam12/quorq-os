import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { CalendarDays, Wallet, Send, Check, X } from 'lucide-react'
import { getLeave, applyLeave, decideLeave } from '#/server/leave'
import { Card, CardHeader, KpiCard, Badge } from '#/components/ui'

export const Route = createFileRoute('/_app/leave')({
  staticData: { title: 'Leave management' },
  loader: () => getLeave(),
  component: LeaveManagement,
})

const types = ['casual', 'sick', 'earned', 'comp-off', 'maternity', 'paternity']
const fmt = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
const cap = (s: string) =>
  s === 'comp-off' ? 'Comp-off' : s[0].toUpperCase() + s.slice(1)

function LeaveManagement() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [type, setType] = useState('casual')
  const [startDate, setStartDate] = useState('')
  const [days, setDays] = useState(1)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState<number | null>(null)

  async function apply(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    await applyLeave({ data: { type: type as never, startDate, days, reason } })
    setBusy(false)
    setStartDate('')
    setDays(1)
    setReason('')
    router.invalidate()
  }
  async function decide(id: number, approve: boolean) {
    setActing(id)
    await decideLeave({ data: { id, action: approve ? 'approve' : 'reject' } })
    setActing(null)
    router.invalidate()
  }

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <KpiCard
          icon={<Wallet size={15} />}
          label="Leave balance"
          value={`${d.balance} days`}
          valueTone="green"
          delta={`of ${d.entitled} entitled`}
          deltaTone="slate"
          footer="Available to use"
        />
        <KpiCard
          icon={<CalendarDays size={15} />}
          label="Used this year"
          value={`${d.used} days`}
          delta="Approved leave"
          deltaTone="blue"
          footer="Across all types"
        />
        <KpiCard
          icon={<CalendarDays size={15} />}
          label="Pending requests"
          value={`${d.myRequests.filter((r) => r.status === 'pending').length}`}
          delta="Awaiting approval"
          deltaTone="amber"
          footer="Your open requests"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Apply for leave" />
          {d.hasProfile ? (
            <form onSubmit={apply} className="space-y-3 px-5 pb-5">
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm capitalize"
                >
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {cap(t)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Days"
                />
              </div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Reason (optional)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Send size={14} /> {busy ? 'Submitting…' : 'Submit request'}
              </button>
            </form>
          ) : (
            <p className="px-5 pb-5 text-sm text-slate-500">
              This account isn’t linked to an employee record.
            </p>
          )}
        </Card>

        <Card>
          <CardHeader title="My requests" />
          <div className="px-5 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium">From</th>
                  <th className="py-2 font-medium">Days</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {d.myRequests.length ? (
                  d.myRequests.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 font-medium text-slate-700">
                        {cap(r.type)}
                      </td>
                      <td className="py-2.5 text-slate-500">
                        {fmt(r.startDate)}
                      </td>
                      <td className="py-2.5 text-slate-500">{r.days}</td>
                      <td className="py-2.5">
                        <Badge
                          tone={
                            r.status === 'approved'
                              ? 'ok'
                              : r.status === 'rejected'
                                ? 'alert'
                                : 'pending'
                          }
                          label={cap(r.status)}
                        />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-slate-400">
                      No requests yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {d.canApprove ? (
        <Card>
          <CardHeader
            title="Approvals queue"
            hint={`${d.pending.length} pending`}
          />
          <div className="px-5 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Employee</th>
                  <th className="py-2 font-medium">Dept</th>
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium">From</th>
                  <th className="py-2 font-medium">Days</th>
                  <th className="py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {d.pending.length ? (
                  d.pending.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 font-medium text-slate-700">
                        {r.name}
                      </td>
                      <td className="py-2.5 text-slate-500">{r.department}</td>
                      <td className="py-2.5 text-slate-500">{cap(r.type)}</td>
                      <td className="py-2.5 text-slate-500">
                        {fmt(r.startDate)}
                      </td>
                      <td className="py-2.5 text-slate-500">{r.days}</td>
                      <td className="py-2.5">
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => decide(r.id, true)}
                            disabled={acting === r.id}
                            className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                          >
                            <Check size={12} /> Approve
                          </button>
                          <button
                            onClick={() => decide(r.id, false)}
                            disabled={acting === r.id}
                            className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                          >
                            <X size={12} /> Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-4 text-slate-400">
                      No pending approvals 🎉
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
