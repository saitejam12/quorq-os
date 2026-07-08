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
} from 'lucide-react'
import type { ReactNode } from 'react'
import { getMyProfile, updateMyPersonalDetails } from '#/server/profile'
import type { MyPersonalDetails } from '#/server/profile'
import { Card, CardHeader } from '#/components/ui'
import { mask } from '#/lib/mask'
import PayslipCard from '#/components/PayslipCard'

export const Route = createFileRoute('/_app/profile')({
  staticData: { title: 'My profile' },
  loader: () => getMyProfile(),
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

function PersonalForm({ personal }: { personal: MyPersonalDetails }) {
  const router = useRouter()
  const [form, setForm] = useState({
    phone: personal.phone ?? '',
    currentAddress: personal.currentAddress ?? '',
    permanentAddress: personal.permanentAddress ?? '',
    emergencyContactName: personal.emergencyContactName ?? '',
    emergencyContactPhone: personal.emergencyContactPhone ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const initial = {
    phone: personal.phone ?? '',
    currentAddress: personal.currentAddress ?? '',
    permanentAddress: personal.permanentAddress ?? '',
    emergencyContactName: personal.emergencyContactName ?? '',
    emergencyContactPhone: personal.emergencyContactPhone ?? '',
  }
  const dirty = (Object.keys(form) as Array<keyof typeof form>).some(
    (k) => form[k] !== initial[k],
  )
  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const res = await updateMyPersonalDetails({ data: form })
    setSaving(false)
    if (res.ok) {
      setMsg({ ok: true, text: 'Saved.' })
      router.invalidate()
    } else {
      setMsg({ ok: false, text: res.error })
    }
  }

  return (
    <Card>
      <CardHeader
        title="Personal details"
        hint="You can edit these"
        icon={<Phone size={16} />}
      />
      <form onSubmit={save} className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Phone size={13} /> Phone number
          </span>
          <input
            value={form.phone}
            onChange={(e) => set('phone')(e.target.value)}
            placeholder="+91 98765 43210"
            className={inputCls}
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <LifeBuoy size={13} /> Emergency contact name
          </span>
          <input
            value={form.emergencyContactName}
            onChange={(e) => set('emergencyContactName')(e.target.value)}
            placeholder="Contact name"
            className={inputCls}
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Home size={13} /> Current address
          </span>
          <textarea
            value={form.currentAddress}
            onChange={(e) => set('currentAddress')(e.target.value)}
            rows={2}
            placeholder="Where you live now"
            className={inputCls}
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Home size={13} /> Permanent address
          </span>
          <textarea
            value={form.permanentAddress}
            onChange={(e) => set('permanentAddress')(e.target.value)}
            rows={2}
            placeholder="Permanent address"
            className={inputCls}
          />
        </label>
        <label className="space-y-1.5">
          <span className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Phone size={13} /> Emergency contact phone
          </span>
          <input
            value={form.emergencyContactPhone}
            onChange={(e) => set('emergencyContactPhone')(e.target.value)}
            placeholder="+91 98765 43210"
            className={inputCls}
          />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            type="submit"
            disabled={saving || !dirty}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : null}
            Save changes
          </button>
          {msg ? (
            <span
              className={`text-xs ${msg.ok ? 'text-emerald-600' : 'text-red-600'}`}
            >
              {msg.text}
            </span>
          ) : null}
        </div>
      </form>
    </Card>
  )
}

function ProfilePage() {
  const data = Route.useLoaderData()

  if (!data) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <BadgeCheck className="mx-auto text-slate-300" size={40} />
          <p className="mt-3 text-sm text-slate-500">
            Your account isn&apos;t linked to an employee record yet.
          </p>
        </Card>
      </div>
    )
  }

  const { employee: e, personal, kyc } = data

  return (
    <div className="space-y-5 p-6">
      <Card>
        <CardHeader
          title="Employee details"
          hint="Read-only"
          icon={<IdCard size={16} />}
        />
        <div className="grid grid-cols-1 gap-x-8 px-5 pb-4 sm:grid-cols-2">
          <Field icon={<IdCard size={16} />} label="Employee ID" value={e.empCode ?? '—'} />
          <Field icon={<BadgeCheck size={16} />} label="Name" value={e.name} />
          <Field icon={<Mail size={16} />} label="Email" value={e.email} />
          <Field icon={<Building2 size={16} />} label="Department" value={e.department} />
          <Field icon={<Briefcase size={16} />} label="Designation" value={e.designation} />
          <Field icon={<Briefcase size={16} />} label="Employment type" value={e.employmentType} />
          <Field icon={<MapPin size={16} />} label="Location" value={e.location} />
          <Field
            icon={<CalendarDays size={16} />}
            label="Date of joining"
            value={new Date(e.dateOfJoining).toLocaleDateString('en-US', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          />
        </div>
      </Card>

      <PersonalForm personal={personal} />

      <Card>
        <CardHeader
          title="KYC information"
          hint="Read-only · visible only to you"
          icon={<ShieldCheck size={16} />}
        />
        <div className="grid grid-cols-1 gap-x-8 px-5 pb-4 sm:grid-cols-2">
          <Field icon={<Landmark size={16} />} label="Bank name" value={kyc?.bankName ?? '—'} />
          <Field
            icon={<CreditCard size={16} />}
            label="Salary account"
            value={mask(kyc?.bankAccountNumber)}
          />
          <Field icon={<Landmark size={16} />} label="IFSC" value={kyc?.bankIfsc ?? '—'} />
          <Field
            icon={<Fingerprint size={16} />}
            label="Aadhaar number"
            value={mask(kyc?.aadhaarNumber)}
          />
          <Field icon={<IdCard size={16} />} label="PAN number" value={kyc?.panNumber ?? '—'} />
        </div>
        {!kyc ? (
          <p className="px-5 pb-5 text-xs text-slate-400">
            No KYC information on file yet.
          </p>
        ) : null}
      </Card>

      <div className="max-w-sm">
        <PayslipCard />
      </div>
    </div>
  )
}
