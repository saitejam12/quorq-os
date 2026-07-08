import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Clock, LogIn, LogOut, Timer, Users } from 'lucide-react'
import { getTimeTracking, clockIn, clockOut } from '#/server/time'
import { Card, CardHeader, KpiCard, Avatar, Badge } from '#/components/ui'
import { hasTier } from '#/lib/tiers'

export const Route = createFileRoute('/_app/time')({
  staticData: { title: 'Time tracking' },
  loader: () => getTimeTracking(),
  component: TimeTracking,
})

const fmtTime = (t: string | null) =>
  t ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'
const fmtDay = (d: string) =>
  new Date(d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })

function TimeTracking() {
  const d = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const isManager = hasTier(user.tier, 'ops')

  const t: {
    clockIn: string | null
    clockOut: string | null
    hoursWorked: number
    status: string
  } | null = d.myToday
  const clockedIn = t?.status === 'active'
  const completed = t?.status === 'completed'

  async function toggle() {
    setBusy(true)
    if (clockedIn) await clockOut()
    else await clockIn()
    setBusy(false)
    router.invalidate()
  }

  return (
    <div className="space-y-5 p-6">
      {/* clock widget */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-1">
          <div className="flex items-center gap-2 text-slate-500">
            <Clock size={16} />
            <span className="text-[11px] font-semibold uppercase tracking-wide">Today</span>
          </div>
          {d.hasProfile ? (
            <>
              <div className="mt-3 text-sm text-slate-500">
                {clockedIn ? 'Clocked in at' : completed ? 'Worked today' : 'Not clocked in'}
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {clockedIn
                  ? fmtTime(t.clockIn)
                  : completed
                    ? `${t.hoursWorked} hrs`
                    : '—'}
              </div>
              <button
                onClick={toggle}
                disabled={busy || completed}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 ${
                  clockedIn ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {clockedIn ? <LogOut size={16} /> : <LogIn size={16} />}
                {completed ? 'Day complete' : clockedIn ? 'Clock out' : 'Clock in'}
              </button>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              This account isn’t linked to an employee record, so time tracking is unavailable.
            </p>
          )}
        </Card>

        <KpiCard
          icon={<Timer size={15} />}
          label="My hours this week"
          value={`${d.myWeekHours}`}
          delta="Last 7 days"
          deltaTone="blue"
          footer="Logged via clock in/out"
        />
        <KpiCard
          icon={<Users size={15} />}
          label="Team clocked in today"
          value={`${d.team.active + d.team.completed}`}
          delta={`${d.team.active} active now`}
          deltaTone="green"
          footer={`${d.team.hours} team hours logged`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="My timesheet" hint="Recent days" />
          <div className="px-5 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Day</th>
                  <th className="py-2 font-medium">In</th>
                  <th className="py-2 font-medium">Out</th>
                  <th className="py-2 font-medium">Hours</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {d.myRecent.length ? (
                  d.myRecent.map((r, i) => (
                    <tr key={i}>
                      <td className="py-2.5 font-medium text-slate-700">{fmtDay(r.day)}</td>
                      <td className="py-2.5 text-slate-500">{fmtTime(r.clockIn)}</td>
                      <td className="py-2.5 text-slate-500">{fmtTime(r.clockOut)}</td>
                      <td className="py-2.5 text-slate-500">{r.hours || '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-slate-400">
                      No entries yet — clock in to start.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {isManager ? (
          <Card>
            <CardHeader title="Team activity today" hint={`${d.team.total} entries`} />
            <div className="px-5 pb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-2 font-medium">Employee</th>
                    <th className="py-2 font-medium">In</th>
                    <th className="py-2 font-medium">Out</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {d.team.entries.map((te, i) => (
                    <tr key={i}>
                      <td className="flex items-center gap-2 py-2">
                        <Avatar name={te.name} size={26} />
                        <span className="text-slate-700">{te.name}</span>
                      </td>
                      <td className="py-2 text-slate-500">{fmtTime(te.clockIn)}</td>
                      <td className="py-2 text-slate-500">{fmtTime(te.clockOut)}</td>
                      <td className="py-2">
                        <Badge tone={te.status === 'active' ? 'ok' : 'info'} label={te.status === 'active' ? 'Active' : 'Done'} />
                      </td>
                    </tr>
                  ))}
                  {!d.team.entries.length ? (
                    <tr><td colSpan={4} className="py-4 text-slate-400">No team activity logged today.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="How time tracking works" />
            <div className="space-y-2 px-5 pb-5 pt-1 text-sm text-slate-500">
              <p>• Clock in when you start your day and clock out when you finish.</p>
              <p>• Your hours roll up into attendance analytics automatically.</p>
              <p>• Unworked days affect payroll loss-of-pay calculations.</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
