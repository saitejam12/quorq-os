import { ShieldCheck } from 'lucide-react'

const BrandPanel = () => {
  const Texts = {
    title: 'Quorq-OS',
    subtitle: 'HR Analytics Suite · FY 2026–27',
    description1: 'Get your team onboarded in minutes.',
    description2:
      'Create your account to access Hiring, Payrolls, Engagement and much more — For Employees, Managers and HR.',
    footnote: 'Secure and private. Your data is encrypted and never shared.',
  }
  return (
    <div className="hidden w-1/2 flex-col justify-between bg-slate-900 p-12 text-white lg:flex">
      <div>
        <div className="text-2xl font-bold">{Texts.title}</div>
        <div className="text-sm text-slate-400">{Texts.subtitle}</div>
      </div>
      <div>
        <h2 className="text-3xl font-bold leading-tight">
          {Texts.description1}
        </h2>
        <p className="mt-4 max-w-md text-slate-400">{Texts.description2}</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <ShieldCheck size={14} /> {Texts.footnote}
      </div>
    </div>
  )
}
export default BrandPanel
