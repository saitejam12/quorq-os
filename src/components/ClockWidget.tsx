import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Clock, LogIn, LogOut } from 'lucide-react'
import { clockIn, clockOut, getMyClock } from '#/server/time'
import { Card } from '#/components/ui'

// Shared key so any page can invalidate the widget after a related change.
export const clockQueryKey = ['time', 'my-clock'] as const

const fmtTime = (t: string | null) =>
  t
    ? new Date(t).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—'

// Self-contained clock in/out card. Fetches its own state, so it can be dropped
// onto any page. `onChange` fires after a successful clock in/out for hosts that
// need to refresh other data (e.g. the time page's team table and KPIs).
export default function ClockWidget({
  className,
  onChange,
}: {
  className?: string
  onChange?: () => void
}) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const { data } = useQuery({
    queryKey: clockQueryKey,
    queryFn: () => getMyClock(),
  })

  async function toggle() {
    if (!data) return
    setBusy(true)
    if (data.active) await clockOut()
    else await clockIn()
    setBusy(false)
    await qc.invalidateQueries({ queryKey: clockQueryKey })
    onChange?.()
  }

  return (
    <Card className={`p-6 ${className ?? ''}`}>
      <div className="flex items-center gap-2 text-slate-500">
        <Clock size={16} />
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          Today
        </span>
      </div>

      {data == null ? (
        <div className="mt-3 h-24 animate-pulse rounded-lg bg-slate-100" />
      ) : data.hasProfile ? (
        <>
          <div className="mt-3 text-sm text-slate-500">
            {data.active ? 'Clocked in since' : 'Worked today'}
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {data.active ? fmtTime(data.activeSince) : `${data.hoursToday} hrs`}
          </div>
          <button
            onClick={toggle}
            disabled={busy}
            className={`mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60 ${
              data.active
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {data.active ? <LogOut size={16} /> : <LogIn size={16} />}
            {data.active ? 'Clock out' : 'Clock in'}
          </button>

          {data.sessions.length ? (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Today’s sessions
              </div>
              <div className="space-y-1.5">
                {data.sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between text-xs text-slate-500"
                  >
                    <span>
                      {fmtTime(s.clockIn)} –{' '}
                      {s.clockOut ? fmtTime(s.clockOut) : 'now'}
                    </span>
                    <span className="font-medium text-slate-600">
                      {s.status === 'active' ? 'active' : `${s.hours} h`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          This account isn’t linked to an employee record, so time tracking is
          unavailable.
        </p>
      )}
    </Card>
  )
}
