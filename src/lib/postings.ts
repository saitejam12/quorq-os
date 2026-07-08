export const EMPLOYMENT_TYPES = ['full-time', 'contract'] as const
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number]

export const TEMPLATE_CATEGORIES = ['tech', 'sales', 'others'] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export function isTemplateCategory(v: string): v is TemplateCategory {
  return (TEMPLATE_CATEGORIES as ReadonlyArray<string>).includes(v)
}

export const DEACTIVATION_REASONS = [
  'Position filled',
  'Budget freeze',
  'Role on hold',
  'Requirements changed',
  'Duplicate posting',
] as const
export type DeactivationReason = (typeof DEACTIVATION_REASONS)[number]

export function isEmploymentType(v: string): v is EmploymentType {
  return (EMPLOYMENT_TYPES as ReadonlyArray<string>).includes(v)
}

export function isDeactivationReason(v: string): v is DeactivationReason {
  return (DEACTIVATION_REASONS as ReadonlyArray<string>).includes(v)
}

export interface JdTemplate {
  id: number
  title: string
  category: string
  description: string
}

export interface PostingRow {
  role: string
  department: string
  location: string
  employmentType: EmploymentType
  category: string
  description: string
  templateId: number
}

// Maps a chosen JD template plus the operator's form inputs to the fields of a
// new job_openings row. The template supplies the role title, JD text and
// category; the operator supplies where and how the role is staffed.
export function templateToPosting(
  template: JdTemplate,
  input: { department: string; location: string; employmentType: EmploymentType },
): PostingRow {
  return {
    role: template.title,
    department: input.department,
    location: input.location,
    employmentType: input.employmentType,
    category: template.category,
    description: template.description,
    templateId: template.id,
  }
}
