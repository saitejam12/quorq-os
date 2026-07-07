import { createFileRoute } from '@tanstack/react-router'
import { Bell, Power, ArrowRight, ClipboardCheck, Palmtree } from 'lucide-react'

export const Route = createFileRoute('/_app/home')({
  component: HomePage,
})

const cardBase = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm'
const cardTitle = 'text-base font-semibold text-slate-900'

function HomePage() {
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
            className="text-slate-500 hover:text-red-600"
            aria-label="Log out"
          >
            <Power size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 p-6">
        {/* hero */}
        <section className="relative overflow-hidden">
          <div className="max-w-xl">
            <h2 className="text-3xl font-bold text-slate-900">Good Evening</h2>{' '}
            {/*TODO: Change to dynamic greeting based on time of day */}
          </div>
          <div className="pointer-events-none absolute right-0 top-0 hidden h-40 w-96 opacity-90 xl:block">
            <SunsetIllustration />
          </div>
        </section>

        {/* cards grid */}
        <section className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {/* Review */}
          <div className={cardBase}>
            <h3 className={cardTitle}>Review</h3>
            <div className="mt-6 flex flex-col items-center justify-center text-center">
              <ClipboardCheck className="text-slate-300" size={48} />
              <p className="mt-4 text-sm text-slate-500">
                Hurrah! You've nothing to review.
              </p>
            </div>
          </div>

          {/* Upcoming Holidays */}
          <div className={cardBase}>
            <h3 className={cardTitle}>Upcoming Holidays</h3>
            <div className="mt-6 flex flex-col items-center justify-center text-center">
              <Palmtree className="text-emerald-300" size={48} />
              <p className="mt-4 text-sm text-slate-500">
                Uh oh! No holidays to show.
              </p>
            </div>
          </div>

          {/* Payslip */}
          <div className={cardBase}>
            <div className="flex items-center justify-between">
              <h3 className={cardTitle}>Payslip</h3>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-600"
                aria-label="Open payslip"
              >
                <ArrowRight size={18} />
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div
                className="relative h-28 w-28 rounded-full"
                style={{
                  background:
                    'conic-gradient(#2f6b7e 0% 82%, #bfe3cf 82% 100%)',
                }}
              >
                <div className="absolute inset-4 rounded-full bg-white" />
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-slate-800">
                  May 2026
                </div>
                <div className="mt-2 text-2xl font-bold text-slate-900">31</div>
                <div className="text-xs text-slate-500">Paid Days</div>
              </div>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <PayRow color="bg-slate-800" label="Gross Pay" />
              <PayRow color="bg-emerald-300" label="Deduction" />
              <PayRow color="bg-teal-600" label="Net Pay" />
            </dl>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm font-medium">
              <button className="text-blue-600 hover:underline">
                Download
              </button>
              <button className="text-blue-600 hover:underline">
                Show Salary
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function PayRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-600">
        <span className={`h-3 w-1 rounded-sm ${color}`} />
        {label}
      </span>
      <span className="tracking-widest text-slate-400">*****</span>
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
