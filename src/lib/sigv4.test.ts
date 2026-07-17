import { describe, expect, it } from 'vitest'
import { signRequest } from './sigv4'

// AWS SigV4 test-suite vectors (aws-sig-v4-test-suite): AKIDEXAMPLE key,
// service `service`, region us-east-1, 2015-08-30T12:36:00Z, empty body.
const BASE = {
  region: 'us-east-1',
  service: 'service',
  body: '',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  timestamp: new Date('2015-08-30T12:36:00Z'),
}

describe('signRequest (AWS SigV4 vectors)', () => {
  it('matches get-vanilla', async () => {
    const headers = await signRequest({
      ...BASE,
      method: 'GET',
      url: 'https://example.amazonaws.com/',
    })
    expect(headers['x-amz-date']).toBe('20150830T123600Z')
    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, ' +
        'SignedHeaders=host;x-amz-date, ' +
        'Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    )
  })

  it('matches post-vanilla', async () => {
    const headers = await signRequest({
      ...BASE,
      method: 'POST',
      url: 'https://example.amazonaws.com/',
    })
    expect(headers.Authorization).toContain(
      'Signature=5da7c1a2acd57cee7505fc6676e4e544621c30862966e37dddb68e92efbe5d6b',
    )
  })

  it('includes x-amz-security-token in signed headers when a session token is given', async () => {
    const headers = await signRequest({
      ...BASE,
      method: 'POST',
      url: 'https://example.amazonaws.com/',
      sessionToken: 'FQoGZXIvYXdzECMPLE',
    })
    expect(headers['x-amz-security-token']).toBe('FQoGZXIvYXdzECMPLE')
    expect(headers.Authorization).toContain(
      'SignedHeaders=host;x-amz-date;x-amz-security-token',
    )
  })
})
