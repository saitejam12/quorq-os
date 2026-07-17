// Pure helpers for password-reset tokens. No I/O — the DB row and email are the
// caller's job (src/server/reset.ts). Only the SHA-256 hash of a token is ever
// stored; the plaintext lives solely in the emailed URL.

const encoder = new TextEncoder()

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// 32 random bytes as base64url — high entropy, URL-safe, not guessable.
export function generateToken(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(32)))
}

// SHA-256 hex of the token; this is what goes in password_reset_tokens.token_hash.
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token))
  return toHex(digest)
}

// True when `expiresAt` is at or before `now`. Accepts a Date or ISO string.
export function isExpired(expiresAt: Date | string, now: Date): boolean {
  const exp = expiresAt instanceof Date ? expiresAt : new Date(expiresAt)
  return exp.getTime() <= now.getTime()
}

// Minutes a reset link stays valid (matches the copy in forgot-password.tsx).
export const RESET_TTL_MINUTES = 30
