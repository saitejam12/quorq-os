import { createFileRoute } from '@tanstack/react-router'
import { Users } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/workforce')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Workforce intelligence' },
  component: () => (
    <PagePlaceholder
      title="Workforce intelligence"
      description="Headcount, demographics, and workforce trends."
      icon={Users}
    />
  ),
})
