import { z } from 'zod'
import { TIERS } from '#/lib/tiers'

const PayloadSchema = z.object({
  sub: z.number(),
  email: z.string(),
  name: z.string(),
  tier: z.enum(TIERS),
  exp: z.number(),
})

export type TokenPayload = z.infer<typeof PayloadSchema>

const encoder = new TextEncoder()

function b64urlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function b64urlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signToken(
  payload: TokenPayload,
  secret: string,
): Promise<string> {
  const header = b64urlEncode(
    encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
  )
  const body = b64urlEncode(encoder.encode(JSON.stringify(payload)))
  const key = await getKey(secret)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(`${header}.${body}`),
  )
  return `${header}.${body}.${b64urlEncode(new Uint8Array(signature))}`
}

export async function verifyToken(
  token: string,
  secret: string,
): Promise<TokenPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  const key = await getKey(secret)
  let valid = false
  try {
    valid = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(signature),
      encoder.encode(`${header}.${body}`),
    )
  } catch {
    return null
  }
  if (!valid) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(body)))
  } catch {
    return null
  }
  const result = PayloadSchema.safeParse(parsed)
  if (!result.success) return null
  if (result.data.exp <= Math.floor(Date.now() / 1000)) return null
  return result.data
}
