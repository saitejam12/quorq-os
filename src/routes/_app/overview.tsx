import { createFileRoute } from '@tanstack/react-router'
import {
  Users,
  TrendingDown,
  UserCheck,
  IndianRupee,
  Sparkles,
  CalendarClock,
  FileCheck2,
  KeyRound,
  ClipboardCheck,
  Lock,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { getExecutive } from '#/server/metrics'
import { Card, CardHeader, KpiCard, inr } from '#/components/ui'
import { LineChart, Heatmap, ProgressRow } from '#/components/charts'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/overview')({
  staticData: { title: 'Executive overview' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getExecutive(),
  component: ExecutiveOverview,
})

const dotTone: Record<string, string> = {
  risk: 'bg-red-500',
  warn: 'bg-orange-400',
  info: 'bg-blue-500',
  ok: 'bg-emerald-500',
}
const complianceIcon: Record<string, ReactNode> = {
  'PF filings up to date': <FileCheck2 size={15} />,
  'ESI returns': <ClipboardCheck size={15} />,
  'TDS deposited': <KeyRound size={15} />,
  'POSH training': <Lock size={15} />,
  'Labour law audit': <CalendarClock size={15} />,
}
const toneClass: Record<string, string> = {
  alert: 'text-red-500',
  warn: 'text-amber-500',
  info: 'text-blue-600',
  ok: 'text-emerald-600',
}

function ExecutiveOverview() {
  const d = Route.useLoaderData()

  return (
    <div className="space-y-5 p-6">
      {/* KPI row */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Users size={15} />}
          label="Total headcount"
          value={String(d.headcount.total)}
          delta={`↑ +${d.headcount.newThisMonth} this month`}
          deltaTone="green"
          footer={`Active ${d.headcount.active} · On leave ${d.headcount.onLeave} · Notice ${d.headcount.notice}`}
        />
        <KpiCard
          icon={<TrendingDown size={15} />}
          label="Attrition rate"
          value={`${d.attrition.rate}%`}
          valueTone="red"
          delta={`↑ +${d.attrition.deltaVsQ3}% vs Q3`}
          deltaTone="red"
          footer={
            <span>
              Industry avg {d.attrition.industryAvg}% ·{' '}
              <span className="text-red-500">Above benchmark</span>
            </span>
          }
        />
        <KpiCard
          icon={<UserCheck size={15} />}
          label="Attendance health"
          value={`${d.attendance.percent}%`}
          valueTone="green"
          delta={`↑ +${d.attendance.deltaVsLastWeek}% vs last week`}
          deltaTone="green"
          footer={`Today: ${d.attendance.present}/${d.attendance.total} present · Late: ${d.attendance.late}`}
        />
        <KpiCard
          icon={<IndianRupee size={15} />}
          label="Monthly payroll"
          value={inr(d.payroll.monthlyL)}
          delta={`↑ ${Math.round((d.payroll.monthlyL / d.payroll.budgetL) * 100)}% of budget`}
          deltaTone="red"
          footer={
            <div>
              <div className="mb-1.5 h-1 w-full rounded-full bg-red-400" />
              Budget {inr(d.payroll.budgetL)} · Over by {inr(d.payroll.overL)}
            </div>
          }
        />
      </div>

      {/* trend + AI insights */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Attrition trend — rolling 12 months"
            hint="vs industry avg"
          />
          <div className="px-3 pb-3">
            <LineChart data={d.attritionTrend} target={d.industryAvg} suffix="%" />
          </div>
          <div className="flex gap-5 px-5 pb-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 bg-blue-600" /> Attrition %
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-amber-500" />{' '}
              Industry avg {d.industryAvg}%
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader title="AI insight cards" hint="Auto-generated" />
          <div className="space-y-3 px-5 pb-5 pt-1">
            {d.aiInsights.map((a, i) => (
              <div key={i} className="flex gap-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotTone[a.tone]}`}
                />
                <p className="text-xs leading-relaxed text-slate-600">
                  <span className="font-semibold text-slate-800">{a.title}:</span>{' '}
                  {a.body}
                </p>
              </div>
            ))}
            <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-slate-400">
              <Sparkles size={13} /> Powered by QuorqOS AI
            </div>
          </div>
        </Card>
      </div>

      {/* bottom row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Compliance risk tracker"
            hint={`${d.compliance.length} open items`}
          />
          <div className="divide-y divide-slate-100 px-5 pb-3">
            {d.compliance.map((c, i) => (
              <div key={i} className="flex items-center justify-between py-2.5">
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <span className="text-slate-400">{complianceIcon[c.label]}</span>
                  {c.label}
                </span>
                <span className={`text-sm font-medium ${toneClass[c.tone]}`}>
                  {c.value}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Attendance heatmap" hint="This week" />
          <div className="px-5 pb-5">
            <Heatmap
              data={d.heatmap.map((h) => ({ label: h.label, value: h.percent }))}
            />
            <p className="mt-3 text-xs text-slate-400">Rolling 5-day attendance</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Hiring velocity" hint="Current quarter" />
          <div className="space-y-3 px-5 pb-4 pt-1">
            <ProgressRow label="Open roles" value={d.velocity.openRoles} max={d.velocity.openRoles} />
            <ProgressRow label="Interviewing" value={d.velocity.interviewing} max={d.velocity.openRoles} />
            <ProgressRow label="Offers made" value={d.velocity.offersMade} max={d.velocity.openRoles} />
            <ProgressRow label="Joined" value={d.velocity.joined} max={d.velocity.openRoles} color="#10b981" />
            <p className="border-t border-slate-100 pt-3 text-xs text-slate-400">
              Avg time-to-hire:{' '}
              <b className="text-slate-600">{d.velocity.avgTimeToHire} days</b> ·
              Target: {d.velocity.target} days · Offer accept:{' '}
              {d.velocity.offerAccept}%
            </p>
          </div>
        </Card>
      </div>
    </div>
  )
}
