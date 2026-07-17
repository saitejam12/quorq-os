import { useState } from 'react'
import { Link, useRouteContext, useRouterState } from '@tanstack/react-router'
import {
  Home,
  UserCircle,
  UsersRound,
  Building2,
  BarChart3,
  SlidersHorizontal,
  Shield,
  HelpCircle,
  ChevronDown,
  UserStar,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { hasTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'

// Every path here is a real route under src/routes/_app. Keeping the union
// explicit lets TanStack's <Link> type-check each destination.
type RoutePath =
  | '/'
  | '/profile'
  | '/directory'
  | '/engagement'
  | '/org'
  | '/hiring'
  | '/postings'
  | '/onboarding'
  | '/time'
  | '/leave'
  | '/expenses'
  | '/payroll'
  | '/overview'
  | '/workforce'
  | '/talent'
  | '/attendance'
  | '/attrition'
  | '/reports'
  | '/import-export'
  | '/alerts'
  | '/settings'
  | '/calendar'
  | '/monitoring'
  | '/help'
  | '/admin/users'
  | '/admin/requests'
  | '/admin/profile-requests'

type NavLeaf = {
  label: string
  to?: RoutePath
  minTier?: Tier
}

type NavItem = NavLeaf & {
  icon: LucideIcon
  children?: Array<NavLeaf>
}

const NAV: Array<NavItem> = [
  { label: 'Home', icon: Home, to: '/' },
  { label: 'My Profile', icon: UserCircle, to: '/profile' },
  {
    label: 'People',
    icon: UsersRound,
    children: [
      { label: 'Employee Directory', to: '/directory' },
      { label: 'Engagement', to: '/engagement' },
      { label: 'Org Structure', to: '/org' },
    ],
  },
  {
    label: 'Hiring & Onboarding',
    icon: UserStar,
    children: [
      { label: 'Applications', to: '/hiring', minTier: 'ops' },
      { label: 'Job Postings', to: '/postings', minTier: 'ops' },
      { label: 'Onboarding', to: '/onboarding', minTier: 'ops' },
    ],
    minTier: 'ops',
  },
  {
    label: 'Workplace',
    icon: Building2,
    children: [
      { label: 'Time Tracking', to: '/time' },
      { label: 'Leave Management', to: '/leave' },
    ],
  },
  {
    label: 'Payroll',
    icon: Building2,
    to: '/payroll',
    minTier: 'ops',
  },
  {
    label: 'Analytics',
    icon: BarChart3,
    minTier: 'ops',
    children: [
      { label: 'Executive Overview', to: '/overview', minTier: 'ops' },
      { label: 'Workforce Intelligence', to: '/workforce', minTier: 'ops' },
      { label: 'Talent Acquisition', to: '/talent', minTier: 'ops' },
      { label: 'Attendance & Leave', to: '/attendance', minTier: 'ops' },
      { label: 'Attrition & Retention', to: '/attrition', minTier: 'ops' },
      { label: 'Reports Hub', to: '/reports', minTier: 'ops' },
    ],
  },
  {
    label: 'Management',
    icon: SlidersHorizontal,
    minTier: 'ops',
    children: [
      { label: 'Import & Export', to: '/import-export', minTier: 'ops' },
      { label: 'Alerts & Notifications', to: '/alerts', minTier: 'ops' },
    ],
  },
  {
    label: 'Administration',
    icon: Shield,
    minTier: 'ops',
    children: [
      { label: 'User Management', to: '/admin/users', minTier: 'ops' },
      {
        label: 'Profile Change Requests',
        to: '/admin/profile-requests',
        minTier: 'ops',
      },
      { label: 'User Requests', to: '/admin/requests', minTier: 'master' },
      { label: 'Holiday Calendar', to: '/calendar', minTier: 'master' },
      { label: 'Monitoring', to: '/monitoring', minTier: 'master' },
    ],
  },
  { label: 'Help', icon: HelpCircle, to: '/help' },
]

const TIER_BADGE: Record<Tier, string> = {
  basic: 'bg-slate-100 text-slate-600',
  ops: 'bg-emerald-100 text-emerald-700',
  master: 'bg-indigo-100 text-indigo-700',
}

const rowBase =
  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'

function groupForPath(pathname: string): string | null {
  const group = NAV.find((item) =>
    item.children?.some((child) => child.to === pathname),
  )
  return group?.label ?? null
}

export function Logo() {
  return (
    <div className="flex items-center gap-2 h-16">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white">
        Q
      </div>
      <span className="text-lg font-bold text-slate-900">
        Quorq<span className="text-blue-600">OS</span>
      </span>
    </div>
  )
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useRouteContext({ from: '/_app' })
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Open the group containing the current route on first render.
  const [open, setOpen] = useState<string | null>(() => groupForPath(pathname))

  const visible = NAV.filter((item) =>
    hasTier(user.tier, item.minTier ?? 'basic'),
  )

  return (
    <div className="flex h-full flex-col">
      {/* nav items */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visible.map((item) => {
          const Icon = item.icon
          const active = item.to !== undefined && pathname === item.to

          if (item.children) {
            const children = item.children.filter((child) =>
              hasTier(user.tier, child.minTier ?? 'basic'),
            )
            const isOpen = open === item.label
            return (
              <div key={item.label}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : item.label)}
                  className={`${rowBase} w-full text-slate-600 hover:bg-slate-100`}
                  aria-expanded={isOpen}
                >
                  <Icon size={18} className="shrink-0 text-slate-500" />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-slate-400 transition-transform ${
                      isOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {isOpen ? (
                  <div className="mt-1 space-y-1 pl-11">
                    {children.map((child) =>
                      child.to ? (
                        <Link
                          key={child.label}
                          to={child.to}
                          onClick={onNavigate}
                          className={`block w-full rounded-md px-3 py-1.5 text-left text-sm ${
                            pathname === child.to
                              ? 'bg-blue-50 text-blue-700'
                              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                          }`}
                        >
                          {child.label}
                        </Link>
                      ) : (
                        <button
                          key={child.label}
                          type="button"
                          onClick={onNavigate}
                          className="block w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                        >
                          {child.label}
                        </button>
                      ),
                    )}
                  </div>
                ) : null}
              </div>
            )
          }

          const content = (
            <>
              <Icon
                size={18}
                className={`shrink-0 ${
                  active ? 'text-blue-600' : 'text-slate-500'
                }`}
              />
              <span>{item.label}</span>
            </>
          )

          const className = `${rowBase} ${
            active
              ? 'bg-blue-50 text-blue-700'
              : 'text-slate-600 hover:bg-slate-100'
          }`

          if (item.to) {
            return (
              <Link
                key={item.label}
                to={item.to}
                onClick={onNavigate}
                className={className}
              >
                {content}
              </Link>
            )
          }

          return (
            <button
              key={item.label}
              type="button"
              onClick={onNavigate}
              className={`${className} w-full text-left`}
            >
              {content}
            </button>
          )
        })}
      </nav>
      {/* profile */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
          {user.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">
            {user.name}
          </div>
          <span
            className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${TIER_BADGE[user.tier]}`}
          >
            {user.tier}
          </span>
        </div>
      </div>
    </div>
  )
}
