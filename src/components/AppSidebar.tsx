import { useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import {
  Home,
  Radio,
  LayoutGrid,
  ClipboardList,
  Wallet,
  CalendarDays,
  FileText,
  Users,
  LifeBuoy,
  Layers,
  Split,
  Settings,
  ChevronDown,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

type NavItem = {
  label: string
  icon: LucideIcon
  // Only `/home` is wired to a real route for now; the rest are placeholders
  // that render as buttons until their routes are scaffolded.
  home?: boolean
  children?: Array<string>
}

const NAV: Array<NavItem> = [
  { label: 'Home', icon: Home, home: true },
  { label: 'Engage', icon: Radio },
  {
    label: 'My Worklife',
    icon: LayoutGrid,
    children: ['Profile', 'Attendance', 'Shifts', 'Assets'],
  },
  {
    label: 'To do',
    icon: ClipboardList,
    children: ['Approvals', 'Tasks', 'Reviews'],
  },
  {
    label: 'Salary',
    icon: Wallet,
    children: ['Payslips', 'IT Statement', 'YTD Reports', 'Loans'],
  },
  {
    label: 'Leave',
    icon: CalendarDays,
    children: ['Apply Leave', 'Leave Balance', 'Holidays'],
  },
  { label: 'Document Center', icon: FileText },
  { label: 'People', icon: Users },
  { label: 'Helpdesk', icon: LifeBuoy },
  { label: 'Request Hub', icon: Layers },
  { label: 'Workflow Delegates', icon: Split },
]

const rowBase =
  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors'

export function Logo() {
  return (
    <div className="flex items-center gap-2">
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
  const [open, setOpen] = useState<string | null>(null)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="flex h-full flex-col">
      {/* nav items */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => {
          const Icon = item.icon
          const active = item.home && pathname === '/home'

          if (item.children) {
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
                    {item.children.map((child) => (
                      <button
                        key={child}
                        type="button"
                        onClick={onNavigate}
                        className="block w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                      >
                        {child}
                      </button>
                    ))}
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

          if (item.home) {
            return (
              <Link
                key={item.label}
                to="/home"
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
      <div className=" flex items-center gap-3 px-4 py-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-slate-500">
          <Users size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">
            Hi User
          </div>
        </div>
        <button
          type="button"
          className="text-slate-400 hover:text-slate-600"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>
      </div>
    </div>
  )
}
