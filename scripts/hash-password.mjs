// usage: node scripts/hash-password.mjs <password>
const password = process.argv[2]
if (!password) {
  console.error('usage: node scripts/hash-password.mjs <password>')
  process.exit(1)
}

const ITERATIONS = 100_000
const encoder = new TextEncoder()
const toBase64 = (bytes) => Buffer.from(bytes).toString('base64')

const salt = crypto.getRandomValues(new Uint8Array(16))
const key = await crypto.subtle.importKey(
  'raw',
  encoder.encode(password),
  'PBKDF2',
  false,
  ['deriveBits'],
)
const bits = await crypto.subtle.deriveBits(
  { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
  key,
  256,
)
console.log(`${toBase64(salt)}:${ITERATIONS}:${toBase64(new Uint8Array(bits))}`)
