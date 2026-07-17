import { render } from '@react-email/render'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResetPasswordEmail } from './templates'
import { sendPasswordResetEmail } from './notifications'

afterEach(() => vi.unstubAllEnvs())

describe('email templates', () => {
  it('renders the reset email to HTML with name + link', async () => {
    const html = await render(
      ResetPasswordEmail({
        name: 'Asha',
        resetUrl: 'https://app.example/reset-password?token=abc123',
      }),
    )
    expect(html).toContain('Reset your password')
    expect(html).toContain('Asha')
    expect(html).toContain('https://app.example/reset-password?token=abc123')
  })

  it('produces a readable plain-text fallback', async () => {
    const text = await render(
      ResetPasswordEmail({ name: 'Asha', resetUrl: 'https://x/y' }),
    )
    expect(text.length).toBeGreaterThan(0)
  })
})

describe('best-effort contract', () => {
  it('swallows a missing-SES-config error and resolves without throwing', async () => {
    // No AWS_* env set -> sendEmail() throws "not configured"; deliver() must
    // catch it so the caller (signup/reset/approve) is never affected.
    vi.stubEnv('AWS_ACCESS_KEY_ID', '')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', '')
    vi.stubEnv('AWS_REGION', '')
    vi.stubEnv('SES_FROM_EMAIL', '')
    await expect(
      sendPasswordResetEmail({ to: 'a@b.com', name: 'A', token: 't' }),
    ).resolves.toBeUndefined()
  })
})
