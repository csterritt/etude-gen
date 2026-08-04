// ====================================
// Tests for logger.ts redaction and correlation passthrough
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import { logInfo, logError, logWarn, logRoutineSuccess } from '../src/lib/logger'

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

describe('logInfo - sensitive field redaction', () => {
  let cap: { lines: string[]; restore: () => void }

  beforeEach(() => {
    cap = captureConsole('log')
  })
  afterEach(() => {
    cap.restore()
  })

  it('should redact a name field', () => {
    logInfo('event', { name: 'Ada Lovelace' })
    const serialized = cap.lines.join('')
    expect(serialized).not.toContain('Ada Lovelace')
    expect(serialized).toContain('[REDACTED]')
  })

  it('should redact an email field', () => {
    logInfo('event', { email: 'ada@example.com' })
    const serialized = cap.lines.join('')
    expect(serialized).not.toContain('ada@example.com')
  })

  it('should redact a session value field', () => {
    logInfo('event', { session: 'sess-12345', sessionToken: 'tok-67890' })
    const serialized = cap.lines.join('')
    expect(serialized).not.toContain('sess-12345')
    expect(serialized).not.toContain('tok-67890')
  })

  it('should redact a Bearer authorization value', () => {
    logInfo('event', { authorization: 'Bearer abc123' })
    const serialized = cap.lines.join('')
    expect(serialized).not.toContain('Bearer abc123')
    expect(serialized).not.toContain('abc123')
  })

  it('should redact a secret/api key field', () => {
    logInfo('event', { apiKey: 'super-secret-api-key-12345', secret: 'hush' })
    const serialized = cap.lines.join('')
    expect(serialized).not.toContain('super-secret-api-key-12345')
    expect(serialized).not.toContain('hush')
  })

  it('should redact service credentials', () => {
    logInfo('event', { serviceCredential: 'svc-cred-xyz', credential: 'cred-xyz' })
    const serialized = cap.lines.join('')
    expect(serialized).not.toContain('svc-cred-xyz')
    expect(serialized).not.toContain('cred-xyz')
  })

  it('should redact a LilyPond request body field', () => {
    logInfo('event', { lilypondBody: '\\relative c { c d e f }', lilypondRequest: 'raw-source' })
    const serialized = cap.lines.join('')
    expect(serialized).not.toContain('\\relative c { c d e f }')
    expect(serialized).not.toContain('raw-source')
  })

  it('should preserve non-sensitive fields', () => {
    logInfo('event', { measureCount: 8, key: 'C major' })
    const serialized = cap.lines.join('')
    expect(serialized).toContain('"measureCount":8')
    // 'key' is a sensitive keyword, so it should be redacted
    expect(serialized).not.toContain('C major')
  })
})

describe('logInfo - correlation identifier passthrough', () => {
  let cap: { lines: string[]; restore: () => void }

  beforeEach(() => {
    cap = captureConsole('log')
  })
  afterEach(() => {
    cap.restore()
  })

  it('should include a correlationId verbatim in the emitted line', () => {
    const id = '11111111-2222-4333-8444-555555555555'
    logInfo('event', { correlationId: id, measureCount: 4 })
    const serialized = cap.lines.join('')
    expect(serialized).toContain(id)
    expect(serialized).toContain('"measureCount":4')
  })

  it('should not redact the correlationId field', () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
    logInfo('event', { correlationId: id })
    const serialized = cap.lines.join('')
    expect(serialized).toContain(id)
    expect(serialized).not.toContain('[REDACTED]')
  })
})

describe('logError and logWarn - redaction and correlation', () => {
  it('logError should redact sensitive fields and include correlationId', () => {
    const cap = captureConsole('error')
    try {
      const id = '11111111-2222-4333-8444-555555555555'
      logError('boom', { correlationId: id, email: 'ada@example.com', secret: 'hush' })
      const serialized = cap.lines.join('')
      expect(serialized).toContain(id)
      expect(serialized).not.toContain('ada@example.com')
      expect(serialized).not.toContain('hush')
    } finally {
      cap.restore()
    }
  })

  it('logWarn should redact sensitive fields and include correlationId', () => {
    const cap = captureConsole('warn')
    try {
      const id = '22222222-3333-4444-9555-666666666666'
      logWarn('careful', { correlationId: id, name: 'Ada Lovelace', lilypondBody: 'src' })
      const serialized = cap.lines.join('')
      expect(serialized).toContain(id)
      expect(serialized).not.toContain('Ada Lovelace')
      expect(serialized).not.toContain('src')
    } finally {
      cap.restore()
    }
  })
})

describe('logRoutineSuccess - no log line for routine success', () => {
  it('should emit no console line', () => {
    const logCap = captureConsole('log')
    const errCap = captureConsole('error')
    const warnCap = captureConsole('warn')
    try {
      logRoutineSuccess({ correlationId: '11111111-2222-4333-8444-555555555555' })
      expect(logCap.lines.length).toBe(0)
      expect(errCap.lines.length).toBe(0)
      expect(warnCap.lines.length).toBe(0)
    } finally {
      logCap.restore()
      errCap.restore()
      warnCap.restore()
    }
  })

  it('should be a no-op that returns nothing', () => {
    const result = logRoutineSuccess({ correlationId: 'x' })
    expect(result).toBeUndefined()
  })
})
