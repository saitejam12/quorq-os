import { createFileRoute } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import { getExecutive } from '#/server/metrics'
import { Card, CardHeader } from '#/components/ui'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/alerts')({
  staticData: { title: 'Alerts & notifications' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  loader: () => getExecutive(),
  component: Alerts,
})

const dotTone: Record<string, string> = {
  risk: 'bg-red-500',
  warn: 'bg-orange-400',
  info: 'bg-blue-500',
  ok: 'bg-emerald-500',
  alert: 'bg-red-500',
}

function Alerts() {
  const d = Route.useLoaderData()
  const complianceAlerts = d.compliance
    .filter((c) => c.tone === 'alert' || c.tone === 'warn')
    .map((c) => ({ tone: c.tone, title: c.label, body: c.value }))

  return (
    <div className="space-y-5 p-6">
      <Card>
        <CardHeader title="AI insights & alerts" hint="Auto-generated" />
        <div className="divide-y divide-slate-100 px-5 pb-3">
          {d.aiInsights.map((a, i) => (
            <div key={i} className="flex items-start gap-3 py-3">
              <span
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dotTone[a.tone]}`}
              />
              <div>
                <div className="text-sm font-medium text-slate-800">
                  {a.title}
                </div>
                <div className="text-xs text-slate-500">{a.body}</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Compliance alerts" hint="Action required" />
        <div className="divide-y divide-slate-100 px-5 pb-3">
          {complianceAlerts.length ? (
            complianceAlerts.map((a, i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-500">
                  <Bell size={15} />
                </span>
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {a.title}
                  </div>
                  <div className="text-xs text-slate-500">{a.body}</div>
                </div>
              </div>
            ))
          ) : (
            <p className="py-3 text-sm text-slate-400">
              No compliance alerts right now.
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
