// ====================================
// Tests for the safe error page and global error handler
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { Hono } from 'hono'

import { correlationIdMiddleware, CORRELATION_ID_HEADER } from '../src/middleware/correlation-id'
import { handleUnexpectedError, SAFE_ERROR_TESTID } from '../src/routes/build-safe-error'
import type { AppEnv } from '../src/local-types'

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

const SENSITIVE_STACK = 'at /sql/select * from users where id=1'
const SENSITIVE_SERVICE = 'LilyPond responded: ENGRAVE_ERROR raw-source'
const SENSITIVE_PII = 'ada@example.com'
const SENSITIVE_NAME = 'Ada Lovelace'

const buildApp = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>()
  app.use(correlationIdMiddleware)
  app.get('/boom', () => {
    throw new Error(`${SENSITIVE_STACK} | ${SENSITIVE_SERVICE} | ${SENSITIVE_PII} | ${SENSITIVE_NAME}`)
  })
  app.onError((err, c) => handleUnexpectedError(c, err))
  return app
}

describe('safe error page and global error handler', () => {
  let errCap: { lines: string[]; restore: () => void }

  beforeEach(() => {
    errCap = captureConsole('error')
  })
  afterEach(() => {
    errCap.restore()
  })

  it('should render a generic safe message and the correlation identifier', async () => {
    const app = buildApp()
    const res = await app.request('/boom')
    const body = await res.text()
    expect(body).toContain(SAFE_ERROR_TESTID)
    // Generic safe message present
    expect(body).toMatch(/something went wrong|unexpected error|sorry/i)
  })

  it('should not leak stack traces, SQL, service detail, or PII into the response body', async () => {
    const app = buildApp()
    const res = await app.request('/boom')
    const body = await res.text()
    expect(body).not.toContain('select * from users')
    expect(body).not.toContain('ENGRAVE_ERROR')
    expect(body).not.toContain('raw-source')
    expect(body).not.toContain(SENSITIVE_PII)
    expect(body).not.toContain(SENSITIVE_NAME)
    expect(body).not.toContain(SENSITIVE_STACK)
  })

  it('should set the X-Correlation-ID header on the error response', async () => {
    const app = buildApp()
    const res = await app.request('/boom')
    const header = res.headers.get(CORRELATION_ID_HEADER)
    expect(header).not.toBeNull()
    expect(header as string).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('should show the same correlation identifier in the body that is in the header', async () => {
    const app = buildApp()
    const res = await app.request('/boom')
    const header = res.headers.get(CORRELATION_ID_HEADER) as string
    const body = await res.text()
    expect(body).toContain(header)
  })

  it('should log the error with the correlation identifier and no PII or secret values', async () => {
    const app = buildApp()
    const res = await app.request('/boom')
    await res.text()
    const logged = errCap.lines.join('\n')
    const header = res.headers.get(CORRELATION_ID_HEADER) as string
    expect(logged).toContain(header)
    expect(logged).not.toContain(SENSITIVE_PII)
    expect(logged).not.toContain(SENSITIVE_NAME)
    expect(logged).not.toContain('select * from users')
    expect(logged).not.toContain('ENGRAVE_ERROR')
  })
})
