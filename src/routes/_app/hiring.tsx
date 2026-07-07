import { createFileRoute } from '@tanstack/react-router'
import { Briefcase } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/hiring')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Hiring' },
  component: () => (
    <PagePlaceholder
      title="Hiring"
      description="Manage requisitions and candidates."
      icon={Briefcase}
    />
  ),
})
