import { render } from '@react-email/render'
import type { ReactElement } from 'react'
import { sendEmail } from './ses'
import {
  ProfileChangeApprovedEmail,
  ProfileChangeRejectedEmail,
  ResetPasswordEmail,
  SignupApprovedEmail,
  SignupPendingEmail,
  SignupRejectedEmail,
} from './templates'

// One function per event: render the template to HTML + plain text and send it.
// BEST-EFFORT — every helper catches its own errors and returns without throwing.
// Email is a side effect; it must never fail the authoritative DB action (a user
// is created / approved / rejected even if SES is down or unconfigured).

const APP_URL = () => process.env.APP_URL ?? ''

async function deliver(
  label: string,
  to: string | Array<string>,
  subject: string,
  element: ReactElement,
): Promise<void> {
  try {
    const recipients = Array.isArray(to) ? to.filter(Boolean) : to
    if (Array.isArray(recipients) && recipients.length === 0) return
    const html = await render(element)
    const text = await render(element, { plainText: true })
    const res = await sendEmail({ to: recipients, subject, html, text })
    if (!res.ok) console.error(`[email] ${label} not sent:`, res.error)
  } catch (error) {
    // Includes the "SES is not configured" case — log, never propagate.
    console.error(`[email] ${label} failed:`, error)
  }
}

export function sendPasswordResetEmail(args: {
  to: string
  name: string
  token: string
}): Promise<void> {
  const resetUrl = `${APP_URL()}/reset-password?token=${args.token}`
  return deliver(
    'password-reset',
    args.to,
    'Reset your QuorqOS password',
    ResetPasswordEmail({ name: args.name, resetUrl }),
  )
}

export function sendSignupPendingEmail(args: {
  masters: Array<string>
  applicantName: string
  applicantEmail: string
}): Promise<void> {
  return deliver(
    'signup-pending',
    args.masters,
    'New QuorqOS signup request',
    SignupPendingEmail({
      applicantName: args.applicantName,
      applicantEmail: args.applicantEmail,
      requestsUrl: `${APP_URL()}/admin/requests`,
    }),
  )
}

export function sendSignupApprovedEmail(args: {
  to: string
  name: string
}): Promise<void> {
  return deliver(
    'signup-approved',
    args.to,
    'Your QuorqOS account is active',
    SignupApprovedEmail({ name: args.name, loginUrl: `${APP_URL()}/login` }),
  )
}

export function sendSignupRejectedEmail(args: {
  to: string
  name: string
}): Promise<void> {
  return deliver(
    'signup-rejected',
    args.to,
    'Update on your QuorqOS signup request',
    SignupRejectedEmail({ name: args.name }),
  )
}

export function sendProfileChangeApprovedEmail(args: {
  to: string
  name: string
  fields: Array<string>
}): Promise<void> {
  return deliver(
    'profile-change-approved',
    args.to,
    'Your profile change was approved',
    ProfileChangeApprovedEmail({ name: args.name, fields: args.fields }),
  )
}

export function sendProfileChangeRejectedEmail(args: {
  to: string
  name: string
  fields: Array<string>
  reason: string
}): Promise<void> {
  return deliver(
    'profile-change-rejected',
    args.to,
    'Update on your profile change request',
    ProfileChangeRejectedEmail({
      name: args.name,
      fields: args.fields,
      reason: args.reason,
    }),
  )
}
