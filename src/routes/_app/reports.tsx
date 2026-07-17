import { createFileRoute } from '@tanstack/react-router'
import {
  FileText,
  Download,
  CalendarClock,
  Database,
  Users,
  TrendingDown,
  IndianRupee,
  Calendar,
  Briefcase,
  ShieldCheck,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { getReports } from '#/server/metrics'
import { Card, CardHeader, KpiCard, Badge } from '#/components/ui'
import { downloadReport } from '#/lib/download'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/reports')({
  staticData: { title: 'Reports hub' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getReports(),
  component: ReportsHub,
})

const reportIcon: Record<string, ReactNode> = {
  users: <Users size={16} className="text-blue-500" />,
  'trending-down': <TrendingDown size={16} className="text-red-500" />,
  wallet: <IndianRupee size={16} className="text-emerald-500" />,
  calendar: <Calendar size={16} className="text-amber-500" />,
  filter: <Briefcase size={16} className="text-violet-500" />,
  shield: <ShieldCheck size={16} className="text-teal-500" />,
  clock: <CalendarClock size={16} className="text-blue-500" />,
  file: <FileText size={16} className="text-slate-500" />,
}

const builderFields = ['Employee name', 'Department', 'Designation']
const addFields = [
  'CTC',
  'Tenure',
  'Leave balance',
  'Performance',
  'Attendance %',
]

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

const cadenceTone: Record<string, string> = {
  ok: 'text-emerald-600',
  info: 'text-blue-600',
  warn: 'text-amber-600',
}

function ReportsHub() {
  const d = Route.useLoaderData()

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<FileText size={15} />}
          label="Pre-built reports"
          value={String(d.stats.prebuilt)}
          delta="All ready to export"
          deltaTone="green"
          footer={d.stats.prebuiltSplit}
        />
        <KpiCard
          icon={<Download size={15} />}
          label="Exports this month"
          value={String(d.stats.exports)}
          delta={d.stats.exportsSplit}
          deltaTone="blue"
          footer="Most exported: Headcount report"
        />
        <KpiCard
          icon={<CalendarClock size={15} />}
          label="Scheduled reports"
          value={String(d.stats.scheduled)}
          delta="Auto-email active"
          deltaTone="blue"
          footer="Weekly 4 · Monthly 2 · Next: Monday"
        />
        <KpiCard
          icon={<Database size={15} />}
          label="Data completeness"
          value={`${d.stats.completeness}%`}
          valueTone="orange"
          delta={`${d.stats.incomplete} profiles incomplete`}
          deltaTone="orange"
          footer="Missing: emergency contact, skills data"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Pre-built report library" hint="Click to export" />
          <div className="divide-y divide-slate-100 px-5 pb-3">
            {d.prebuilt.map((r, i) => (
              <div key={i} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50">
                    {reportIcon[r.icon]}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-700">
                      {r.title}
                    </div>
                    <div className="text-xs text-slate-400">{r.subtitle}</div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {r.formats.map((f) => (
                    <button
                      key={f}
                      onClick={() => downloadReport(r.title)}
                      className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-blue-100 hover:text-blue-700"
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Custom report builder"
              hint="Drag & drop fields"
            />
            <div className="px-5 pb-5">
              <p className="mb-3 text-xs text-slate-400">
                Select fields, filters and date range to generate a custom
                report.
              </p>
              <div className="mb-4 flex flex-wrap gap-2">
                {builderFields.map((f) => (
                  <span
                    key={f}
                    className="rounded-md bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700"
                  >
                    {f}
                  </span>
                ))}
                {addFields.map((f) => (
                  <span
                    key={f}
                    className="rounded-md border border-dashed border-slate-300 px-2.5 py-1 text-xs text-slate-500"
                  >
                    + {f}
                  </span>
                ))}
              </div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <option>Group by: Department</option>
                  <option>Group by: Location</option>
                  <option>Group by: Employment type</option>
                </select>
                <select className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <option>Date: This month</option>
                  <option>Date: This quarter</option>
                  <option>Date: YTD</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => downloadReport('Headcount summary')}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Generate report
                </button>
                <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                  Schedule report
                </button>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Scheduled reports" hint="Auto-email" />
            <div className="divide-y divide-slate-100 px-5 pb-3">
              {d.scheduled.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="text-slate-600">{r.name}</span>
                  <span className={`font-medium ${cadenceTone[r.tone]}`}>
                    {r.cadence}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader
          title="Compliance reports — statutory"
          hint="Regulatory & legal deadlines"
        />
        <div className="px-5 pb-5">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 font-medium">Report</th>
                <th className="py-2 font-medium">Frequency</th>
                <th className="py-2 font-medium">Next due</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Responsibility</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {d.statutory.map((r, i) => (
                <tr key={i}>
                  <td className="py-3 font-medium text-slate-700">{r.name}</td>
                  <td className="py-3 text-slate-500">{r.frequency}</td>
                  <td className="py-3 text-slate-500">{fmtDate(r.nextDue)}</td>
                  <td className="py-3">
                    <Badge tone={r.status} />
                  </td>
                  <td className="py-3 text-slate-500">{r.responsibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
