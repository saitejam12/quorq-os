import { createFileRoute } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'
import { Send, Loader2, MailCheck, ArrowLeft } from 'lucide-react'
import { z } from 'zod'
import BrandPanel from '#/components/BrandPanel'

export const Route = createFileRoute('/forgot-password')({
  component: ForgotPasswordPage,
})

const inputClass =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'
const labelClass = 'mb-1 block text-sm font-medium text-slate-700'

function FieldError({ errors }: { errors: Array<unknown> }) {
  const first = errors.find(Boolean)
  if (!first) return null
  const message =
    typeof first === 'string' ? first : (first as { message?: string }).message
  return <p className="mt-1 text-xs text-red-600">{message}</p>
}

function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm({
    defaultValues: { email: '' },
    onSubmit: async ({ value }) => {
      // const res = await requestPasswordReset({ data: value })
      // if (!res.ok) throw new Error(res.error)
      setSentTo(value.email)
    },
  })

  return (
    <div className="flex min-h-screen bg-slate-50">
      <BrandPanel />

      {/* form panel */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm">
          {sentTo ? (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-50 text-green-600">
                <MailCheck size={22} />
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">
                Check your email
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                If an account exists for{' '}
                <span className="font-medium text-slate-700">{sentTo}</span>,
                we've sent a link to reset your password. The link expires in 30
                minutes.
              </p>
              <button
                type="button"
                onClick={() => {
                  form.reset()
                  setSentTo(null)
                }}
                className="mt-6 text-sm text-blue-500 hover:underline"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold text-slate-900">
                Forgot password
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Enter your email and we'll send you a reset link.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  void form.handleSubmit()
                }}
                className="mt-6 space-y-4"
              >
                <form.Field
                  name="email"
                  validators={{
                    onChange: z.email({ error: 'Enter a valid email' }),
                  }}
                >
                  {(field) => (
                    <div>
                      <label className={labelClass}>Email</label>
                      <input
                        type="email"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        autoComplete="email"
                        className={inputClass}
                      />
                      <FieldError errors={field.state.meta.errors} />
                    </div>
                  )}
                </form.Field>

                <form.Subscribe
                  selector={(state) => [state.canSubmit, state.isSubmitting]}
                >
                  {([canSubmit, isSubmitting]) => (
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                      Send reset link
                    </button>
                  )}
                </form.Subscribe>
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
