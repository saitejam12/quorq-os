import { ArrowRight, ClipboardCheck, Palmtree } from 'lucide-react'
import { cardBase, cardTitle } from './styles'

export default function BasicDashboard() {
  return (
    <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
      {/* Review */}
      <div className={cardBase}>
        <h3 className={cardTitle}>Review</h3>
        <div className="mt-6 flex flex-col items-center justify-center text-center">
          <ClipboardCheck className="text-slate-300" size={48} />
          <p className="mt-4 text-sm text-slate-500">
            Hurrah! You&apos;ve nothing to review.
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
              background: 'conic-gradient(#2f6b7e 0% 82%, #bfe3cf 82% 100%)',
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
          <button className="text-blue-600 hover:underline">Download</button>
          <button className="text-blue-600 hover:underline">
            Show Salary
          </button>
        </div>
      </div>
    </section>
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
