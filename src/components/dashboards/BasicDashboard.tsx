import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck, Palmtree } from 'lucide-react'
import { getUpcomingHolidays } from '#/server/holidays'
import { cardBase, cardTitle } from './styles'

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })

export default function BasicDashboard() {
  const { data: holidays = [] } = useQuery({
    queryKey: ['upcoming-holidays'],
    queryFn: () => getUpcomingHolidays(),
  })

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
        {holidays.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center text-center">
            <Palmtree className="text-emerald-300" size={48} />
            <p className="mt-4 text-sm text-slate-500">
              Uh oh! No holidays to show.
            </p>
          </div>
        ) : (
          <ul className="mt-4 space-y-2.5">
            {holidays.map((h) => (
              <li
                key={h.id}
                className="flex items-center justify-between text-sm"
              >
                <span className="font-medium text-slate-700">{h.name}</span>
                <span className="text-slate-400">{fmtDate(h.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
