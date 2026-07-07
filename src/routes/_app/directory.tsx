import { createFileRoute } from '@tanstack/react-router'
import { Contact } from 'lucide-react'
import PagePlaceholder from '#/components/PagePlaceholder'

export const Route = createFileRoute('/_app/directory')({
  staticData: { title: 'Employee directory' },
  component: () => (
    <PagePlaceholder
      title="Employee directory"
      description="Search and browse the employee directory."
      icon={Contact}
    />
  ),
})
