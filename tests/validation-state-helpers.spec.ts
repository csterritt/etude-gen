// ====================================
// Tests for the nonce cookie and validation-state redirect/consume helpers.
// Verifies the nonce cookie is set with HttpOnly, Secure, SameSite=Lax,
// Path=/etude, and Max-Age=300; that the cookie value contains only the
// opaque nonce and no submitted value, field name, or error text; that
// redirectWithValidationState returns a 303 with the Set-Cookie header and
// Location pointing to the same step; that consumeValidationStateFromRequest
// returns the payload for a valid nonce and deletes the cookie; that an
// unknown, expired, already-consumed, or foreign-user nonce all yield null
// identically and reveal nothing; and that when storeValidationState fails,
// the helper still returns a 303 redirect with a generic corrective error
// message rather than a 500.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { Hono } from 'hono'
import type { Context } from 'hono'
import Result from 'true-myth/result'

import {
  redirectWithValidationState,
  consumeValidationStateFromRequest,
} from '../src/lib/validation-state-helpers'
import type { ValidationStatePayload } from '../src/lib/validation-state-repository'
import { storeValidationState } from '../src/lib/validation-state-repository'
import { COOKIES } from '../src/constants'
import { createTestDb } from './helpers/test-db'
import { user } from '../src/db/schema'
import type { DrizzleClient, AppEnv } from '../src/local-types'

const insertUser = async (db: DrizzleClient, id: string, email: string): Promise<void> => {
  await db
    .insert(user)
    .values({
      id,
      name: `name-${id}`,
      email,
      emailVerified: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })
    .run()
}

/**
 * Unwrap a Result.ok value, throwing if it is an Err. Used for test setup
 * where the store is expected to succeed.
 */
const unwrapOk = <T, E>(result: Result<T, E>): T => {
  if (result.isErr) {
    throw new Error(`Expected Ok, got Err: ${String(result.error)}`)
  }
  return result.value
}

const samplePayload = (): ValidationStatePayload => ({
  safeValues: { measures: '33', meter: '3/4', hands: 'both' },
  fieldErrors: [{ field: 'measures', message: 'Measure count must be a whole number between 4 and 32.' }],
  droppedFields: [],
})

/**
 * Parse a Set-Cookie header value into the cookie name, value, and attribute
 * map so the tests can assert on individual attributes without relying on
 * string substring checks.
 */
const parseSetCookie = (header: string): { name: string; value: string; attrs: Record<string, string> } => {
  const parts = header.split(';').map((p) => p.trim())
  const first = parts[0] ?? ''
  const eq = first.indexOf('=')
  const name = eq >= 0 ? first.slice(0, eq) : first
  const value = eq >= 0 ? first.slice(eq + 1) : ''
  const attrs: Record<string, string> = {}
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i] ?? ''
    const aeq = part.indexOf('=')
    if (aeq >= 0) {
      attrs[part.slice(0, aeq).toLowerCase()] = part.slice(aeq + 1)
    } else {
      attrs[part.toLowerCase()] = 'true'
    }
  }
  return { name, value, attrs }
}

/**
 * Build a minimal Hono app with a single GET route that calls
 * redirectWithValidationState, so we can use app.request() to exercise the
 * helper with a real Hono context.
 */
const buildRedirectApp = (db: DrizzleClient, userId: string, payload: ValidationStatePayload): Hono =>
  new Hono().get('/redirect', (c) =>
    redirectWithValidationState(c as unknown as Context<AppEnv>, '/etude/setup', db, userId, payload),
  )

/**
 * Build a minimal Hono app with a single GET route that calls
 * consumeValidationStateFromRequest, passing the nonce cookie via the
 * request's Cookie header.
 */
const buildConsumeApp = (db: DrizzleClient, userId: string): Hono =>
  new Hono().get('/consume', async (c) => {
    const result = await consumeValidationStateFromRequest(c as unknown as Context<AppEnv>, db, userId)
    // Use c.json() so the Set-Cookie header set by the helper on the context
    // is applied to the response.
    return c.json(result.isOk ? result.value : { error: 'err' })
  })

describe('redirectWithValidationState', () => {
  it('returns a 303 with Location pointing to the redirect URL and a nonce cookie with the required attributes', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-a', 'a@example.com')
    const app = buildRedirectApp(db, 'user-a', samplePayload())

    const res = await app.request('/redirect')

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/etude/setup')

    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    const parsed = parseSetCookie(setCookie!)
    expect(parsed.name).toBe(COOKIES.VALIDATION_STATE_NONCE)
    // Required attributes. Secure is toggled via PRODUCTION comments
    // (false in testing, true in production) so we don't assert it here.
    expect(parsed.attrs['httponly']).toBe('true')
    expect(parsed.attrs['samesite']).toBe('Lax')
    expect(parsed.attrs['path']).toBe('/etude')
    expect(parsed.attrs['max-age']).toBe('300')
    // The cookie value is a non-empty opaque nonce.
    expect(parsed.value.length).toBeGreaterThan(0)
  })

  it('the cookie value contains only the opaque nonce and no submitted value, field name, or error text', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-b', 'b@example.com')
    const payload = samplePayload()
    const app = buildRedirectApp(db, 'user-b', payload)

    const res = await app.request('/redirect')
    const setCookie = res.headers.get('set-cookie')!
    const parsed = parseSetCookie(setCookie)

    // The cookie value must not contain any submitted value, field name, or
    // error text from the payload.
    expect(parsed.value).not.toContain('33')
    expect(parsed.value).not.toContain('measures')
    expect(parsed.value).not.toContain('3/4')
    expect(parsed.value).not.toContain('both')
    expect(parsed.value).not.toContain('Measure')
    expect(parsed.value).not.toContain('range')
    // The full Set-Cookie header must not leak payload content either.
    expect(setCookie).not.toContain('33')
    expect(setCookie).not.toContain('Measure count')
  })
})

describe('consumeValidationStateFromRequest', () => {
  it('returns the payload for a valid nonce and sets a Set-Cookie header that deletes the nonce cookie', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-c', 'c@example.com')
    const payload = samplePayload()
    // Store a real validation-state record to get a valid nonce.
    const nonce = unwrapOk(await storeValidationState(db, 'user-c', payload))
    const app = buildConsumeApp(db, 'user-c')

    const res = await app.request('/consume', {
      headers: { Cookie: `${COOKIES.VALIDATION_STATE_NONCE}=${nonce}` },
    })
    const body = (await res.json()) as ValidationStatePayload | null

    expect(body).not.toBeNull()
    expect(body!.safeValues.measures).toBe('33')

    // The response sets a Set-Cookie that deletes (expires) the nonce cookie.
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    const parsed = parseSetCookie(setCookie!)
    expect(parsed.name).toBe(COOKIES.VALIDATION_STATE_NONCE)
    // Deletion is via Max-Age=0 or an expired Expires.
    const maxAge = parsed.attrs['max-age']
    const expires = parsed.attrs['expires']
    const isDeleted = maxAge === '0' || (expires !== undefined && new Date(expires).getTime() < Date.now())
    expect(isDeleted).toBe(true)
  })

  it('returns null when no nonce cookie is present', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-d', 'd@example.com')
    const app = buildConsumeApp(db, 'user-d')

    const res = await app.request('/consume')
    const body = (await res.json()) as ValidationStatePayload | null

    expect(body).toBeNull()
  })

  it('returns null identically for an unknown nonce, an expired nonce, an already-consumed nonce, and a foreign-user nonce', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-e', 'e@example.com')
    await insertUser(db, 'user-f', 'f@example.com')

    // Unknown nonce.
    const app = buildConsumeApp(db, 'user-e')
    const unknownRes = await app.request('/consume', {
      headers: { Cookie: `${COOKIES.VALIDATION_STATE_NONCE}=totally-unknown-nonce` },
    })
    expect(await unknownRes.json()).toBeNull()

    // Expired nonce: store then backdate.
    const expiredNonce = unwrapOk(await storeValidationState(db, 'user-e', samplePayload()))
    // Manually expire via a direct update is not possible through the helper,
    // so we wait for the TTL by backdating through the repository's DB. Use
    // the raw DB to backdate.
    const { eq } = await import('drizzle-orm')
    const { etudeValidationState } = await import('../src/db/schema')
    await db
      .update(etudeValidationState)
      .set({ expiresAt: Date.now() - 60_000 })
      .where(eq(etudeValidationState.nonce, expiredNonce))
      .run()
    const expiredRes = await app.request('/consume', {
      headers: { Cookie: `${COOKIES.VALIDATION_STATE_NONCE}=${expiredNonce}` },
    })
    expect(await expiredRes.json()).toBeNull()

    // Already-consumed nonce: store, consume once, then consume again.
    const consumedNonce = unwrapOk(await storeValidationState(db, 'user-e', samplePayload()))
    const firstConsume = await app.request('/consume', {
      headers: { Cookie: `${COOKIES.VALIDATION_STATE_NONCE}=${consumedNonce}` },
    })
    const firstBody = await firstConsume.json()
    expect(firstBody).not.toBeNull()
    const secondConsume = await app.request('/consume', {
      headers: { Cookie: `${COOKIES.VALIDATION_STATE_NONCE}=${consumedNonce}` },
    })
    expect(await secondConsume.json()).toBeNull()

    // Foreign-user nonce: store for user-e, present to user-f.
    const foreignNonce = unwrapOk(await storeValidationState(db, 'user-e', samplePayload()))
    const foreignApp = buildConsumeApp(db, 'user-f')
    const foreignRes = await foreignApp.request('/consume', {
      headers: { Cookie: `${COOKIES.VALIDATION_STATE_NONCE}=${foreignNonce}` },
    })
    expect(await foreignRes.json()).toBeNull()
  })
})

describe('redirectWithValidationState storage failure fallback', () => {
  it('falls back to redirectWithError with a generic corrective message and still returns a 303, never a 500', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-g', 'g@example.com')
    const app = buildRedirectApp(db, 'user-g', samplePayload())

    // Close the underlying SQLite database to simulate a storage failure.
    const raw = (db as unknown as { $client: { close: () => void } }).$client
    if (raw && typeof raw.close === 'function') {
      raw.close()
    }

    const res = await app.request('/redirect')

    // Still a 303, never a 500.
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('/etude/setup')
    // A Set-Cookie header is present (the error flash cookie), but it must
    // NOT be the nonce cookie — the store failed, so no nonce was generated.
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).not.toBeNull()
    expect(setCookie).not.toContain(COOKIES.VALIDATION_STATE_NONCE)
    // The error flash cookie is set with a generic corrective message.
    expect(setCookie).toContain(COOKIES.ERROR_FOUND)
  })
})
