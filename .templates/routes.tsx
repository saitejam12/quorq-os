import {
  LayoutDashboard,
  Users,
  Briefcase,
  Clock,
  TrendingDown,
  FileText,
  Download,
  Bell,
  Settings,
  HelpCircle,
  Contact,
  Heart,
  Network,
  UserCircle,
  LogOut,
  CalendarClock,
  CalendarDays,
  Receipt,
  Wallet,
  ClipboardList,
  Menu,
  X,
  Activity,
} from 'lucide-react'

const ALL = ['basic', 'ops', 'admin']
const analytics = [
  {
    to: '/overview',
    label: 'Executive overview',
    icon: <LayoutDashboard size={16} />,
    roles: ['ops', 'admin'],
  },
  {
    to: '/workforce',
    label: 'Workforce intelligence',
    icon: <Users size={16} />,
    roles: ['ops', 'admin'],
  },
  {
    to: '/talent',
    label: 'Talent acquisition',
    icon: <Briefcase size={16} />,
    roles: ['ops', 'admin'],
  },
  {
    to: '/attendance',
    label: 'Attendance & leave',
    icon: <Clock size={16} />,
    roles: ['ops', 'admin'],
  },
  {
    to: '/attrition',
    label: 'Attrition & retention',
    icon: <TrendingDown size={16} />,
    roles: ['ops', 'admin'],
  },
  {
    to: '/reports',
    label: 'Reports hub',
    icon: <FileText size={16} />,
    roles: ['ops', 'admin'],
  },
]
const people = [
  {
    to: '/directory',
    label: 'Employee directory',
    icon: <Contact size={16} />,
    roles: ALL,
  },
  {
    to: '/engagement',
    label: 'Engagement',
    icon: <Heart size={16} />,
    roles: ALL,
  },
  {
    to: '/hiring',
    label: 'Hiring',
    icon: <Briefcase size={16} />,
    roles: ['ops', 'admin'],
  },
  {
    to: '/onboarding',
    label: 'Onboarding',
    icon: <ClipboardList size={16} />,
    roles: ['ops', 'admin'],
  },
  {
    to: '/org',
    label: 'Org structure',
    icon: <Network size={16} />,
    roles: ALL,
  },
]
const workplace = [
  {
    to: '/time',
    label: 'Time tracking',
    icon: <CalendarClock size={16} />,
    roles: ALL,
  },
  {
    to: '/leave',
    label: 'Leave management',
    icon: <CalendarDays size={16} />,
    roles: ALL,
  },
  {
    to: '/expenses',
    label: 'Expenses',
    icon: <Receipt size={16} />,
    roles: ALL,
  },
  {
    to: '/payroll',
    label: 'Payroll',
    icon: <Wallet size={16} />,
    roles: ['ops', 'admin'],
  },
]
const management = [
  {
    to: '/import-export',
    label: 'Import & export',
    icon: <Download size={16} />,
    roles: ['ops', 'admin'],
  },
  {
    to: '/alerts',
    label: 'Alerts & notifications',
    icon: <Bell size={16} />,
    roles: ['ops', 'admin'],
  },
]
const selfNav = [
  {
    to: '/',
    label: 'My profile',
    icon: <UserCircle size={16} />,
    roles: ALL,
  },
]
const footerNav = [
  {
    to: '/settings',
    label: 'Settings',
    icon: <Settings size={16} />,
    roles: ['ops', 'admin'],
  },
  {
    to: '/monitoring',
    label: 'Monitoring',
    icon: <Activity size={16} />,
    roles: ['admin'],
  },
  { to: '/help', label: 'Help', icon: <HelpCircle size={16} />, roles: ALL },
]
