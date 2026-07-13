import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import {
  ArrowLeft,
  Mail,
  MapPin,
  Briefcase,
  CalendarDays,
  Star,
  Users,
  Award,
  ShieldCheck,
  Network,
  Loader2,
} from 'lucide-react'
import { getEmployee, updateEmployeeOrg } from '#/server/people'
import { Card, CardHeader, Avatar, Badge } from '#/components/ui'
import { TIERS } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'

export const Route = createFileRoute('/_app/directory/$id')({
  staticData: { title: 'Employee profile' },
  loader: ({ params }) => getEmployee({ data: Number(params.id) }),
  component: EmployeeProfile,
})

const statusLabel: Record<string, string> = {
  active: 'Active',
  on_leave: 'On leave',
  notice: 'Notice period',
}

const TIER_LABEL: Record<Tier, string> = {
  basic: 'Basic',
  ops: 'Ops',
  master: 'Master',
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-slate-400">{icon}</span>
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-400">
          {label}
        </div>
        <div className="text-sm font-medium text-slate-700">{value}</div>
      </div>
    </div>
  )
}

function OrgAccessCard({
  employeeId,
  currentManagerId,
  currentTier,
  managerOptions,
}: {
  employeeId: number
  currentManagerId: number | null
  currentTier: Tier | null
  managerOptions: Array<{ id: number; name: string; designation: string }>
}) {
  const router = useRouter()
  const [tier, setTier] = useState<Tier>(currentTier ?? 'basic')
  const [managerId, setManagerId] = useState<number | null>(currentManagerId)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const hasUser = currentTier !== null

  const dirty =
    managerId !== currentManagerId || (hasUser && tier !== currentTier)

  async function save() {
    setSaving(true)
    setMsg(null)
    const res = await updateEmployeeOrg({
      data: { employeeId, managerId, tier },
    })
    setSaving(false)
    if (res.ok) {
      setMsg({
        ok: true,
        text: res.data.tierChanged
          ? 'Saved.'
          : hasUser
            ? 'Saved.'
            : 'Reporting line saved. No login account is linked, so tier was not changed.',
      })
      router.invalidate()
    } else {
      setMsg({ ok: false, text: res.error })
    }
  }

  return (
    <Card>
      <CardHeader
        title="Org & access"
        hint="Ops / Master"
        icon={<ShieldCheck size={16} />}
      />
      <div className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <ShieldCheck size={13} /> Access tier
          </label>
          <select
            value={tier}
            disabled={!hasUser}
            onChange={(ev) => setTier(ev.target.value as Tier)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {TIER_LABEL[t]}
              </option>
            ))}
          </select>
          {!hasUser ? (
            <p className="text-[11px] text-slate-400">
              No login account is linked to this employee.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <Network size={13} /> Reports to
          </label>
          <select
            value={managerId ?? ''}
            onChange={(ev) =>
              setManagerId(ev.target.value ? Number(ev.target.value) : null)
            }
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">— No manager —</option>
            {managerOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.designation}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 sm:col-span-2">
          <button
            onClick={save}
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
      </div>
    </Card>
  )
}

function EmployeeProfile() {
  const data = Route.useLoaderData()
  if (!data) {
    return (
      <div className="p-6">
        <Link to="/directory" className="text-sm text-blue-600">
          ← Back to directory
        </Link>
        <p className="mt-4 text-slate-500">Employee not found.</p>
      </div>
    )
  }
  const {
    employee: e,
    manager,
    reports,
    kudos,
    canManage,
    managerOptions,
    linkedUserTier,
  } = data

  return (
    <div className="space-y-5 p-6">
      <Link
        to="/directory"
        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
      >
        <ArrowLeft size={15} /> Back to directory
      </Link>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-6 text-center">
          <div className="flex justify-center">
            <Avatar name={e.name} size={84} />
          </div>
          <div className="mt-4 text-lg font-bold text-slate-900">{e.name}</div>
          <div className="text-sm text-slate-500">{e.designation}</div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <Badge tone="info" label={e.department} />
            <Badge
              tone={
                e.status === 'active'
                  ? 'ok'
                  : e.status === 'notice'
                    ? 'alert'
                    : 'warn'
              }
              label={statusLabel[e.status] ?? e.status}
            />
            {e.flightRisk !== 'none' ? <Badge tone={e.flightRisk} /> : null}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Details" />
          <div className="grid grid-cols-1 gap-x-8 px-5 pb-4 sm:grid-cols-2">
            <Field icon={<Mail size={16} />} label="Email" value={e.email} />
            <Field
              icon={<MapPin size={16} />}
              label="Location"
              value={e.location}
            />
            <Field
              icon={<Briefcase size={16} />}
              label="Employment type"
              value={e.employmentType}
            />
            <Field
              icon={<CalendarDays size={16} />}
              label="Date of joining"
              value={new Date(e.dateOfJoining).toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            />
            <Field
              icon={<Star size={16} />}
              label="Performance rating"
              value={`${e.performanceRating} / 5`}
            />
            <Field
              icon={<Users size={16} />}
              label="Reports to"
              value={manager ? manager.name : '—'}
            />
          </div>
        </Card>
      </div>

      {canManage ? (
        <OrgAccessCard
          employeeId={e.id}
          currentManagerId={e.managerId ?? null}
          currentTier={linkedUserTier}
          managerOptions={managerOptions}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Direct reports" hint={`${reports.length}`} />
          <div className="px-5 pb-4">
            {reports.length ? (
              <div className="divide-y divide-slate-100">
                {reports.map((r) => (
                  <Link
                    key={r.id}
                    to="/directory/$id"
                    params={{ id: String(r.id) }}
                    className="flex items-center gap-3 py-2.5 hover:opacity-80"
                  >
                    <Avatar name={r.name} size={34} />
                    <div>
                      <div className="text-sm font-medium text-slate-700">
                        {r.name}
                      </div>
                      <div className="text-xs text-slate-400">
                        {r.designation}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="py-3 text-sm text-slate-400">No direct reports.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Recognition received" hint={`${kudos.length}`} />
          <div className="px-5 pb-4">
            {kudos.length ? (
              <div className="space-y-3">
                {kudos.map((k) => (
                  <div key={k.id} className="rounded-lg bg-slate-50 p-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Award size={13} className="text-amber-500" />
                      <span className="font-medium text-slate-700">
                        {k.fromName}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-[10px] capitalize text-slate-500 ring-1 ring-slate-200">
                        {k.value}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-slate-600">{k.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-3 text-sm text-slate-400">No recognition yet.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
