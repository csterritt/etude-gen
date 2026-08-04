// ====================================
// Tests for correlation-id.ts
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import { generateCorrelationId } from '../src/lib/correlation-id'

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('generateCorrelationId', () => {
  it('should return a string matching the UUID v4 format', () => {
    const id = generateCorrelationId()
    expect(typeof id).toBe('string')
    expect(id).toMatch(UUID_V4_PATTERN)
  })

  it('should return a different identifier on each call', () => {
    const first = generateCorrelationId()
    const second = generateCorrelationId()
    expect(first).not.toBe(second)
    expect(first).toMatch(UUID_V4_PATTERN)
    expect(second).toMatch(UUID_V4_PATTERN)
  })

  it('should produce many unique identifiers in a sequence', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i += 1) {
      ids.add(generateCorrelationId())
    }
    expect(ids.size).toBe(100)
  })
})
