import { createServerFn } from '@tanstack/react-start'
import { requireDb } from '#/db'

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  uptime: number
  database: {
    connected: boolean
    responseTime: number
  }
  version: string
}

// The Cloudflare worker runtime has no process.uptime(); track from module load.
const START = Date.now()

export const getHealth = createServerFn({ method: 'GET' }).handler(
  async (): Promise<HealthCheckResponse> => {
    const startTime = Date.now()
    const timestamp = new Date().toISOString()
    const uptime = Math.floor((Date.now() - START) / 1000)

    try {
      const sql = requireDb()
      const dbStart = Date.now()
      await sql`SELECT count(*) FROM employees`
      const dbTime = Date.now() - dbStart

      return {
        status: dbTime > 5000 ? 'degraded' : 'healthy',
        timestamp,
        uptime,
        database: { connected: true, responseTime: dbTime },
        version: process.env.APP_VERSION || '0.0.1',
      }
    } catch (error) {
      console.error('Health check failed', error)
      return {
        status: 'unhealthy',
        timestamp,
        uptime,
        database: { connected: false, responseTime: Date.now() - startTime },
        version: process.env.APP_VERSION || '0.0.1',
      }
    }
  },
)
