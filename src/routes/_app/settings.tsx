import { createFileRoute } from '@tanstack/react-router'
import { Settings } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/settings')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Settings' },
  component: () => (
    <PagePlaceholder
      title="Settings"
      description="Manage workspace settings."
      icon={Settings}
    />
  ),
})
