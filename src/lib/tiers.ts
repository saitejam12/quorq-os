export const TIERS = ['basic', 'ops', 'master'] as const

export type Tier = (typeof TIERS)[number]

export const TIER_RANK: Record<Tier, number> = {
  basic: 1,
  ops: 2,
  master: 3,
}

export function hasTier(userTier: Tier, minTier: Tier): boolean {
  return TIER_RANK[userTier] >= TIER_RANK[minTier]
}

// Ops may shuffle users between basic and ops; only master may grant
// or revoke master access.
export function canSetTier(
  callerTier: Tier,
  targetCurrentTier: Tier,
  newTier: Tier,
): boolean {
  if (!hasTier(callerTier, 'ops')) return false
  if (callerTier === 'master') return true
  return targetCurrentTier !== 'master' && newTier !== 'master'
}
