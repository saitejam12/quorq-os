import { Button, Section, Text } from '@react-email/components'
import { Layout, styles } from './Layout'

// All six transactional email bodies. Rendered to HTML/plain-text by
// notifications.ts via @react-email/render.

export function ResetPasswordEmail({
  name,
  resetUrl,
}: {
  name: string
  resetUrl: string
}) {
  return (
    <Layout preview="Reset your QuorqOS password">
      <Text style={styles.heading}>Reset your password</Text>
      <Text style={styles.text}>
        Hi {name}, we received a request to reset your QuorqOS password. Click
        below to choose a new one.
      </Text>
      <Section style={{ margin: '16px 0' }}>
        <Button href={resetUrl} style={styles.button}>
          Reset password
        </Button>
      </Section>
      <Text style={styles.muted}>
        This link expires in 30 minutes and can be used once. If you didn&apos;t
        request this, you can safely ignore this email.
      </Text>
    </Layout>
  )
}

export function SignupPendingEmail({
  applicantName,
  applicantEmail,
  requestsUrl,
}: {
  applicantName: string
  applicantEmail: string
  requestsUrl: string
}) {
  return (
    <Layout preview="New signup request awaiting review">
      <Text style={styles.heading}>New signup request</Text>
      <Text style={styles.text}>
        {applicantName} ({applicantEmail}) requested a QuorqOS account. Review
        and approve or decline it from the requests page.
      </Text>
      <Section style={{ margin: '16px 0' }}>
        <Button href={requestsUrl} style={styles.button}>
          Review request
        </Button>
      </Section>
    </Layout>
  )
}

export function SignupApprovedEmail({
  name,
  loginUrl,
}: {
  name: string
  loginUrl: string
}) {
  return (
    <Layout preview="Your QuorqOS account is active">
      <Text style={styles.heading}>Welcome to QuorqOS</Text>
      <Text style={styles.text}>
        Hi {name}, your account has been approved and is now active. You can
        sign in and get started.
      </Text>
      <Section style={{ margin: '16px 0' }}>
        <Button href={loginUrl} style={styles.button}>
          Sign in
        </Button>
      </Section>
    </Layout>
  )
}

export function SignupRejectedEmail({ name }: { name: string }) {
  return (
    <Layout preview="Update on your QuorqOS signup request">
      <Text style={styles.heading}>Signup request declined</Text>
      <Text style={styles.text}>
        Hi {name}, thanks for your interest in QuorqOS. After review, your
        account request was not approved at this time. If you believe this was a
        mistake, please contact your administrator.
      </Text>
    </Layout>
  )
}

export function ProfileChangeApprovedEmail({
  name,
  fields,
}: {
  name: string
  fields: Array<string>
}) {
  return (
    <Layout preview="Your profile change was approved">
      <Text style={styles.heading}>Profile change approved</Text>
      <Text style={styles.text}>
        Hi {name}, your requested change to {joinFields(fields)} has been
        approved and applied to your profile.
      </Text>
    </Layout>
  )
}

export function ProfileChangeRejectedEmail({
  name,
  fields,
  reason,
}: {
  name: string
  fields: Array<string>
  reason: string
}) {
  return (
    <Layout preview="Update on your profile change request">
      <Text style={styles.heading}>Profile change declined</Text>
      <Text style={styles.text}>
        Hi {name}, your requested change to {joinFields(fields)} was not
        approved.
      </Text>
      <Text style={styles.muted}>Reason: {reason}</Text>
    </Layout>
  )
}

function joinFields(fields: Array<string>): string {
  if (fields.length === 0) return 'your profile'
  if (fields.length === 1) return fields[0]
  return `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}`
}
