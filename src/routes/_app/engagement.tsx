import { createFileRoute } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'

export const Route = createFileRoute('/_app/engagement')({
  staticData: { title: 'Engagement' },
  component: () => (
    <PagePlaceholder
      title="Engagement"
      description="Surveys, recognition, and engagement signals."
      icon={Heart}
    />
  ),
})
