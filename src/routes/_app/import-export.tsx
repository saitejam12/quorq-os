import { createFileRoute } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/import-export')({
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  staticData: { title: 'Import & export' },
  component: () => (
    <PagePlaceholder
      title="Import & export"
      description="Bulk import and export of HR data."
      icon={Download}
    />
  ),
})
