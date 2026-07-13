import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title,
  hint,
  icon,
}: {
  title: string
  hint?: string
  icon?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between px-5 pt-4 pb-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        {icon ? <span className="text-slate-400">{icon}</span> : null}
        {title}
      </h3>
      {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
    </div>
  )
}

const toneText: Record<string, string> = {
  green: 'text-emerald-600',
  red: 'text-red-500',
  amber: 'text-amber-500',
  orange: 'text-orange-500',
  slate: 'text-slate-900',
  blue: 'text-blue-600',
}

export function KpiCard({
  icon,
  label,
  value,
  valueTone = 'slate',
  delta,
  deltaTone = 'slate',
  footer,
}: {
  icon: ReactNode
  label: string
  value: string
  valueTone?: keyof typeof toneText
  delta?: string
  deltaTone?: keyof typeof toneText
  footer?: ReactNode
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 text-slate-500">
        <span className="text-slate-400">{icon}</span>
        <span className="text-[11px] font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className={`mt-3 text-3xl font-bold ${toneText[valueTone]}`}>
        {value}
      </div>
      {delta ? (
        <div className={`mt-2 text-xs font-medium ${toneText[deltaTone]}`}>
          {delta}
        </div>
      ) : null}
      {footer ? (
        <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-400">
          {footer}
        </div>
      ) : null}
    </Card>
  )
}

const badgeTone: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  escalated: 'bg-blue-100 text-blue-700',
  critical: 'bg-red-100 text-red-700',
  high: 'bg-amber-100 text-amber-700',
  at_risk: 'bg-amber-100 text-amber-700',
  in_progress: 'bg-blue-100 text-blue-700',
  on_track: 'bg-emerald-100 text-emerald-700',
  done: 'bg-emerald-100 text-emerald-700',
  ok: 'bg-emerald-100 text-emerald-700',
  alert: 'bg-red-100 text-red-700',
  warn: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
}
const badgeLabels: Record<string, string> = {
  at_risk: 'At risk',
  in_progress: 'In progress',
  on_track: 'On track',
}

export function Badge({ tone, label }: { tone: string; label?: string }) {
  const cls = badgeTone[tone] ?? 'bg-slate-100 text-slate-600'
  const named =
    badgeLabels[tone] ?? tone.charAt(0).toUpperCase() + tone.slice(1)
  const text = label ?? named
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}
    >
      {text}
    </span>
  )
}

export function inr(lakhs: number) {
  return `₹${lakhs.toFixed(1)}L`
}

const avatarColors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-teal-500',
  'bg-indigo-500',
]

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  let hash = 0
  for (let i = 0; i < name.length; i++)
    hash = (hash + name.charCodeAt(i)) % avatarColors.length
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${avatarColors[hash]}`}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  )
}

const moneyTone = {
  ink: 'text-slate-900',
  earning: 'text-emerald-600',
  deduction: 'text-rose-600',
  muted: 'text-slate-400',
} as const

export function Money({
  value,
  tone = 'ink',
  sign = false,
  className = '',
}: {
  value: number
  tone?: keyof typeof moneyTone
  sign?: boolean
  className?: string
}) {
  const prefix = sign ? (value < 0 ? '−' : '+') : ''
  return (
    <span className={`tabular ${moneyTone[tone]} ${className}`}>
      {prefix}₹{Math.abs(value).toLocaleString('en-IN')}
    </span>
  )
}

export function LedgerLine({ label }: { label: string }) {
  return (
    <div className="mb-2 mt-4 flex items-center gap-3">
      <span className="tabular text-[10px] font-semibold uppercase tracking-widest text-slate-400">
        {label}
      </span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  )
}

export function Ring({ value, size = 44 }: { value: number; size?: number }) {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(100, Math.max(0, value)) / 100)
  const half = size / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={half} cy={half} r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle
        cx={half}
        cy={half}
        r={r}
        fill="none"
        stroke="#2563eb"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform={`rotate(-90 ${half} ${half})`}
      />
      <text
        x="50%"
        y="52%"
        dominantBaseline="middle"
        textAnchor="middle"
        fontSize={size * 0.26}
        fontWeight="600"
        fill="#334155"
      >
        {value}%
      </text>
    </svg>
  )
}
