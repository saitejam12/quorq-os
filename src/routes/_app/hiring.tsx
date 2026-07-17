import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Briefcase,
  Users,
  FileCheck2,
  UserPlus,
  ChevronRight,
  X,
  XCircle,
} from 'lucide-react'
import {
  getHiring,
  moveApplication,
  declineApplication,
  STAGES,
} from '#/server/hiring'
import type { Stage } from '#/server/hiring'
import {
  Card,
  CardHeader,
  KpiCard,
  Avatar,
  Badge,
  LedgerLine,
} from '#/components/ui'
import { HBars } from '#/components/charts'
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
const DECLINE_REASONS = [
  'salary',
  'location',
  'counter_offer',
  'other',
] as const
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })

type Candidate = {
  id: number
  name: string
  department: string
  source: string
  appliedDate: string
  role: string
}

function CandidateDrawer({
  candidate,
  stage,
  onClose,
  onChanged,
}: {
  candidate: Candidate
  stage: Stage
  onClose: () => void
  onChanged: () => void
}) {
  const [reason, setReason] =
    useState<(typeof DECLINE_REASONS)[number]>('other')
  const [busy, setBusy] = useState(false)

  async function advance() {
    const idx = STAGES.indexOf(stage)
    if (idx >= STAGES.length - 1) return
    setBusy(true)
    await moveApplication({
      data: { id: candidate.id, toStage: STAGES[idx + 1] },
    })
    setBusy(false)
    onChanged()
  }
  async function decline() {
    setBusy(true)
    await declineApplication({ data: { id: candidate.id, reason } })
    setBusy(false)
    onChanged()
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-slate-900/20"
      onClick={onClose}
    >
      <div
        className="h-full w-full max-w-sm bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 p-4">
          <div className="flex items-center gap-3">
            <Avatar name={candidate.name} size={44} />
            <div>
              <div className="text-sm font-semibold text-slate-800">
                {candidate.name}
              </div>
              <div className="text-xs text-slate-400">
                {candidate.role} · {candidate.department}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-300 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-4">
          <LedgerLine label="Candidate" />
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Stage</dt>
              <dd>
                <Badge tone="info" label={stageLabel[stage]} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Source</dt>
              <dd className="text-slate-600">
                {sourceLabel[candidate.source] ?? candidate.source}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Applied</dt>
              <dd className="text-slate-600">
                {fmtDate(candidate.appliedDate)}
              </dd>
            </div>
          </dl>

          <LedgerLine label="Actions" />
          {stage !== 'joined' ? (
            <button
              onClick={advance}
              disabled={busy}
              className="mb-3 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Advance to {stageLabel[STAGES[STAGES.indexOf(stage) + 1]]}{' '}
              <ChevronRight size={14} />
            </button>
          ) : null}
          <div className="rounded-lg border border-rose-100 bg-rose-50/50 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-rose-600">
              <XCircle size={13} /> Decline candidate
            </div>
            <div className="flex gap-2">
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as typeof reason)}
                className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs capitalize"
              >
                {DECLINE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r.replace('_', ' ')}
                  </option>
                ))}
              </select>
              <button
                onClick={decline}
                disabled={busy}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Applications() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [active, setActive] = useState<{
    candidate: Candidate
    stage: Stage
  } | null>(null)

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Briefcase size={15} />}
          label="Open roles"
          value={String(d.kpis.openRoles)}
          delta={`${d.kpis.critical} critical`}
          deltaTone="orange"
          footer="Active postings"
        />
        <KpiCard
          icon={<Users size={15} />}
          label="In pipeline"
          value={String(d.kpis.inPipeline)}
          delta="Active candidates"
          deltaTone="blue"
          footer="Applied → interviewed"
        />
        <KpiCard
          icon={<FileCheck2 size={15} />}
          label="At offer stage"
          value={String(d.kpis.offers)}
          delta="Pending decision"
          deltaTone="amber"
          footer="Offers extended"
        />
        <KpiCard
          icon={<UserPlus size={15} />}
          label="Joined"
          value={String(d.kpis.joined)}
          valueTone="green"
          delta="This quarter"
          deltaTone="green"
          footer="Successful hires"
        />
      </div>

      <Card>
        <CardHeader title="Conversion funnel" hint="Applied → joined" />
        <div className="px-5 pb-5">
          <HBars data={d.funnel} colorByIndex showValue />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Candidate pipeline"
          hint="Click a card to advance or decline"
        />
        <div className="overflow-x-auto px-5 pb-5">
          <div className="flex min-w-[900px] gap-3">
            {d.columns.map((col) => (
              <div key={col.stage} className="flex-1">
                <div
                  className={`mb-2 rounded-t-lg border-t-4 bg-slate-50 px-3 py-2 ${stageColor[col.stage]}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">
                      {stageLabel[col.stage]}
                    </span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                      {col.count}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  {col.candidates.map((c) => (
                    <button
                      key={c.id}
                      onClick={() =>
                        setActive({ candidate: c, stage: col.stage })
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-left hover:border-blue-300 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar name={c.name} size={28} />
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-slate-700">
                            {c.name}
                          </div>
                          <div className="truncate text-[10px] text-slate-400">
                            {c.role}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">
                          {sourceLabel[c.source] ?? c.source}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {fmtDate(c.appliedDate)}
                        </span>
                      </div>
                    </button>
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

      {active ? (
        <CandidateDrawer
          candidate={active.candidate}
          stage={active.stage}
          onClose={() => setActive(null)}
          onChanged={() => {
            setActive(null)
            router.invalidate()
          }}
        />
      ) : null}
    </div>
  )
}
