import { redirect } from '@tanstack/react-router'
import { hasTier } from '#/lib/tiers'
import type { Tier } from '#/lib/tiers'
import type { AuthUser } from '#/server/auth'

export function requireTier(user: AuthUser, minTier: Tier): void {
  if (!hasTier(user.tier, minTier)) {
    throw redirect({ to: '/home', search: { denied: '1' } })
  }
}
