import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { ReactNode } from 'react'

// Branded shell shared by every QuorqOS email: header wordmark, container, footer.
export function Layout({
  preview,
  children,
}: {
  preview: string
  children: ReactNode
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={header}>
            <Text style={wordmark}>QuorqOS</Text>
          </Section>
          <Section style={card}>{children}</Section>
          <Hr style={hr} />
          <Text style={footer}>
            QuorqOS · HR portal. This is an automated message — please do not
            reply.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main = { backgroundColor: '#f8fafc', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', padding: '24px 0', maxWidth: '480px' }
const header = { padding: '0 24px' }
const wordmark = {
  fontSize: '20px',
  fontWeight: 'bold' as const,
  color: '#2563eb',
}
const card = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: '12px',
  padding: '24px',
}
const hr = { borderColor: '#e2e8f0', margin: '20px 0' }
const footer = { fontSize: '12px', color: '#94a3b8', padding: '0 24px' }

// Shared inline styles content templates reuse.
export const styles = {
  heading: {
    fontSize: '18px',
    fontWeight: 'bold' as const,
    color: '#0f172a',
    margin: '0 0 8px',
  },
  text: { fontSize: '14px', lineHeight: '22px', color: '#334155' },
  muted: { fontSize: '13px', color: '#64748b' },
  button: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    borderRadius: '8px',
    padding: '10px 20px',
    textDecoration: 'none',
    display: 'inline-block',
  },
}
