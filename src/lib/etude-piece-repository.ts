/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Etude Piece and Operation repository (Issue 20).
 *
 * Encapsulates the physical `etude_piece` and `etude_operation` columns behind
 * domain interfaces. Routes and tests depend only on these interfaces and the
 * repository operations, never on the raw Drizzle row types.
 *
 * `persistEtudePiece` is an epoch-conditional upsert: it verifies the
 * aggregate epoch on the `etude_params` row before replacing the owner's
 * current Piece, so a request whose captured epoch no longer matches (e.g.
 * Start Over bumped it) is rejected with a typed `epoch-mismatch` and the
 * prior Piece is unchanged. Replacement semantics: the UNIQUE `userId`
 * constraint on `etude_piece` means one current Piece per owner; the upsert
 * replaces the prior row.
 *
 * `ensureEtudeOperation` creates the one-per-user operation record if it does
 * not exist. The operation record's lock, cooldown, and grant columns are
 * unused in Issue 20; Issues 33–37 populate them.
 *
 * The epoch check is on a different table (`etude_params`) than the write
 * (`etude_piece`), so the check-then-write is not a single atomic CAS. Issue
 * 33's in-flight lock prevents concurrent generation requests from racing;
 * the epoch check here is the safety net that prevents a request whose
 * workflow was cleared (Start Over) or account deleted from publishing a
 * Piece (cross-cutting contract section 4).
 * @module lib/etude-piece-repository
 */
import { eq } from 'drizzle-orm'
import Result from 'true-myth/result'

import { etudePiece, etudeOperation, etudeParams } from '../db/schema'
import type { EtudePiece as EtudePieceRow, EtudeOperation as EtudeOperationRow } from '../db/schema'
import type { DrizzleClient } from '../local-types'
import { withRetry } from './db-access'
import type { Piece } from './piece-generator'

/**
 * Domain view of the current-Piece record. This is the only type routes and
 * tests may depend on; physical column names are encapsulated behind it.
 */
export interface PieceRecord {
  id: string
  userId: string
  pieceId: string
  pieceJson: string
  sourceParameterVersion: number
  svgArtifactKey: string | null
  renderState: string | null
  renderErrorCategory: string | null
  lilypondVersion: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Typed conflict returned by `persistEtudePiece`. The caller distinguishes
 * epoch-mismatch rejections from transient DB failures. An epoch-mismatch is
 * deterministic and must not be retried; a db-error is transient.
 */
export type PiecePersistError =
  | { kind: 'epoch-mismatch' }
  | { kind: 'db-error'; error: Error }

/**
 * Map a raw Drizzle `etude_piece` row to the domain `PieceRecord` interface
 * so physical column names never leak outside the repository.
 */
const mapPieceToDomain = (row: EtudePieceRow): PieceRecord => ({
  id: row.id,
  userId: row.userId,
  pieceId: row.pieceId,
  pieceJson: row.pieceJson,
  sourceParameterVersion: row.sourceParameterVersion,
  svgArtifactKey: row.svgArtifactKey,
  renderState: row.renderState,
  renderErrorCategory: row.renderErrorCategory,
  lilypondVersion: row.lilypondVersion,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Detect whether a thrown error is a UNIQUE-constraint violation on the
 * `etude_operation` owner reference. Robust across the D1 and bun-sqlite
 * drivers, matching the pattern in `etude-params-repository`.
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
 * Owner-scoped read of the current-Piece record. Returns null when none
 * exists. Never returns another user's Piece.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @returns Promise<Result<PieceRecord | null, Error>>
 */
export const loadEtudePiece = (
  db: DrizzleClient,
  userId: string,
): Promise<Result<PieceRecord | null, Error>> =>
  withRetry('loadEtudePiece', () => loadEtudePieceActual(db, userId))

const loadEtudePieceActual = async (
  db: DrizzleClient,
  userId: string,
): Promise<Result<PieceRecord | null, Error>> => {
  try {
    const rows = await db
      .select()
      .from(etudePiece)
      .where(eq(etudePiece.userId, userId))
      .limit(1)
    if (rows.length === 0) {
      return Result.ok(null)
    }
    return Result.ok(mapPieceToDomain(rows[0]!))
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Epoch-conditional persist/replace of the owner's current Piece.
 *
 * Verifies the aggregate epoch on the `etude_params` row before writing: the
 * `where` clause matches `userId` and `aggregateEpoch === expectedEpoch`, so
 * a request whose captured epoch no longer matches (e.g. Start Over bumped
 * it) updates zero rows and returns a typed `epoch-mismatch`. On success the
 * Piece is upserted into `etude_piece` (replacing any prior current Piece for
 * that owner via the UNIQUE `userId` constraint). The prior committed
 * aggregate and any prior Piece are unchanged on rejection.
 *
 * The epoch check is on `etude_params` (a different table from the write),
 * so the check-then-write is not a single atomic CAS. Issue 33's in-flight
 * lock prevents concurrent generation requests from racing; the epoch check
 * here is the safety net (cross-cutting contract section 4).
 *
 * Epoch-mismatch is deterministic and is not retried — `withRetry` is not
 * used because it would retry a conflict that will deterministically fail
 * again. Transient DB errors are wrapped as `db-error`.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @param expectedEpoch - Aggregate epoch captured at acquisition
 * @param piece - The immutable Piece to persist
 * @returns Promise<Result<PieceRecord, PiecePersistError>>
 */
export const persistEtudePiece = (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  piece: Piece,
): Promise<Result<PieceRecord, PiecePersistError>> =>
  persistEtudePieceActual(db, userId, expectedEpoch, piece)

const persistEtudePieceActual = async (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  piece: Piece,
): Promise<Result<PieceRecord, PiecePersistError>> => {
  try {
    // Verify the aggregate epoch on etude_params before writing the Piece.
    // A request whose captured epoch no longer matches (e.g. Start Over
    // bumped it) is rejected with epoch-mismatch and no Piece is written.
    const paramsRows = await db
      .select({ epoch: etudeParams.aggregateEpoch })
      .from(etudeParams)
      .where(eq(etudeParams.userId, userId))
      .limit(1)
    if (paramsRows.length === 0) {
      // No aggregate exists for this owner; treat as a safe epoch-mismatch.
      return Result.err({ kind: 'epoch-mismatch' })
    }
    if (paramsRows[0]!.epoch !== expectedEpoch) {
      return Result.err({ kind: 'epoch-mismatch' })
    }

    // Upsert the Piece record, replacing any prior current Piece for this
    // owner via the UNIQUE userId constraint.
    const now = new Date()
    const upserted = await db
      .insert(etudePiece)
      .values({
        id: crypto.randomUUID(),
        userId,
        pieceId: piece.pieceId,
        pieceJson: JSON.stringify(piece),
        sourceParameterVersion: piece.sourceParameterVersion,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: etudePiece.userId,
        set: {
          pieceId: piece.pieceId,
          pieceJson: JSON.stringify(piece),
          sourceParameterVersion: piece.sourceParameterVersion,
          updatedAt: now,
        },
      })
      .returning()
    if (upserted.length === 0) {
      return Result.err({ kind: 'db-error', error: new Error('persistEtudePiece: upsert returned no rows') })
    }
    return Result.ok(mapPieceToDomain(upserted[0]!))
  } catch (e) {
    return Result.err({ kind: 'db-error', error: e instanceof Error ? e : new Error(String(e)) })
  }
}

/**
 * Map a raw Drizzle `etude_operation` row to the domain interface. Exported
 * for future issues (33–37) that read and write the operation record's lock,
 * cooldown, and grant columns.
 */
const mapOperationToDomain = (row: EtudeOperationRow): EtudeOperationRow => ({
  id: row.id,
  userId: row.userId,
  generationLockOwner: row.generationLockOwner,
  generationLockAcquiredAt: row.generationLockAcquiredAt,
  generationLockExpiresAt: row.generationLockExpiresAt,
  pdfLockOwner: row.pdfLockOwner,
  pdfLockAcquiredAt: row.pdfLockAcquiredAt,
  pdfLockExpiresAt: row.pdfLockExpiresAt,
  generationCooldownAt: row.generationCooldownAt,
  pdfCooldownAt: row.pdfCooldownAt,
  pdfGrantId: row.pdfGrantId,
  pdfGrantExpiresAt: row.pdfGrantExpiresAt,
  pdfGrantConsumedAt: row.pdfGrantConsumedAt,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Atomically create the one-per-user operation record if it does not exist.
 * Under concurrency the caller that loses the insert race handles the
 * UNIQUE-constraint violation on the owner reference as a load of the
 * winner's record, not as an error. The lock, cooldown, and grant columns
 * are left null; Issues 33–37 populate them.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @returns Promise<Result<EtudeOperationRow, Error>>
 */
export const ensureEtudeOperation = (
  db: DrizzleClient,
  userId: string,
): Promise<Result<EtudeOperationRow, Error>> =>
  withRetry('ensureEtudeOperation', () => ensureEtudeOperationActual(db, userId))

const ensureEtudeOperationActual = async (
  db: DrizzleClient,
  userId: string,
): Promise<Result<EtudeOperationRow, Error>> => {
  try {
    const now = new Date()
    const inserted = await db
      .insert(etudeOperation)
      .values({
        id: crypto.randomUUID(),
        userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    if (inserted.length === 1) {
      return Result.ok(mapOperationToDomain(inserted[0]!))
    }
    return Result.err(new Error('ensureEtudeOperation: insert returned no rows'))
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Lost the insert race: load the winner's record.
      const existing = await db
        .select()
        .from(etudeOperation)
        .where(eq(etudeOperation.userId, userId))
        .limit(1)
      if (existing.length === 1) {
        return Result.ok(mapOperationToDomain(existing[0]!))
      }
      return Result.err(
        new Error('ensureEtudeOperation: uniqueness violation but no existing row found'),
      )
    }
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}
