import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { ClipboardList, UserPlus, CheckCircle2, Plus, Loader2, Trash2, Pencil } from 'lucide-react'
import {
  getOnboarding,
  createOnboarding,
  toggleOnboardingTask,
  addOnboardingNote,
  toggleOnboardingNote,
  deleteOnboardingNote,
  updateOnboarding,
  addOnboardingTask,
  deleteOnboardingTask,
} from '#/server/onboarding'
import { Card, KpiCard, Badge, Ring } from '#/components/ui'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/onboarding')({
  staticData: { title: 'Onboarding' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getOnboarding(),
  component: Onboarding,
})

const depts = ['Engineering', 'Sales', 'Operations', 'Product', 'Marketing', 'Finance', 'HR']
const categories = ['docs', 'it', 'orientation', 'compliance'] as const
const catColor: Record<string, string> = {
  docs: 'text-blue-500', it: 'text-violet-500', orientation: 'text-amber-500', compliance: 'text-teal-500',
}
const fmt = (d: string) => new Date(d).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDateTime = (d: string) => new Date(d).toLocaleString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

type OnboardingNote = { id: number; note: string; done: boolean; createdAt: string }

function NotesSection({ onboardingId, notes }: { onboardingId: number; notes: Array<OnboardingNote> }) {
  const router = useRouter()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    await addOnboardingNote({ data: { onboardingId, note: text } })
    setText('')
    setBusy(false)
    router.invalidate()
  }
  async function toggle(noteId: number) { await toggleOnboardingNote({ data: { noteId } }); router.invalidate() }
  async function remove(noteId: number) { await deleteOnboardingNote({ data: { noteId } }); router.invalidate() }

  return (
    <div className="border-t border-slate-100 px-4 py-3">
      <div className="mb-2 text-xs font-medium text-slate-600">Notes</div>
      {notes.length ? (
        <ul className="mb-3 space-y-1.5">
          {notes.map((nn) => (
            <li key={nn.id} className="flex items-start gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-sm">
              <input type="checkbox" checked={nn.done} onChange={() => toggle(nn.id)} className="mt-1" />
              <div className="min-w-0 flex-1">
                <div className={nn.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{nn.note}</div>
                <div className="text-[11px] text-slate-400">{fmtDateTime(nn.createdAt)}</div>
              </div>
              <button onClick={() => remove(nn.id)} aria-label="Delete note" className="mt-0.5 text-slate-300 hover:text-red-500"><Trash2 size={14} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="mb-3 text-xs text-slate-400">No notes yet.</p>}
      <form onSubmit={add} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a note…" className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
        <button type="submit" disabled={busy || !text.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Add note
        </button>
      </form>
    </div>
  )
}

type Task = { id: number; task: string; category: string; done: boolean }

function ChecklistSection({ onboardingId, tasks }: { onboardingId: number; tasks: Array<Task> }) {
  const router = useRouter()
  const [acting, setActing] = useState<number | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [task, setTask] = useState('')
  const [category, setCategory] = useState<(typeof categories)[number]>('docs')

  async function toggle(taskId: number) {
    setActing(taskId)
    await toggleOnboardingTask({ data: { taskId } })
    setActing(null)
    router.invalidate()
  }
  async function remove(taskId: number) { await deleteOnboardingTask({ data: { taskId } }); router.invalidate() }
  async function add(e: React.FormEvent) {
    e.preventDefault()
    if (!task.trim()) return
    await addOnboardingTask({ data: { onboardingId, task: task.trim(), category } })
    setTask('')
    setShowAdd(false)
    router.invalidate()
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-slate-100 px-4 py-3 sm:grid-cols-2">
        {tasks.map((t) => (
          <div key={t.id} className="group flex items-center gap-2 py-1 text-sm">
            <input type="checkbox" checked={t.done} disabled={acting === t.id} onChange={() => toggle(t.id)} />
            <span className={t.done ? 'text-slate-400 line-through' : 'text-slate-700'}>{t.task}</span>
            <span className={`ml-auto text-[10px] uppercase ${catColor[t.category]}`}>{t.category}</span>
            <button onClick={() => remove(t.id)} aria-label="Delete task" className="text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>
      <div className="px-4 pb-3">
        {showAdd ? (
          <form onSubmit={add} className="flex flex-wrap items-center gap-2">
            <input value={task} onChange={(e) => setTask(e.target.value)} placeholder="New checklist item…" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" />
            <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs capitalize">
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Add</button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-slate-400 hover:text-slate-600">Cancel</button>
          </form>
        ) : (
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"><Plus size={13} /> Add checklist item</button>
        )}
      </div>
    </>
  )
}

type Journey = {
  id: number; candidateName: string; role: string; department: string; startDate: string
  status: string; progress: number; employeeId: number | null
  notes: Array<OnboardingNote>; tasks: Array<Task>
}

function EditJourney({ journey, onDone }: { journey: Journey; onDone: () => void }) {
  const [dept, setDept] = useState(journey.department)
  // neon DATE round-trips to a JS Date on the client, so normalize via Date, not string.slice.
  const [start, setStart] = useState(new Date(journey.startDate).toISOString().slice(0, 10))
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    await updateOnboarding({ data: { id: journey.id, department: dept, startDate: start } })
    setBusy(false)
    onDone()
  }

  return (
    <form onSubmit={save} className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3">
      <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
        {depts.map((dp) => <option key={dp}>{dp}</option>)}
      </select>
      <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
      <button type="submit" disabled={busy} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {busy ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}

function Onboarding() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [open, setOpen] = useState<number | null>(d.onboardings[0]?.id ?? null)
  const [editing, setEditing] = useState<number | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [dept, setDept] = useState('Engineering')
  const [start, setStart] = useState('')

  async function create(e: React.FormEvent) {
    e.preventDefault()
    await createOnboarding({ data: { candidateName: name, email, role, department: dept, startDate: start } })
    setName(''); setEmail(''); setRole(''); setStart(''); setShowForm(false)
    router.invalidate()
  }

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<UserPlus size={15} />} label="In onboarding" value={String(d.stats.active)} delta="Active journeys" deltaTone="blue" footer="New hires in progress" />
        <KpiCard icon={<CheckCircle2 size={15} />} label="Completed" value={String(d.stats.completed)} valueTone="green" delta="Fully onboarded" deltaTone="green" footer="Converted to employees" />
        <KpiCard icon={<ClipboardList size={15} />} label="Avg progress" value={`${d.stats.avgProgress}%`} delta="Across journeys" deltaTone="amber" footer="Checklist completion" />
        <KpiCard icon={<ClipboardList size={15} />} label="Total journeys" value={String(d.stats.total)} delta="All time" deltaTone="slate" footer="Onboarding records" />
      </div>

      <Card>
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-sm font-semibold text-slate-800">New hires</h3>
          <button onClick={() => setShowForm((s) => !s)} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
            <Plus size={13} /> Start onboarding
          </button>
        </div>
        {showForm ? (
          <form onSubmit={create} className="mx-5 mt-3 grid grid-cols-1 gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-5">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Candidate name" required className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <select value={dept} onChange={(e) => setDept(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {depts.map((dp) => <option key={dp}>{dp}</option>)}
            </select>
            <div className="flex gap-2">
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-2 text-sm" />
              <button type="submit" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700">Add</button>
            </div>
          </form>
        ) : null}

        <div className="space-y-2 px-5 pb-5 pt-3">
          {d.onboardings.length ? d.onboardings.map((o) => (
            <div key={o.id} className="rounded-lg border border-slate-200">
              <div className="flex w-full items-center gap-3 px-4 py-3">
                <Ring value={o.progress} size={46} />
                <button onClick={() => setOpen(open === o.id ? null : o.id)} className="min-w-0 flex-1 text-left">
                  <div className="text-sm font-semibold text-slate-800">{o.candidateName}</div>
                  <div className="text-xs text-slate-400">{o.role} · {o.department} · starts {fmt(o.startDate)}</div>
                </button>
                {o.employeeId ? <Badge tone="ok" label="Employee created" /> : <Badge tone={o.status === 'completed' ? 'ok' : 'in_progress'} label={o.status === 'completed' ? 'Completed' : `${o.progress}%`} />}
                <button onClick={() => setEditing(editing === o.id ? null : o.id)} aria-label="Edit journey" className="text-slate-300 hover:text-blue-500"><Pencil size={15} /></button>
              </div>
              {editing === o.id ? <EditJourney journey={o} onDone={() => { setEditing(null); router.invalidate() }} /> : null}
              {open === o.id ? (
                <>
                  <ChecklistSection onboardingId={o.id} tasks={o.tasks} />
                  <NotesSection onboardingId={o.id} notes={o.notes} />
                </>
              ) : null}
            </div>
          )) : <p className="py-4 text-sm text-slate-400">No onboarding journeys yet — start one above.</p>}
        </div>
      </Card>
    </div>
  )
}
