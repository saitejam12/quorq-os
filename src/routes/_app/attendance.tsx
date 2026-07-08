import { createFileRoute } from '@tanstack/react-router'
import { UserCheck, CalendarCheck, AlertTriangle, Clock } from 'lucide-react'
import type { ReactNode } from 'react'
import { getAttendance } from '#/server/metrics'
import { Card, CardHeader, KpiCard, Badge, inr } from '#/components/ui'
import { LineChart, BarChart, Heatmap } from '#/components/charts'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/attendance')({
  staticData: { title: 'Attendance & leave' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getAttendance(),
  component: AttendanceLeave,
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

function AttendanceLeave() {
  const d = Route.useLoaderData()

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<UserCheck size={15} />}
          label="Today's attendance"
          value={`${d.today.percent}%`}
          valueTone="green"
          delta={`${d.today.present} / ${d.today.total} present`}
          deltaTone="green"
          footer={`Absent ${d.today.absent} · Late ${d.today.late} · WFH ${d.today.wfh}`}
        />
        <KpiCard
          icon={<CalendarCheck size={15} />}
          label="Leave utilization"
          value={`${d.leave.utilization}%`}
          delta="Healthy range"
          deltaTone="blue"
          footer={`Avg ${d.leave.avgUsed} of ${d.leave.entitled} days used · ${d.leave.monthsElapsed} months elapsed`}
        />
        <KpiCard
          icon={<AlertTriangle size={15} />}
          label="Absenteeism rate"
          value={`${d.absenteeism.rate}%`}
          valueTone="orange"
          delta={`↑ +${d.absenteeism.delta}% vs last month`}
          deltaTone="orange"
          footer={`Unplanned absences · Target <${d.absenteeism.target}%`}
        />
        <KpiCard
          icon={<Clock size={15} />}
          label="Overtime hours"
          value={String(d.overtime.hours)}
          delta="This month"
          deltaTone="amber"
          footer={`Avg ${d.overtime.avgPerEmployee} hrs/employee · Cost ${inr(d.overtime.costL)}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Monthly attendance trend" hint="Rolling 12 months" />
          <div className="px-3 pb-3">
            <LineChart data={d.trend} target={d.target} suffix="%" yMin={75} yMax={100} />
          </div>
          <div className="flex gap-5 px-5 pb-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 bg-blue-600" /> Attendance %
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-amber-500" />{' '}
              Target {d.target}%
            </span>
          </div>
        </Card>

        <Card>
          <CardHeader title="Leave type breakdown" hint="Days taken YTD by category" />
          <div className="px-3 pb-4">
            <BarChart data={d.leaveBreakdown} suffix="" />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Weekly heatmap" hint="This week" />
          <div className="px-5 pb-5">
            <Heatmap data={d.heatmap.map((h) => ({ label: h.label, value: h.percent }))} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Pending leave approvals" hint="Action required" />
          <div className="px-5 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Employee</th>
                  <th className="py-2 font-medium">Type</th>
                  <th className="py-2 font-medium">Days</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {d.pending.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2.5 font-medium text-slate-700">{p.name}</td>
                    <td className="py-2.5 text-slate-500">{p.type}</td>
                    <td className="py-2.5 text-slate-500">{p.days}</td>
                    <td className="py-2.5">
                      <Badge tone={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Leave & attendance KPIs" />
          <div className="divide-y divide-slate-100 px-5 pb-3">
            <KpiRow label="Avg leave per employee (YTD)" value={`${d.kpis.avgLeavePerEmployee} days`} />
            <KpiRow label="Sick leave spike months" value={d.kpis.sickSpikeMonths} />
            <KpiRow label="Employees with 0 leave taken" value={`${d.kpis.employeesZeroLeave} employees`} tone="text-orange-500" />
            <KpiRow label="Late arrivals this month" value={`${d.kpis.lateArrivals} instances`} />
            <KpiRow label="Early exits this month" value={`${d.kpis.earlyExits} instances`} />
            <KpiRow label="Leave encashment due (yr-end)" value={`${inr(d.kpis.leaveEncashmentL)} est.`} />
          </div>
        </Card>
      </div>
    </div>
  )
}
