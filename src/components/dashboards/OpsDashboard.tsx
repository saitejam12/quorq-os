import { ClipboardList, UsersRound } from 'lucide-react'
import { cardBase, cardTitle, sectionTitle } from './styles'

export default function OpsDashboard() {
  return (
    <section>
      <h3 className={sectionTitle}>Operations</h3>
      <div className="mt-3 grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className={cardBase}>
          <h3 className={cardTitle}>Team Overview</h3>
          <div className="mt-6 flex flex-col items-center justify-center text-center">
            <UsersRound className="text-slate-300" size={48} />
            <p className="mt-4 text-sm text-slate-500">
              Team insights arrive with the People module.
            </p>
          </div>
        </div>
        <div className={cardBase}>
          <h3 className={cardTitle}>Approvals Queue</h3>
          <div className="mt-6 flex flex-col items-center justify-center text-center">
            <ClipboardList className="text-slate-300" size={48} />
            <p className="mt-4 text-sm text-slate-500">
              Leave and request approvals arrive with the Leave module.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}
