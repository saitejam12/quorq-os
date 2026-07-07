import { createFileRoute } from '@tanstack/react-router'
import { Clock } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/attendance')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Attendance & leave' },
  component: () => (
    <PagePlaceholder
      title="Attendance & leave"
      description="Team attendance and leave patterns."
      icon={Clock}
    />
  ),
})
