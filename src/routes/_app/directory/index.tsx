import { createFileRoute, Link } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { Search, MapPin, ChevronLeft, ChevronRight, ShieldCheck } from 'lucide-react'
import { listEmployeesPaginated } from '#/server/people'
import { Card, Avatar, Badge } from '#/components/ui'
import { hasTier } from '#/lib/tiers'

export const Route = createFileRoute('/_app/directory/')({
  staticData: { title: 'Employee directory' },
  loader: () => listEmployeesPaginated({ data: { page: 1, limit: 25 } }),
  component: Directory,
})

const statusTone: Record<string, string> = {
  active: 'ok',
  on_leave: 'warn',
  notice: 'alert',
}
const statusLabel: Record<string, string> = {
  active: 'Active',
  on_leave: 'On leave',
  notice: 'Notice',
}

function Directory() {
  const initialData = Route.useLoaderData()
  const { user } = Route.useRouteContext()
  const canManage = hasTier(user.tier, 'ops')
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('All')
  const [data, setData] = useState(initialData)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return data.data.filter((e) => {
      if (dept !== 'All' && e.department !== dept) return false
      if (!needle) return true
      return (
        e.name.toLowerCase().includes(needle) ||
        e.designation.toLowerCase().includes(needle) ||
        e.email.toLowerCase().includes(needle)
      )
    })
  }, [data.data, q, dept])

  const depts = useMemo(
    () => ['All', ...Array.from(new Set(data.data.map((e) => e.department))).sort()],
    [data.data],
  )

  const handlePageChange = async (newPage: number) => {
    if (newPage < 1 || newPage > data.pagination.totalPages) return
    const result = await listEmployeesPaginated({
      data: { page: newPage, limit: 25 },
    })
    setData(result)
    setPage(newPage)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-5 p-6">
      {canManage ? (
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Employee directory</h1>
          <Link
            to="/admin/users"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <ShieldCheck size={15} /> Manage access
          </Link>
        </div>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, role or email…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>
        <div className="flex items-center gap-2 overflow-x-auto">
          {depts.map((d) => (
            <button
              key={d}
              onClick={() => setDept(d)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
                dept === d
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="text-xs text-slate-400">
        {filtered.length} of {data.pagination.total} people{' '}
        {data.pagination.totalPages > 1 &&
          `(Page ${page} of ${data.pagination.totalPages})`}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((e) => (
          <Link key={e.id} to="/directory/$id" params={{ id: String(e.id) }}>
            <Card className="flex h-full flex-col p-4 transition-shadow hover:shadow-md">
              <div className="flex items-center gap-3">
                <Avatar name={e.name} size={44} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-800">
                    {e.name}
                  </div>
                  <div className="truncate text-xs text-slate-500">
                    {e.designation}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">{e.department}</span>
                <Badge
                  tone={statusTone[e.status] ?? 'info'}
                  label={statusLabel[e.status] ?? e.status}
                />
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                <MapPin size={12} /> {e.location}
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => handlePageChange(page - 1)}
            disabled={page === 1}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <ChevronLeft size={16} /> Previous
          </button>
          {Array.from({ length: data.pagination.totalPages }).map((_, i) => {
            const pageNum = i + 1
            return (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  pageNum === page
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
          <button
            onClick={() => handlePageChange(page + 1)}
            disabled={page === data.pagination.totalPages}
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  )
}
