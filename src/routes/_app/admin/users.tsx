import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { listUsers, setUserTier } from '#/server/admin'
import { requireTier } from '#/lib/guards'
import { TIERS, canSetTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'

export const Route = createFileRoute('/_app/admin/users')({
  beforeLoad: ({ context }) => {
    requireTier(context.user, 'ops')
  },
  component: UsersPage,
})

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  active: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-600',
}

function UsersPage() {
  const { user: caller } = Route.useRouteContext()
  const queryClient = useQueryClient()

  const usersQuery = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const res = await listUsers()
      if (!res.ok) throw new Error(res.error)
      return res.data
    },
  })

  const tierMutation = useMutation({
    mutationFn: (vars: { userId: number; tier: Tier }) =>
      setUserTier({ data: vars }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })

  const mutationError =
    tierMutation.data && !tierMutation.data.ok ? tierMutation.data.error : ''

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold text-slate-800">User Management</h1>
      <p className="mt-1 text-sm text-slate-500">
        Assign access tiers. Only a master can grant or revoke master access.
      </p>

      {usersQuery.error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {usersQuery.error.message}
        </div>
      ) : null}
      {mutationError ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {mutationError}
        </div>
      ) : null}

      {usersQuery.isPending ? (
        <div className="mt-10 flex justify-center text-slate-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Tier</th>
              </tr>
            </thead>
            <tbody>
              {(usersQuery.data ?? []).map((user) => {
                const isSelf = user.id === caller.id
                const canEdit =
                  !isSelf &&
                  user.status === 'active' &&
                  TIERS.some(
                    (tier) =>
                      tier !== user.tier &&
                      canSetTier(caller.tier, user.tier, tier),
                  )
                return (
                  <tr key={user.id} className="border-b border-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {user.name}
                      {isSelf ? (
                        <span className="ml-2 text-xs text-slate-400">
                          (you)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[user.status]}`}
                      >
                        {user.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.tier}
                        disabled={!canEdit || tierMutation.isPending}
                        onChange={(e) =>
                          tierMutation.mutate({
                            userId: user.id,
                            tier: e.target.value as Tier,
                          })
                        }
                        className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 disabled:bg-slate-50 disabled:text-slate-400"
                      >
                        {TIERS.map((tier) => (
                          <option
                            key={tier}
                            value={tier}
                            disabled={
                              tier !== user.tier &&
                              !canSetTier(caller.tier, user.tier, tier)
                            }
                          >
                            {tier}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
