// Demo/sample login accounts surfaced for quick tier switching. Single source of
// truth so every screen shows the same set and one env flag hides them all.
//
// VITE_SHOW_DEMO_ACCOUNTS is VITE_-prefixed so its value reaches the client
// bundle (import.meta.env). Only the exact string 'true' enables them; anything
// else (unset, 'false', '0') hides them — so production stays clean by default.
export const SHOW_DEMO_ACCOUNTS =
  import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true'

export interface DemoAccount {
  tier: 'basic' | 'ops' | 'master'
  email: string
  password: string
}

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  { tier: 'basic', email: 'basic@quorq.com', password: 'basicUser@123' },
  { tier: 'ops', email: 'ops@quorq.com', password: 'opsUser@123' },
  { tier: 'master', email: 'master@quorq.com', password: 'masterUser@123' },
]
