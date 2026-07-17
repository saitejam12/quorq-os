import { signRequest } from '#/lib/sigv4'
import type { Result } from '#/server/auth'

// AWS SES v2 SendEmail transport. Signs a plain HTTPS POST with SigV4 (Web Crypto)
// — no aws-sdk, matching the hand-rolled JWT/PBKDF2 grain. Reads config from
// process.env (on AWS these come from Secrets Manager / the task env). This is the
// ONLY module that talks to the network for email.

interface SesConfig {
  accessKeyId: string
  secretAccessKey: string
  sessionToken?: string
  region: string
  from: string
}

function requireConfig(): SesConfig {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY
  const region = process.env.AWS_REGION
  const from = process.env.SES_FROM_EMAIL
  // Phrase matches isConfigError() so callers can distinguish "not set up" from
  // a real send failure; the values themselves are never logged.
  if (!accessKeyId || !secretAccessKey || !region || !from) {
    throw new Error(
      'SES is not configured — AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, ' +
        'AWS_REGION and SES_FROM_EMAIL must all be set in the server environment.',
    )
  }
  return {
    accessKeyId,
    secretAccessKey,
    sessionToken: process.env.AWS_SESSION_TOKEN, // present under an ECS task role
    region,
    from,
  }
}

export interface SendEmailInput {
  to: string | Array<string>
  subject: string
  html: string
  text: string
}

// Returns Result<null>: ok on HTTP 200, ok:false with the SES error body otherwise.
// Throws only for a missing-config error (recognized by isConfigError); a delivery
// failure never throws — the caller decides how to treat it.
export async function sendEmail(input: SendEmailInput): Promise<Result<null>> {
  const cfg = requireConfig()
  const to = Array.isArray(input.to) ? input.to : [input.to]

  const url = `https://email.${cfg.region}.amazonaws.com/v2/email/outbound-emails`
  const body = JSON.stringify({
    FromEmailAddress: cfg.from,
    Destination: { ToAddresses: to },
    Content: {
      Simple: {
        Subject: { Data: input.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: input.html, Charset: 'UTF-8' },
          Text: { Data: input.text, Charset: 'UTF-8' },
        },
      },
    },
  })

  const headers = await signRequest({
    method: 'POST',
    url,
    region: cfg.region,
    service: 'ses',
    body,
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    sessionToken: cfg.sessionToken,
    headers: { 'content-type': 'application/json' },
    timestamp: new Date(),
  })

  const res = await fetch(url, { method: 'POST', headers, body })
  if (res.ok) return { ok: true, data: null }
  const errBody = await res.text().catch(() => '')
  return {
    ok: false,
    error: `SES send failed (${res.status}): ${errBody.slice(0, 300)}`,
  }
}
