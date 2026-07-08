import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Briefcase, Users, FileCheck2, UserPlus, ChevronRight } from 'lucide-react'
import { getHiring, moveApplication, STAGES } from '#/server/hiring'
import type { Stage } from '#/server/hiring'
import { Card, CardHeader, KpiCard, Avatar } from '#/components/ui'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/hiring')({
  staticData: { title: 'Applications' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getHiring(),
  component: Applications,
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

function Applications() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [moving, setMoving] = useState<number | null>(null)

  async function advance(id: number, current: Stage) {
    const idx = STAGES.indexOf(current)
    if (idx >= STAGES.length - 1) return
    setMoving(id)
    await moveApplication({ data: { id, toStage: STAGES[idx + 1] } })
    setMoving(null)
    router.invalidate()
  }

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Briefcase size={15} />} label="Open roles" value={String(d.kpis.openRoles)} delta={`${d.kpis.critical} critical`} deltaTone="orange" footer="Active postings" />
        <KpiCard icon={<Users size={15} />} label="In pipeline" value={String(d.kpis.inPipeline)} delta="Active candidates" deltaTone="blue" footer="Applied → interviewed" />
        <KpiCard icon={<FileCheck2 size={15} />} label="At offer stage" value={String(d.kpis.offers)} delta="Pending decision" deltaTone="amber" footer="Offers extended" />
        <KpiCard icon={<UserPlus size={15} />} label="Joined" value={String(d.kpis.joined)} valueTone="green" delta="This quarter" deltaTone="green" footer="Successful hires" />
      </div>

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
    </div>
  )
}
