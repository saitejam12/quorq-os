// Single source of truth for which profile fields an employee may request to
// change. Drives both the request modal (UI) and the server-side application of
// an approved request. Aadhaar and PAN are deliberately absent — no code path
// can request them.

export type ProfileFieldType = 'text' | 'textarea' | 'date' | 'email'
export type ProfileFieldTable = 'employees' | 'kyc'

export interface ProfileField {
  key: string
  label: string
  group: 'Employee' | 'Personal' | 'Bank'
  table: ProfileFieldTable
  column: string
  type: ProfileFieldType
  max: number
  // nullable columns may be cleared (empty → NULL on apply); non-nullable ones
  // (the required employee identity/org fields) may not be emptied.
  nullable?: boolean
}

export const PROFILE_FIELDS: Array<ProfileField> = [
  {
    key: 'name',
    label: 'Name',
    group: 'Employee',
    table: 'employees',
    column: 'name',
    type: 'text',
    max: 120,
  },
  {
    key: 'email',
    label: 'Email',
    group: 'Employee',
    table: 'employees',
    column: 'email',
    type: 'email',
    max: 160,
  },
  {
    key: 'department',
    label: 'Department',
    group: 'Employee',
    table: 'employees',
    column: 'department',
    type: 'text',
    max: 64,
  },
  {
    key: 'designation',
    label: 'Designation',
    group: 'Employee',
    table: 'employees',
    column: 'designation',
    type: 'text',
    max: 120,
  },
  {
    key: 'employmentType',
    label: 'Employment type',
    group: 'Employee',
    table: 'employees',
    column: 'employment_type',
    type: 'text',
    max: 24,
  },
  {
    key: 'location',
    label: 'Location',
    group: 'Employee',
    table: 'employees',
    column: 'location',
    type: 'text',
    max: 64,
  },
  {
    key: 'dateOfJoining',
    label: 'Date of joining',
    group: 'Employee',
    table: 'employees',
    column: 'date_of_joining',
    type: 'date',
    max: 10,
  },
  {
    key: 'phone',
    label: 'Phone number',
    group: 'Personal',
    table: 'employees',
    column: 'phone',
    type: 'text',
    max: 24,
    nullable: true,
  },
  {
    key: 'currentAddress',
    label: 'Current address',
    group: 'Personal',
    table: 'employees',
    column: 'current_address',
    type: 'textarea',
    max: 400,
    nullable: true,
  },
  {
    key: 'permanentAddress',
    label: 'Permanent address',
    group: 'Personal',
    table: 'employees',
    column: 'permanent_address',
    type: 'textarea',
    max: 400,
    nullable: true,
  },
  {
    key: 'emergencyContactName',
    label: 'Emergency contact name',
    group: 'Personal',
    table: 'employees',
    column: 'emergency_contact_name',
    type: 'text',
    max: 120,
    nullable: true,
  },
  {
    key: 'emergencyContactPhone',
    label: 'Emergency contact phone',
    group: 'Personal',
    table: 'employees',
    column: 'emergency_contact_phone',
    type: 'text',
    max: 24,
    nullable: true,
  },
  {
    key: 'bankName',
    label: 'Bank name',
    group: 'Bank',
    table: 'kyc',
    column: 'bank_name',
    type: 'text',
    max: 120,
    nullable: true,
  },
  {
    key: 'bankAccountNumber',
    label: 'Salary account number',
    group: 'Bank',
    table: 'kyc',
    column: 'bank_account_number',
    type: 'text',
    max: 40,
    nullable: true,
  },
  {
    key: 'bankIfsc',
    label: 'IFSC',
    group: 'Bank',
    table: 'kyc',
    column: 'bank_ifsc',
    type: 'text',
    max: 20,
    nullable: true,
  },
]

const FIELD_BY_KEY: Record<string, ProfileField | undefined> =
  Object.fromEntries(PROFILE_FIELDS.map((f) => [f.key, f]))

export const getProfileField = (key: string): ProfileField | undefined =>
  FIELD_BY_KEY[key]

export const labelFor = (key: string): string => FIELD_BY_KEY[key]?.label ?? key

// Keep only allow-listed keys, coercing each value to a trimmed string. Anything
// not in PROFILE_FIELDS (Aadhaar, PAN, unknown keys) is dropped.
export function pickAllowed(input: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (input == null || typeof input !== 'object') return out
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!FIELD_BY_KEY[key]) continue
    out[key] =
      typeof value === 'string' ? value.trim() : String(value ?? '').trim()
  }
  return out
}

// Only the keys whose proposed value differs from the current one.
export function diffChanges(
  current: Record<string, string>,
  proposed: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(proposed)) {
    if (!FIELD_BY_KEY[key]) continue
    if ((current[key] ?? '') !== value) out[key] = value
  }
  return out
}

// Error messages for a proposed change set: non-nullable fields may not be
// emptied, and values may not exceed the field's max length.
export function validateChanges(
  changes: Record<string, string>,
): Array<string> {
  const errors: Array<string> = []
  for (const [key, value] of Object.entries(changes)) {
    const field = FIELD_BY_KEY[key]
    if (!field) continue
    if (!field.nullable && value.length === 0) {
      errors.push(`${field.label} is required`)
    }
    if (value.length > field.max) {
      errors.push(`${field.label} must be ${field.max} characters or fewer`)
    }
  }
  return errors
}
