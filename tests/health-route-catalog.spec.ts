// ====================================
// Tests for the rhythm-catalog contribution to the health check.
// Verifies that the health route builds a CatalogHealthContribution from
// the packaged catalog via the parser: a healthy packaged catalog
// contributes a healthy contribution; a corrupted catalog makes the
// aggregate health result unhealthy with defects naming the offending
// meter and line; catalog defects and configuration defects aggregate
// together in the detailed report; and the anonymous liveness payload
// still carries only the healthy flag and leaks no defect detail, meter
// name, or line number.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import {
  buildCatalogHealthContribution,
} from '../src/routes/build-health'
import { runHealthCheck, buildAnonymousLiveness, buildDetailedReport } from '../src/routes/build-health'

const fakeR2Bucket = {} as R2Bucket
const fakeD1 = {} as D1Database

const completeInput = {
  PROJECT_DB: fakeD1,
  ETUDE_GEN_STORAGE: fakeR2Bucket,
  LILYPOND_SERVICE_URL: 'https://lilypond.example.com',
  LILYPOND_API_KEY: 'super-secret-api-key-12345',
  LILYPOND_TIMEOUT_MS: '45000',
}

const VALID_CATALOG = ['2/4', 'QQ', 'ER', 'H', '3/4', 'QQQ', 'D', '4/4', 'QQQQ', 'W'].join('\n')

// A corrupted catalog: a wrong-length pattern under 2/4 on line 2.
const CORRUPTED_CATALOG = ['2/4', 'Q', '3/4', 'QQQ', '4/4', 'QQQQ'].join('\n')

describe('buildCatalogHealthContribution - healthy catalog', () => {
  it('builds a healthy contribution from a valid packaged catalog', () => {
    const contribution = buildCatalogHealthContribution(VALID_CATALOG)
    expect(contribution.healthy).toBe(true)
    expect(contribution.defects).toHaveLength(0)
  })
})

describe('buildCatalogHealthContribution - corrupted catalog', () => {
  it('builds an unhealthy contribution from a corrupted catalog', () => {
    const contribution = buildCatalogHealthContribution(CORRUPTED_CATALOG)
    expect(contribution.healthy).toBe(false)
    expect(contribution.defects.length).toBeGreaterThan(0)
  })

  it('names the offending meter and line in the catalog defect message', () => {
    const contribution = buildCatalogHealthContribution(CORRUPTED_CATALOG)
    const defect = contribution.defects.find((d) => d.valueName === 'rhythm-catalog')
    expect(defect).toBeDefined()
    expect(defect?.message).toContain('2/4')
    expect(defect?.message).toContain('2')
  })
})

describe('runHealthCheck - catalog contribution from the packaged catalog', () => {
  it('is healthy when config and the packaged catalog are both healthy', () => {
    const contribution = buildCatalogHealthContribution(VALID_CATALOG)
    const result = runHealthCheck(completeInput, contribution)
    expect(result.healthy).toBe(true)
    expect(result.defects).toHaveLength(0)
  })

  it('is unhealthy when the packaged catalog is corrupted', () => {
    const contribution = buildCatalogHealthContribution(CORRUPTED_CATALOG)
    const result = runHealthCheck(completeInput, contribution)
    expect(result.healthy).toBe(false)
    expect(result.defects.some((d) => d.valueName === 'rhythm-catalog')).toBe(true)
  })

  it('aggregates catalog defects and configuration defects together', () => {
    const contribution = buildCatalogHealthContribution(CORRUPTED_CATALOG)
    const result = runHealthCheck({ ...completeInput, LILYPOND_API_KEY: '' }, contribution)
    expect(result.healthy).toBe(false)
    const names = result.defects.map((d) => d.valueName)
    expect(names).toContain('LILYPOND_API_KEY')
    expect(names).toContain('rhythm-catalog')
  })
})

describe('anonymous liveness - no catalog defect detail leaks', () => {
  it('carries only the healthy flag when the catalog is corrupted', () => {
    const contribution = buildCatalogHealthContribution(CORRUPTED_CATALOG)
    const result = runHealthCheck(completeInput, contribution)
    const payload = buildAnonymousLiveness(result)
    expect(payload).toEqual({ healthy: false })
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('rhythm-catalog')
    expect(serialized).not.toContain('2/4')
    expect(serialized).not.toContain('defect')
  })
})

describe('detailed report - catalog defects named without secret values', () => {
  it('names the catalog defect and the offending meter and line', () => {
    const contribution = buildCatalogHealthContribution(CORRUPTED_CATALOG)
    const result = runHealthCheck(completeInput, contribution)
    const report = buildDetailedReport(result)
    const defect = report.defects.find((d) => d.valueName === 'rhythm-catalog')
    expect(defect).toBeDefined()
    expect(defect?.message).toContain('2/4')
    expect(defect?.message).toContain('2')
  })

  it('never contains secret values alongside catalog defects', () => {
    const secretValue = 'super-secret-api-key-12345'
    const contribution = buildCatalogHealthContribution(CORRUPTED_CATALOG)
    const result = runHealthCheck(
      { ...completeInput, LILYPOND_API_KEY: secretValue, LILYPOND_SERVICE_URL: '' },
      contribution,
    )
    const report = buildDetailedReport(result)
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(secretValue)
    expect(serialized).toContain('rhythm-catalog')
  })
})
