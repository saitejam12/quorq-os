import { createFileRoute } from '@tanstack/react-router'
import { CalendarClock } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'

export const Route = createFileRoute('/_app/time')({
  staticData: { title: 'Time tracking' },
  component: () => (
    <PagePlaceholder
      title="Time tracking"
      description="Log and review your working hours."
      icon={CalendarClock}
    />
  ),
})
