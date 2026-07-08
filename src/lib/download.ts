import { exportCsv } from '#/server/metrics'

// Maps a report title from the Reports hub to an exportCsv dataset kind.
const KIND: Record<string, string> = {
  'Headcount register': 'headcount',
  'Headcount summary': 'headcount',
  'Payroll summary': 'payroll',
  'Attrition analysis': 'attrition',
  'Leave register': 'leave',
  'Recruitment funnel': 'recruitment',
  'PF & ESI statement': 'compliance',
  'Attendance report': 'headcount',
  'Form 16 pack': 'payroll',
}

// Fetches a DB-backed CSV from the server and triggers a browser download.
export async function downloadReport(title: string): Promise<void> {
  const kind = KIND[title] ?? 'headcount'
  const { filename, csv } = await exportCsv({ data: kind })
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
