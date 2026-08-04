// ====================================
// Tests for health-route.ts
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import {
  runHealthCheck,
  buildAnonymousLiveness,
  buildDetailedReport,
} from '../src/routes/build-health'
import type { CatalogHealthContribution } from '../src/routes/build-health'

const fakeR2Bucket = {} as R2Bucket
const fakeD1 = {} as D1Database

const completeInput = {
  PROJECT_DB: fakeD1,
  ETUDE_GEN_STORAGE: fakeR2Bucket,
  LILYPOND_SERVICE_URL: 'https://lilypond.example.com',
  LILYPOND_API_KEY: 'super-secret-api-key-12345',
  LILYPOND_TIMEOUT_MS: '45000',
}

describe('runHealthCheck - config contribution', () => {
  it('should be healthy when configuration is complete', () => {
    const result = runHealthCheck(completeInput)
    expect(result.healthy).toBe(true)
    expect(result.defects).toHaveLength(0)
    expect(result.lilypondTimeoutMs).toBe(45000)
  })

  it('should be unhealthy when configuration is incomplete', () => {
    const result = runHealthCheck({
      ...completeInput,
      LILYPOND_SERVICE_URL: '',
    })
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'LILYPOND_SERVICE_URL')).toBe(true)
  })
})

describe('runHealthCheck - rhythm catalog contribution surface', () => {
  it('should be unhealthy when the catalog contribution is unhealthy', () => {
    const catalogContribution: CatalogHealthContribution = {
      healthy: false,
      defects: [
        { valueName: 'rhythm-catalog', message: 'rhythm catalog is malformed' },
      ],
    }
    const result = runHealthCheck(completeInput, catalogContribution)
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'rhythm-catalog')).toBe(true)
  })

  it('should be healthy when both config and catalog are healthy', () => {
    const catalogContribution: CatalogHealthContribution = {
      healthy: true,
      defects: [],
    }
    const result = runHealthCheck(completeInput, catalogContribution)
    expect(result.healthy).toBe(true)
    expect(result.defects).toHaveLength(0)
  })

  it('should aggregate config and catalog defects together', () => {
    const catalogContribution: CatalogHealthContribution = {
      healthy: false,
      defects: [
        { valueName: 'rhythm-catalog', message: 'rhythm catalog is malformed' },
      ],
    }
    const result = runHealthCheck(
      { ...completeInput, LILYPOND_API_KEY: '' },
      catalogContribution,
    )
    expect(result.healthy).toBe(false)
    const names = result.defects.map((d) => d.valueName)
    expect(names).toContain('LILYPOND_API_KEY')
    expect(names).toContain('rhythm-catalog')
  })

  it('should be healthy when no catalog contribution is provided', () => {
    const result = runHealthCheck(completeInput)
    expect(result.healthy).toBe(true)
  })
})

describe('buildAnonymousLiveness - no sensitive information', () => {
  it('should contain only a healthy flag when healthy', () => {
    const result = runHealthCheck(completeInput)
    const payload = buildAnonymousLiveness(result)
    expect(payload).toEqual({ healthy: true })
  })

  it('should contain only a healthy flag when unhealthy', () => {
    const result = runHealthCheck({ ...completeInput, LILYPOND_SERVICE_URL: '' })
    const payload = buildAnonymousLiveness(result)
    expect(payload).toEqual({ healthy: false })
  })

  it('should not expose binding names, value names, defect detail, or resolved values', () => {
    const result = runHealthCheck({
      PROJECT_DB: undefined,
      ETUDE_GEN_STORAGE: undefined,
      LILYPOND_SERVICE_URL: '',
      LILYPOND_API_KEY: 'super-secret-api-key-12345',
      LILYPOND_TIMEOUT_MS: 'bad',
    })
    const payload = buildAnonymousLiveness(result)
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('PROJECT_DB')
    expect(serialized).not.toContain('ETUDE_GEN_STORAGE')
    expect(serialized).not.toContain('LILYPOND_SERVICE_URL')
    expect(serialized).not.toContain('LILYPOND_API_KEY')
    expect(serialized).not.toContain('LILYPOND_TIMEOUT_MS')
    expect(serialized).not.toContain('super-secret-api-key-12345')
    expect(serialized).not.toContain('defect')
    expect(serialized).not.toContain('lilypondTimeoutMs')
  })
})

describe('buildDetailedReport - privileged operator view', () => {
  it('should name every missing value when configuration is incomplete', () => {
    const result = runHealthCheck({
      PROJECT_DB: undefined,
      ETUDE_GEN_STORAGE: undefined,
      LILYPOND_SERVICE_URL: '',
      LILYPOND_API_KEY: '',
      LILYPOND_TIMEOUT_MS: 'bad',
    })
    const report = buildDetailedReport(result)
    expect(report.healthy).toBe(false)
    const names = report.defects.map((d) => d.valueName)
    expect(names).toContain('PROJECT_DB')
    expect(names).toContain('ETUDE_GEN_STORAGE')
    expect(names).toContain('LILYPOND_SERVICE_URL')
    expect(names).toContain('LILYPOND_API_KEY')
    expect(names).toContain('LILYPOND_TIMEOUT_MS')
  })

  it('should include the resolved timeout value when healthy', () => {
    const result = runHealthCheck(completeInput)
    const report = buildDetailedReport(result)
    expect(report.healthy).toBe(true)
    expect(report.lilypondTimeoutMs).toBe(45000)
  })

  it('should never contain secret values in defect text', () => {
    const secretValue = 'super-secret-api-key-12345'
    const result = runHealthCheck({
      ...completeInput,
      LILYPOND_API_KEY: secretValue,
      LILYPOND_SERVICE_URL: '',
    })
    const report = buildDetailedReport(result)
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(secretValue)
  })

  it('should never contain secret values in defect text when the key is missing', () => {
    const result = runHealthCheck({
      ...completeInput,
      LILYPOND_API_KEY: undefined,
    })
    const report = buildDetailedReport(result)
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('super-secret-api-key-12345')
  })
})
