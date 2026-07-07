import type { LucideIcon } from 'lucide-react'

// Shared titled empty-state for scaffolded module pages. Real content
// replaces the placeholder per module in later sub-projects.
export default function PagePlaceholder({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: LucideIcon
}) {
  return (
    <div className="p-6">
      <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Icon size={26} />
        </div>
        <h2 className="mt-4 text-base font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
        <span className="mt-4 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
          Coming soon
        </span>
      </div>
    </div>
  )
}
