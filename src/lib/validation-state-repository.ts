/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You may obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Validation-state store repository.
 *
 * Persists a short-lived, single-use, owner-scoped record keyed by an opaque
 * cryptographically random nonce. The record carries the safe redisplay
 * values and field-level errors for an invalid form submission between the
 * POST (which rejects and stores) and the GET (which consumes and
 * redisplays).
 *
 * The nonce is opaque — it is not derived from the payload or the user id, so
 * the client-side cookie reveals nothing about the submitted values, field
 * names, or error text. Consumption is single-use: a successful consume
 * deletes the row, so a second presentation of the same nonce yields `null`
 * identically to an unknown, expired, or foreign-user nonce. All three
 * "negative" cases are indistinguishable from the caller's perspective so no
 * information leaks about which case occurred.
 *
 * Each documented size bound is enforced here as a drop, never a truncation:
 * an offending field is removed from redisplay entirely (and its name added
 * to `droppedFields`) rather than being cut into a different value. The
 * caller (the GET handler) redisplays dropped fields from the committed
 * aggregate instead.
 *
 * Storage failures surface as `Result.err` so the caller can fall back to the
 * generic corrective error path without producing a 500.
 * @module lib/validation-state-repository
 */
import { eq, and } from 'drizzle-orm'
import Result from 'true-myth/result'

import { etudeValidationState } from '../db/schema'
import type { DrizzleClient } from '../local-types'
import { withRetry } from './db-access'
import {
  shapeRedisplayPayload,
  type RedisplayPayload,
} from './safe-redisplay'

/**
 * Time-to-live for a validation-state record: 5 minutes after creation. An
 * expired record is unusable and indistinguishable from an unknown one.
 */
export const VALIDATION_STATE_TTL_MS = 5 * 60 * 1000

// Re-export the bound constants and the FieldError type from the
// safe-redisplay module so they are defined in one place. The repository
// applies the same bounds via `shapeRedisplayPayload` before persisting.
export {
  MAX_FIELD_ENTRIES,
  MAX_VALUES_PER_FIELD,
  MAX_VALUE_BYTES,
  MAX_ERROR_BYTES,
  MAX_TOTAL_BYTES,
} from './safe-redisplay'
export type { FieldError } from './safe-redisplay'

/**
 * The redisplay payload persisted between the POST rejection and the GET
 * redisplay. `safeValues` are the string/string[] values that passed
 * shaping; `fieldErrors` are the field-addressable failures; `droppedFields`
 * names the fields that were removed by a bound and must be redisplayed from
 * the committed aggregate instead.
 */
export interface ValidationStatePayload extends RedisplayPayload {}

/**
 * Internal shape persisted to the database: the `ValidationStatePayload` plus
 * the `createdAt` and `expiresAt` timestamps so the consume path can check
 * expiry without a separate column read.
 */
interface StoredPayload extends ValidationStatePayload {
  createdAt: number
  expiresAt: number
}

/**
 * Generate an opaque, cryptographically random nonce. Uses `crypto.randomUUID`
 * when available and falls back to `crypto.getRandomValues` hex encoding so
 * the nonce is never derived from the payload or user id.
 */
const generateNonce = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Persist a nonce-keyed, owner-scoped validation-state record with an
 * `expiresAt` 5 minutes in the future, after applying the documented size
 * bounds (drop, never truncate). Returns `Result.ok` with the opaque nonce
 * so the caller can set it as an HttpOnly cookie on the 303 redirect. On a
 * storage failure returns `Result.err` so the caller can fall back to the
 * generic corrective error path without a 500.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @param payload - Raw redisplay payload (shaped internally to the bounds)
 * @returns Promise<Result<string, Error>> — the opaque nonce on success
 */
export const storeValidationState = (
  db: DrizzleClient,
  userId: string,
  payload: ValidationStatePayload,
): Promise<Result<string, Error>> =>
  withRetry('storeValidationState', () => storeValidationStateActual(db, userId, payload))

const storeValidationStateActual = async (
  db: DrizzleClient,
  userId: string,
  rawPayload: ValidationStatePayload,
): Promise<Result<string, Error>> => {
  try {
    const shaped = shapeRedisplayPayload(rawPayload.safeValues, rawPayload.fieldErrors)
    const nonce = generateNonce()
    const createdAt = Date.now()
    const expiresAt = createdAt + VALIDATION_STATE_TTL_MS
    const stored: StoredPayload = { ...shaped, createdAt, expiresAt }
    await db
      .insert(etudeValidationState)
      .values({
        nonce,
        userId,
        payload: JSON.stringify(stored),
        expiresAt,
        createdAt,
      })
      .run()
    return Result.ok(nonce)
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Consume the validation-state record for the given nonce and owner. Returns
 * `Result.ok` with the payload for a matching, unexpired, owner-scoped
 * record, then deletes the row so a second consumption returns
 * `Result.ok(null)` (single-use). An unknown, expired, or foreign-user nonce
 * all yield `Result.ok(null)` identically — no error, no partial data, no
 * indication of which case occurred. On a storage failure returns
 * `Result.err`.
 * @param db - Database instance
 * @param nonce - Opaque nonce from the cookie
 * @param userId - Authenticated owner user id
 * @returns Promise<Result<ValidationStatePayload | null, Error>>
 */
export const consumeValidationState = (
  db: DrizzleClient,
  nonce: string,
  userId: string,
): Promise<Result<ValidationStatePayload | null, Error>> =>
  withRetry('consumeValidationState', () => consumeValidationStateActual(db, nonce, userId))

const consumeValidationStateActual = async (
  db: DrizzleClient,
  nonce: string,
  userId: string,
): Promise<Result<ValidationStatePayload | null, Error>> => {
  try {
    // Always delete the row when presented (single-use), even if it is
    // expired or being presented by the wrong user — this prevents a
    // foreign-user presentation from leaving the row around for the owner
    // to consume later. The owner-scoped `where` ensures a foreign user
    // cannot delete another user's record.
    const rows = await db
      .select()
      .from(etudeValidationState)
      .where(and(eq(etudeValidationState.nonce, nonce), eq(etudeValidationState.userId, userId)))
      .limit(1)
    if (rows.length === 0) {
      // Unknown nonce, or foreign-user presentation: identical null result.
      return Result.ok(null)
    }
    const row = rows[0]!
    // Single-use: delete the row regardless of expiry so a second
    // presentation yields null.
    await db
      .delete(etudeValidationState)
      .where(eq(etudeValidationState.nonce, nonce))
      .run()
    if (row.expiresAt < Date.now()) {
      // Expired: indistinguishable from unknown.
      return Result.ok(null)
    }
    const stored = JSON.parse(row.payload) as StoredPayload
    const payload: ValidationStatePayload = {
      safeValues: stored.safeValues,
      fieldErrors: stored.fieldErrors,
      droppedFields: stored.droppedFields,
    }
    return Result.ok(payload)
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}
