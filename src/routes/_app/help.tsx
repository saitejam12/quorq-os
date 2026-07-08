import { createFileRoute } from '@tanstack/react-router'
import { Card, CardHeader } from '#/components/ui'

export const Route = createFileRoute('/_app/help')({
  staticData: { title: 'Help' },
  component: Help,
})

const faqs = [
  {
    q: 'Where does the data come from?',
    a: 'All metrics are computed live from a Neon PostgreSQL database via TanStack Start server functions.',
  },
  {
    q: 'How do I export a report?',
    a: 'Open the Reports hub or Import & Export center and click any format button to download a CSV generated from the current data.',
  },
  {
    q: 'How is attrition calculated?',
    a: 'Attrition rate = total exits ÷ headcount. Voluntary and involuntary splits come from the exits table.',
  },
  {
    q: 'What do the access tiers mean?',
    a: 'Basic is employee self-service, Ops adds HR/manager operations, and Master has full administration. Higher tiers see everything lower tiers can.',
  },
]

function Help() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader title="Help & FAQ" />
        <div className="divide-y divide-slate-100 px-5 pb-4">
          {faqs.map((f, i) => (
            <div key={i} className="py-4">
              <div className="text-sm font-semibold text-slate-800">{f.q}</div>
              <div className="mt-1 text-sm text-slate-500">{f.a}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
