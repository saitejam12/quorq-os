import { createFileRoute } from '@tanstack/react-router'
import { UserCircle } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'

export const Route = createFileRoute('/_app/profile')({
  staticData: { title: 'My profile' },
  component: () => (
    <PagePlaceholder
      title="My profile"
      description="View and update your personal details."
      icon={UserCircle}
    />
  ),
})
