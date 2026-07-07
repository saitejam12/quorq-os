import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ShieldCheck, LogIn, Loader2 } from 'lucide-react'
import BrandPanel from '#/components/BrandPanel'

export const Route = createFileRoute('/login')({
  // beforeLoad: async () => {
  //   const user = await getCurrentUser()
  //   if (user) throw redirect({ to: landingFor(user.role) })
  // },
  component: LoginPage,
})

const demoAccounts = [
  { role: 'Admin', email: 'admin@quorq.com', password: 'admin123' },
  { role: 'HR', email: 'hr@quorq.com', password: 'hr123' },
  { role: 'Manager', email: 'manager@quorq.com', password: 'manager123' },
  { role: 'Employee', email: 'employee@quorq.com', password: 'employee123' },
]

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('admin@quorq.com')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    // const res = await login({ data: { email, password } })
    // setBusy(false)
    // if (!res.ok) {
    //   setError(res.error)
    //   return
    // }
    // navigate({ to: landingFor(res.user.role) })
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
