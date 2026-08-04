// ====================================
// Tests for correlation-id middleware
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { Hono } from 'hono'

import { correlationIdMiddleware, CORRELATION_ID_HEADER } from '../src/middleware/correlation-id'
import type { AppEnv } from '../src/local-types'

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const buildApp = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>()
  app.use(correlationIdMiddleware)
  app.get('/echo', (c) => c.json({ correlationId: c.get('correlationId') }))
  return app
}

describe('correlationIdMiddleware', () => {
  it('should set an X-Correlation-ID response header containing a UUID v4', async () => {
    const app = buildApp()
    const res = await app.request('/echo')
    const header = res.headers.get(CORRELATION_ID_HEADER)
    expect(header).not.toBeNull()
    expect(header as string).toMatch(UUID_V4_PATTERN)
  })

  it('should store the same identifier in the Hono context', async () => {
    const app = buildApp()
    const res = await app.request('/echo')
    const header = res.headers.get(CORRELATION_ID_HEADER)
    const body = (await res.json()) as { correlationId: string }
    expect(body.correlationId).toBe(header as string)
    expect(body.correlationId).toMatch(UUID_V4_PATTERN)
  })

  it('should produce different identifiers for two separate requests', async () => {
    const app = buildApp()
    const res1 = await app.request('/echo')
    const res2 = await app.request('/echo')
    const h1 = res1.headers.get(CORRELATION_ID_HEADER)
    const h2 = res2.headers.get(CORRELATION_ID_HEADER)
    expect(h1).not.toBe(h2)
    expect(h1 as string).toMatch(UUID_V4_PATTERN)
    expect(h2 as string).toMatch(UUID_V4_PATTERN)
  })
})
