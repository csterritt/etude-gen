// ====================================
// Tests for config-validator.ts
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { validateEtudeConfig } from '../src/lib/config-validator'

/**
 * A fake R2 bucket reference used in place of a real Cloudflare binding.
 */
const fakeR2Bucket = {} as R2Bucket

/**
 * A fake D1 database reference used in place of a real Cloudflare binding.
 */
const fakeD1 = {} as D1Database

/**
 * A complete, valid configuration input shaped like the etude Bindings.
 */
const completeInput = {
  PROJECT_DB: fakeD1,
  ETUDE_GEN_STORAGE: fakeR2Bucket,
  LILYPOND_SERVICE_URL: 'https://lilypond.example.com',
  LILYPOND_API_KEY: 'secret-api-key-value',
  LILYPOND_TIMEOUT_MS: '45000',
  ETUDE_GENERATION_RELEASED: '',
}

describe('validateEtudeConfig - complete configuration', () => {
  it('should pass when every required value is present and valid', () => {
    const result = validateEtudeConfig(completeInput)
    expect(result.healthy).toBe(true)
    expect(result.defects).toHaveLength(0)
    expect(result.lilypondTimeoutMs).toBe(45000)
  })

  it('should include the resolved timeout value in the result', () => {
    const result = validateEtudeConfig(completeInput)
    expect(result.lilypondTimeoutMs).toBe(45000)
  })
})

describe('validateEtudeConfig - missing required values', () => {
  it('should fail and name LILYPOND_SERVICE_URL when it is missing', () => {
    const { LILYPOND_SERVICE_URL: _removed, ...rest } = completeInput
    const result = validateEtudeConfig(rest)
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'LILYPOND_SERVICE_URL')).toBe(true)
  })

  it('should fail and name LILYPOND_SERVICE_URL when it is an empty string', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      LILYPOND_SERVICE_URL: '',
    })
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'LILYPOND_SERVICE_URL')).toBe(true)
  })

  it('should fail and name LILYPOND_API_KEY when it is missing', () => {
    const { LILYPOND_API_KEY: _removed, ...rest } = completeInput
    const result = validateEtudeConfig(rest)
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'LILYPOND_API_KEY')).toBe(true)
  })

  it('should fail and name LILYPOND_API_KEY when it is an empty string', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      LILYPOND_API_KEY: '',
    })
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'LILYPOND_API_KEY')).toBe(true)
  })

  it('should fail and name PROJECT_DB when the D1 binding is missing', () => {
    const { PROJECT_DB: _removed, ...rest } = completeInput
    const result = validateEtudeConfig(rest)
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'PROJECT_DB')).toBe(true)
  })

  it('should fail and name ETUDE_GEN_STORAGE when the R2 binding is missing', () => {
    const { ETUDE_GEN_STORAGE: _removed, ...rest } = completeInput
    const result = validateEtudeConfig(rest)
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'ETUDE_GEN_STORAGE')).toBe(true)
  })
})

describe('validateEtudeConfig - LILYPOND_TIMEOUT_MS validation', () => {
  it('should default to 30,000 milliseconds when LILYPOND_TIMEOUT_MS is absent', () => {
    const { LILYPOND_TIMEOUT_MS: _removed, ...rest } = completeInput
    const result = validateEtudeConfig(rest)
    expect(result.healthy).toBe(true)
    expect(result.lilypondTimeoutMs).toBe(30000)
  })

  it('should fail when LILYPOND_TIMEOUT_MS is non-numeric', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      LILYPOND_TIMEOUT_MS: 'not-a-number',
    })
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'LILYPOND_TIMEOUT_MS')).toBe(true)
  })

  it('should fail when LILYPOND_TIMEOUT_MS is zero', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      LILYPOND_TIMEOUT_MS: '0',
    })
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'LILYPOND_TIMEOUT_MS')).toBe(true)
  })

  it('should fail when LILYPOND_TIMEOUT_MS is negative', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      LILYPOND_TIMEOUT_MS: '-1000',
    })
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'LILYPOND_TIMEOUT_MS')).toBe(true)
  })

  it('should pass when LILYPOND_TIMEOUT_MS is a positive number', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      LILYPOND_TIMEOUT_MS: '60000',
    })
    expect(result.healthy).toBe(true)
    expect(result.lilypondTimeoutMs).toBe(60000)
  })
})

describe('validateEtudeConfig - aggregate defect reporting', () => {
  it('should report every defect together, not just the first one', () => {
    const result = validateEtudeConfig({
      PROJECT_DB: undefined,
      ETUDE_GEN_STORAGE: undefined,
      LILYPOND_SERVICE_URL: '',
      LILYPOND_API_KEY: '',
      LILYPOND_TIMEOUT_MS: 'bad',
    })
    expect(result.healthy).toBe(false)
    expect(result.defects.length).toBeGreaterThanOrEqual(5)
    const names = result.defects.map((d) => d.valueName)
    expect(names).toContain('PROJECT_DB')
    expect(names).toContain('ETUDE_GEN_STORAGE')
    expect(names).toContain('LILYPOND_SERVICE_URL')
    expect(names).toContain('LILYPOND_API_KEY')
    expect(names).toContain('LILYPOND_TIMEOUT_MS')
  })
})

describe('validateEtudeConfig - no secret values in output', () => {
  it('should never include the API key value in any defect text', () => {
    const secretValue = 'super-secret-api-key-12345'
    const result = validateEtudeConfig({
      ...completeInput,
      LILYPOND_API_KEY: secretValue,
      LILYPOND_SERVICE_URL: '',
    })
    expect(result.healthy).toBe(false)
    for (const defect of result.defects) {
      expect(defect.message).not.toContain(secretValue)
    }
  })

  it('should never include the API key value in any defect text when the key itself is missing', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      LILYPOND_API_KEY: undefined,
    })
    expect(result.healthy).toBe(false)
    for (const defect of result.defects) {
      expect(defect.message).not.toContain('secret-api-key-value')
    }
  })
})

describe('validateEtudeConfig - ETUDE_GENERATION_RELEASED flag', () => {
  it('should expose a resolved generationReleased boolean on the result', () => {
    const result = validateEtudeConfig(completeInput)
    expect(typeof result.generationReleased).toBe('boolean')
  })

  it('should resolve to not-released when ETUDE_GENERATION_RELEASED is absent', () => {
    const { ETUDE_GENERATION_RELEASED: _removed, ...rest } = completeInput
    const result = validateEtudeConfig(rest)
    expect(result.generationReleased).toBe(false)
  })

  it('should resolve to released when ETUDE_GENERATION_RELEASED is the literal "true"', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      ETUDE_GENERATION_RELEASED: 'true',
    })
    expect(result.generationReleased).toBe(true)
  })

  it('should resolve to not-released when ETUDE_GENERATION_RELEASED is "false"', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      ETUDE_GENERATION_RELEASED: 'false',
    })
    expect(result.generationReleased).toBe(false)
  })

  it('should resolve to not-released when ETUDE_GENERATION_RELEASED is an empty string', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      ETUDE_GENERATION_RELEASED: '',
    })
    expect(result.generationReleased).toBe(false)
  })

  it('should resolve to not-released when ETUDE_GENERATION_RELEASED is garbage', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      ETUDE_GENERATION_RELEASED: 'yes-please',
    })
    expect(result.generationReleased).toBe(false)
  })

  it('should not produce a defect when ETUDE_GENERATION_RELEASED is absent (absence is a valid not-released state)', () => {
    const { ETUDE_GENERATION_RELEASED: _removed, ...rest } = completeInput
    const result = validateEtudeConfig(rest)
    expect(result.healthy).toBe(true)
    expect(result.defects.some((d) => d.valueName === 'ETUDE_GENERATION_RELEASED')).toBe(false)
  })

  it('should not produce a defect when ETUDE_GENERATION_RELEASED is "false"', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      ETUDE_GENERATION_RELEASED: 'false',
    })
    expect(result.healthy).toBe(true)
    expect(result.defects.some((d) => d.valueName === 'ETUDE_GENERATION_RELEASED')).toBe(false)
  })

  it('should not leak any secret value in the resolved flag payload', () => {
    const result = validateEtudeConfig({
      ...completeInput,
      ETUDE_GENERATION_RELEASED: 'true',
    })
    const payload = JSON.stringify(result)
    expect(payload).not.toContain('secret-api-key-value')
  })
})
