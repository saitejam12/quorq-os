import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { getUserStats } from '#/server/admin'
import { cardBase, sectionTitle } from './styles'

export default function MasterDashboard() {
  const { data } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const res = await getUserStats()
      if (!res.ok) throw new Error(res.error)
      return res.data
    },
  })

  return (
    <section>
      <h3 className={sectionTitle}>Administration</h3>
      <div className="mt-3 grid grid-cols-2 gap-5 md:grid-cols-4">
        <Link
          to="/admin/requests"
          className={`${cardBase} hover:border-blue-300`}
        >
          <StatBody label="Pending requests" value={data?.pending} highlight />
        </Link>
        <div className={cardBase}>
          <StatBody label="Basic users" value={data?.byTier.basic} />
        </div>
        <div className={cardBase}>
          <StatBody label="Ops users" value={data?.byTier.ops} />
        </div>
        <div className={cardBase}>
          <StatBody label="Master users" value={data?.byTier.master} />
        </div>
      </div>
    </section>
  )
}

function StatBody({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: number | undefined
  highlight?: boolean
}) {
  return (
    <div>
      <div
        className={`text-3xl font-bold ${
          highlight && value ? 'text-blue-600' : 'text-slate-900'
        }`}
      >
        {value ?? '—'}
      </div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  )
}
