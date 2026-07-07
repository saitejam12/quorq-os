import { createFileRoute } from '@tanstack/react-router'
import { Receipt } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'

export const Route = createFileRoute('/_app/expenses')({
  staticData: { title: 'Expenses' },
  component: () => (
    <PagePlaceholder
      title="Expenses"
      description="Submit and track expense claims."
      icon={Receipt}
    />
  ),
})
