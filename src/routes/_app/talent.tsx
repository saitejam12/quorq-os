import { createFileRoute } from '@tanstack/react-router'
import { Briefcase, Clock, CheckCircle2, IndianRupee } from 'lucide-react'
import type { ReactNode } from 'react'
import { getTalent } from '#/server/metrics'
import { Card, CardHeader, KpiCard, Badge } from '#/components/ui'
import { HBars, Donut } from '#/components/charts'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/talent')({
  staticData: { title: 'Talent acquisition' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getTalent(),
  component: TalentAcquisition,
})

function KpiRow({
  label,
  value,
  tone = 'text-slate-800',
}: {
  label: string
  value: ReactNode
  tone?: string
}) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold ${tone}`}>{value}</span>
    </div>
  )
}

const daysTone: Record<string, string | undefined> = {
  critical: 'text-red-500',
  at_risk: 'text-amber-500',
  in_progress: 'text-slate-600',
  on_track: 'text-slate-500',
}

function TalentAcquisition() {
  const d = Route.useLoaderData()

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Briefcase size={15} />}
          label="Open positions"
          value={String(d.openPositions.count)}
          delta={`${d.openPositions.critical} critical roles`}
          deltaTone="orange"
          footer={`Tech ${d.openPositions.tech} · Sales ${d.openPositions.sales} · Others ${d.openPositions.others}`}
        />
        <KpiCard
          icon={<Clock size={15} />}
          label="Avg time-to-hire"
          value={`${d.timeToHire.avg} days`}
          valueTone="orange"
          delta={`↑ +${d.timeToHire.avg - d.timeToHire.target}d vs target`}
          deltaTone="red"
          footer={`Target ${d.timeToHire.target} days · Best: ${d.timeToHire.best}d (Sales)`}
        />
        <KpiCard
          icon={<CheckCircle2 size={15} />}
          label="Offer accept rate"
          value={`${d.offerAccept.rate}%`}
          valueTone="orange"
          delta="↓ -8% vs last quarter"
          deltaTone="red"
          footer={`${d.offerAccept.made} offers made · ${d.offerAccept.accepted} accepted · ${d.offerAccept.declined} declined`}
        />
        <KpiCard
          icon={<IndianRupee size={15} />}
          label="Cost per hire"
          value={`₹${d.costPerHire.value}K`}
          delta="↓ -₹6K vs last quarter"
          deltaTone="green"
          footer={`Agency ₹${d.costPerHire.agency}K · Referral ₹${d.costPerHire.referral}K`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recruitment funnel" hint="This quarter — all active roles" />
          <div className="px-5 pb-3 pt-2">
            <HBars
              data={d.funnel}
              valueInside
              barColors={['#3b82f6', '#3b82f6', '#3b82f6', '#f59e0b', '#10b981']}
            />
          </div>
          <p className="px-5 pb-4 text-xs text-slate-400">
            Application-to-join rate:{' '}
            <b className="text-slate-600">{d.appToJoin}%</b> · Drop-off: Top
            reason — <b className="text-slate-600">salary mismatch (42%)</b>
          </p>
        </Card>

        <Card>
          <CardHeader title="Source of hire" hint="YTD" />
          <div className="px-5 pb-5 pt-3">
            <Donut data={d.sourceOfHire} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Open roles by department & age" hint="Days unfilled" />
          <div className="px-5 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Role</th>
                  <th className="py-2 font-medium">Dept</th>
                  <th className="py-2 font-medium">Days open</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {d.openRoles.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2.5 font-medium text-slate-700">{r.role}</td>
                    <td className="py-2.5 text-slate-500">{r.dept}</td>
                    <td className={`py-2.5 font-medium ${daysTone[r.status] ?? 'text-slate-500'}`}>
                      {r.daysOpen} days
                    </td>
                    <td className="py-2.5">
                      <Badge tone={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Recruitment KPIs at a glance" />
          <div className="divide-y divide-slate-100 px-5 pb-3">
            <KpiRow label="Total applications received (MTD)" value={d.kpis.totalApps} />
            <KpiRow label="Interviews conducted (MTD)" value={d.kpis.interviews} />
            <KpiRow label="Interview-to-offer ratio" value={d.kpis.interviewToOffer} />
            <KpiRow label="Diversity hiring ratio (gender)" value={`${d.kpis.diversity}% female`} />
            <KpiRow label="Avg offers declined reason" value={d.kpis.declinedReason} />
            <KpiRow label="Referral hire conversion" value={`${d.kpis.referralConversion}% (best source)`} tone="text-emerald-600" />
            <KpiRow label="30-day new hire retention" value={`${d.kpis.newHireRetention}%`} tone="text-emerald-600" />
          </div>
        </Card>
      </div>
    </div>
  )
}
