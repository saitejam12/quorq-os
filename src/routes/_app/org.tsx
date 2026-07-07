import { createFileRoute } from '@tanstack/react-router'
import { Network } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'

export const Route = createFileRoute('/_app/org')({
  staticData: { title: 'Org structure' },
  component: () => (
    <PagePlaceholder
      title="Org structure"
      description="Explore the organizational structure."
      icon={Network}
    />
  ),
})
