import { createFileRoute } from '@tanstack/react-router'
import { Wallet } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/payroll')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Payroll' },
  component: () => (
    <PagePlaceholder
      title="Payroll"
      description="Run and review payroll."
      icon={Wallet}
    />
  ),
})
