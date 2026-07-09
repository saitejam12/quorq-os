import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  CalendarDays,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  RefreshCw,
  Loader2,
} from 'lucide-react'
import {
  getHolidays,
  addHoliday,
  updateHoliday,
  deleteHoliday,
} from '#/server/holidays'
import type { Holiday } from '#/server/holidays'
import { reconcileAttendance } from '#/server/attendance'
import { Card, CardHeader } from '#/components/ui'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/calendar')({
  staticData: { title: 'Holiday Calendar' },
  beforeLoad: ({ context }) => requireTier(context.user, 'master'),
  component: CalendarEditor,
})

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

const monthIndex = (d: string) => Number(d.slice(5, 7)) - 1

function CalendarEditor() {
  const qc = useQueryClient()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)

  const { data: holidays = [] } = useQuery({
    queryKey: ['holidays', year],
    queryFn: () => getHolidays({ data: { year } }),
  })

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['holidays'] })
    void qc.invalidateQueries({ queryKey: ['upcoming-holidays'] })
  }

  const years = [currentYear - 1, currentYear, currentYear + 1]

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setYear(y)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                y === year
                  ? 'bg-blue-600 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
        <ReconcileButton />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <AddHolidayForm year={year} onDone={invalidate} />

        <Card className="lg:col-span-2">
          <CardHeader
            title={`Holidays in ${year}`}
            hint={`${holidays.length} total`}
            icon={<CalendarDays size={15} />}
          />
          <div className="px-5 pb-4">
            {holidays.length === 0 ? (
              <p className="py-6 text-sm text-slate-400">
                No holidays for {year} yet. Add one on the left.
              </p>
            ) : (
              MONTHS.map((label, mi) => {
                const rows = holidays.filter((h) => monthIndex(h.date) === mi)
                if (rows.length === 0) return null
                return (
                  <div key={label} className="mb-3">
                    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {label}
                    </div>
                    <div className="divide-y divide-slate-50">
                      {rows.map((h) => (
                        <HolidayRow
                          key={h.id}
                          holiday={h}
                          onDone={invalidate}
                        />
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

function AddHolidayForm({
  year,
  onDone,
}: {
  year: number
  onDone: () => void
}) {
  const [date, setDate] = useState(`${year}-01-01`)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!date || !name.trim()) {
      setError('Date and name are required')
      return
    }
    setBusy(true)
    setError('')
    const res = await addHoliday({ data: { date, name: name.trim() } })
    setBusy(false)
    if (res.ok) {
      setName('')
      onDone()
    } else {
      setError(res.error)
    }
  }

  return (
    <Card className="lg:col-span-1">
      <CardHeader title="Add holiday" icon={<Plus size={15} />} />
      <div className="space-y-3 px-5 pb-5">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">Name</span>
          <input
            type="text"
            value={name}
            placeholder="e.g. Independence Day"
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <button
          onClick={submit}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null}
          Add holiday
        </button>
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
      </div>
    </Card>
  )
}

function HolidayRow({
  holiday,
  onDone,
}: {
  holiday: Holiday
  onDone: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [date, setDate] = useState(holiday.date)
  const [name, setName] = useState(holiday.name)
  const [busy, setBusy] = useState(false)

  async function save() {
    setBusy(true)
    const res = await updateHoliday({
      data: { id: holiday.id, date, name: name.trim() },
    })
    setBusy(false)
    if (res.ok) {
      setEditing(false)
      onDone()
    }
  }

  async function remove() {
    setBusy(true)
    const res = await deleteHoliday({ data: { id: holiday.id } })
    setBusy(false)
    if (res.ok) onDone()
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 py-2">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
        <button
          onClick={save}
          disabled={busy}
          aria-label="Save"
          className="rounded-md bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          <Check size={14} />
        </button>
        <button
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className="rounded-md bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200"
        >
          <X size={14} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="flex items-center gap-3">
        <span className="w-28 shrink-0 text-slate-500">
          {fmtDate(holiday.date)}
        </span>
        <span className="font-medium text-slate-700">{holiday.name}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          aria-label="Edit"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={remove}
          disabled={busy}
          aria-label="Delete"
          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

function ReconcileButton() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function run() {
    setBusy(true)
    setMsg('')
    const res = await reconcileAttendance()
    setBusy(false)
    setMsg(
      res.ok
        ? `Reconciled ${res.data.daysProcessed} day(s), ${res.data.entriesCreated} absence(s) recorded.`
        : res.error,
    )
  }

  return (
    <div className="flex items-center gap-3">
      {msg ? <span className="text-xs text-slate-500">{msg}</span> : null}
      <button
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : (
          <RefreshCw size={15} />
        )}
        Run reconciliation now
      </button>
    </div>
  )
}
