import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader } from '#/components/ui'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/settings')({
  staticData: { title: 'Settings' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  component: Settings,
})

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-700">{value}</span>
    </div>
  )
}

function Settings() {
  return (
    <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Organization" />
        <div className="divide-y divide-slate-100 px-5 pb-3">
          <Row label="Company" value="QuorqOS Technologies Pvt Ltd" />
          <Row label="Financial year" value="FY 2025–26" />
          <Row label="Headquarters" value="Hyderabad, India" />
          <Row label="Company size" value="SME · 142 employees" />
          <Row label="Currency" value="INR (₹)" />
        </div>
      </Card>
      <Card>
        <CardHeader title="Preferences" />
        <div className="divide-y divide-slate-100 px-5 pb-3">
          <Row label="Default landing tab" value="Executive overview" />
          <Row label="Attendance target" value="90%" />
          <Row label="Attrition benchmark" value="6.5%" />
          <Row label="Data source" value="Neon PostgreSQL" />
          <Row label="Report auto-email" value="Enabled" />
        </div>
      </Card>
    </div>
  )
}
