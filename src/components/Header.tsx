import { useNavigate, useRouter } from '@tanstack/react-router'
import { Bell, Power } from 'lucide-react'
import { logout } from '#/server/auth'

// Shared top bar for every authenticated screen. The title is supplied by
// the active route's staticData (see src/routes/_app.tsx).
export default function Header({ title }: { title: string }) {
  const navigate = useNavigate()
  const router = useRouter()

  async function handleLogout() {
    await logout()
    await router.invalidate()
    void navigate({ to: '/login' })
  }

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="relative text-slate-500 hover:text-slate-700"
          aria-label="Notifications"
        >
          <Bell size={18} />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
        </button>
        <button
          type="button"
          onClick={handleLogout}
          className="text-slate-500 hover:text-red-600"
          aria-label="Log out"
        >
          <Power size={18} />
        </button>
      </div>
    </header>
  )
}
