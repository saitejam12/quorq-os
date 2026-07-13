import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Timer, Users, Pencil, X, Loader2 } from 'lucide-react'
import { getTimeTracking, editTimeEntry } from '#/server/time'
import { Card, CardHeader, KpiCard, Avatar, Badge } from '#/components/ui'
import ClockWidget from '#/components/ClockWidget'
import { hasTier } from '#/lib/tiers'

export const Route = createFileRoute('/_app/time')({
  staticData: { title: 'Time tracking' },
  loader: () => getTimeTracking(),
  component: TimeTracking,
})

const fmtTime = (t: string | null) =>
  t
    ? new Date(t).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—'
const fmtDay = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

// machine-local "YYYY-MM-DDTHH:MM" for a <input type="datetime-local">
const pad = (n: number) => String(n).padStart(2, '0')
const localDateTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type TeamEntry = ReturnType<
  typeof Route.useLoaderData
>['team']['entries'][number]

function EditClockInOutModal({
  entry,
  onClose,
}: {
  entry: TeamEntry
  onClose: () => void
}) {
  const router = useRouter()
  const [clockInLocal, setClockInLocal] = useState(
    entry.clockIn ? localDateTime(entry.clockIn) : '',
  )
  const [clockOutLocal, setClockOutLocal] = useState(
    entry.clockOut ? localDateTime(entry.clockOut) : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!clockInLocal) {
      setError('Clock-in is required')
      return
    }
    // datetime-local values are machine-local; convert to absolute UTC instants.
    const clockIn = new Date(clockInLocal).toISOString()
    const clockOut = clockOutLocal
      ? new Date(clockOutLocal).toISOString()
      : null
    setBusy(true)
    setError('')
    const res = await editTimeEntry({
      data: { entryId: entry.id, clockIn, clockOut },
    })
    setBusy(false)
    if (res.ok) {
      router.invalidate()
      onClose()
    } else {
      setError(res.error)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">
            Edit time entry — {entry.name}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">
              Clock-in date &amp; time (your timezone)
            </span>
            <input
              type="datetime-local"
              value={clockInLocal}
              onChange={(e) => setClockInLocal(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">
              Clock-out date &amp; time (leave empty to reopen)
            </span>
            <input
              type="datetime-local"
              value={clockOutLocal}
              onChange={(e) => setClockOutLocal(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : null}
              Save
            </button>
            {error ? (
              <span className="text-xs text-red-600">{error}</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function TimeTracking() {
  const d = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const [editing, setEditing] = useState<TeamEntry | null>(null)
  const isManager = hasTier(user.tier, 'ops')

  return (
    <div className="space-y-5 p-6">
      {/* clock widget */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ClockWidget
          className="lg:col-span-1"
          onChange={() => router.invalidate()}
        />

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
          label="Team sessions today"
          value={`${d.team.active + d.team.completed}`}
          delta={`${d.team.active} active now`}
          deltaTone="green"
          footer={`${d.team.hours} team hours logged`}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="My timesheet" hint="Recent entries" />
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
                      <td className="py-2.5 font-medium text-slate-700">
                        {fmtDay(r.day)}
                      </td>
                      <td className="py-2.5 text-slate-500">
                        {fmtTime(r.clockIn)}
                      </td>
                      <td className="py-2.5 text-slate-500">
                        {fmtTime(r.clockOut)}
                      </td>
                      <td className="py-2.5 text-slate-500">
                        {r.hours || '—'}
                      </td>
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
            <CardHeader
              title="Team activity today"
              hint={`${d.team.total} entries`}
            />
            <div className="px-5 pb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-2 font-medium">Employee</th>
                    <th className="py-2 font-medium">In</th>
                    <th className="py-2 font-medium">Out</th>
                    <th className="py-2 font-medium">Hours</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {d.team.entries.map((te) => (
                    <tr key={te.id}>
                      <td className="flex items-center gap-2 py-2">
                        <Avatar name={te.name} size={26} />
                        <span className="text-slate-700">{te.name}</span>
                      </td>
                      <td className="py-2 text-slate-500">
                        {fmtTime(te.clockIn)}
                      </td>
                      <td className="py-2 text-slate-500">
                        {fmtTime(te.clockOut)}
                      </td>
                      <td className="py-2 text-slate-500">{te.hours || '—'}</td>
                      <td className="py-2">
                        <Badge
                          tone={te.status === 'active' ? 'ok' : 'info'}
                          label={te.status === 'active' ? 'Active' : 'Done'}
                        />
                      </td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => setEditing(te)}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil size={12} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!d.team.entries.length ? (
                    <tr>
                      <td colSpan={5} className="py-4 text-slate-400">
                        No team activity logged today.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          <Card>
            <CardHeader title="How time tracking works" />
            <div className="space-y-2 px-5 pb-5 pt-1 text-sm text-slate-500">
              <p>
                • Clock in and out as many times as you like through the day.
              </p>
              <p>
                • Your hours roll up into attendance analytics automatically.
              </p>
              <p>• Times are shown in your device’s timezone.</p>
            </div>
          </Card>
        )}
      </div>

      {editing ? (
        <EditClockInOutModal entry={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  )
}
