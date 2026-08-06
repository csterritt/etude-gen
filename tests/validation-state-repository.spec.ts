// ====================================
// Tests for the validation-state store repository.
// Verifies nonce-keyed, owner-scoped, single-use records with a 5-minute
// expiry; opaque nonces that reveal nothing about the payload or owner;
// unknown / expired / foreign-user / already-consumed nonces all yield null
// identically; each documented size bound is enforced by dropping the
// offending field from redisplay rather than truncating it into a different
// value; and a storage failure returns Result.err so the caller can fall back
// to the generic error path without a 500.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { eq } from 'drizzle-orm'
import Result from 'true-myth/result'

import { user, etudeValidationState } from '../src/db/schema'
import type { DrizzleClient } from '../src/local-types'
import {
  storeValidationState,
  consumeValidationState,
  type ValidationStatePayload,
  type FieldError,
} from '../src/lib/validation-state-repository'
import { createTestDb } from './helpers/test-db'

const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.isOk) {
    throw new Error(`Expected Ok, got Err: ${String(result.error)}`)
  }
  return result.value
}

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
 * Read the raw stored row for a nonce so the tests can assert on the
 * physical `expiresAt`/`createdAt` columns without going through the
 * repository's consume path (which deletes the row).
 */
const readRawRow = async (
  db: DrizzleClient,
  nonce: string,
): Promise<{ expiresAt: number; createdAt: number; payload: string } | null> => {
  const rows = await db
    .select()
    .from(etudeValidationState)
    .where(eq(etudeValidationState.nonce, nonce))
    .limit(1)
  if (rows.length === 0) {
    return null
  }
  const row = rows[0]!
  // The `expiresAt` and `createdAt` columns are plain integers (epoch ms),
  // so they come back as numbers, not Date objects.
  return {
    expiresAt: typeof row.expiresAt === 'number' ? row.expiresAt : new Date(row.expiresAt).getTime(),
    createdAt: typeof row.createdAt === 'number' ? row.createdAt : new Date(row.createdAt).getTime(),
    payload: row.payload,
  }
}

const countValidationStateRows = async (db: DrizzleClient, userId: string): Promise<number> => {
  const rows = await db
    .select({ nonce: etudeValidationState.nonce })
    .from(etudeValidationState)
    .where(eq(etudeValidationState.userId, userId))
    .all()
  return rows.length
}

const samplePayload = (overrides: Partial<ValidationStatePayload> = {}): ValidationStatePayload => ({
  safeValues: { measures: '16', meter: '3/4', hands: 'both' },
  fieldErrors: [{ field: 'measures', message: 'Measure count must be a whole number between 4 and 32.' }],
  droppedFields: [],
  ...overrides,
})

describe('storeValidationState', () => {
  it('returns Result.ok with an opaque nonce and persists a record whose expiresAt is ~5 minutes after createdAt', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-a', 'a@example.com')
    const payload = samplePayload()

    const result = await storeValidationState(db, 'user-a', payload)

    expect(result.isOk).toBe(true)
    const nonce = unwrap(result)
    expect(typeof nonce).toBe('string')
    expect(nonce.length).toBeGreaterThan(0)
    // The nonce must not be derived from the payload or user id — it must not
    // contain any submitted value, field name, or user identifier.
    expect(nonce).not.toContain('user-a')
    expect(nonce).not.toContain('measures')
    expect(nonce).not.toContain('16')
    expect(nonce).not.toContain('3/4')

    const raw = await readRawRow(db, nonce)
    expect(raw).not.toBeNull()
    const created = raw!.createdAt
    const expires = raw!.expiresAt
    // 5 minutes = 300_000 ms. Allow a small clock skew window.
    const delta = expires - created
    expect(delta).toBeGreaterThanOrEqual(299_000)
    expect(delta).toBeLessThanOrEqual(301_000)
  })

  it('produces distinct nonces for distinct payloads', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-b', 'b@example.com')

    const a = unwrap(await storeValidationState(db, 'user-b', samplePayload({ safeValues: { measures: '8' } })))
    const b = unwrap(await storeValidationState(db, 'user-b', samplePayload({ safeValues: { measures: '16' } })))

    expect(a).not.toBe(b)
  })
})

describe('consumeValidationState', () => {
  it('returns the stored payload for the matching nonce and owner, then deletes the record so a second consumption returns null', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-c', 'c@example.com')
    const payload = samplePayload()
    const nonce = unwrap(await storeValidationState(db, 'user-c', payload))

    const first = await consumeValidationState(db, nonce, 'user-c')
    expect(first.isOk).toBe(true)
    const firstValue = unwrap(first)
    expect(firstValue).not.toBeNull()
    expect(firstValue!.safeValues.measures).toBe('16')
    expect(firstValue!.fieldErrors.length).toBe(1)
    expect(firstValue!.fieldErrors[0]!.field).toBe('measures')

    // Single-use: a second consumption returns null.
    const second = await consumeValidationState(db, nonce, 'user-c')
    expect(second.isOk).toBe(true)
    expect(unwrap(second)).toBeNull()

    // The row is gone from the database.
    expect(await countValidationStateRows(db, 'user-c')).toBe(0)
  })

  it('returns null for an expired record and is unusable even on first consumption', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-d', 'd@example.com')
    const payload = samplePayload()
    const nonce = unwrap(await storeValidationState(db, 'user-d', payload))

    // Manually backdate the row so it is already expired. The `expiresAt`
    // column is a plain integer (epoch ms), so set a number, not a Date.
    const past = Date.now() - 60_000
    await db
      .update(etudeValidationState)
      .set({ expiresAt: past })
      .where(eq(etudeValidationState.nonce, nonce))
      .run()

    const result = await consumeValidationState(db, nonce, 'user-d')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toBeNull()
  })

  it('returns null and reveals nothing when a nonce stored for user A is presented by user B', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-e', 'e@example.com')
    await insertUser(db, 'user-f', 'f@example.com')
    const payload = samplePayload({ safeValues: { measures: '24', meter: '2/4', hands: 'left' } })
    const nonce = unwrap(await storeValidationState(db, 'user-e', payload))

    const result = await consumeValidationState(db, nonce, 'user-f')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toBeNull()

    // The original owner can still consume it — the foreign presentation did
    // not delete or alter the record.
    const ownerResult = await consumeValidationState(db, nonce, 'user-e')
    expect(ownerResult.isOk).toBe(true)
    const ownerValue = unwrap(ownerResult)
    expect(ownerValue).not.toBeNull()
    expect(ownerValue!.safeValues.measures).toBe('24')
  })

  it('returns null for an unknown nonce', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-g', 'g@example.com')

    const result = await consumeValidationState(db, 'unknown-nonce-that-does-not-exist', 'user-g')
    expect(result.isOk).toBe(true)
    expect(unwrap(result)).toBeNull()
  })
})

describe('storeValidationState size bounds', () => {
  it('drops excess fields (more than 32 entries) rather than truncating them, and keeps the remaining fields', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-h', 'h@example.com')
    // Build 40 single-value fields; only the first 32 should be kept.
    const safeValues: Record<string, string> = {}
    for (let i = 0; i < 40; i++) {
      safeValues[`field-${i}`] = `v-${i}`
    }
    const payload = samplePayload({ safeValues })

    const nonce = unwrap(await storeValidationState(db, 'user-h', payload))
    const consumed = unwrap(await consumeValidationState(db, nonce, 'user-h'))!

    const keptKeys = Object.keys(consumed.safeValues)
    expect(keptKeys.length).toBeLessThanOrEqual(32)
    // The first 32 fields are kept; the excess are dropped (not truncated).
    expect(consumed.safeValues['field-0']).toBe('v-0')
    expect(consumed.safeValues['field-31']).toBe('v-31')
    expect(consumed.safeValues['field-32']).toBeUndefined()
    expect(consumed.safeValues['field-39']).toBeUndefined()
    // The dropped excess fields are reported in droppedFields.
    expect(consumed.droppedFields).toContain('field-32')
    expect(consumed.droppedFields).toContain('field-39')
  })

  it('drops a multi-value field with more than 64 values entirely rather than truncating to 64', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-i', 'i@example.com')
    const big: string[] = []
    for (let i = 0; i < 65; i++) {
      big.push(`octave-${i}`)
    }
    const payload = samplePayload({ safeValues: { octaves: big } })

    const nonce = unwrap(await storeValidationState(db, 'user-i', payload))
    const consumed = unwrap(await consumeValidationState(db, nonce, 'user-i'))!

    // The entire field is dropped — no partial 64-value array.
    expect(consumed.safeValues.octaves).toBeUndefined()
    expect(consumed.droppedFields).toContain('octaves')
  })

  it('keeps a multi-value field with exactly 64 values', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-j', 'j@example.com')
    const ok: string[] = []
    for (let i = 0; i < 64; i++) {
      ok.push(`octave-${i}`)
    }
    const payload = samplePayload({ safeValues: { octaves: ok } })

    const nonce = unwrap(await storeValidationState(db, 'user-j', payload))
    const consumed = unwrap(await consumeValidationState(db, nonce, 'user-j'))!

    expect(Array.isArray(consumed.safeValues.octaves)).toBe(true)
    expect((consumed.safeValues.octaves as string[]).length).toBe(64)
  })

  it('drops a value exceeding 128 bytes rather than truncating it', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-k', 'k@example.com')
    // 129 bytes of ASCII.
    const tooLong = 'x'.repeat(129)
    const payload = samplePayload({ safeValues: { measures: tooLong } })

    const nonce = unwrap(await storeValidationState(db, 'user-k', payload))
    const consumed = unwrap(await consumeValidationState(db, nonce, 'user-k'))!

    // The field is dropped, not truncated to 128 bytes.
    expect(consumed.safeValues.measures).toBeUndefined()
    expect(consumed.droppedFields).toContain('measures')
  })

  it('keeps a value of exactly 128 bytes', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-l', 'l@example.com')
    const ok = 'x'.repeat(128)
    const payload = samplePayload({ safeValues: { measures: ok } })

    const nonce = unwrap(await storeValidationState(db, 'user-l', payload))
    const consumed = unwrap(await consumeValidationState(db, nonce, 'user-l'))!

    expect(consumed.safeValues.measures).toBe(ok)
  })

  it('drops an error message exceeding 256 bytes rather than truncating it', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-m', 'm@example.com')
    const tooLong = 'e'.repeat(257)
    const fieldErrors: FieldError[] = [
      { field: 'measures', message: tooLong },
      { field: 'meter', message: 'short reason' },
    ]
    const payload = samplePayload({ fieldErrors })

    const nonce = unwrap(await storeValidationState(db, 'user-m', payload))
    const consumed = unwrap(await consumeValidationState(db, nonce, 'user-m'))!

    // The over-long error is dropped; the short one is kept.
    const keptFields = consumed.fieldErrors.map((e) => e.field)
    expect(keptFields).not.toContain('measures')
    expect(keptFields).toContain('meter')
  })

  it('drops fields from the end until a total payload exceeding 16 KB is under the limit, never truncating an individual value', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-n', 'n@example.com')
    // Build a payload well over 16 KB using multi-value fields that each
    // pass the per-field bounds (64 values × 128 bytes = 8 KB per field).
    // Three such fields = 24 KB of values, exceeding the 16 KB total bound.
    // The repository must drop whole fields from the end until under the
    // limit, never truncating any single value into a different value.
    const bigArray: string[] = []
    for (let i = 0; i < 64; i++) {
      bigArray.push('y'.repeat(128))
    }
    const safeValues: Record<string, string | string[]> = {
      'keep-first': bigArray.slice(),
      'keep-second': bigArray.slice(),
      'drop-third': bigArray.slice(),
    }
    const payload = samplePayload({ safeValues })

    const nonce = unwrap(await storeValidationState(db, 'user-n', payload))
    const consumed = unwrap(await consumeValidationState(db, nonce, 'user-n'))!

    const keptKeys = Object.keys(consumed.safeValues)
    // The kept redisplay content (safeValues + fieldErrors) must be under 16 KB.
    const redisplayBytes = JSON.stringify({
      safeValues: consumed.safeValues,
      fieldErrors: consumed.fieldErrors,
    }).length
    expect(redisplayBytes).toBeLessThanOrEqual(16 * 1024)
    // No kept value was truncated — each multi-value array still has 64
    // entries of exactly 128 bytes.
    for (const key of keptKeys) {
      const v = consumed.safeValues[key]
      if (Array.isArray(v)) {
        expect(v.length).toBe(64)
        for (const item of v) {
          expect(item.length).toBe(128)
        }
      }
    }
    // The first field is kept; the last (drop-third) is dropped from the end.
    expect(consumed.safeValues['keep-first']).toBeDefined()
    expect(consumed.safeValues['drop-third']).toBeUndefined()
    expect(consumed.droppedFields).toContain('drop-third')
  })
})

describe('storeValidationState storage failure', () => {
  it('returns Result.err on a simulated storage failure so the caller can fall back', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-o', 'o@example.com')
    const payload = samplePayload()

    // Close the underlying SQLite database to simulate a storage failure.
    // The Drizzle client wraps the raw bun:sqlite Database; closing it makes
    // subsequent queries throw.
    const raw = (db as unknown as { $client: { close: () => void } }).$client
    if (raw && typeof raw.close === 'function') {
      raw.close()
    } else {
      // Fallback: throw inside the test by passing a closed-ish handle. If
      // the driver shape differs, skip closing and instead force an error by
      // deleting the table data — but the contract is that any thrown error
      // surfaces as Result.err, so we assert on a deliberately bad call.
    }

    const result = await storeValidationState(db, 'user-o', payload)
    expect(result.isErr).toBe(true)
  })
})
