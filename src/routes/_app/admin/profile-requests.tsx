import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Check, Inbox, Loader2, X } from 'lucide-react'
import {
  approveProfileChangeRequest,
  listProfileChangeRequests,
  rejectProfileChangeRequest,
} from '#/server/profile-requests'
import type { PendingChangeRequest } from '#/server/profile-requests'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/admin/profile-requests')({
  beforeLoad: ({ context }) => {
    requireTier(context.user, 'ops')
  },
  staticData: { title: 'Profile Change Requests' },
  component: ProfileRequestsPage,
})

function ProfileRequestsPage() {
  const queryClient = useQueryClient()

  const requestsQuery = useQuery({
    queryKey: ['profile-requests'],
    queryFn: async () => {
      const res = await listProfileChangeRequests()
      if (!res.ok) throw new Error(res.error)
      return res.data
    },
  })

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['profile-requests'] })
  }

  const requests = requestsQuery.data ?? []

  return (
    <div className="p-6">
      <p className="text-sm text-slate-500">
        Approve or decline employee profile change requests. Approving applies
        every changed field to the employee record.
      </p>

      {requestsQuery.error ? (
        <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          {requestsQuery.error.message}
        </div>
      ) : null}

      {requestsQuery.isPending ? (
        <div className="mt-10 flex justify-center text-slate-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : requests.length === 0 ? (
        <div className="mt-10 flex flex-col items-center text-center">
          <Inbox className="text-slate-300" size={48} />
          <p className="mt-4 text-sm text-slate-500">No pending requests.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {requests.map((req) => (
            <RequestCard key={req.id} req={req} onDone={invalidate} />
          ))}
        </div>
      )}
    </div>
  )
}

function RequestCard({
  req,
  onDone,
}: {
  req: PendingChangeRequest
  onDone: () => void
}) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const approve = useMutation({
    mutationFn: () => approveProfileChangeRequest({ data: { id: req.id } }),
    onSuccess: (res) => {
      if (res.ok) onDone()
      else setError(res.error)
    },
  })
  const reject = useMutation({
    mutationFn: () =>
      rejectProfileChangeRequest({
        data: { id: req.id, reason: reason.trim() },
      }),
    onSuccess: (res) => {
      if (res.ok) onDone()
      else setError(res.error)
    },
  })

  const busy = approve.isPending || reject.isPending

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div>
          <div className="text-sm font-semibold text-slate-800">
            {req.employeeName}
          </div>
          <div className="text-xs text-slate-400">
            {req.department} · requested{' '}
            {new Date(req.requestedAt).toLocaleDateString()}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => approve.mutate()}
            disabled={busy}
            className="flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
          >
            <Check size={14} /> Approve
          </button>
          <button
            type="button"
            onClick={() => setRejecting((v) => !v)}
            disabled={busy}
            className="flex items-center gap-1 rounded-md bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-60"
          >
            <X size={14} /> Reject
          </button>
        </div>
      </div>

      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-2 font-medium">Field</th>
            <th className="px-4 py-2 font-medium">Current</th>
            <th className="px-4 py-2 font-medium">Requested</th>
          </tr>
        </thead>
        <tbody>
          {req.items.map((item) => (
            <tr key={item.key} className="border-b border-slate-50">
              <td className="px-4 py-2 font-medium text-slate-700">
                {item.label}
              </td>
              <td className="px-4 py-2 text-slate-400">
                {item.current || '—'}
              </td>
              <td className="px-4 py-2 text-slate-800">
                {item.requested || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {rejecting ? (
        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for declining (shown to the employee)"
            maxLength={300}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => reject.mutate()}
            disabled={busy || reason.trim().length === 0}
            className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            Confirm reject
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="border-t border-slate-100 bg-red-50 px-4 py-2 text-xs text-red-600">
          {error}
        </div>
      ) : null}
    </div>
  )
}
