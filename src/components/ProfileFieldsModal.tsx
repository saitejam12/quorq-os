import { useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { PROFILE_FIELDS } from '#/lib/profile-fields'
import type { ProfileField } from '#/lib/profile-fields'
import type { Result } from '#/server/auth'

const inputCls =
  'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100'

const GROUPS: Array<ProfileField['group']> = ['Employee', 'Personal', 'Bank']

// A grouped form over PROFILE_FIELDS (the single source of truth), used for the
// master's direct create/edit of an employee record — their own or another's.
// The full form is submitted; the server allow-lists, validates and applies it.
export default function ProfileFieldsModal({
  title,
  description,
  initial,
  submitLabel,
  onSubmit,
  onClose,
  onSaved,
}: {
  title: string
  description?: string
  initial: Record<string, string>
  submitLabel: string
  onSubmit: (form: Record<string, string>) => Promise<Result<unknown>>
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<Record<string, string>>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const set = (key: string, value: string) =>
    setForm((s) => ({ ...s, [key]: value }))

  async function submit() {
    const missing = PROFILE_FIELDS.filter(
      (f) => !f.nullable && !(form[f.key] ?? '').trim(),
    )
    if (missing.length > 0) {
      setError(`Please fill: ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    setBusy(true)
    setError('')
    const res = await onSubmit(form)
    setBusy(false)
    if (res.ok) {
      onSaved()
      onClose()
    } else {
      setError(res.error)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {description ? (
            <p className="text-xs text-slate-500">{description}</p>
          ) : null}
          {GROUPS.map((group) => (
            <div key={group}>
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {group}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {PROFILE_FIELDS.filter((f) => f.group === group).map((f) => (
                  <label
                    key={f.key}
                    className={`space-y-1.5 ${f.type === 'textarea' ? 'sm:col-span-2' : ''}`}
                  >
                    <span className="text-xs font-medium text-slate-600">
                      {f.label}
                      {!f.nullable ? (
                        <span className="text-red-500"> *</span>
                      ) : null}
                    </span>
                    {f.type === 'textarea' ? (
                      <textarea
                        value={form[f.key] ?? ''}
                        rows={2}
                        maxLength={f.max}
                        onChange={(e) => set(f.key, e.target.value)}
                        className={inputCls}
                      />
                    ) : (
                      <input
                        type={f.type === 'date' ? 'date' : f.type}
                        value={form[f.key] ?? ''}
                        maxLength={f.type === 'date' ? undefined : f.max}
                        onChange={(e) => set(f.key, e.target.value)}
                        className={inputCls}
                      />
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-3">
          <button
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : null}
            {submitLabel}
          </button>
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
        </div>
      </div>
    </div>
  )
}
