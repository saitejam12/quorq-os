import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Inbox, Loader2, X } from 'lucide-react'
import { approveUser, listUsers, rejectUser } from '#/server/admin'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/admin/requests')({
  beforeLoad: ({ context }) => {
    requireTier(context.user, 'master')
  },
  staticData: { title: 'User Requests' },
  component: RequestsPage,
})

function RequestsPage() {
  const queryClient = useQueryClient()

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await listUsers()
      if (!res.ok) throw new Error(res.error)
      return res.data
    },
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin'] })
  }
  const approve = useMutation({
    mutationFn: (userId: number) => approveUser({ data: { userId } }),
    onSuccess: invalidate,
  })
  const reject = useMutation({
    mutationFn: (userId: number) => rejectUser({ data: { userId } }),
    onSuccess: invalidate,
  })

  const pending =
    usersQuery.data?.filter((user) => user.status === 'pending') ?? []
  const actionError = [approve.data, reject.data].find(
    (result) => result && !result.ok,
  )

  return (
    <div className="p-6">
      <p className="text-sm text-slate-500">
        Approve or decline signup requests. Approved users join with the basic
        tier.
      </p>

      {usersQuery.error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {usersQuery.error.message}
        </div>
      ) : null}
      {actionError && !actionError.ok ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {actionError.error}
        </div>
      ) : null}

      {usersQuery.isPending ? (
        <div className="mt-10 flex justify-center text-slate-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : pending.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <Inbox className="text-slate-300" size={48} />
          <p className="mt-4 text-sm text-slate-500">No pending requests.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Requested</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((user) => (
                <tr key={user.id} className="border-b border-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {user.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => approve.mutate(user.id)}
                        disabled={approve.isPending || reject.isPending}
                        className="flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                      >
                        <Check size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => reject.mutate(user.id)}
                        disabled={approve.isPending || reject.isPending}
                        className="flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
                      >
                        <X size={14} /> Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
