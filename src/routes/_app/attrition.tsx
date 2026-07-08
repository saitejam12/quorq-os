import { createFileRoute } from '@tanstack/react-router'
import { TrendingDown, Heart, AlertCircle, IndianRupee } from 'lucide-react'
import type { ReactNode } from 'react'
import { getAttrition } from '#/server/metrics'
import { Card, CardHeader, KpiCard, Badge, inr } from '#/components/ui'
import { HBars, Donut, BarChart } from '#/components/charts'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/attrition')({
  staticData: { title: 'Attrition & retention' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getAttrition(),
  component: AttritionRetention,
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

function AttritionRetention() {
  const d = Route.useLoaderData()

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<TrendingDown size={15} />}
          label="Attrition rate"
          value={`${d.attrition.rate}%`}
          valueTone="red"
          delta={`↑ Above ${d.attrition.benchmark}% benchmark`}
          deltaTone="red"
          footer={`${d.attrition.exitsThisMonth} exits this month · ${d.attrition.voluntary} voluntary`}
        />
        <KpiCard
          icon={<Heart size={15} />}
          label="Retention rate"
          value={`${d.retention.rate}%`}
          valueTone="amber"
          delta={`Target: ${d.retention.target}%+`}
          deltaTone="slate"
          footer={
            <span>
              Top performer retention:{' '}
              <span className="text-emerald-600">{d.retention.topPerformer}%</span>
            </span>
          }
        />
        <KpiCard
          icon={<AlertCircle size={15} />}
          label="Flight risk count"
          value={String(d.flightRisk.count)}
          valueTone="red"
          delta="High risk employees"
          deltaTone="red"
          footer={d.flightRisk.byDept.map((b) => `${b.dept} ${b.count}`).join(' · ')}
        />
        <KpiCard
          icon={<IndianRupee size={15} />}
          label="Cost of attrition"
          value={inr(d.cost.totalL)}
          delta="YTD estimate"
          deltaTone="red"
          footer={`Avg ${inr(d.cost.perExitL)} per exit · ${d.cost.exitsYTD} exits YTD`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Attrition by department" hint="YTD exits" />
          <div className="px-5 pb-5 pt-2">
            <HBars data={d.attritionByDept} color="#ef4444" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Exit reason analysis" hint="From exit interviews" />
          <div className="px-5 pb-5 pt-3">
            <Donut data={d.exitReasons} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Flight risk employees" hint="High-risk flagged" />
          <div className="px-5 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Employee</th>
                  <th className="py-2 font-medium">Dept</th>
                  <th className="py-2 font-medium">Risk level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {d.flightRiskEmployees.map((e, i) => (
                  <tr key={i}>
                    <td className="py-2.5 font-medium text-slate-700">{e.name}</td>
                    <td className="py-2.5 text-slate-500">{e.dept}</td>
                    <td className="py-2.5">
                      <Badge tone={e.level} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Tenure at exit" hint="When are people leaving?" />
          <div className="px-3 pb-4">
            <BarChart
              data={d.tenureAtExit}
              colors={['#ef4444', '#f59e0b', '#3b82f6', '#10b981']}
              height={220}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Retention KPIs" />
          <div className="divide-y divide-slate-100 px-5 pb-3">
            <KpiRow label="Voluntary attrition rate" value={`${d.kpis.voluntary}%`} tone="text-red-500" />
            <KpiRow label="Involuntary attrition rate" value={`${d.kpis.involuntary}%`} />
            <KpiRow label="Regrettable exits (YTD)" value={d.kpis.regrettable} />
            <KpiRow label="eNPS score" value={`+${d.kpis.enps} (Watch)`} tone="text-amber-500" />
            <KpiRow label="Avg notice period served" value={`${d.kpis.avgNotice} days`} />
            <KpiRow label="Counter-offer acceptance" value={`${d.kpis.counterOffer} retained`} tone="text-emerald-600" />
          </div>
        </Card>
      </div>
    </div>
  )
}
