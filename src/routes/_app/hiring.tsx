import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Briefcase, Users, FileCheck2, UserPlus, ChevronRight, Plus } from 'lucide-react'
import { getHiring, moveApplication, createJob, STAGES } from '#/server/hiring'
import type { Stage } from '#/server/hiring'
import { Card, CardHeader, KpiCard, Avatar, Badge } from '#/components/ui'
import { requireTier } from '#/lib/guards'
import { hasTier } from '#/lib/tiers'

export const Route = createFileRoute('/_app/hiring')({
  staticData: { title: 'Hiring' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getHiring(),
  component: Hiring,
})

const stageLabel: Record<string, string> = {
  applied: 'Applied',
  screened: 'Screened',
  interviewed: 'Interviewed',
  offer: 'Offer',
  joined: 'Joined',
}
const stageColor: Record<string, string> = {
  applied: 'border-t-slate-400',
  screened: 'border-t-blue-400',
  interviewed: 'border-t-violet-400',
  offer: 'border-t-amber-400',
  joined: 'border-t-emerald-500',
}
const sourceLabel: Record<string, string | undefined> = {
  linkedin: 'LinkedIn',
  referral: 'Referral',
  job_boards: 'Job boards',
  agency: 'Agency',
  direct: 'Direct',
}
const depts = ['Engineering', 'Sales', 'Operations', 'Product', 'Marketing', 'Finance', 'HR']

function Hiring() {
  const d = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const canManageJobs = hasTier(user.tier, 'ops')

  const [moving, setMoving] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [role, setRole] = useState('')
  const [dept, setDept] = useState('Engineering')
  const [category, setCategory] = useState('tech')
  const [critical, setCritical] = useState(false)

  async function advance(id: number, current: Stage) {
    const idx = STAGES.indexOf(current)
    if (idx >= STAGES.length - 1) return
    setMoving(id)
    await moveApplication({ data: { id, toStage: STAGES[idx + 1] } })
    setMoving(null)
    router.invalidate()
  }

  async function submitJob(e: React.FormEvent) {
    e.preventDefault()
    if (!role.trim()) return
    await createJob({ data: { role, department: dept, category: category as never, critical } })
    setRole('')
    setCritical(false)
    setShowForm(false)
    router.invalidate()
  }

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Briefcase size={15} />} label="Open roles" value={String(d.kpis.openRoles)} delta={`${d.kpis.critical} critical`} deltaTone="orange" footer="Across all departments" />
        <KpiCard icon={<Users size={15} />} label="In pipeline" value={String(d.kpis.inPipeline)} delta="Active candidates" deltaTone="blue" footer="Applied → interviewed" />
        <KpiCard icon={<FileCheck2 size={15} />} label="At offer stage" value={String(d.kpis.offers)} delta="Pending decision" deltaTone="amber" footer="Offers extended" />
        <KpiCard icon={<UserPlus size={15} />} label="Joined" value={String(d.kpis.joined)} valueTone="green" delta="This quarter" deltaTone="green" footer="Successful hires" />
      </div>

      {/* pipeline kanban */}
      <Card>
        <CardHeader title="Candidate pipeline" hint="Advance candidates through stages" />
        <div className="overflow-x-auto px-5 pb-5">
          <div className="flex min-w-[900px] gap-3">
            {d.columns.map((col) => (
              <div key={col.stage} className="flex-1">
                <div className={`mb-2 rounded-t-lg border-t-4 bg-slate-50 px-3 py-2 ${stageColor[col.stage]}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">{stageLabel[col.stage]}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                      {col.count}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {col.candidates.map((c) => (
                    <div key={c.id} className="rounded-lg border border-slate-200 bg-white p-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={c.name} size={28} />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-700">{c.name}</div>
                          <div className="truncate text-[10px] text-slate-400">{c.department}</div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">{sourceLabel[c.source] ?? c.source}</span>
                        {col.stage !== 'joined' ? (
                          <button
                            onClick={() => advance(c.id, col.stage)}
                            disabled={moving === c.id}
                            className="flex items-center gap-0.5 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-100 disabled:opacity-50"
                          >
                            {moving === c.id ? '…' : <>Advance <ChevronRight size={11} /></>}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {col.count > col.candidates.length ? (
                    <div className="py-1 text-center text-[11px] text-slate-400">
                      +{col.count - col.candidates.length} more
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* job openings */}
      <Card>
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-sm font-semibold text-slate-800">Open positions</h3>
          {canManageJobs ? (
            <button
              onClick={() => setShowForm((s) => !s)}
              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus size={13} /> New role
            </button>
          ) : null}
        </div>

        {showForm ? (
          <form onSubmit={submitJob} className="mx-5 mt-3 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-5">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role title"
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2"
              required
            />
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {depts.map((dp) => <option key={dp}>{dp}</option>)}
            </select>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="tech">Tech</option>
              <option value="sales">Sales</option>
              <option value="others">Others</option>
            </select>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} /> Critical
              </label>
              <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700">
                Add
              </button>
            </div>
          </form>
        ) : null}

        <div className="px-5 pb-4 pt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Dept</th>
                <th className="py-2 font-medium">Applicants</th>
                <th className="py-2 font-medium">Days open</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {d.jobs.map((j) => (
                <tr key={j.id}>
                  <td className="py-2.5 font-medium text-slate-700">{j.role}</td>
                  <td className="py-2.5 text-slate-500">{j.department}</td>
                  <td className="py-2.5 text-slate-500">{j.applicants}</td>
                  <td className="py-2.5 text-slate-500">{j.daysOpen}d</td>
                  <td className="py-2.5"><Badge tone={j.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
