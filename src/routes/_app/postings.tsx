import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Megaphone,
  Globe,
  CalendarPlus,
  Users,
  Plus,
  X,
  Loader2,
  Ban,
  Pencil,
  Trash2,
  FileText,
} from 'lucide-react'
import {
  getPostings,
  createPosting,
  deactivatePosting,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from '#/server/postings'
import { Card, CardHeader, KpiCard, Badge } from '#/components/ui'
import { requireTier } from '#/lib/guards'
import {
  DEACTIVATION_REASONS,
  EMPLOYMENT_TYPES,
  TEMPLATE_CATEGORIES,
} from '#/lib/postings'
import type { EmploymentType, TemplateCategory } from '#/lib/postings'

export const Route = createFileRoute('/_app/postings')({
  staticData: { title: 'Job postings' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getPostings(),
  component: JobPostings,
})

const DEPARTMENTS = [
  'Engineering',
  'Sales',
  'Operations',
  'Product',
  'Marketing',
  'Finance',
  'HR',
]
const LOCATIONS = ['Hyderabad', 'Bangalore', 'Remote', 'Pune']
const typeLabel: Record<string, string> = {
  'full-time': 'Full-time',
  contract: 'Contract',
}
const catChip: Record<string, string | undefined> = {
  tech: 'bg-blue-100 text-blue-700',
  sales: 'bg-emerald-100 text-emerald-700',
  others: 'bg-slate-100 text-slate-600',
}
const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—'

type Template = ReturnType<typeof Route.useLoaderData>['templates'][number]

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
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-xl"
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
        {children}
      </div>
    </div>
  )
}

function NewOpeningModal({
  templates,
  onClose,
}: {
  templates: Array<Template>
  onClose: () => void
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Template | null>(null)
  const [department, setDepartment] = useState('Engineering')
  const [location, setLocation] = useState('Hyderabad')
  const [employmentType, setEmploymentType] =
    useState<EmploymentType>('full-time')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function publish() {
    if (!selected) return
    setBusy(true)
    setError('')
    const res = await createPosting({
      data: { templateId: selected.id, department, location, employmentType },
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
    <Modal title="New opening" onClose={onClose}>
      {!selected ? (
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="rounded-lg border border-slate-200 p-3 text-left transition-shadow hover:border-blue-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  {t.title}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${catChip[t.category] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {t.category}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{t.summary}</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800">
                {selected.title}
              </span>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-blue-600 hover:underline"
              >
                Change template
              </button>
            </div>
            <p className="mt-1 whitespace-pre-line text-xs text-slate-500">
              {selected.description}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                Department
              </span>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {DEPARTMENTS.map((dp) => (
                  <option key={dp}>{dp}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium text-slate-600">
                Location
              </span>
              <select
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {LOCATIONS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-slate-600">
              Employment type
            </span>
            <div className="flex gap-2">
              {EMPLOYMENT_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setEmploymentType(t)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    employmentType === t
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {typeLabel[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={publish}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              Publish
            </button>
            {error ? (
              <span className="text-xs text-red-600">{error}</span>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  )
}

function DeactivateModal({
  posting,
  onClose,
}: {
  posting: { id: number; role: string }
  onClose: () => void
}) {
  const router = useRouter()
  const [reason, setReason] = useState<string>(DEACTIVATION_REASONS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    const res = await deactivatePosting({
      data: { id: posting.id, reason: reason as never },
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
    <Modal title={`Deactivate — ${posting.role}`} onClose={onClose}>
      <div className="space-y-4 p-5">
        <p className="text-sm text-slate-500">
          This removes the posting from the careers site. Select a reason:
        </p>
        <select
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          {DEACTIVATION_REASONS.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <div className="flex items-center gap-3">
          <button
            onClick={confirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <Ban size={15} />
            )}
            Deactivate posting
          </button>
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </div>
      </div>
    </Modal>
  )
}

function TemplateModal({
  template,
  onClose,
}: {
  template: Template | null
  onClose: () => void
}) {
  const router = useRouter()
  const [title, setTitle] = useState(template?.title ?? '')
  const [category, setCategory] = useState<TemplateCategory>(
    template ? (template.category as TemplateCategory) : 'tech',
  )
  const [summary, setSummary] = useState(template?.summary ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!title.trim() || !summary.trim() || !description.trim()) {
      setError('All fields are required')
      return
    }
    setBusy(true)
    setError('')
    const fields = { title, category, summary, description }
    const res = template
      ? await updateTemplate({ data: { id: template.id, ...fields } })
      : await createTemplate({ data: fields })
    setBusy(false)
    if (res.ok) {
      router.invalidate()
      onClose()
    } else {
      setError(res.error)
    }
  }

  return (
    <Modal
      title={template ? 'Edit template' : 'New template'}
      onClose={onClose}
    >
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Role title"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TemplateCategory)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm capitalize"
            >
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">Summary</span>
          <input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="One-line summary shown in the picker"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">
            Description (JD)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={7}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Full job description…"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {template ? 'Save changes' : 'Add template'}
          </button>
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </div>
      </div>
    </Modal>
  )
}

function JobPostings() {
  const d = Route.useLoaderData()
  const router = useRouter()
  const [showNew, setShowNew] = useState(false)
  const [deactivating, setDeactivating] = useState<{
    id: number
    role: string
  } | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<
    Template | null | 'new'
  >(null)
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)

  async function removeTemplate(id: number) {
    await deleteTemplate({ data: { id } })
    setConfirmRemove(null)
    router.invalidate()
  }

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Megaphone size={15} />}
          label="Active postings"
          value={String(d.kpis.active)}
          delta="Live now"
          deltaTone="green"
          footer="On the careers site"
        />
        <KpiCard
          icon={<Globe size={15} />}
          label="Published"
          value={String(d.kpis.published)}
          delta="Externally visible"
          deltaTone="blue"
          footer="Pulled by careers API"
        />
        <KpiCard
          icon={<CalendarPlus size={15} />}
          label="Opened this month"
          value={String(d.kpis.openedThisMonth)}
          delta="New openings"
          deltaTone="blue"
          footer="Since 1st of month"
        />
        <KpiCard
          icon={<Users size={15} />}
          label="Total applicants"
          value={String(d.kpis.totalApplicants)}
          delta="Across active roles"
          deltaTone="slate"
          footer="Linked applications"
        />
      </div>

      <Card>
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-sm font-semibold text-slate-800">
            Active postings
          </h3>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus size={13} /> New opening
          </button>
        </div>
        <div className="px-5 pb-4 pt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Dept</th>
                <th className="py-2 font-medium">Location</th>
                <th className="py-2 font-medium">Type</th>
                <th className="py-2 font-medium">Applicants</th>
                <th className="py-2 font-medium">Careers</th>
                <th className="py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {d.active.length ? (
                d.active.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 font-medium text-slate-700">
                      {p.role}
                    </td>
                    <td className="py-2.5 text-slate-500">{p.department}</td>
                    <td className="py-2.5 text-slate-500">{p.location}</td>
                    <td className="py-2.5 text-slate-500">
                      {typeLabel[p.employmentType] ?? p.employmentType}
                    </td>
                    <td className="py-2.5 text-slate-500">{p.applicants}</td>
                    <td className="py-2.5">
                      {p.published ? (
                        <Badge tone="ok" label="Published" />
                      ) : (
                        <Badge tone="warn" label="Unpublished" />
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() =>
                          setDeactivating({ id: p.id, role: p.role })
                        }
                        className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                      >
                        <Ban size={12} /> Deactivate
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-4 text-slate-400">
                    No active postings — create one with “New opening”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between px-5 pt-4">
          <h3 className="text-sm font-semibold text-slate-800">
            Job description templates
          </h3>
          <button
            onClick={() => setEditingTemplate('new')}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus size={13} /> Add template
          </button>
        </div>
        <div className="divide-y divide-slate-100 px-5 pb-4 pt-2">
          {d.templates.length ? (
            d.templates.map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                  <FileText size={15} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">
                      {t.title}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${catChip[t.category] ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      {t.category}
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-400">{t.summary}</p>
                </div>
                {confirmRemove === t.id ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500">Remove?</span>
                    <button
                      onClick={() => removeTemplate(t.id)}
                      className="rounded-md bg-red-50 px-2 py-1 font-medium text-red-600 hover:bg-red-100"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmRemove(null)}
                      className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-600 hover:bg-slate-200"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => setEditingTemplate(t)}
                      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                    >
                      <Pencil size={12} /> Edit
                    </button>
                    <button
                      onClick={() => setConfirmRemove(t.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="py-3 text-sm text-slate-400">
              No templates yet — add one.
            </p>
          )}
        </div>
      </Card>

      {d.closed.length ? (
        <Card>
          <CardHeader title="Recently closed" hint={`${d.closed.length}`} />
          <div className="px-5 pb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-medium">Role</th>
                  <th className="py-2 font-medium">Dept</th>
                  <th className="py-2 font-medium">Reason</th>
                  <th className="py-2 font-medium">Closed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {d.closed.map((p) => (
                  <tr key={p.id}>
                    <td className="py-2.5 font-medium text-slate-700">
                      {p.role}
                    </td>
                    <td className="py-2.5 text-slate-500">{p.department}</td>
                    <td className="py-2.5 text-slate-500">{p.reason}</td>
                    <td className="py-2.5 text-slate-500">
                      {fmtDate(p.closedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {showNew ? (
        <NewOpeningModal
          templates={d.templates}
          onClose={() => setShowNew(false)}
        />
      ) : null}
      {deactivating ? (
        <DeactivateModal
          posting={deactivating}
          onClose={() => setDeactivating(null)}
        />
      ) : null}
      {editingTemplate ? (
        <TemplateModal
          template={editingTemplate === 'new' ? null : editingTemplate}
          onClose={() => setEditingTemplate(null)}
        />
      ) : null}
    </div>
  )
}
