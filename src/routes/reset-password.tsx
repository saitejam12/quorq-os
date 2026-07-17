import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { KeyRound, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import BrandPanel from '#/components/BrandPanel'
import { resetPassword } from '#/server/reset'

export const Route = createFileRoute('/reset-password')({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  component: ResetPasswordPage,
})

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
const labelClass = 'mb-1 block text-sm font-medium text-slate-700'

function ResetPasswordPage() {
  const { token } = Route.useSearch()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const res = await resetPassword({ data: { token, password } })
      if (!res.ok) {
        setError(res.error)
        setBusy(false)
        return
      }
      setDone(true)
    } catch {
      setError('Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <BrandPanel />
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          {done ? (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
                <CheckCircle2 size={22} />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">
                Password updated
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Your password has been reset. You can now sign in with your new
                password.
              </p>
              <a
                href="/login"
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Go to sign in
              </a>
            </div>
          ) : !token ? (
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                Invalid reset link
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                This link is missing its token. Request a new one from the
                forgot password page.
              </p>
              <a
                href="/forgot-password"
                className="mt-6 inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
              >
                Request a new link
              </a>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">
                Set a new password
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Choose a new password for your account.
              </p>

              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label className={labelClass}>New password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className={inputClass}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>Confirm password</label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className={inputClass}
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
                    <KeyRound size={16} />
                  )}
                  Reset password
                </button>
              </form>
            </>
          )}

          <div className="mt-6">
            <a
              href="/login"
              className="inline-flex items-center gap-1 text-sm text-blue-500 hover:underline"
            >
              <ArrowLeft size={14} /> Back to sign in
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
