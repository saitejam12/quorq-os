import { describe, expect, it } from 'vitest'
import {
  isEmploymentType,
  isDeactivationReason,
  isTemplateCategory,
  templateToPosting,
} from './postings'

describe('employment type guard', () => {
  it('accepts the two valid types', () => {
    expect(isEmploymentType('full-time')).toBe(true)
    expect(isEmploymentType('contract')).toBe(true)
  })
  it('rejects anything else', () => {
    expect(isEmploymentType('part-time')).toBe(false)
    expect(isEmploymentType('')).toBe(false)
  })
})

describe('template category guard', () => {
  it('accepts known categories', () => {
    expect(isTemplateCategory('tech')).toBe(true)
    expect(isTemplateCategory('others')).toBe(true)
  })
  it('rejects unknown categories', () => {
    expect(isTemplateCategory('design')).toBe(false)
  })
})

describe('deactivation reason guard', () => {
  it('accepts a known reason', () => {
    expect(isDeactivationReason('Position filled')).toBe(true)
  })
  it('rejects an unknown reason', () => {
    expect(isDeactivationReason('Because')).toBe(false)
  })
})

describe('templateToPosting', () => {
  const template = {
    id: 3,
    title: 'Senior Software Engineer',
    category: 'tech',
    description: 'Build and own backend services.',
  }

  it('takes role, category and JD text from the template', () => {
    const row = templateToPosting(template, {
      department: 'Engineering',
      location: 'Remote',
      employmentType: 'contract',
    })
    expect(row).toEqual({
      role: 'Senior Software Engineer',
      department: 'Engineering',
      location: 'Remote',
      employmentType: 'contract',
      category: 'tech',
      description: 'Build and own backend services.',
      templateId: 3,
    })
  })
})
