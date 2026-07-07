import { createFileRoute } from '@tanstack/react-router'
import { CalendarDays } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'

export const Route = createFileRoute('/_app/leave')({
  staticData: { title: 'Leave management' },
  component: () => (
    <PagePlaceholder
      title="Leave management"
      description="Apply for leave and view your balances."
      icon={CalendarDays}
    />
  ),
})
