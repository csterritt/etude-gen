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
import { eq } from 'drizzle-orm'
import Result from 'true-myth/result'

import { etudeParams } from '../db/schema'
import type { EtudeParam } from '../db/schema'
import type { DrizzleClient } from '../local-types'
import { withRetry } from './db-access'

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
  octaveRange: number
  hand: string
  workflowVersion: number
  aggregateEpoch: number
  setupConfirmed: boolean
  notesConfirmed: boolean
  splitConfirmed: boolean
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
  octaveRange: row.octaveRange,
  hand: row.hand,
  workflowVersion: row.workflowVersion,
  aggregateEpoch: row.aggregateEpoch,
  setupConfirmed: row.setupConfirmed,
  notesConfirmed: row.notesConfirmed,
  splitConfirmed: row.splitConfirmed,
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
 * Defaults: 8 measures, 4/4, C major, octave range 4, right hand,
 * workflowVersion 1, aggregateEpoch 1, no confirmed steps.
 */
const buildDefaultRow = (userId: string): typeof etudeParams.$inferInsert => {
  const now = new Date()
  return {
    id: crypto.randomUUID(),
    userId,
    measureCount: 8,
    timeSignature: '4/4',
    keySignature: 'C major',
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
