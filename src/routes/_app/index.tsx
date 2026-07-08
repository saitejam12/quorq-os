import { Link, createFileRoute } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { hasTier } from '#/lib/tiers'
import BasicDashboard from '#/components/dashboards/BasicDashboard'
import OpsDashboard from '#/components/dashboards/OpsDashboard'
import MasterDashboard from '#/components/dashboards/MasterDashboard'

export const Route = createFileRoute('/_app/')({
  validateSearch: (search: Record<string, unknown>): { denied?: '1' } => ({
    denied: search.denied === '1' ? '1' : undefined,
  }),
  staticData: { title: 'Home' },
  component: HomePage,
})

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good Morning'
  if (hour < 17) return 'Good Afternoon'
  return 'Good Evening'
}

function HomePage() {
  const { user } = Route.useRouteContext()
  const { denied } = Route.useSearch()

  return (
    <div className="p-6">
      {denied ? (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span>You do not have access to that page.</span>
          <Link
            to="/"
            aria-label="Dismiss"
            className="text-amber-500 hover:text-amber-700"
          >
            <X size={16} />
          </Link>
        </div>
      ) : null}

      {/* hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-xl">
          <h2 className="text-3xl font-bold text-slate-900">
            {getGreeting()}, {user.name}
          </h2>
        </div>
        <div className="pointer-events-none absolute right-0 top-0 hidden h-40 w-96 opacity-90 xl:block">
          <SunsetIllustration />
        </div>
      </section>

      {/* stacked tier dashboards: higher tiers see extra panels on top */}
      <div className="mt-6 space-y-8">
        {user.tier === 'master' ? <MasterDashboard /> : null}
        {hasTier(user.tier, 'ops') ? <OpsDashboard /> : null}
        <BasicDashboard />
      </div>
    </div>
  )
}

function SunsetIllustration() {
  return (
    <svg viewBox="0 0 384 160" className="h-full w-full" fill="none">
      <circle cx="300" cy="70" r="26" fill="#f97362" opacity="0.9" />
      <path
        d="M0 110 C 60 90, 120 120, 180 100 S 300 80, 384 96"
        stroke="#94a3b8"
        strokeWidth="1.5"
        fill="none"
      />
      <path
        d="M40 130 C 120 110, 200 140, 260 120 S 360 118, 384 124"
        stroke="#cbd5e1"
        strokeWidth="1.5"
        fill="none"
      />
      <rect x="150" y="86" width="34" height="18" rx="4" fill="#60a5fa" />
      <circle cx="158" cy="106" r="3.5" fill="#334155" />
      <circle cx="176" cy="106" r="3.5" fill="#334155" />
    </svg>
  )
}
