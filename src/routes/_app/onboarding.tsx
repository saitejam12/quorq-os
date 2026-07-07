import { createFileRoute } from '@tanstack/react-router'
import { ClipboardList } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/onboarding')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Onboarding' },
  component: () => (
    <PagePlaceholder
      title="Onboarding"
      description="Track new-hire onboarding progress."
      icon={ClipboardList}
    />
  ),
})
