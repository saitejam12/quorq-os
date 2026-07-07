import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { Bell, Power, X } from 'lucide-react'
import { logout } from '#/server/auth'
import { hasTier } from '#/lib/tiers'
import BasicDashboard from '#/components/dashboards/BasicDashboard'
import OpsDashboard from '#/components/dashboards/OpsDashboard'
import MasterDashboard from '#/components/dashboards/MasterDashboard'

export const Route = createFileRoute('/_app/home')({
  validateSearch: (search: Record<string, unknown>): { denied?: '1' } => ({
    denied: search.denied === '1' ? '1' : undefined,
  }),
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
  const navigate = useNavigate()
  const router = useRouter()

  async function handleLogout() {
    await logout()
    await router.invalidate()
    void navigate({ to: '/login' })
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* top bar */}
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <h1 className="text-lg font-semibold text-slate-800">Home</h1>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="relative text-slate-500 hover:text-slate-700"
            aria-label="Notifications"
          >
            <Bell size={18} />
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="text-slate-500 hover:text-red-600"
            aria-label="Log out"
          >
            <Power size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 p-6">
        {denied ? (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span>You do not have access to that page.</span>
            <Link
              to="/home"
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
