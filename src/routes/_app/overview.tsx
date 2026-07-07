import { createFileRoute } from '@tanstack/react-router'
import { LayoutDashboard } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/overview')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Executive overview' },
  component: () => (
    <PagePlaceholder
      title="Executive overview"
      description="High-level KPIs across the organization."
      icon={LayoutDashboard}
    />
  ),
})
