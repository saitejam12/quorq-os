import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import {
  Activity,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Clock,
  Database,
} from 'lucide-react'
import { getHealth } from '#/server/health'
import type { HealthCheckResponse } from '#/server/health'
import { Card, CardHeader } from '#/components/ui'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/monitoring')({
  staticData: { title: 'Monitoring' },
  beforeLoad: ({ context }) => requireTier(context.user, 'master'),
  component: Monitoring,
})

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function Monitoring() {
  const [health, setHealth] = useState<HealthCheckResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchHealth = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await getHealth()
      setHealth(result)
      setLastRefresh(new Date())
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to fetch health status',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchHealth()
    const interval = setInterval(() => void fetchHealth(), 30000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const statusIcon =
    health?.status === 'healthy' ? (
      <CheckCircle className="text-emerald-600" size={24} />
    ) : health?.status === 'degraded' ? (
      <AlertCircle className="text-amber-600" size={24} />
    ) : (
      <AlertCircle className="text-red-600" size={24} />
    )

  const statusColor =
    health?.status === 'healthy'
      ? 'bg-emerald-50 border-emerald-200'
      : health?.status === 'degraded'
        ? 'bg-amber-50 border-amber-200'
        : 'bg-red-50 border-red-200'

  const statusText =
    health?.status === 'healthy'
      ? 'System healthy'
      : health?.status === 'degraded'
        ? 'System degraded'
        : 'System unhealthy'

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">System monitoring</h1>
        <button
          onClick={() => void fetchHealth()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />{' '}
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {health ? (
        <div className={`rounded-lg border-2 p-6 ${statusColor}`}>
          <div className="mb-2 flex items-center gap-3">
            {statusIcon}
            <div>
              <div className="text-lg font-semibold text-slate-900">
                {statusText}
              </div>
              <div className="text-sm text-slate-500">
                Last updated: {health.timestamp}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Card>
          <CardHeader title="Database" icon={<Database size={16} />} />
          <div className="space-y-3 px-5 pb-5">
            {health ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Status</span>
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {health.database.connected ? (
                      <>
                        <CheckCircle size={14} className="text-emerald-600" />{' '}
                        Connected
                      </>
                    ) : (
                      <>
                        <AlertCircle size={14} className="text-red-600" />{' '}
                        Disconnected
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Response time</span>
                  <span className="font-mono text-sm font-medium text-slate-900">
                    {health.database.responseTime}ms
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400">Loading…</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Application" icon={<Activity size={16} />} />
          <div className="space-y-3 px-5 pb-5">
            {health ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Version</span>
                  <span className="font-mono text-sm font-medium text-slate-900">
                    {health.version}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Uptime</span>
                  <span className="font-mono text-sm font-medium text-slate-900">
                    {formatUptime(health.uptime)}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-400">Loading…</div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Updates" icon={<Clock size={16} />} />
          <div className="space-y-3 px-5 pb-5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600">Last check</span>
              <span className="text-sm font-medium text-slate-900">
                {lastRefresh.toLocaleTimeString()}
              </span>
            </div>
            <div className="text-xs text-slate-400">
              Auto-refreshes every 30 seconds
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
