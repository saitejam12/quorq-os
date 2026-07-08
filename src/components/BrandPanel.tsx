import { ShieldCheck } from 'lucide-react'

const BrandPanel = () => {
  return (
    <div className="hidden w-1/2 flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
      <div>
        <div className="text-2xl font-bold">Quorq-OS</div>
        <div className="text-sm text-slate-400">
          HR Analytics Suite · FY 2026–27
        </div>
      </div>
      <div>
        <h2 className="text-3xl font-bold leading-tight">
          Get your team onboarded in minutes.
        </h2>
        <p className="mt-4 max-w-md text-slate-400">
          Create your account to access Hiring, Payrolls, Engagement and much
          more — For Employees, Managers and HR.
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck size={14} /> Secure session · Neon PostgreSQL
      </div>
    </div>
  )
}
export default BrandPanel
