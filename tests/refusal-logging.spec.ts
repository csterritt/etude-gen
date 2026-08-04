// ====================================
// Tests for refusal-logger.ts
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import { logRefusal, REFUSAL_CATEGORIES, type RefusalCategory } from '../src/lib/refusal-logger'

const captureConsole = (
  method: 'log' | 'error' | 'warn',
): { lines: string[]; restore: () => void } => {
  const original = console[method]
  const lines: string[] = []
  console[method] = ((...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(' '))
  }) as typeof original
  return {
    lines,
    restore: () => {
      console[method] = original
    },
  }
}

const FORBIDDEN = {
  userId: 'user-abc-123',
  pieceContent: 'piece-content-xyz',
  lilypondSource: '\\relative c { c d e }',
  grantId: 'grant-999',
  credential: 'super-secret-credential',
}

const buildContext = (category: RefusalCategory) => ({
  category,
  correlationId: '11111111-2222-4333-8444-555555555555',
  // Forbidden fields that must never appear in the emitted line:
  userId: FORBIDDEN.userId,
  pieceContent: FORBIDDEN.pieceContent,
  lilypondSource: FORBIDDEN.lilypondSource,
  grantId: FORBIDDEN.grantId,
  credential: FORBIDDEN.credential,
})

describe('logRefusal - typed categories', () => {
  let cap: { lines: string[]; restore: () => void }

  beforeEach(() => {
    cap = captureConsole('warn')
  })
  afterEach(() => {
    cap.restore()
  })

  it('should expose the four typed refusal categories', () => {
    expect(REFUSAL_CATEGORIES).toContain('lost-lock')
    expect(REFUSAL_CATEGORIES).toContain('stale-operation')
    expect(REFUSAL_CATEGORIES).toContain('stale-epoch')
    expect(REFUSAL_CATEGORIES).toContain('stale-Piece')
  })

  it('should log a lost-lock refusal with the typed category', () => {
    logRefusal(buildContext('lost-lock'))
    const serialized = cap.lines.join('')
    expect(serialized).toContain('lost-lock')
    expect(serialized).toContain('11111111-2222-4333-8444-555555555555')
  })

  it('should log a stale-operation refusal with the typed category', () => {
    logRefusal(buildContext('stale-operation'))
    const serialized = cap.lines.join('')
    expect(serialized).toContain('stale-operation')
  })

  it('should log a stale-epoch refusal with the typed category', () => {
    logRefusal(buildContext('stale-epoch'))
    const serialized = cap.lines.join('')
    expect(serialized).toContain('stale-epoch')
  })

  it('should log a stale-Piece refusal with the typed category', () => {
    logRefusal(buildContext('stale-Piece'))
    const serialized = cap.lines.join('')
    expect(serialized).toContain('stale-Piece')
  })
})

describe('logRefusal - no forbidden fields', () => {
  let cap: { lines: string[]; restore: () => void }

  beforeEach(() => {
    cap = captureConsole('warn')
  })
  afterEach(() => {
    cap.restore()
  })

  const assertNoForbidden = (serialized: string) => {
    expect(serialized).not.toContain(FORBIDDEN.userId)
    expect(serialized).not.toContain(FORBIDDEN.pieceContent)
    expect(serialized).not.toContain(FORBIDDEN.lilypondSource)
    expect(serialized).not.toContain(FORBIDDEN.grantId)
    expect(serialized).not.toContain(FORBIDDEN.credential)
  }

  it('should not leak forbidden fields for lost-lock', () => {
    logRefusal(buildContext('lost-lock'))
    assertNoForbidden(cap.lines.join(''))
  })

  it('should not leak forbidden fields for stale-operation', () => {
    logRefusal(buildContext('stale-operation'))
    assertNoForbidden(cap.lines.join(''))
  })

  it('should not leak forbidden fields for stale-epoch', () => {
    logRefusal(buildContext('stale-epoch'))
    assertNoForbidden(cap.lines.join(''))
  })

  it('should not leak forbidden fields for stale-Piece', () => {
    logRefusal(buildContext('stale-Piece'))
    assertNoForbidden(cap.lines.join(''))
  })

  it('should include the correlation identifier in every refusal log line', () => {
    logRefusal(buildContext('stale-Piece'))
    expect(cap.lines.join('')).toContain('11111111-2222-4333-8444-555555555555')
  })
})
