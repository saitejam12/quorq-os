// Editorial / target / benchmark figures that are configured rather than
// derived from transactional data (industry benchmarks, targets, snapshot
// costs). Kept in one place so the dashboards read as a single source.
export const C = {
  industryAttritionAvg: 6.5,
  attendanceTarget: 90,
  payrollBudgetL: 56.5,
  attritionDeltaVsQ3: 1.2,
  attendanceDeltaVsLastWeek: 2,

  // attendance & leave
  leaveDaysEntitled: 15,
  monthsElapsed: 6,
  absenteeismRate: 3.2,
  absenteeismDelta: 0.4,
  absenteeismTarget: 3,
  overtimeCostL: 1.8,
  leaveEncashmentL: 2.4,
  sickSpikeMonths: 'Nov, Dec, Feb',

  // attrition & retention
  retentionTarget: 93,
  topPerformerRetention: 96,
  exitsThisMonth: 8,
  voluntaryThisMonth: 6,
  costPerExitL: 3.2,
  voluntaryAttrition: 6.3,
  involuntaryAttrition: 2.1,
  enps: 18,
  avgNoticeDays: 38,

  // talent acquisition
  avgTimeToHire: 34,
  timeToHireTarget: 30,
  bestTimeToHire: 18,
  offerAcceptRate: 60,
  offersMade: 5,
  offersAccepted: 3,
  offersDeclined: 2,
  costPerHireK: 42,
  agencyCostK: 68,
  referralCostK: 18,
  interviewToOffer: '3.3 : 1',
  referralConversion: 41,
  newHireRetention30: 93,

  // hiring velocity (exec)
  velocity: { openRoles: 12, interviewing: 8, offersMade: 5, joined: 3 },

  // reports hub
  prebuiltCount: 32,
  prebuiltSplit: 'HR 12 · Payroll 8 · Compliance 7 · Other 5',
  exportsThisMonth: 47,
  exportsSplit: 'PDF 28 · Excel 14 · CSV 5',
  scheduledCount: 6,
  dataCompleteness: 84,
  profilesIncomplete: 22,
}

export const AI_INSIGHTS = [
  {
    tone: 'risk',
    title: 'Flight risk',
    body: '3 employees in Engineering flagged — tenure under 1 yr, no appraisal in 6+ months',
  },
  {
    tone: 'warn',
    title: 'Leave spike',
    body: 'Sales team 38% above avg this month — possible morale concern',
  },
  {
    tone: 'info',
    title: 'Hiring lag',
    body: '2 senior roles open 45+ days — exceeding 30-day target',
  },
  {
    tone: 'ok',
    title: 'Payroll',
    body: 'June disbursement processed for 140/142 employees — 2 pending verification',
  },
]
