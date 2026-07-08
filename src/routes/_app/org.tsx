import { createFileRoute, Link } from '@tanstack/react-router'
import { Building2, Users, Network, UserCog } from 'lucide-react'
import { getOrg } from '#/server/org'
import { Card, KpiCard, Avatar } from '#/components/ui'

export const Route = createFileRoute('/_app/org')({
  staticData: { title: 'Org structure' },
  loader: () => getOrg(),
  component: OrgStructure,
})

function PersonBox({
  id,
  name,
  sub,
  accent,
}: {
  id: number
  name: string
  sub: string
  accent?: boolean
}) {
  return (
    <Link
      to="/directory/$id"
      params={{ id: String(id) }}
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-shadow hover:shadow-sm ${
        accent ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'
      }`}
    >
      <Avatar name={name} size={34} />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-slate-800">{name}</div>
        <div className="truncate text-xs text-slate-500">{sub}</div>
      </div>
    </Link>
  )
}

function OrgStructure() {
  const d = Route.useLoaderData()

  return (
    <div className="space-y-5 p-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<Building2 size={15} />}
          label="Departments"
          value={String(d.stats.departments)}
          delta="Business units"
          deltaTone="blue"
          footer="Each led by a department head"
        />
        <KpiCard
          icon={<UserCog size={15} />}
          label="People managers"
          value={String(d.stats.managers)}
          delta="With direct reports"
          deltaTone="blue"
          footer="Across all departments"
        />
        <KpiCard
          icon={<Network size={15} />}
          label="Avg span of control"
          value={String(d.stats.avgSpan)}
          delta="Reports per manager"
          deltaTone="slate"
          footer="Healthy range 5–8"
        />
        <KpiCard
          icon={<Users size={15} />}
          label="Individual contributors"
          value={String(d.stats.ics)}
          delta="Non-manager roles"
          deltaTone="slate"
          footer="The wider workforce"
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {d.departments.map((dep) => (
          <Card key={dep.department} className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                {dep.department}
              </h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                {dep.total} people
              </span>
            </div>

            {/* head */}
            <PersonBox
              id={dep.head.id}
              name={dep.head.name}
              sub={dep.head.designation}
              accent
            />

            {/* managers */}
            {dep.managers.length ? (
              <div className="relative mt-3 space-y-2 border-l-2 border-slate-100 pl-4">
                {dep.managers.map((m) => (
                  <div key={m.id} className="relative">
                    <span className="absolute -left-4 top-1/2 h-px w-3 bg-slate-200" />
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <PersonBox id={m.id} name={m.name} sub={m.designation} />
                      </div>
                      <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-600">
                        {m.reports} reports
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 pl-1 text-xs text-slate-400">
                {dep.directReports} direct reports
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
