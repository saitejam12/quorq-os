import { createFileRoute } from '@tanstack/react-router'
import { Bell } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/alerts')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Alerts & notifications' },
  component: () => (
    <PagePlaceholder
      title="Alerts & notifications"
      description="Configure alerts and notifications."
      icon={Bell}
    />
  ),
})
