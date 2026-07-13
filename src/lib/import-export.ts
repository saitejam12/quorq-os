import { z } from 'zod'

export interface ImportResult<T> {
  success: boolean
  rowsProcessed: number
  rowsSkipped: number
  errors: Array<{ row: number; message: string }>
  warnings: Array<{ row: number; message: string }>
  data: Array<T>
}

// Minimal CSV parser — handles quoted fields containing commas and escaped quotes.
export function parseCSV(content: string): Array<Array<string>> {
  const lines = content.split('\n').filter((line) => line.trim())
  return lines.map((line) => {
    const fields: Array<string> = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      const nextChar = line[i + 1]
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === ',' && !inQuotes) {
        fields.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    fields.push(current.trim())
    return fields
  })
}

export function toCSV<T extends Record<string, any>>(
  data: Array<T>,
  headers?: Array<string>,
): string {
  if (data.length === 0) return headers ? headers.join(',') : ''
  const allHeaders = headers || Object.keys(data[0])
  const lines: Array<string> = [allHeaders.join(',')]
  for (const row of data) {
    const values = allHeaders.map((header) => {
      const value = row[header]
      if (value === null || value === undefined) return ''
      if (
        typeof value === 'string' &&
        (value.includes(',') || value.includes('"'))
      ) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return String(value)
    })
    lines.push(values.join(','))
  }
  return lines.join('\n')
}

const csvBool = z.preprocess(
  (v) => ['true', '1', 'yes'].includes(String(v ?? '').toLowerCase()),
  z.boolean(),
)

export const EmployeeImportSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.email('Invalid email'),
  department: z.string().min(1, 'Department is required'),
  designation: z.string().min(1, 'Designation is required'),
  location: z.string().default('Hyderabad'),
  employmentType: z
    .enum(['full-time', 'part-time', 'contract'])
    .default('full-time'),
  status: z.enum(['active', 'on_leave', 'notice', 'exited']).default('active'),
  gender: z.enum(['male', 'female', 'other']).default('male'),
  dateOfJoining: z
    .string()
    .refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  ctc: z.coerce.number().min(0).default(0),
  managerId: z.coerce.number().optional().nullable(),
})
export type EmployeeImportData = z.infer<typeof EmployeeImportSchema>

export const AttendanceImportSchema = z.object({
  employeeId: z.coerce.number().int().positive('Employee ID required'),
  date: z.string().refine((d) => !isNaN(Date.parse(d)), 'Invalid date'),
  status: z.enum(['present', 'absent', 'wfh', 'leave']),
  late: csvBool.default(false),
  earlyExit: csvBool.default(false),
  overtimeHours: z.coerce.number().min(0).max(12).default(0),
})
export type AttendanceImportData = z.infer<typeof AttendanceImportSchema>

function emptyResult<T>(): ImportResult<T> {
  return {
    success: true,
    rowsProcessed: 0,
    rowsSkipped: 0,
    errors: [],
    warnings: [],
    data: [],
  }
}

function zodMessage(error: unknown): string {
  return error instanceof z.ZodError
    ? error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ')
    : error instanceof Error
      ? error.message
      : 'Unknown error'
}

export function importEmployees(
  csvLines: Array<Array<string>>,
): ImportResult<EmployeeImportData> {
  const result = emptyResult<EmployeeImportData>()
  if (csvLines.length < 2) {
    result.errors.push({
      row: 1,
      message: 'CSV file must have headers and at least one data row',
    })
    result.success = false
    return result
  }
  const headers = csvLines[0]
  const missing = ['name', 'email', 'department', 'designation'].filter(
    (f) => !headers.includes(f),
  )
  if (missing.length > 0) {
    result.errors.push({
      row: 1,
      message: `Missing required columns: ${missing.join(', ')}`,
    })
    result.success = false
    return result
  }

  const seenEmails = new Set<string>()
  for (let i = 1; i < csvLines.length; i++) {
    const line = csvLines[i]
    if (line.every((f) => !f)) continue
    const row = i + 1
    try {
      const obj: Record<string, any> = {}
      headers.forEach((header, index) => {
        obj[header] = line[index]
      })
      const email = String(obj.email ?? '').toLowerCase()
      if (seenEmails.has(email)) {
        result.warnings.push({ row, message: `Duplicate email: ${obj.email}` })
        result.rowsSkipped++
        continue
      }
      seenEmails.add(email)
      result.data.push(EmployeeImportSchema.parse(obj))
      result.rowsProcessed++
    } catch (error) {
      result.errors.push({ row, message: zodMessage(error) })
      if (result.errors.length > 50) {
        result.errors.push({
          row: -1,
          message: 'Too many errors. Stopping import.',
        })
        break
      }
    }
  }
  result.success = result.errors.length === 0
  return result
}

export function importAttendance(
  csvLines: Array<Array<string>>,
): ImportResult<AttendanceImportData> {
  const result = emptyResult<AttendanceImportData>()
  if (csvLines.length < 2) {
    result.errors.push({
      row: 1,
      message: 'CSV file must have headers and at least one data row',
    })
    result.success = false
    return result
  }
  const headers = csvLines[0]
  const missing = ['employeeId', 'date', 'status'].filter(
    (f) => !headers.includes(f),
  )
  if (missing.length > 0) {
    result.errors.push({
      row: 1,
      message: `Missing required columns: ${missing.join(', ')}`,
    })
    result.success = false
    return result
  }

  for (let i = 1; i < csvLines.length; i++) {
    const line = csvLines[i]
    if (line.every((f) => !f)) continue
    const row = i + 1
    try {
      const obj: Record<string, any> = {}
      headers.forEach((header, index) => {
        obj[header] = line[index]
      })
      result.data.push(AttendanceImportSchema.parse(obj))
      result.rowsProcessed++
    } catch (error) {
      result.errors.push({ row, message: zodMessage(error) })
      if (result.errors.length > 50) {
        result.errors.push({
          row: -1,
          message: 'Too many errors. Stopping import.',
        })
        break
      }
    }
  }
  result.success = result.errors.length === 0
  return result
}
