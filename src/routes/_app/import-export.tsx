import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import {
  Upload,
  Download,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileText,
} from 'lucide-react'
import {
  importEmployeesFromCSV,
  importAttendanceFromCSV,
  exportEmployees,
  exportAttendance,
} from '#/server/import'
import { toCSV } from '#/lib/import-export'
import { Card, CardHeader } from '#/components/ui'
import { requireTier } from '#/lib/guards'

export const Route = createFileRoute('/_app/import-export')({
  staticData: { title: 'Import & export' },
  beforeLoad: ({ context }) => requireTier(context.user, 'ops'),
  component: ImportExport,
})

type ImportType = 'employees' | 'attendance'

function ImportExport() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('import')
  const [selectedType, setSelectedType] = useState<ImportType>('employees')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) {
      setFile(f)
      setError(null)
      setResult(null)
    }
  }

  const handleImport = async () => {
    if (!file) {
      setError('Please select a file')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const content = await file.text()
      const res =
        selectedType === 'employees'
          ? await importEmployeesFromCSV({
              data: { content, fileName: file.name },
            })
          : await importAttendanceFromCSV({
              data: { content, fileName: file.name },
            })

      if (res.ok) {
        setResult(res)
        setFile(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
        router.invalidate()
      } else {
        setError(res.error)
        setResult(res.details ? { errors: res.details } : null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    setLoading(true)
    setError(null)
    try {
      const res =
        selectedType === 'employees'
          ? await exportEmployees()
          : await exportAttendance()
      if (res.ok) {
        const csv = toCSV(res.data as Array<Record<string, any>>)
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${selectedType}-${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        window.URL.revokeObjectURL(url)
        setResult({ exported: res.data.length })
      } else {
        setError(res.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5 p-6">
      <h1 className="text-2xl font-bold text-slate-900">Import &amp; export</h1>

      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('import')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            activeTab === 'import'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Upload size={16} className="mr-2 inline" />
          Import
        </button>
        <button
          onClick={() => setActiveTab('export')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            activeTab === 'export'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Download size={16} className="mr-2 inline" />
          Export
        </button>
      </div>

      {activeTab === 'import' ? (
        <Card>
          <CardHeader title="Import data" hint="CSV format" />
          <div className="space-y-4 px-5 pb-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Data type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as ImportType)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="employees">Employees</option>
                <option value="attendance">Attendance records</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Select file
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="block w-full text-sm text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100"
              />
              {file ? (
                <p className="text-xs text-slate-500">Selected: {file.name}</p>
              ) : null}
            </div>

            {selectedType === 'employees' ? (
              <div className="space-y-1 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                <p className="font-semibold">Required columns:</p>
                <p>name, email, department, designation</p>
                <p className="text-blue-600">
                  Optional: location, employmentType, status, gender,
                  dateOfJoining, ctc, managerId
                </p>
              </div>
            ) : (
              <div className="space-y-1 rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
                <p className="font-semibold">Required columns:</p>
                <p>employeeId, date, status</p>
                <p className="text-blue-600">
                  Optional: late, earlyExit, overtimeHours
                </p>
                <p className="text-blue-600">
                  Status values: present, absent, wfh, leave
                </p>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={!file || loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Upload size={16} />
              )}
              {loading ? 'Importing…' : 'Import'}
            </button>
          </div>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Export data" hint="Download as CSV" />
          <div className="space-y-4 px-5 pb-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Data type
              </label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as ImportType)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="employees">Employees</option>
                <option value="attendance">Attendance records</option>
              </select>
            </div>

            <button
              onClick={handleExport}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              {loading ? 'Exporting…' : 'Export to CSV'}
            </button>
          </div>
        </Card>
      )}

      {error ? (
        <div className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <AlertCircle className="shrink-0 text-red-600" size={20} />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-900">{error}</p>
            {result?.errors && result.errors.length > 0 ? (
              <div className="mt-2 space-y-1 text-xs text-red-700">
                {result.errors.slice(0, 3).map((err: any, i: number) => (
                  <p key={i}>
                    {typeof err === 'string'
                      ? err
                      : `Row ${err.row}: ${err.message}`}
                  </p>
                ))}
                {result.errors.length > 3 ? (
                  <p>… and {result.errors.length - 3} more errors</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {result && !error ? (
        <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <CheckCircle className="shrink-0 text-emerald-600" size={20} />
          <div className="flex-1">
            {activeTab === 'import' ? (
              <>
                <p className="text-sm font-medium text-emerald-900">
                  Import completed successfully
                </p>
                <div className="mt-2 grid grid-cols-3 gap-4 text-xs text-emerald-700">
                  <div>
                    <p className="font-semibold">
                      {result.summary?.inserted || 0}
                    </p>
                    <p>Inserted</p>
                  </div>
                  <div>
                    <p className="font-semibold">
                      {result.summary?.duplicates || 0}
                    </p>
                    <p>Skipped</p>
                  </div>
                  <div>
                    <p className="font-semibold">
                      {result.summary?.total || 0}
                    </p>
                    <p>Total</p>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm font-medium text-emerald-900">
                Export complete — downloaded {result.exported || 0} records
              </p>
            )}
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader title="Sample CSV formats" icon={<FileText size={16} />} />
        <div className="space-y-4 px-5 pb-5">
          {selectedType === 'employees' ? (
            <div className="overflow-x-auto rounded bg-slate-50 p-3 text-xs">
              <pre className="text-slate-700">
                {`name,email,department,designation,location,employmentType,status,dateOfJoining,ctc
John Doe,john@company.com,Engineering,Software Engineer,Hyderabad,full-time,active,2024-01-15,800000
Jane Smith,jane@company.com,Sales,Sales Manager,Mumbai,full-time,active,2023-06-01,600000`}
              </pre>
            </div>
          ) : (
            <div className="overflow-x-auto rounded bg-slate-50 p-3 text-xs">
              <pre className="text-slate-700">
                {`employeeId,date,status,late,earlyExit,overtimeHours
1,2026-07-04,present,false,false,0
2,2026-07-04,wfh,false,false,1.5
3,2026-07-04,absent,false,false,0`}
              </pre>
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
