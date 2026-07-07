import { createFileRoute } from '@tanstack/react-router'
import { HelpCircle } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'

export const Route = createFileRoute('/_app/help')({
  staticData: { title: 'Help' },
  component: () => (
    <PagePlaceholder
      title="Help"
      description="Guides, FAQs, and support."
      icon={HelpCircle}
    />
  ),
})
