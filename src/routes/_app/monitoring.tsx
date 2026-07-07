import { createFileRoute } from '@tanstack/react-router'
import { Activity } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/monitoring')({
  beforeLoad: ({ context }) => requireTier(context.user, 'master'),
  staticData: { title: 'Monitoring' },
  component: () => (
    <PagePlaceholder
      title="Monitoring"
      description="System health and audit monitoring."
      icon={Activity}
    />
  ),
})
