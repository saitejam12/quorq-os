// Pure AWS Signature Version 4 signer, built on Web Crypto (no aws-sdk). Matches
// the codebase grain — hand-rolled HS256 JWT (jwt.ts) and PBKDF2 (password.ts).
// Deterministic: the timestamp is passed in, not read from the clock, so it is
// unit-testable against the AWS SigV4 test-suite vectors.

const encoder = new TextEncoder()

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(data))
  return toHex(new Uint8Array(digest))
}

// key must be ArrayBuffer-backed (encoder.encode and this fn's own output both are).
async function hmac(
  key: Uint8Array<ArrayBuffer>,
  msg: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(msg))
  return new Uint8Array(sig)
}

// RFC 3986 encoding for canonical URIs/queries: encodeURIComponent plus the four
// characters it leaves alone, minus the unreserved `~`.
function rfc3986(str: string): string {
  return encodeURIComponent(str)
    .replace(
      /[!'()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    )
    .replace(/%7E/g, '~')
}

function encodePath(pathname: string): string {
  if (pathname === '' || pathname === '/') return '/'
  return pathname
    .split('/')
    .map((seg) => rfc3986(seg))
    .join('/')
}

function canonicalQuery(search: string): string {
  const params = new URLSearchParams(search)
  const pairs: Array<[string, string]> = []
  for (const [k, v] of params) pairs.push([rfc3986(k), rfc3986(v)])
  pairs.sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1,
  )
  return pairs.map(([k, v]) => `${k}=${v}`).join('&')
}

function amzDate(timestamp: Date): { amz: string; stamp: string } {
  const amz = timestamp.toISOString().replace(/[:-]|\.\d{3}/g, '')
  return { amz, stamp: amz.slice(0, 8) }
}

export interface SignInput {
  method: string
  url: string
  region: string
  service: string
  body: string
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  // Extra headers to include in the signature (e.g. content-type). host and
  // x-amz-date (and x-amz-security-token, if a sessionToken is given) are added.
  headers?: Record<string, string>
  timestamp: Date
}

// Returns the full set of headers to send, including Authorization + x-amz-date
// (+ x-amz-security-token). Attach them verbatim to the request.
export async function signRequest(
  input: SignInput,
): Promise<Record<string, string>> {
  const { amz, stamp } = amzDate(input.timestamp)
  const url = new URL(input.url)

  const signed: Record<string, string> = {
    ...(input.headers ?? {}),
    host: url.host,
    'x-amz-date': amz,
  }
  if (input.sessionToken) signed['x-amz-security-token'] = input.sessionToken

  // Canonical headers: lowercased names, trimmed single-spaced values, sorted.
  const names = Object.keys(signed)
    .map((n) => n.toLowerCase())
    .sort()
  const lower: Record<string, string> = {}
  for (const [k, v] of Object.entries(signed)) {
    lower[k.toLowerCase()] = v.trim().replace(/\s+/g, ' ')
  }
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('')
  const signedHeaders = names.join(';')

  const payloadHash = await sha256Hex(input.body)
  const canonicalRequest = [
    input.method.toUpperCase(),
    encodePath(url.pathname),
    canonicalQuery(url.search),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const scope = `${stamp}/${input.region}/${input.service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amz,
    scope,
    await sha256Hex(canonicalRequest),
  ].join('\n')

  const kDate = await hmac(
    encoder.encode(`AWS4${input.secretAccessKey}`),
    stamp,
  )
  const kRegion = await hmac(kDate, input.region)
  const kService = await hmac(kRegion, input.service)
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = toHex(await hmac(kSigning, stringToSign))

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${input.accessKeyId}/${scope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return { ...signed, Authorization: authorization }
}
