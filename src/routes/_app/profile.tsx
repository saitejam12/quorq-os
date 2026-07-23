import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  BadgeCheck,
  Mail,
  Building2,
  Briefcase,
  MapPin,
  CalendarDays,
  IdCard,
  Phone,
  Home,
  LifeBuoy,
  Landmark,
  CreditCard,
  Fingerprint,
  ShieldCheck,
  Loader2,
  Pencil,
  X,
  Clock,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { getMyProfile, saveMyProfile } from '#/server/profile'
import type { MyProfile } from '#/server/profile'
import {
  getMyProfileChangeRequest,
  submitProfileChangeRequest,
} from '#/server/profile-requests'
import { PROFILE_FIELDS } from '#/lib/profile-fields'
import type { ProfileField } from '#/lib/profile-fields'
import { hasTier } from '#/lib/tiers'
import { Card, CardHeader } from '#/components/ui'
import ProfileFieldsModal from '#/components/ProfileFieldsModal'
import { mask } from '#/lib/mask'
import PayslipCard from '#/components/PayslipCard'

export const Route = createFileRoute('/_app/profile')({
  staticData: { title: 'My profile' },
  loader: async () => ({
    profile: await getMyProfile(),
    request: await getMyProfileChangeRequest(),
  }),
  component: ProfilePage,
})

function Field({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-slate-400">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="truncate text-sm font-medium text-slate-700">
          {value || '—'}
        </div>
      </div>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'

// Current value of each requestable field, keyed by field key — pre-fills the
// modal and is diffed client-side so only changed fields are submitted.
function currentFromProfile(p: MyProfile): Record<string, string> {
  const { employee: e, personal: per, kyc: k } = p
  return {
    name: e.name,
    email: e.email,
    department: e.department,
    designation: e.designation,
    employmentType: e.employmentType,
    location: e.location,
    dateOfJoining: e.dateOfJoining,
    phone: per.phone ?? '',
    currentAddress: per.currentAddress ?? '',
    permanentAddress: per.permanentAddress ?? '',
    emergencyContactName: per.emergencyContactName ?? '',
    emergencyContactPhone: per.emergencyContactPhone ?? '',
    bankName: k?.bankName ?? '',
    bankAccountNumber: k?.bankAccountNumber ?? '',
    bankIfsc: k?.bankIfsc ?? '',
  }
}

const GROUPS: Array<ProfileField['group']> = ['Employee', 'Personal', 'Bank']

function RequestChangesModal({
  profile,
  onClose,
}: {
  profile: MyProfile
  onClose: () => void
}) {
  const router = useRouter()
  const initial = currentFromProfile(profile)
  const [form, setForm] = useState<Record<string, string>>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const changed = PROFILE_FIELDS.filter((f) => form[f.key] !== initial[f.key])

  async function submit() {
    if (changed.length === 0) {
      setError('Change at least one field to request an update')
      return
    }
    const changes: Record<string, string> = {}
    for (const f of changed) changes[f.key] = form[f.key] ?? ''
    setBusy(true)
    setError('')
    const res = await submitProfileChangeRequest({ data: { changes } })
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
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">
            Request profile changes
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
            Edit any field below and submit. An HR/ops reviewer will approve the
            changes before they appear on your record. Aadhaar and PAN
            can&apos;t be changed here.
          </p>
          {GROUPS.map((group) => (
            <div key={group}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {group}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {PROFILE_FIELDS.filter((f) => f.group === group).map((f) => (
                  <label
                    key={f.key}
                    className={`space-y-1.5 ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}
                  >
                    <span className="text-xs font-medium text-slate-600">
                      {f.label}
                    </span>
                    {f.type === 'textarea' ? (
                      <textarea
                        value={form[f.key] ?? ''}
                        rows={2}
                        maxLength={f.max}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, [f.key]: e.target.value }))
                        }
                        className={inputCls}
                      />
                    ) : (
                      <input
                        type={f.type === 'date' ? 'date' : f.type}
                        value={form[f.key] ?? ''}
                        maxLength={f.type === 'date' ? undefined : f.max}
                        onChange={(e) =>
                          setForm((s) => ({ ...s, [f.key]: e.target.value }))
                        }
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
            disabled={busy || changed.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            Submit request
            {changed.length > 0 ? ` (${changed.length})` : ''}
          </button>
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </div>
      </div>
    </div>
  )
}

// Blank create form for a master with no employee record yet — name/email are
// pre-filled from their login, with sensible defaults for the required fields.
function blankProfileForm(user: {
  name: string
  email: string
}): Record<string, string> {
  const base: Record<string, string> = {}
  for (const f of PROFILE_FIELDS) base[f.key] = ''
  base.name = user.name
  base.email = user.email
  base.employmentType = 'full-time'
  base.location = 'Hyderabad'
  base.dateOfJoining = new Date().toISOString().slice(0, 10)
  return base
}

function ProfilePage() {
  const router = useRouter()
  const { user } = Route.useRouteContext()
  const { profile: data, request } = Route.useLoaderData()
  const isMaster = hasTier(user.tier, 'master')
  const [modalOpen, setModalOpen] = useState(false)
  const [masterModal, setMasterModal] = useState<null | 'create' | 'edit'>(null)

  if (!data) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <BadgeCheck className="mx-auto text-slate-300" size={40} />
          <p className="mt-3 text-sm text-slate-500">
            Your account isn&apos;t linked to an employee record yet.
          </p>
          {isMaster ? (
            <button
              onClick={() => setMasterModal('create')}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Pencil size={15} /> Add my details
            </button>
          ) : null}
        </Card>
        {isMaster && masterModal === 'create' ? (
          <ProfileFieldsModal
            title="Add your details"
            description="Create your employee record. These details save directly — no approval needed."
            initial={blankProfileForm(user)}
            submitLabel="Save details"
            onSubmit={(form) => saveMyProfile({ data: { changes: form } })}
            onClose={() => setMasterModal(null)}
            onSaved={() => router.invalidate()}
          />
        ) : null}
      </div>
    )
  }

  const { employee: e, personal, kyc } = data
  const pending = request?.status === 'pending'

  return (
    <div className="space-y-5 p-6">
      <div className="max-w-full">
        <PayslipCard />
      </div>
      {!isMaster && pending ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Clock size={16} className="mt-0.5 shrink-0" />
          <span>
            A change request is awaiting review
            {request.changedLabels.length
              ? `: ${request.changedLabels.join(', ')}`
              : ''}
            . You can submit a new one once it&apos;s decided.
          </span>
        </div>
      ) : !isMaster && request?.status === 'rejected' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Your last change request was declined
          {request.reviewReason ? `: ${request.reviewReason}` : ''}.
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Employee details"
          hint="Read-only"
          icon={<IdCard size={16} />}
        />
        <div className="grid grid-cols-1 gap-x-8 px-5 pb-4 sm:grid-cols-2">
          <Field
            icon={<IdCard size={16} />}
            label="Employee ID"
            value={e.empCode ?? '—'}
          />
          <Field icon={<BadgeCheck size={16} />} label="Name" value={e.name} />
          <Field icon={<Mail size={16} />} label="Email" value={e.email} />
          <Field
            icon={<Building2 size={16} />}
            label="Department"
            value={e.department}
          />
          <Field
            icon={<Briefcase size={16} />}
            label="Designation"
            value={e.designation}
          />
          <Field
            icon={<Briefcase size={16} />}
            label="Employment type"
            value={e.employmentType}
          />
          <Field
            icon={<MapPin size={16} />}
            label="Location"
            value={e.location}
          />
          <Field
            icon={<CalendarDays size={16} />}
            label="Date of joining"
            value={
              e.dateOfJoining
                ? new Date(e.dateOfJoining).toLocaleDateString('en-US', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—'
            }
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Personal details"
          hint="Read-only · request changes to edit"
          icon={<Phone size={16} />}
        />
        <div className="grid grid-cols-1 gap-x-8 px-5 pb-4 sm:grid-cols-2">
          <Field
            icon={<Phone size={16} />}
            label="Phone number"
            value={personal.phone ?? '—'}
          />
          <Field
            icon={<LifeBuoy size={16} />}
            label="Emergency contact name"
            value={personal.emergencyContactName ?? '—'}
          />
          <Field
            icon={<Home size={16} />}
            label="Current address"
            value={personal.currentAddress ?? '—'}
          />
          <Field
            icon={<Home size={16} />}
            label="Permanent address"
            value={personal.permanentAddress ?? '—'}
          />
          <Field
            icon={<Phone size={16} />}
            label="Emergency contact phone"
            value={personal.emergencyContactPhone ?? '—'}
          />
        </div>
      </Card>

      <Card>
        <CardHeader
          title="KYC information"
          hint="Read-only · visible only to you"
          icon={<ShieldCheck size={16} />}
        />
        <div className="grid grid-cols-1 gap-x-8 px-5 pb-4 sm:grid-cols-2">
          <Field
            icon={<Landmark size={16} />}
            label="Bank name"
            value={kyc?.bankName ?? '—'}
          />
          <Field
            icon={<CreditCard size={16} />}
            label="Salary account"
            value={mask(kyc?.bankAccountNumber)}
          />
          <Field
            icon={<Landmark size={16} />}
            label="IFSC"
            value={kyc?.bankIfsc ?? '—'}
          />
          <Field
            icon={<Fingerprint size={16} />}
            label="Aadhaar number"
            value={mask(kyc?.aadhaarNumber)}
          />
          <Field
            icon={<IdCard size={16} />}
            label="PAN number"
            value={kyc?.panNumber ?? '—'}
          />
        </div>
        {!kyc ? (
          <p className="px-5 pb-5 text-xs text-slate-400">
            No KYC information on file yet.
          </p>
        ) : null}
      </Card>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {isMaster
            ? 'You can edit your details directly — changes save immediately.'
            : 'Your details are read-only. Use “Request changes” to propose edits for approval.'}
        </p>
        <button
          onClick={() =>
            isMaster ? setMasterModal('edit') : setModalOpen(true)
          }
          disabled={!isMaster && pending}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Pencil size={15} /> {isMaster ? 'Edit details' : 'Request changes'}
        </button>
      </div>

      {modalOpen ? (
        <RequestChangesModal
          profile={data}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
      {isMaster && masterModal === 'edit' ? (
        <ProfileFieldsModal
          title="Edit my details"
          description="Changes save directly — no approval needed."
          initial={currentFromProfile(data)}
          submitLabel="Save changes"
          onSubmit={(form) => saveMyProfile({ data: { changes: form } })}
          onClose={() => setMasterModal(null)}
          onSaved={() => router.invalidate()}
        />
      ) : null}
    </div>
  )
}
