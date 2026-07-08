import { ClipboardCheck, Palmtree } from 'lucide-react'
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
    </section>
  )
}
