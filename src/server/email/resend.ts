import type { Result } from '#/server/auth'

// Resend email transport. A plain HTTPS POST to the Resend API (works on the
// Cloudflare worker runtime via fetch — no SDK). Reads config from process.env
// (.dev.vars in dev, wrangler secret/vars in prod). This is the ONLY module that
// talks to the network for email.

interface ResendConfig {
  apiKey: string
  from: string
}

function requireConfig(): ResendConfig {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  // Phrase matches isConfigError() so callers can distinguish "not set up" from
  // a real send failure; the values themselves are never logged.
  if (!apiKey || !from) {
    throw new Error(
      'Resend is not configured — RESEND_API_KEY and RESEND_FROM_EMAIL must ' +
        'both be set in the server environment.',
    )
  }
  return { apiKey, from }
}

export interface SendEmailInput {
  to: string | Array<string>
  subject: string
  html: string
  text: string
}

// Returns Result<null>: ok on HTTP 2xx, ok:false with the Resend error body
// otherwise. Throws only for a missing-config error (recognized by isConfigError);
// a delivery failure never throws — the caller decides how to treat it.
export async function sendEmail(input: SendEmailInput): Promise<Result<null>> {
  const cfg = requireConfig()
  const to = Array.isArray(input.to) ? input.to : [input.to]

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: cfg.from,
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  if (res.ok) return { ok: true, data: null }
  const errBody = await res.text().catch(() => '')
  return {
    ok: false,
    error: `Resend send failed (${res.status}): ${errBody.slice(0, 300)}`,
  }
}
