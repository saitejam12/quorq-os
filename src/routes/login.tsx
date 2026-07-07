import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { LogIn, Loader2 } from 'lucide-react'
import BrandPanel from '#/components/BrandPanel'
import { getCurrentUser, login } from '#/server/auth'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (user) throw redirect({ to: '/home' })
  },
  component: LoginPage,
})

const demoAccounts = [
  { tier: 'basic', email: 'basic@quorq.com', password: 'basic123' },
  { tier: 'ops', email: 'ops@quorq.com', password: 'ops123' },
  { tier: 'master', email: 'master@quorq.com', password: 'master123' },
] as const

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const res = await login({ data: { email, password } })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    void navigate({ to: '/home' })
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <BrandPanel />
      {/* form panel */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-slate-900">Sign in</h1>
          <p className="mt-1 text-sm text-slate-500">
            Welcome back. Enter your credentials.
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                required
              />
            </div>
            {error ? (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <LogIn size={16} />
              )}
              Sign in
            </button>
          </form>

          <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
            <div className="text-xs font-medium text-slate-500">
              Demo accounts
            </div>
            <div className="mt-2 flex gap-2">
              {demoAccounts.map((account) => (
                <button
                  key={account.tier}
                  type="button"
                  onClick={() => {
                    setEmail(account.email)
                    setPassword(account.password)
                  }}
                  className="flex-1 rounded-md border border-slate-200 py-1.5 text-xs font-medium capitalize text-slate-600 hover:bg-slate-50"
                >
                  {account.tier}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-700">
            <div>New User? </div>
            <a href="/signup" className="text-blue-500 hover:underline">
              Sign up
            </a>
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-slate-700">
            <div>Forgot password?</div>
            <a
              href="/forgot-password"
              className="text-blue-500 hover:underline"
            >
              Reset password
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
