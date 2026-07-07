import { createFileRoute } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/reports')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Reports hub' },
  component: () => (
    <PagePlaceholder
      title="Reports hub"
      description="Generate and download HR reports."
      icon={FileText}
    />
  ),
})
