import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Timer,
  Users,
  Pencil,
  X,
  Loader2,
  Plus,
  Send,
  Clock3,
  Check,
  AlertTriangle,
} from 'lucide-react'
import {
  getTimeTracking,
  editTimeEntry,
  editOwnEntry,
  fileEntry,
} from '#/server/time'
import {
  submitTimesheet,
  requestOvertime,
  approveTimesheet,
  declineTimesheet,
  closeWeek,
  closeAllOverdue,
} from '#/server/timesheets'
import type { Result } from '#/server/auth'
import { Card, CardHeader, KpiCard, Avatar, Badge } from '#/components/ui'
import ClockWidget from '#/components/ClockWidget'
import { hasTier } from '#/lib/tiers'

export const Route = createFileRoute('/_app/time')({
  staticData: { title: 'Time tracking' },
  loader: () => getTimeTracking(),
  component: TimeTracking,
})

type Loader = ReturnType<typeof Route.useLoaderData>
type WeekEntry = Loader['week']['entries'][number]
type TeamEntry = Loader['team']['entries'][number]

const fmtTime = (t: string | null) =>
  t
    ? new Date(t).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—'
const fmtDay = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
const fmtRange = (a: string, b: string) => `${fmtDay(a)} – ${fmtDay(b)}`

const pad = (n: number) => String(n).padStart(2, '0')
const localDateTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50'

const SUBMISSION_TONE: Record<string, string> = {
  submitted: 'info',
  approved: 'ok',
  declined: 'warn',
  closed: 'info',
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
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
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 p-5">{children}</div>
      </div>
    </div>
  )
}

// Edit an entry's clock in/out (date + time). `save` is the caller's server fn,
// so this serves both the self (editOwnEntry) and ops team (editTimeEntry) paths.
function EditEntryModal({
  title,
  clockIn,
  clockOut,
  onClose,
  save,
}: {
  title: string
  clockIn: string | null
  clockOut: string | null
  onClose: () => void
  save: (clockIn: string, clockOut: string | null) => Promise<Result<null>>
}) {
  const router = useRouter()
  const [inLocal, setInLocal] = useState(clockIn ? localDateTime(clockIn) : '')
  const [outLocal, setOutLocal] = useState(
    clockOut ? localDateTime(clockOut) : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSave() {
    if (!inLocal) {
      setError('Clock-in is required')
      return
    }
    setBusy(true)
    setError('')
    const res = await save(
      new Date(inLocal).toISOString(),
      outLocal ? new Date(outLocal).toISOString() : null,
    )
    setBusy(false)
    if (res.ok) {
      router.invalidate()
      onClose()
    } else setError(res.error)
  }

  return (
    <Modal title={title} onClose={onClose}>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-slate-600">
          Clock-in date &amp; time (your timezone)
        </span>
        <input
          type="datetime-local"
          value={inLocal}
          onChange={(e) => setInLocal(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-slate-600">
          Clock-out date &amp; time (leave empty to reopen)
        </span>
        <input
          type="datetime-local"
          value={outLocal}
          onChange={(e) => setOutLocal(e.target.value)}
          className={inputCls}
        />
      </label>
      <SaveRow busy={busy} error={error} onSave={onSave} />
    </Modal>
  )
}

function FileEntryModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [day, setDay] = useState(today)
  const [inTime, setInTime] = useState('09:00')
  const [outTime, setOutTime] = useState('17:00')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSave() {
    setBusy(true)
    setError('')
    const res = await fileEntry({
      data: {
        clockIn: new Date(`${day}T${inTime}`).toISOString(),
        clockOut: new Date(`${day}T${outTime}`).toISOString(),
      },
    })
    setBusy(false)
    if (res.ok) {
      router.invalidate()
      onClose()
    } else setError(res.error)
  }

  return (
    <Modal title="File a time entry" onClose={onClose}>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-slate-600">Day</span>
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className={inputCls}
        />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">In</span>
          <input
            type="time"
            value={inTime}
            onChange={(e) => setInTime(e.target.value)}
            className={inputCls}
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">Out</span>
          <input
            type="time"
            value={outTime}
            onChange={(e) => setOutTime(e.target.value)}
            className={inputCls}
          />
        </label>
      </div>
      <SaveRow busy={busy} error={error} onSave={onSave} />
    </Modal>
  )
}

function OvertimeModal({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const today = new Date().toISOString().slice(0, 10)
  const [day, setDay] = useState(today)
  const [hours, setHours] = useState('2')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSave() {
    const h = Number(hours)
    if (!Number.isFinite(h) || h <= 0) {
      setError('Enter a valid number of hours')
      return
    }
    setBusy(true)
    setError('')
    const res = await requestOvertime({
      data: { day, hours: h, reason: reason.trim() || undefined },
    })
    setBusy(false)
    if (res.ok) {
      router.invalidate()
      onClose()
    } else setError(res.error)
  }

  return (
    <Modal title="Request overtime" onClose={onClose}>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-slate-600">Day</span>
        <input
          type="date"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-slate-600">Hours</span>
        <input
          type="number"
          min="0.5"
          step="0.5"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-slate-600">Reason</span>
        <textarea
          value={reason}
          rows={2}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why the extra hours?"
          className={inputCls}
        />
      </label>
      <SaveRow busy={busy} error={error} onSave={onSave} label="Submit request" />
    </Modal>
  )
}

function SaveRow({
  busy,
  error,
  onSave,
  label = 'Save',
}: {
  busy: boolean
  error: string
  onSave: () => void
  label?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <button onClick={onSave} disabled={busy} className={btnPrimary}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        {label}
      </button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  )
}

function TimeTracking() {
  const d = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const isManager = hasTier(user.tier, 'ops')

  const [editEntry, setEditEntry] = useState<WeekEntry | null>(null)
  const [editTeam, setEditTeam] = useState<TeamEntry | null>(null)
  const [filing, setFiling] = useState(false)
  const [overtime, setOvertime] = useState(false)
  const [busy, setBusy] = useState(false)

  const { week } = d
  const status = week.submission?.status ?? null
  const canSubmit = week.editable && week.entries.length > 0

  async function runAndRefresh(fn: () => Promise<Result<unknown>>) {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (res.ok) router.invalidate()
    else alert(res.error)
  }

  return (
    <div className="space-y-5 p-6">
      {/* self timesheet banner */}
      {canSubmit ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} />
            {status === 'declined'
              ? `Your timesheet for ${fmtRange(week.weekStart, week.weekEnd)} was declined${week.submission?.reviewReason ? ` — ${week.submission.reviewReason}` : ''}. Fix and resubmit.`
              : `Your timesheet for ${fmtRange(week.weekStart, week.weekEnd)} (${week.hours}h logged) is due. Submit it for approval.`}
          </span>
          <button
            onClick={() =>
              runAndRefresh(() =>
                submitTimesheet({ data: { weekStart: week.weekStart } }),
              )
            }
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
          >
            <Send size={14} /> Submit for approval
          </button>
        </div>
      ) : status && status !== 'declined' ? (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Check size={16} />
          Timesheet for {fmtRange(week.weekStart, week.weekEnd)} is {status}.
        </div>
      ) : null}

      {/* ops overdue banner */}
      {isManager && d.review && d.review.overdueCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} />
            {d.review.overdueCount} employees haven’t submitted this week. Close
            the week to finalise.
          </span>
          <button
            onClick={() =>
              runAndRefresh(() =>
                closeAllOverdue({ data: { weekStart: week.weekStart } }),
              )
            }
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            Close timesheets
          </button>
        </div>
      ) : null}

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ClockWidget
          className="lg:col-span-1"
          onChange={() => router.invalidate()}
        />
        <KpiCard
          icon={<Timer size={15} />}
          label="My hours this week"
          value={`${d.myWeekHours}`}
          delta={fmtRange(week.weekStart, week.weekEnd)}
          deltaTone="blue"
          footer="Auto clock-out after 8h"
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

      {/* This week — editable self timesheet */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            This week
            <span className="text-xs font-normal text-slate-400">
              {fmtRange(week.weekStart, week.weekEnd)}
            </span>
            {week.editable ? (
              <span className="text-xs font-normal text-emerald-600">
                · editable
              </span>
            ) : (
              <Badge tone={SUBMISSION_TONE[status ?? ''] ?? 'info'} label={status ?? 'locked'} />
            )}
          </h3>
          <div className="flex flex-wrap gap-2">
            {canSubmit ? (
              <button
                onClick={() =>
                  runAndRefresh(() =>
                    submitTimesheet({ data: { weekStart: week.weekStart } }),
                  )
                }
                disabled={busy}
                className={btnPrimary}
              >
                <Send size={14} /> Submit for approval
              </button>
            ) : null}
            <button onClick={() => setOvertime(true)} className={btnGhost}>
              <Clock3 size={14} /> Request overtime
            </button>
            {week.editable ? (
              <button onClick={() => setFiling(true)} className={btnGhost}>
                <Plus size={14} /> File entry
              </button>
            ) : null}
          </div>
        </div>
        <div className="px-5 pb-4 pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 font-medium">Day</th>
                <th className="py-2 font-medium">In</th>
                <th className="py-2 font-medium">Out</th>
                <th className="py-2 font-medium">Hours</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {week.entries.length ? (
                week.entries.map((e) => (
                  <tr key={e.id}>
                    <td className="py-2.5 font-medium text-slate-700">
                      {fmtDay(e.day)}
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {fmtTime(e.clockIn)}
                    </td>
                    <td className="py-2.5 text-slate-500">
                      {fmtTime(e.clockOut)}
                    </td>
                    <td className="py-2.5 text-slate-500">{e.hours || '—'}</td>
                    <td className="py-2.5">
                      <Badge
                        tone={e.status === 'active' ? 'ok' : 'info'}
                        label={e.status === 'active' ? 'Active' : 'Done'}
                      />
                    </td>
                    <td className="py-2.5 text-right">
                      {week.editable ? (
                        <button
                          onClick={() => setEditEntry(e)}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil size={12} /> Edit
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-4 text-slate-400">
                    No entries this week — clock in or file an entry.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* history + overtime */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Time entry history"
            hint={`${d.history.length} recent`}
          />
          <div className="max-h-72 overflow-y-auto px-5 pb-4">
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
                {d.history.length ? (
                  d.history.map((r, i) => (
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
                      <td className="py-2.5 text-slate-500">{r.hours || '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="py-4 text-slate-400">
                      No entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="My overtime requests" hint="Last 30" />
          <div className="px-5 pb-4">
            {d.myOvertime.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="py-2 font-medium">Day</th>
                    <th className="py-2 font-medium">Hours</th>
                    <th className="py-2 font-medium">Reason</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {d.myOvertime.map((o, i) => (
                    <tr key={i}>
                      <td className="py-2.5 font-medium text-slate-700">
                        {fmtDay(o.day)}
                      </td>
                      <td className="py-2.5 text-slate-500">{o.hours}</td>
                      <td className="py-2.5 text-slate-500">{o.reason || '—'}</td>
                      <td className="py-2.5">
                        <Badge
                          tone={
                            o.status === 'approved'
                              ? 'ok'
                              : o.status === 'declined'
                                ? 'warn'
                                : 'info'
                          }
                          label={o.status}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-6 text-sm text-slate-400">
                No overtime requests yet.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* ops review sections */}
      {isManager && d.review ? (
        <>
          <Card>
            <CardHeader
              title="Timesheets to review"
              hint={`${d.review.toReview.length} submitted`}
            />
            <div className="px-5 pb-4">
              {d.review.toReview.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="py-2 font-medium">Employee</th>
                      <th className="py-2 font-medium">Week</th>
                      <th className="py-2 font-medium">Hours</th>
                      <th className="py-2 font-medium">Entries</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {d.review.toReview.map((t) => (
                      <ReviewRow
                        key={t.id}
                        row={t}
                        busy={busy}
                        onDone={() => router.invalidate()}
                        setBusy={setBusy}
                      />
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="py-6 text-sm text-slate-400">
                  Nothing awaiting review.
                </p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Not submitted this week"
              hint={`${d.review.overdueCount} overdue`}
            />
            <div className="px-5 pb-4">
              {d.review.notSubmitted.length ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="py-2 font-medium">Employee</th>
                      <th className="py-2 font-medium">Department</th>
                      <th className="py-2 font-medium">Hours logged</th>
                      <th className="py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {d.review.notSubmitted.map((r) => (
                      <tr key={r.employeeId}>
                        <td className="flex items-center gap-2 py-2">
                          <Avatar name={r.employeeName} size={26} />
                          <span className="text-slate-700">
                            {r.employeeName}
                          </span>
                        </td>
                        <td className="py-2 text-slate-500">{r.department}</td>
                        <td className="py-2 text-slate-500">{r.hoursLogged}h</td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() =>
                              runAndRefresh(() =>
                                closeWeek({
                                  data: {
                                    employeeId: r.employeeId,
                                    weekStart: r.weekStart,
                                  },
                                }),
                              )
                            }
                            disabled={busy}
                            className={btnGhost}
                          >
                            Close week
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="py-6 text-sm text-slate-400">
                  Everyone has submitted.
                </p>
              )}
            </div>
          </Card>

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
                          onClick={() => setEditTeam(te)}
                          className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                        >
                          <Pencil size={12} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!d.team.entries.length ? (
                    <tr>
                      <td colSpan={6} className="py-4 text-slate-400">
                        No team activity logged today.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : null}

      {editEntry ? (
        <EditEntryModal
          title="Edit my entry"
          clockIn={editEntry.clockIn}
          clockOut={editEntry.clockOut}
          onClose={() => setEditEntry(null)}
          save={(clockIn, clockOut) =>
            editOwnEntry({ data: { entryId: editEntry.id, clockIn, clockOut } })
          }
        />
      ) : null}
      {editTeam ? (
        <EditEntryModal
          title={`Edit time entry — ${editTeam.name}`}
          clockIn={editTeam.clockIn}
          clockOut={editTeam.clockOut}
          onClose={() => setEditTeam(null)}
          save={(clockIn, clockOut) =>
            editTimeEntry({ data: { entryId: editTeam.id, clockIn, clockOut } })
          }
        />
      ) : null}
      {filing ? <FileEntryModal onClose={() => setFiling(false)} /> : null}
      {overtime ? <OvertimeModal onClose={() => setOvertime(false)} /> : null}
    </div>
  )
}

function ReviewRow({
  row,
  busy,
  setBusy,
  onDone,
}: {
  row: NonNullable<Loader['review']>['toReview'][number]
  busy: boolean
  setBusy: (b: boolean) => void
  onDone: () => void
}) {
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')

  async function act(fn: () => Promise<Result<null>>) {
    setBusy(true)
    const res = await fn()
    setBusy(false)
    if (res.ok) onDone()
    else alert(res.error)
  }

  return (
    <>
      <tr>
        <td className="flex items-center gap-2 py-2">
          <Avatar name={row.employeeName} size={26} />
          <span className="text-slate-700">{row.employeeName}</span>
        </td>
        <td className="py-2 text-slate-500">{fmtDay(row.weekStart)}</td>
        <td className="py-2 text-slate-500">{row.hours}h</td>
        <td className="py-2 text-slate-500">{row.entries}</td>
        <td className="py-2 text-right">
          <div className="inline-flex gap-2">
            <button
              onClick={() => act(() => approveTimesheet({ data: { id: row.id } }))}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
            >
              <Check size={14} /> Approve
            </button>
            <button
              onClick={() => setDeclining((v) => !v)}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
            >
              <X size={14} /> Decline
            </button>
          </div>
        </td>
      </tr>
      {declining ? (
        <tr>
          <td colSpan={5} className="pb-3">
            <div className="flex items-center gap-2">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for declining (shown to the employee)"
                maxLength={300}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
              />
              <button
                onClick={() =>
                  act(() =>
                    declineTimesheet({
                      data: { id: row.id, reason: reason.trim() },
                    }),
                  )
                }
                disabled={busy || reason.trim().length === 0}
                className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                Confirm decline
              </button>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}
