import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { Award, Megaphone, Smile, Send, Sparkles } from 'lucide-react'
import {
  getEngagement,
  listEmployees,
  createRecognition,
} from '#/server/people'
import { Card, CardHeader, KpiCard, Avatar } from '#/components/ui'
import { Donut, HBars } from '#/components/charts'

export const Route = createFileRoute('/_app/engagement')({
  staticData: { title: 'Engagement' },
  loader: async () => ({
    engagement: await getEngagement(),
    employees: await listEmployees(),
  }),
  component: Engagement,
})

const values = ['teamwork', 'innovation', 'ownership', 'customer', 'leadership']
const catTone: Record<string, string> = {
  policy: 'bg-amber-100 text-amber-700',
  event: 'bg-blue-100 text-blue-700',
  general: 'bg-emerald-100 text-emerald-700',
}
const timeAgo = (d: string) => {
  const days = Math.floor((Date.now() - Date.parse(d)) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}

function Engagement() {
  const { engagement: d, employees } = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const [toId, setToId] = useState('')
  const [value, setValue] = useState('teamwork')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function giveKudos(e: React.FormEvent) {
    e.preventDefault()
    if (!toId || !message.trim()) return
    setBusy(true)
    await createRecognition({
      data: {
        fromName: user.name,
        toEmployeeId: Number(toId),
        value,
        message,
      },
    })
    setBusy(false)
    setMessage('')
    setToId('')
    router.invalidate()
  }

  const participation = d.enps.responses
    ? Math.min(100, Math.round((d.enps.responses / employees.length) * 100))
    : 0

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Smile size={15} />}
          label="eNPS score"
          value={`${d.enps.score >= 0 ? '+' : ''}${d.enps.score}`}
          valueTone="green"
          delta={`${d.enps.responses} responses`}
          deltaTone="slate"
          footer={`${d.enps.promoters}% promoters · ${d.enps.detractors}% detractors`}
        />
        <KpiCard
          icon={<Award size={15} />}
          label="Recognitions (MTD)"
          value={String(d.recognitionsThisMonth)}
          delta="This month"
          deltaTone="blue"
          footer="Peer-to-peer kudos"
        />
        <KpiCard
          icon={<Megaphone size={15} />}
          label="Announcements"
          value={String(d.announcements.length)}
          delta="Active"
          deltaTone="blue"
          footer="Company-wide updates"
        />
        <KpiCard
          icon={<Sparkles size={15} />}
          label="Participation"
          value={`${participation}%`}
          valueTone="green"
          delta="Survey response rate"
          deltaTone="green"
          footer="Last pulse survey"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* give kudos + feed */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Give recognition" hint="Celebrate a colleague" />
            <form onSubmit={giveKudos} className="space-y-3 px-5 pb-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  required
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                >
                  <option value="">Select a colleague…</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} · {emp.department}
                    </option>
                  ))}
                </select>
                <select
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm capitalize focus:border-blue-400 focus:outline-none"
                >
                  {values.map((v) => (
                    <option key={v} value={v} className="capitalize">
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Say something nice…"
                rows={2}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                <Send size={14} /> {busy ? 'Posting…' : 'Post recognition'}
              </button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Recognition wall" hint="Recent kudos" />
            <div className="divide-y divide-slate-100 px-5 pb-3">
              {d.feed.map((k, i) => (
                <div key={i} className="flex gap-3 py-3">
                  <Avatar name={k.to} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-semibold text-slate-800">
                        {k.from}
                      </span>
                      <span className="text-slate-500"> recognized </span>
                      <span className="font-semibold text-slate-800">{k.to}</span>
                      <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] capitalize text-slate-500">
                        {k.value}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-600">{k.message}</p>
                    <div className="mt-0.5 text-[11px] text-slate-400">
                      {timeAgo(k.when)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* sidebar: eNPS + values + announcements */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="eNPS breakdown" />
            <div className="px-5 pb-5 pt-2">
              <Donut
                data={[
                  { label: 'Promoters', value: d.enps.promoters },
                  { label: 'Passives', value: d.enps.passives },
                  { label: 'Detractors', value: d.enps.detractors },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Top values" hint="Most recognized" />
            <div className="px-5 pb-5 pt-2">
              <HBars
                data={d.topValues.map((v) => ({ label: v.label, value: v.value }))}
                colorByIndex
              />
            </div>
          </Card>

          <Card>
            <CardHeader title="Announcements" />
            <div className="divide-y divide-slate-100 px-5 pb-3">
              {d.announcements.map((a, i) => (
                <div key={i} className="py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${
                        catTone[a.category] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {a.category}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {timeAgo(a.when)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">
                    {a.title}
                  </div>
                  <p className="text-xs text-slate-500">{a.body}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
