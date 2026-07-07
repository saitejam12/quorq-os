import { createFileRoute } from '@tanstack/react-router'
import { Briefcase } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/talent')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Talent acquisition' },
  component: () => (
    <PagePlaceholder
      title="Talent acquisition"
      description="Open roles, pipeline, and hiring funnel metrics."
      icon={Briefcase}
    />
  ),
})
