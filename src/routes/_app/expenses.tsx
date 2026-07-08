import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Receipt, IndianRupee, Send, Check, X, BadgeIndianRupee } from 'lucide-react'
import { getExpenses, submitExpense, decideExpense } from '#/server/expenses'
import { Card, CardHeader, KpiCard, Badge } from '#/components/ui'

export const Route = createFileRoute('/_app/expenses')({
  staticData: { title: 'Expenses' },
  loader: () => getExpenses(),
  component: Expenses,
})

const categories = ['travel', 'food', 'software', 'equipment', 'training', 'other']
const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
const rupee = (a: number) => `₹${a.toLocaleString('en-IN')}`
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const statusTone: Record<string, string> = { pending: 'pending', approved: 'info', rejected: 'alert', reimbursed: 'ok' }

function Expenses() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [category, setCategory] = useState('travel')
  const [amount, setAmount] = useState('')
  const [spentOn, setSpentOn] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [acting, setActing] = useState<number | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    await submitExpense({ data: { category: category as never, amount: Number(amount), spentOn, description } })
    setBusy(false)
    setAmount('')
    setSpentOn('')
    setDescription('')
    router.invalidate()
  }
  async function act(id: number, action: 'approve' | 'reject' | 'reimburse') {
    setActing(id)
    await decideExpense({ data: { id, action } })
    setActing(null)
    router.invalidate()
  }

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <KpiCard icon={<IndianRupee size={15} />} label="My reimbursed" value={rupee(d.myReimbursed)} valueTone="green" delta="Paid out" deltaTone="green" footer="Total reimbursed to you" />
        <KpiCard icon={<Receipt size={15} />} label="My in-progress" value={rupee(d.myPending)} delta="Pending + approved" deltaTone="amber" footer="Awaiting reimbursement" />
        <KpiCard icon={<BadgeIndianRupee size={15} />} label="Org pending approval" value={rupee(d.orgPending)} delta="Across company" deltaTone="blue" footer="Claims awaiting review" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Submit a claim" />
          {d.hasProfile ? (
            <form onSubmit={submit} className="space-y-3 px-5 pb-5">
              <div className="grid grid-cols-2 gap-3">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm capitalize">
                  {categories.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
                </select>
                <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount ₹" required className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <input type="date" value={spentOn} onChange={(e) => setSpentOn(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Description" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <button type="submit" disabled={busy} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                <Send size={14} /> {busy ? 'Submitting…' : 'Submit claim'}
              </button>
            </form>
          ) : (
            <p className="px-5 pb-5 text-sm text-slate-500">This account isn’t linked to an employee record.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="My claims" />
          <div className="px-5 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Category</th>
                  <th className="py-2 font-medium">Date</th>
                  <th className="py-2 font-medium">Amount</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {d.mine.length ? d.mine.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 font-medium capitalize text-slate-700">{r.category}</td>
                    <td className="py-2.5 text-slate-500">{fmt(r.spentOn)}</td>
                    <td className="py-2.5 text-slate-500">{rupee(r.amount)}</td>
                    <td className="py-2.5"><Badge tone={statusTone[r.status]} label={cap(r.status)} /></td>
                  </tr>
                )) : <tr><td colSpan={4} className="py-4 text-slate-400">No claims yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {d.canApprove ? (
        <Card>
          <CardHeader title="Approvals & reimbursements" hint={`${d.queue.length} open`} />
          <div className="px-5 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Employee</th>
                  <th className="py-2 font-medium">Category</th>
                  <th className="py-2 font-medium">Amount</th>
                  <th className="py-2 font-medium">Status</th>
                  <th className="py-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {d.queue.length ? d.queue.map((r) => (
                  <tr key={r.id}>
                    <td className="py-2.5 font-medium text-slate-700">{r.name}</td>
                    <td className="py-2.5 capitalize text-slate-500">{r.category}</td>
                    <td className="py-2.5 text-slate-500">{rupee(r.amount)}</td>
                    <td className="py-2.5"><Badge tone={statusTone[r.status]} label={cap(r.status)} /></td>
                    <td className="py-2.5">
                      <div className="flex gap-1.5">
                        {r.status === 'pending' ? (
                          <>
                            <button onClick={() => act(r.id, 'approve')} disabled={acting === r.id} className="flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"><Check size={12} /> Approve</button>
                            <button onClick={() => act(r.id, 'reject')} disabled={acting === r.id} className="flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"><X size={12} /> Reject</button>
                          </>
                        ) : (
                          <button onClick={() => act(r.id, 'reimburse')} disabled={acting === r.id} className="rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50">Mark reimbursed</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )) : <tr><td colSpan={5} className="py-4 text-slate-400">Nothing to review.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
