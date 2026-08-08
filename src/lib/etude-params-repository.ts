/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Etude parameter aggregate repository.
 *
 * Encapsulates the physical `etude_params` columns behind a domain
 * `EtudeParams` interface. Routes and tests depend only on this interface
 * and the repository operations, never on the raw Drizzle row type.
 *
 * `loadOrCreateEtudeParams` is atomic under concurrency: the caller that
 * loses the insert race handles the UNIQUE-constraint violation on the owner
 * reference as a load of the winner's aggregate, not as an error.
 * @module lib/etude-params-repository
 */
import { eq, and, sql } from 'drizzle-orm'
import Result from 'true-myth/result'

import { etudeParams } from '../db/schema'
import type { EtudeParam } from '../db/schema'
import type { DrizzleClient } from '../local-types'
import { withRetry } from './db-access'
import { computeDownstreamInvalidation } from './etude-invalidation'
import type { ValidSetup } from './setup-validator'

/**
 * Domain view of the etude parameter aggregate.
 *
 * This is the only type routes and tests may depend on; physical column
 * names are encapsulated behind it.
 */
export interface EtudeParams {
  id: string
  userId: string
  measureCount: number
  timeSignature: string
  keySignature: string
  selectedOctaves: string
  octaveRange: number
  hand: string
  workflowVersion: number
  aggregateEpoch: number
  setupConfirmed: boolean
  notesConfirmed: boolean
  splitConfirmed: boolean
  selectedPitches: string | null
  selectedDurations: string | null
  splitBoundary: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Map a raw Drizzle row to the domain `EtudeParams` interface so physical
 * column names never leak outside the repository.
 */
const mapToDomain = (row: EtudeParam): EtudeParams => ({
  id: row.id,
  userId: row.userId,
  measureCount: row.measureCount,
  timeSignature: row.timeSignature,
  keySignature: row.keySignature,
  selectedOctaves: row.selectedOctaves,
  octaveRange: row.octaveRange,
  hand: row.hand,
  workflowVersion: row.workflowVersion,
  aggregateEpoch: row.aggregateEpoch,
  setupConfirmed: row.setupConfirmed,
  notesConfirmed: row.notesConfirmed,
  splitConfirmed: row.splitConfirmed,
  selectedPitches: row.selectedPitches,
  selectedDurations: row.selectedDurations,
  splitBoundary: row.splitBoundary,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Detect whether a thrown error is a UNIQUE-constraint violation on the
 * owner reference. Robust across the D1 and bun-sqlite drivers, which
 * surface SQLite constraint errors with slightly different shapes:
 * bun-sqlite throws a `SQLiteError` directly, while D1 wraps the SQLite
 * constraint error inside a `DrizzleQueryError` whose `cause` carries the
 * underlying `D1_ERROR: UNIQUE constraint failed: ...` message.
 */
const isUniqueViolation = (e: unknown): boolean => {
  if (!(e instanceof Error)) {
    return false
  }
  const candidates: Error[] = [e]
  const cause = (e as { cause?: unknown }).cause
  if (cause instanceof Error) {
    candidates.push(cause)
  }
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown }).code
    const codeMatches =
      typeof code === 'string' &&
      (code.includes('CONSTRAINT_UNIQUE') || code.includes('CONSTRAINT_PRIMARY'))
    const messageMatches = candidate.message.includes('UNIQUE constraint')
    if (codeMatches || messageMatches) {
      return true
    }
  }
  return false
}

/**
 * Build a new default etude parameter aggregate row for the given owner.
 *
 * Defaults: 8 measures, 4/4, C major, selected octaves '4', octave range 4,
 * right hand, workflowVersion 1, aggregateEpoch 1, no confirmed steps.
 */
const buildDefaultRow = (userId: string): typeof etudeParams.$inferInsert => {
  const now = new Date()
  return {
    id: crypto.randomUUID(),
    userId,
    measureCount: 8,
    timeSignature: '4/4',
    keySignature: 'C major',
    selectedOctaves: '4',
    octaveRange: 4,
    hand: 'right',
    workflowVersion: 1,
    aggregateEpoch: 1,
    setupConfirmed: false,
    notesConfirmed: false,
    splitConfirmed: false,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Atomically load the owner's aggregate, creating one with the default
 * values when none exists. Under concurrency the caller that loses the
 * insert race handles the UNIQUE-constraint violation on the owner
 * reference as a load of the winner's aggregate, not as an error.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @returns Promise<Result<EtudeParams, Error>>
 */
export const loadOrCreateEtudeParams = (
  db: DrizzleClient,
  userId: string,
): Promise<Result<EtudeParams, Error>> =>
  withRetry('loadOrCreateEtudeParams', () => loadOrCreateEtudeParamsActual(db, userId))

const loadOrCreateEtudeParamsActual = async (
  db: DrizzleClient,
  userId: string,
): Promise<Result<EtudeParams, Error>> => {
  try {
    const inserted = await db
      .insert(etudeParams)
      .values(buildDefaultRow(userId))
      .returning()
    if (inserted.length === 1) {
      return Result.ok(mapToDomain(inserted[0]!))
    }
    return Result.err(new Error('loadOrCreateEtudeParams: insert returned no rows'))
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Lost the insert race: load the winner's aggregate.
      const existing = await db
        .select()
        .from(etudeParams)
        .where(eq(etudeParams.userId, userId))
        .limit(1)
      if (existing.length === 1) {
        return Result.ok(mapToDomain(existing[0]!))
      }
      return Result.err(
        new Error('loadOrCreateEtudeParams: uniqueness violation but no existing row found'),
      )
    }
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Owner-scoped read of the aggregate. Returns null when none exists.
 * Never returns another user's aggregate.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @returns Promise<Result<EtudeParams | null, Error>>
 */
export const loadEtudeParams = (
  db: DrizzleClient,
  userId: string,
): Promise<Result<EtudeParams | null, Error>> =>
  withRetry('loadEtudeParams', () => loadEtudeParamsActual(db, userId))

const loadEtudeParamsActual = async (
  db: DrizzleClient,
  userId: string,
): Promise<Result<EtudeParams | null, Error>> => {
  try {
    const rows = await db
      .select()
      .from(etudeParams)
      .where(eq(etudeParams.userId, userId))
      .limit(1)
    if (rows.length === 0) {
      return Result.ok(null)
    }
    return Result.ok(mapToDomain(rows[0]!))
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Typed conflict returned by `updateEtudeSetup`. The caller distinguishes
 * stale-version rejections (`version-mismatch`) from epoch-mismatch rejections
 * (`epoch-mismatch`) and from transient DB failures (`db-error`). A
 * version-mismatch or epoch-mismatch is deterministic and must not be retried;
 * a db-error is transient and may be retried by the caller if appropriate.
 */
export type EtudeUpdateError =
  | { kind: 'version-mismatch' }
  | { kind: 'epoch-mismatch' }
  | { kind: 'db-error'; error: Error }

/**
 * Conditionally update the setup-step fields of the owner's aggregate.
 *
 * Verifies both the aggregate epoch and the workflow version at commit
 * (cross-cutting contract sections 2 and 4): the `where` clause matches
 * `userId`, `aggregateEpoch === expectedEpoch`, and `workflowVersion ===
 * expectedWorkflowVersion`, so a request whose captured epoch or version no
 * longer matches the stored values updates zero rows and returns a typed
 * conflict. On success the same committed transition increments
 * `workflowVersion` by 1, sets `setupConfirmed` to true, and updates the
 * measure/meter/hand/key/octaves columns. Never read-then-unconditionally-write.
 *
 * CAS conflicts (`version-mismatch`, `epoch-mismatch`) are deterministic and
 * are not retried — `withRetry` is not used because it would retry a conflict
 * that will deterministically fail again, and because it would lose the typed
 * conflict information. Transient DB errors are wrapped as `db-error`.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @param expectedEpoch - Aggregate epoch captured at acquisition
 * @param expectedWorkflowVersion - Workflow version captured from the form
 * @param values - Validated setup values from the domain validator
 * @returns Promise<Result<EtudeParams, EtudeUpdateError>> — conflict kinds are
 * `version-mismatch`, `epoch-mismatch`, or `db-error`; the caller treats
 * `version-mismatch` and `epoch-mismatch` as safe stale-form rejections.
 */
export const updateEtudeSetup = (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  expectedWorkflowVersion: number,
  values: ValidSetup,
): Promise<Result<EtudeParams, EtudeUpdateError>> =>
  updateEtudeSetupActual(db, userId, expectedEpoch, expectedWorkflowVersion, values)

const updateEtudeSetupActual = async (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  expectedWorkflowVersion: number,
  values: ValidSetup,
): Promise<Result<EtudeParams, EtudeUpdateError>> => {
  try {
    // Load the current aggregate to compare the submitted values against
    // the stored ones. When every submitted value is identical to the
    // stored values AND the expected version matches, the request is a
    // no-op: no version increment, no write, no flag changes. This avoids
    // spurious version bumps from a double submission of the same form.
    // A stale version on an identical resubmit is still a version-mismatch.
    const current = await db
      .select()
      .from(etudeParams)
      .where(eq(etudeParams.userId, userId))
      .limit(1)
    if (current.length === 0) {
      // No aggregate exists for this owner; treat as a safe version-mismatch.
      return Result.err({ kind: 'version-mismatch' })
    }
    const stored = current[0]!
    const submittedOctavesString = values.octaves.join(',')
    const identicalResubmit =
      stored.measureCount === values.measureCount &&
      stored.timeSignature === values.timeSignature &&
      stored.hand === values.hand &&
      stored.keySignature === values.keySignature &&
      stored.selectedOctaves === submittedOctavesString
    if (identicalResubmit) {
      // Verify the version matches before returning Ok. A stale version on
      // an identical resubmit is a version-mismatch, not a silent success.
      if (stored.workflowVersion !== expectedWorkflowVersion) {
        return Result.err({ kind: 'version-mismatch' })
      }
      return Result.ok(mapToDomain(stored))
    }

    // Compute the dependent-downstream invalidation plan from the Issue 11
    // dependency map (key, octaves, meter, measure count, hands + two-hand
    // revalidation). The plan is applied inside the same compare-and-set write
    // that increments the workflow version — there is no second, separate
    // transition (cross-cutting contract section 4). Identical resubmits
    // short-circuit above, so this only runs when at least one field changed.
    const plan = computeDownstreamInvalidation(stored, values)
    const updated = await db
      .update(etudeParams)
      .set({
        measureCount: values.measureCount,
        timeSignature: values.timeSignature,
        hand: values.hand,
        keySignature: values.keySignature,
        selectedOctaves: submittedOctavesString,
        setupConfirmed: true,
        workflowVersion: sql`${etudeParams.workflowVersion} + 1`,
        ...(plan.clearPitches ? { selectedPitches: null } : {}),
        ...(plan.clearDurations ? { selectedDurations: null } : {}),
        ...(plan.clearSplit ? { splitBoundary: null } : {}),
        ...(plan.unconfirmNotes ? { notesConfirmed: false } : {}),
        ...(plan.unconfirmSplit ? { splitConfirmed: false } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(etudeParams.userId, userId),
          eq(etudeParams.aggregateEpoch, expectedEpoch),
          eq(etudeParams.workflowVersion, expectedWorkflowVersion),
        ),
      )
      .returning()
    if (updated.length === 0) {
      // The CAS failed: either the epoch or the version no longer matches.
      // Re-load the current row to disambiguate the conflict kind so the
      // caller can report the correct failure. If the row is gone, treat it
      // as a version-mismatch (a safe conflict, never a 500).
      const reloaded = await db
        .select()
        .from(etudeParams)
        .where(eq(etudeParams.userId, userId))
        .limit(1)
      if (reloaded.length === 0) {
        return Result.err({ kind: 'version-mismatch' })
      }
      if (reloaded[0]!.aggregateEpoch !== expectedEpoch) {
        return Result.err({ kind: 'epoch-mismatch' })
      }
      return Result.err({ kind: 'version-mismatch' })
    }
    return Result.ok(mapToDomain(updated[0]!))
  } catch (e) {
    return Result.err({ kind: 'db-error', error: e instanceof Error ? e : new Error(String(e)) })
  }
}

/**
 * Conditionally update the notes-step selection (pitches and durations) of the
 * owner's aggregate (Issue 14).
 *
 * This is the combined save that commits both halves of the coherent
 * notes-step prerequisite in one transition: it verifies both the aggregate
 * epoch and the workflow version via a compare-and-set write (matching
 * `updateEtudePitches`), and on success sets `selectedPitches` and
 * `selectedDurations` to the comma-joined submitted values, sets
 * `notesConfirmed` to true (both halves confirmed in this commit), and
 * increments `workflowVersion` by 1. It does NOT modify `splitBoundary`,
 * `splitConfirmed`, `setupConfirmed`, or `notesConfirmed` beyond setting it
 * true on the committed save.
 *
 * An identical resubmit (same selectedPitches and selectedDurations as stored,
 * same version) is a no-op: no version increment, no write, no flag changes. A
 * stale version on an identical resubmit is still a version-mismatch.
 *
 * CAS conflicts (`version-mismatch`, `epoch-mismatch`) are deterministic and
 * are not retried — `withRetry` is not used because it would retry a conflict
 * that will deterministically fail again, and because it would lose the typed
 * conflict information. Transient DB errors are wrapped as `db-error`.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @param expectedEpoch - Aggregate epoch captured at acquisition
 * @param expectedWorkflowVersion - Workflow version captured from the form
 * @param selectedPitches - Validated pitch names in available-set order
 * @param selectedDurations - Validated duration tokens in canonical order
 * @returns Promise<Result<EtudeParams, EtudeUpdateError>> — conflict kinds are
 * `version-mismatch`, `epoch-mismatch`, or `db-error`; the caller treats
 * `version-mismatch` and `epoch-mismatch` as safe stale-form rejections.
 */
export const updateEtudeNotes = (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  expectedWorkflowVersion: number,
  selectedPitches: string[],
  selectedDurations: string[],
): Promise<Result<EtudeParams, EtudeUpdateError>> =>
  updateEtudeNotesActual(
    db,
    userId,
    expectedEpoch,
    expectedWorkflowVersion,
    selectedPitches,
    selectedDurations,
  )

const updateEtudeNotesActual = async (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  expectedWorkflowVersion: number,
  selectedPitches: string[],
  selectedDurations: string[],
): Promise<Result<EtudeParams, EtudeUpdateError>> => {
  try {
    // Load the current row to compare the submitted pitches and durations
    // against the stored ones. When both are identical to the stored values
    // AND the expected version matches, the request is a no-op: no version
    // increment, no write, no flag changes. A stale version on an identical
    // resubmit is still a version-mismatch.
    const current = await db
      .select()
      .from(etudeParams)
      .where(eq(etudeParams.userId, userId))
      .limit(1)
    if (current.length === 0) {
      // No aggregate exists for this owner; treat as a safe version-mismatch.
      return Result.err({ kind: 'version-mismatch' })
    }
    const stored = current[0]!
    const submittedPitchesString = selectedPitches.join(',')
    const submittedDurationsString = selectedDurations.join(',')
    const identicalResubmit =
      stored.selectedPitches === submittedPitchesString &&
      stored.selectedDurations === submittedDurationsString
    if (identicalResubmit) {
      // Verify the version matches before returning Ok. A stale version on
      // an identical resubmit is a version-mismatch, not a silent success.
      if (stored.workflowVersion !== expectedWorkflowVersion) {
        return Result.err({ kind: 'version-mismatch' })
      }
      return Result.ok(mapToDomain(stored))
    }

    const updated = await db
      .update(etudeParams)
      .set({
        selectedPitches: submittedPitchesString,
        selectedDurations: submittedDurationsString,
        notesConfirmed: true,
        workflowVersion: sql`${etudeParams.workflowVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(etudeParams.userId, userId),
          eq(etudeParams.aggregateEpoch, expectedEpoch),
          eq(etudeParams.workflowVersion, expectedWorkflowVersion),
        ),
      )
      .returning()
    if (updated.length === 0) {
      // The CAS failed: either the epoch or the version no longer matches.
      // Re-load the current row to disambiguate the conflict kind so the
      // caller can report the correct failure. If the row is gone, treat it
      // as a version-mismatch (a safe conflict, never a 500).
      const reloaded = await db
        .select()
        .from(etudeParams)
        .where(eq(etudeParams.userId, userId))
        .limit(1)
      if (reloaded.length === 0) {
        return Result.err({ kind: 'version-mismatch' })
      }
      if (reloaded[0]!.aggregateEpoch !== expectedEpoch) {
        return Result.err({ kind: 'epoch-mismatch' })
      }
      return Result.err({ kind: 'version-mismatch' })
    }
    return Result.ok(mapToDomain(updated[0]!))
  } catch (e) {
    return Result.err({ kind: 'db-error', error: e instanceof Error ? e : new Error(String(e)) })
  }
}

/**
 * Conditionally update the pitch selection of the owner's aggregate (Issue 13).
 *
 * Verifies both the aggregate epoch and the workflow version at commit, exactly
 * like `updateEtudeSetup`: the `where` clause matches `userId`,
 * `aggregateEpoch === expectedEpoch`, and `workflowVersion ===
 * expectedWorkflowVersion`, so a request whose captured epoch or version no
 * longer matches the stored values updates zero rows and returns a typed
 * conflict. On success the same committed transition increments
 * `workflowVersion` by 1 and sets `selectedPitches` to the comma-joined
 * submitted pitches. Never read-then-unconditionally-write.
 *
 * Does NOT set `notesConfirmed` — the notes step is confirmed only when both
 * pitches and durations are confirmed (durations are Issue 14). Does NOT
 * modify `selectedDurations`, `splitBoundary`, `setupConfirmed`,
 * `notesConfirmed`, or `splitConfirmed`.
 *
 * An identical resubmit (same `selectedPitches` as stored, same version) is a
 * no-op: no version increment, no write, no flag changes. A stale version on
 * an identical resubmit is still a version-mismatch.
 *
 * CAS conflicts (`version-mismatch`, `epoch-mismatch`) are deterministic and
 * are not retried — `withRetry` is not used because it would retry a conflict
 * that will deterministically fail again, and because it would lose the typed
 * conflict information. Transient DB errors are wrapped as `db-error`.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @param expectedEpoch - Aggregate epoch captured at acquisition
 * @param expectedWorkflowVersion - Workflow version captured from the form
 * @param selectedPitches - Validated pitch names in available-set order
 * @returns Promise<Result<EtudeParams, EtudeUpdateError>> — conflict kinds are
 * `version-mismatch`, `epoch-mismatch`, or `db-error`; the caller treats
 * `version-mismatch` and `epoch-mismatch` as safe stale-form rejections.
 */
export const updateEtudePitches = (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  expectedWorkflowVersion: number,
  selectedPitches: string[],
): Promise<Result<EtudeParams, EtudeUpdateError>> =>
  updateEtudePitchesActual(db, userId, expectedEpoch, expectedWorkflowVersion, selectedPitches)

const updateEtudePitchesActual = async (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  expectedWorkflowVersion: number,
  selectedPitches: string[],
): Promise<Result<EtudeParams, EtudeUpdateError>> => {
  try {
    // Load the current row to compare the submitted pitches against the
    // stored ones. When the submitted pitches are identical to the stored
    // ones AND the expected version matches, the request is a no-op: no
    // version increment, no write, no flag changes. A stale version on an
    // identical resubmit is still a version-mismatch.
    const current = await db
      .select()
      .from(etudeParams)
      .where(eq(etudeParams.userId, userId))
      .limit(1)
    if (current.length === 0) {
      // No aggregate exists for this owner; treat as a safe version-mismatch.
      return Result.err({ kind: 'version-mismatch' })
    }
    const stored = current[0]!
    const submittedPitchesString = selectedPitches.join(',')
    if (stored.selectedPitches === submittedPitchesString) {
      // Verify the version matches before returning Ok. A stale version on
      // an identical resubmit is a version-mismatch, not a silent success.
      if (stored.workflowVersion !== expectedWorkflowVersion) {
        return Result.err({ kind: 'version-mismatch' })
      }
      return Result.ok(mapToDomain(stored))
    }

    const updated = await db
      .update(etudeParams)
      .set({
        selectedPitches: submittedPitchesString,
        workflowVersion: sql`${etudeParams.workflowVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(etudeParams.userId, userId),
          eq(etudeParams.aggregateEpoch, expectedEpoch),
          eq(etudeParams.workflowVersion, expectedWorkflowVersion),
        ),
      )
      .returning()
    if (updated.length === 0) {
      // The CAS failed: either the epoch or the version no longer matches.
      // Re-load the current row to disambiguate the conflict kind so the
      // caller can report the correct failure. If the row is gone, treat it
      // as a version-mismatch (a safe conflict, never a 500).
      const reloaded = await db
        .select()
        .from(etudeParams)
        .where(eq(etudeParams.userId, userId))
        .limit(1)
      if (reloaded.length === 0) {
        return Result.err({ kind: 'version-mismatch' })
      }
      if (reloaded[0]!.aggregateEpoch !== expectedEpoch) {
        return Result.err({ kind: 'epoch-mismatch' })
      }
      return Result.err({ kind: 'version-mismatch' })
    }
    return Result.ok(mapToDomain(updated[0]!))
  } catch (e) {
    return Result.err({ kind: 'db-error', error: e instanceof Error ? e : new Error(String(e)) })
  }
}
