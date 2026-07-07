import { createFileRoute } from '@tanstack/react-router'
import { TrendingDown } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/attrition')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Attrition & retention' },
  component: () => (
    <PagePlaceholder
      title="Attrition & retention"
      description="Turnover and retention analysis."
      icon={TrendingDown}
    />
  ),
})
