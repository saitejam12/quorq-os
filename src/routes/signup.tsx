import { createFileRoute } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { UserPlus, Loader2 } from 'lucide-react'
import { z } from 'zod'
import BrandPanel from '#/components/BrandPanel'

export const Route = createFileRoute('/signup')({
  component: SignupPage,
})

const today = new Date().toISOString().slice(0, 10)

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

function SignupPage() {
  const form = useForm({
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      dob: '',
      password: '',
      confirmPassword: '',
    },
    onSubmit: async ({ value }) => {
      // const res = await signup({ data: value })
      // if (!res.ok) throw new Error(res.error)
      // navigate({ to: landingFor(res.user.role) })
      console.log('signup', value)
    },
  })

  return (
    <div className="flex min-h-screen bg-slate-50">
      <BrandPanel />

      {/* form panel */}
      <div className="flex w-full items-center justify-center p-6 lg:w-1/2">
        <div className="w-full max-w-sm py-8">
          <h1 className="text-2xl font-bold text-slate-900">Create account</h1>
          <p className="mt-1 text-sm text-slate-500">
            Enter your details to get started.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              e.stopPropagation()
              void form.handleSubmit()
            }}
            className="mt-6 space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <form.Field
                name="firstName"
                validators={{ onChange: z.string().min(1, 'Required') }}
              >
                {(field) => (
                  <div>
                    <label className={labelClass}>First name</label>
                    <input
                      type="text"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      autoComplete="given-name"
                      className={inputClass}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </div>
                )}
              </form.Field>

              <form.Field
                name="lastName"
                validators={{ onChange: z.string().min(1, 'Required') }}
              >
                {(field) => (
                  <div>
                    <label className={labelClass}>Last name</label>
                    <input
                      type="text"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => field.handleChange(e.target.value)}
                      autoComplete="family-name"
                      className={inputClass}
                    />
                    <FieldError errors={field.state.meta.errors} />
                  </div>
                )}
              </form.Field>
            </div>

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

            <form.Field
              name="phone"
              validators={{
                onChange: z
                  .string()
                  .regex(/^\+?[0-9\s-]{7,15}$/, 'Enter a valid phone number'),
              }}
            >
              {(field) => (
                <div>
                  <label className={labelClass}>Phone number</label>
                  <input
                    type="tel"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    autoComplete="tel"
                    placeholder="+91 9012345678"
                    className={inputClass}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <form.Field
              name="dob"
              validators={{
                onChange: z
                  .string()
                  .min(1, 'Required')
                  .refine((v) => v <= today, 'Date must be in the past'),
              }}
            >
              {(field) => (
                <div>
                  <label className={labelClass}>Date of birth</label>
                  <input
                    type="date"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    autoComplete="bday"
                    max={today}
                    className={inputClass}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <form.Field
              name="password"
              validators={{
                onChange: z.string().min(8, 'Must be at least 8 characters'),
              }}
            >
              {(field) => (
                <div>
                  <label className={labelClass}>Password</label>
                  <input
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    autoComplete="new-password"
                    className={inputClass}
                  />
                  <FieldError errors={field.state.meta.errors} />
                </div>
              )}
            </form.Field>

            <form.Field
              name="confirmPassword"
              validators={{
                onChangeListenTo: ['password'],
                onChange: ({ value, fieldApi }) =>
                  value !== fieldApi.form.getFieldValue('password')
                    ? 'Passwords do not match'
                    : undefined,
              }}
            >
              {(field) => (
                <div>
                  <label className={labelClass}>Confirm password</label>
                  <input
                    type="password"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    autoComplete="new-password"
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
                    <UserPlus size={16} />
                  )}
                  Create account
                </button>
              )}
            </form.Subscribe>
          </form>

          <div className="mt-4 flex items-center justify-between text-sm text-slate-700">
            <div>Already have an account?</div>
            <a href="/login" className="text-blue-500 hover:underline">
              Sign in
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
