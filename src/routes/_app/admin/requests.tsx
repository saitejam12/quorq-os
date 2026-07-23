import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Check, Inbox, Loader2, UserPlus, X } from 'lucide-react'
import { approveUserWithDetails, listUsers, rejectUser } from '#/server/admin'
import type { AdminUser } from '#/server/admin'
import { listEmployees } from '#/server/people'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/admin/requests')({
  beforeLoad: ({ context }) => {
    requireTier(context.user, 'master')
  },
  staticData: { title: 'User Requests' },
  component: RequestsPage,
})

const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'

const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'intern']
const STATUSES = ['active', 'on_leave', 'notice']
const GENDERS = ['male', 'female', 'other']

const OPTION_LABEL: Record<string, string> = {
  'full-time': 'Full-time',
  'part-time': 'Part-time',
  contract: 'Contract',
  intern: 'Intern',
  active: 'Active',
  on_leave: 'On leave',
  notice: 'Notice period',
  male: 'Male',
  female: 'Female',
  other: 'Other',
}
const optionLabel = (v: string) => OPTION_LABEL[v] ?? v

type FieldKind = 'text' | 'email' | 'date' | 'textarea' | 'number' | 'select'
type FieldGroup = 'Employment' | 'Personal' | 'Bank & KYC'

interface FieldDef {
  key: string
  label: string
  kind: FieldKind
  group: FieldGroup
  max?: number
  options?: Array<string>
  required?: boolean
  wide?: boolean
}

// Mirrors the employee-information route (Name…Reports-to) plus the profile
// route's Personal and Bank/KYC groups. `managerId` is rendered separately since
// its options come from the live employee list.
const FIELDS: Array<FieldDef> = [
  {
    key: 'name',
    label: 'Name',
    kind: 'text',
    group: 'Employment',
    max: 120,
    required: true,
  },
  {
    key: 'email',
    label: 'Email',
    kind: 'email',
    group: 'Employment',
    max: 160,
    required: true,
  },
  {
    key: 'department',
    label: 'Department',
    kind: 'text',
    group: 'Employment',
    max: 64,
    required: true,
  },
  {
    key: 'designation',
    label: 'Designation',
    kind: 'text',
    group: 'Employment',
    max: 120,
    required: true,
  },
  {
    key: 'employmentType',
    label: 'Employment type',
    kind: 'select',
    group: 'Employment',
    options: EMPLOYMENT_TYPES,
  },
  {
    key: 'location',
    label: 'Location',
    kind: 'text',
    group: 'Employment',
    max: 64,
  },
  {
    key: 'status',
    label: 'Status',
    kind: 'select',
    group: 'Employment',
    options: STATUSES,
  },
  {
    key: 'gender',
    label: 'Gender',
    kind: 'select',
    group: 'Employment',
    options: GENDERS,
  },
  {
    key: 'dateOfJoining',
    label: 'Date of joining',
    kind: 'date',
    group: 'Employment',
    required: true,
  },
  {
    key: 'performanceRating',
    label: 'Performance rating (0–5)',
    kind: 'number',
    group: 'Employment',
  },
  {
    key: 'phone',
    label: 'Phone number',
    kind: 'text',
    group: 'Personal',
    max: 24,
  },
  {
    key: 'currentAddress',
    label: 'Current address',
    kind: 'textarea',
    group: 'Personal',
    max: 400,
    wide: true,
  },
  {
    key: 'permanentAddress',
    label: 'Permanent address',
    kind: 'textarea',
    group: 'Personal',
    max: 400,
    wide: true,
  },
  {
    key: 'emergencyContactName',
    label: 'Emergency contact name',
    kind: 'text',
    group: 'Personal',
    max: 120,
  },
  {
    key: 'emergencyContactPhone',
    label: 'Emergency contact phone',
    kind: 'text',
    group: 'Personal',
    max: 24,
  },
  {
    key: 'bankName',
    label: 'Bank name',
    kind: 'text',
    group: 'Bank & KYC',
    max: 120,
  },
  {
    key: 'bankAccountNumber',
    label: 'Salary account number',
    kind: 'text',
    group: 'Bank & KYC',
    max: 40,
  },
  {
    key: 'bankIfsc',
    label: 'IFSC',
    kind: 'text',
    group: 'Bank & KYC',
    max: 20,
  },
  {
    key: 'aadhaarNumber',
    label: 'Aadhaar number',
    kind: 'text',
    group: 'Bank & KYC',
    max: 20,
  },
  {
    key: 'panNumber',
    label: 'PAN number',
    kind: 'text',
    group: 'Bank & KYC',
    max: 15,
  },
]

const GROUPS: Array<FieldGroup> = ['Employment', 'Personal', 'Bank & KYC']

function initialForm(user: AdminUser): Record<string, string> {
  const today = new Date().toISOString().slice(0, 10)
  return {
    name: user.name,
    email: user.email,
    department: '',
    designation: '',
    employmentType: 'full-time',
    location: 'Hyderabad',
    status: 'active',
    gender: 'male',
    dateOfJoining: today,
    performanceRating: '3.0',
    managerId: '',
    phone: '',
    currentAddress: '',
    permanentAddress: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    bankName: '',
    bankAccountNumber: '',
    bankIfsc: '',
    aadhaarNumber: '',
    panNumber: '',
  }
}

function ApproveDetailsModal({
  user,
  managers,
  onClose,
  onApproved,
}: {
  user: AdminUser
  managers: Array<{ id: number; name: string; designation: string }>
  onClose: () => void
  onApproved: () => void
}) {
  const [form, setForm] = useState<Record<string, string>>(() =>
    initialForm(user),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key: string, value: string) =>
    setForm((s) => ({ ...s, [key]: value }))

  async function submit() {
    const missing = FIELDS.filter(
      (f) => f.required && !(form[f.key] ?? '').trim(),
    )
    if (missing.length > 0) {
      setError(`Please fill: ${missing.map((m) => m.label).join(', ')}`)
      return
    }
    setBusy(true)
    setError('')
    const res = await approveUserWithDetails({
      data: {
        userId: user.id,
        name: form.name,
        email: form.email,
        department: form.department,
        designation: form.designation,
        employmentType: form.employmentType,
        location: form.location.trim() || 'Hyderabad',
        status: form.status as 'active' | 'on_leave' | 'notice',
        gender: form.gender as 'male' | 'female' | 'other',
        dateOfJoining: form.dateOfJoining,
        performanceRating: Number(form.performanceRating || '3'),
        managerId: form.managerId ? Number(form.managerId) : null,
        phone: form.phone,
        currentAddress: form.currentAddress,
        permanentAddress: form.permanentAddress,
        emergencyContactName: form.emergencyContactName,
        emergencyContactPhone: form.emergencyContactPhone,
        bankName: form.bankName,
        bankAccountNumber: form.bankAccountNumber,
        bankIfsc: form.bankIfsc,
        aadhaarNumber: form.aadhaarNumber,
        panNumber: form.panNumber,
      },
    })
    setBusy(false)
    if (res.ok) {
      onApproved()
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
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <UserPlus size={16} className="text-slate-400" />
            Approve &amp; create employee
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <p className="text-xs text-slate-500">
            Approving <span className="font-medium">{user.name}</span> (
            {user.email}) creates their employee record and links their login.
            Fill in the details below.
          </p>

          {GROUPS.map((group) => (
            <div key={group}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {group}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {group === 'Employment' ? (
                  <label className="space-y-1.5">
                    <span className="text-xs font-medium text-slate-600">
                      Reports to
                    </span>
                    <select
                      value={form.managerId}
                      onChange={(e) => set('managerId', e.target.value)}
                      className={inputCls}
                    >
                      <option value="">— No manager —</option>
                      {managers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name} · {m.designation}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {FIELDS.filter((f) => f.group === group).map((f) => (
                  <label
                    key={f.key}
                    className={`space-y-1.5 ${f.wide ? 'sm:col-span-2' : ''}`}
                  >
                    <span className="text-xs font-medium text-slate-600">
                      {f.label}
                      {f.required ? (
                        <span className="text-red-500"> *</span>
                      ) : null}
                    </span>
                    {f.kind === 'textarea' ? (
                      <textarea
                        value={form[f.key] ?? ''}
                        rows={2}
                        maxLength={f.max}
                        onChange={(e) => set(f.key, e.target.value)}
                        className={inputCls}
                      />
                    ) : f.kind === 'select' ? (
                      <select
                        value={form[f.key] ?? ''}
                        onChange={(e) => set(f.key, e.target.value)}
                        className={inputCls}
                      >
                        {(f.options ?? []).map((opt) => (
                          <option key={opt} value={opt}>
                            {optionLabel(opt)}
                          </option>
                        ))}
                      </select>
                    ) : f.kind === 'number' ? (
                      <input
                        type="number"
                        min="0"
                        max="5"
                        step="0.1"
                        value={form[f.key] ?? ''}
                        onChange={(e) => set(f.key, e.target.value)}
                        className={inputCls}
                      />
                    ) : (
                      <input
                        type={f.kind === 'date' ? 'date' : f.kind}
                        value={form[f.key] ?? ''}
                        maxLength={f.kind === 'date' ? undefined : f.max}
                        onChange={(e) => set(f.key, e.target.value)}
                        className={inputCls}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3">
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            Approve &amp; create
          </button>
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </div>
      </div>
    </div>
  )
}

function RequestsPage() {
  const queryClient = useQueryClient()
  const [approving, setApproving] = useState<AdminUser | null>(null)

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await listUsers()
      if (!res.ok) throw new Error(res.error)
      return res.data
    },
  })

  const managersQuery = useQuery({
    queryKey: ['employees', 'picker'],
    queryFn: () => listEmployees(),
  })
  const managers = useMemo(
    () =>
      (managersQuery.data ?? []).map((e) => ({
        id: e.id,
        name: e.name,
        designation: e.designation,
      })),
    [managersQuery.data],
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }
  const reject = useMutation({
    mutationFn: (userId: number) => rejectUser({ data: { userId } }),
    onSuccess: invalidate,
  })

  const pending =
    usersQuery.data?.filter((user) => user.status === 'pending') ?? []
  const actionError = reject.data && !reject.data.ok ? reject.data.error : ''

  return (
    <div className="p-6">
      <p className="text-sm text-slate-500">
        Approve or decline signup requests. Approving opens a form to create the
        new employee record; approved users join with the basic tier.
      </p>

      {usersQuery.error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {usersQuery.error.message}
        </div>
      ) : null}
      {actionError ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {actionError}
        </div>
      ) : null}

      {usersQuery.isPending ? (
        <div className="mt-10 flex justify-center text-slate-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : pending.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <Inbox className="text-slate-300" size={48} />
          <p className="mt-4 text-sm text-slate-500">No pending requests.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((user) => (
                <tr key={user.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {user.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setApproving(user)}
                        disabled={reject.isPending}
                        className="flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => reject.mutate(user.id)}
                        disabled={reject.isPending}
                        className="flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {approving ? (
        <ApproveDetailsModal
          user={approving}
          managers={managers}
          onClose={() => setApproving(null)}
          onApproved={invalidate}
        />
      ) : null}
    </div>
  )
}
