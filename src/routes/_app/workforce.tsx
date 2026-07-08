import { createFileRoute } from '@tanstack/react-router'
import { Users, CalendarRange, Award, Star } from 'lucide-react'
import { getWorkforce } from '#/server/metrics'
import { Card, CardHeader, KpiCard } from '#/components/ui'
import { HBars, BarChart, Donut } from '#/components/charts'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/workforce')({
  staticData: { title: 'Workforce intelligence' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getWorkforce(),
  component: WorkforceIntelligence,
})

const typeLabel: Record<string, string | undefined> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
}

function WorkforceIntelligence() {
  const d = Route.useLoaderData()

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Users size={15} />}
          label="Total workforce"
          value={String(d.total)}
          delta={`${d.byDept.length} departments`}
          deltaTone="blue"
          footer={`Largest: ${d.byDept[0]?.label} (${d.byDept[0]?.value})`}
        />
        <KpiCard
          icon={<CalendarRange size={15} />}
          label="Average tenure"
          value={`${d.avgTenureYears} yrs`}
          delta="Across all employees"
          deltaTone="slate"
          footer={`${d.tenure.find((t) => t.label === 'Under 1 yr')?.value ?? 0} joined in last year`}
        />
        <KpiCard
          icon={<Award size={15} />}
          label="Top performers"
          value={String(d.topPerformers)}
          valueTone="green"
          delta={`${d.total ? Math.round((d.topPerformers / d.total) * 100) : 0}% of workforce`}
          deltaTone="green"
          footer="Rating 4.5 and above"
        />
        <KpiCard
          icon={<Star size={15} />}
          label="Avg performance rating"
          value={`${d.avgRating} / 5`}
          delta="Company-wide"
          deltaTone="slate"
          footer={`${d.gender.femalePct}% female · ${100 - d.gender.femalePct}% male`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Headcount by department" hint="Active employees" />
          <div className="px-5 pb-5 pt-2">
            <HBars data={d.byDept} color="#2563eb" />
          </div>
        </Card>

        <Card>
          <CardHeader title="Tenure distribution" hint="By years of service" />
          <div className="px-3 pb-4">
            <BarChart
              data={d.tenure}
              colors={['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6']}
            />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Employment type" hint="Workforce mix" />
          <div className="px-5 pb-5 pt-3">
            <Donut
              data={d.byType.map((t) => ({
                label: typeLabel[t.label] ?? t.label,
                value: t.value,
              }))}
              suffix=""
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Location distribution" hint="Where people work" />
          <div className="px-5 pb-5 pt-2">
            <HBars data={d.byLocation} colorByIndex />
          </div>
        </Card>

        <Card>
          <CardHeader title="Performance bands" hint="Rating distribution" />
          <div className="px-5 pb-5 pt-2">
            <HBars
              data={d.performance}
              barColors={['#10b981', '#3b82f6', '#f59e0b', '#ef4444']}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
