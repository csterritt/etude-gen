// ====================================
// Tests for the Etude Piece repository (Issue 20).
//
// Verifies one current-Piece record per user, replacement semantics (a new
// Piece supersedes the prior), owner-scoped reads, cascade deletion with the
// user row, and the epoch-conditional commit that rejects a stale epoch
// leaving the prior committed aggregate and any prior Piece unchanged. Also
// covers the one-per-user operation record with cascade deletion.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { eq } from 'drizzle-orm'
import Result from 'true-myth/result'

import { user, etudeParams, etudePiece, etudeOperation } from '../src/db/schema'
import type { DrizzleClient } from '../src/local-types'
import { loadOrCreateEtudeParams } from '../src/lib/etude-params-repository'
import {
  loadEtudePiece,
  persistEtudePiece,
  ensureEtudeOperation,
} from '../src/lib/etude-piece-repository'
import type { Piece } from '../src/lib/piece-generator'
import { createTestDb } from './helpers/test-db'

const unwrap = <T, E>(result: Result<T, E>): T => {
  if (!result.isOk) {
    throw new Error(`Expected Ok, got Err: ${JSON.stringify(result.error)}`)
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

const countPiecesForUser = async (db: DrizzleClient, userId: string): Promise<number> => {
  const rows = await db
    .select({ id: etudePiece.id })
    .from(etudePiece)
    .where(eq(etudePiece.userId, userId))
    .all()
  return rows.length
}

const countOperationsForUser = async (db: DrizzleClient, userId: string): Promise<number> => {
  const rows = await db
    .select({ id: etudeOperation.id })
    .from(etudeOperation)
    .where(eq(etudeOperation.userId, userId))
    .all()
  return rows.length
}

/**
 * Build a minimal valid Piece for testing. The content does not matter for
 * repository tests — only the identity and JSON serialization.
 */
const makePiece = (pieceId: string, sourceParameterVersion: number): Piece => ({
  pieceId,
  key: 'C major',
  timeSignature: '4/4',
  hand: 'right',
  sourceParameterVersion,
  measures: [
    {
      rightHand: [{ duration: 'Q', pitch: 'C4', rest: false }],
      leftHand: [],
    },
  ],
})

/**
 * Bump the aggregate epoch directly in the database to simulate Start Over
 * (which increments the epoch) between acquisition and commit.
 */
const bumpEpoch = async (db: DrizzleClient, userId: string): Promise<void> => {
  await db
    .update(etudeParams)
    .set({ aggregateEpoch: 999, updatedAt: new Date() })
    .where(eq(etudeParams.userId, userId))
    .run()
}

describe('persistEtudePiece + loadEtudePiece - one Piece per user', () => {
  it('persists a Piece record for an owner and loads it back', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-1', 'one@example.com')
    const params = unwrap(await loadOrCreateEtudeParams(db, 'user-1'))
    const piece = makePiece('aaaaaaaa-0000-0000-0000-000000000001', params.workflowVersion)

    const result = await persistEtudePiece(db, 'user-1', params.aggregateEpoch, piece)
    expect(result.isOk).toBe(true)

    const loaded = unwrap(await loadEtudePiece(db, 'user-1'))
    expect(loaded).not.toBeNull()
    expect(loaded!.pieceId).toBe(piece.pieceId)
    expect(loaded!.sourceParameterVersion).toBe(piece.sourceParameterVersion)
    expect(loaded!.userId).toBe('user-1')
  })

  it('enforces one current-Piece record per user', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-2', 'two@example.com')
    const params = unwrap(await loadOrCreateEtudeParams(db, 'user-2'))
    const piece1 = makePiece('bbbbbbbb-0000-0000-0000-000000000001', params.workflowVersion)
    const piece2 = makePiece('cccccccc-0000-0000-0000-000000000001', params.workflowVersion)

    unwrap(await persistEtudePiece(db, 'user-2', params.aggregateEpoch, piece1))
    unwrap(await persistEtudePiece(db, 'user-2', params.aggregateEpoch, piece2))

    expect(await countPiecesForUser(db, 'user-2')).toBe(1)
  })
})

describe('persistEtudePiece - replacement semantics', () => {
  it('a new Piece replaces the prior current Piece for the same owner', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-3', 'three@example.com')
    const params = unwrap(await loadOrCreateEtudeParams(db, 'user-3'))
    const piece1 = makePiece('dddddddd-0000-0000-0000-000000000001', params.workflowVersion)
    const piece2 = makePiece('eeeeeeee-0000-0000-0000-000000000001', params.workflowVersion)

    unwrap(await persistEtudePiece(db, 'user-3', params.aggregateEpoch, piece1))
    unwrap(await persistEtudePiece(db, 'user-3', params.aggregateEpoch, piece2))

    const loaded = unwrap(await loadEtudePiece(db, 'user-3'))
    expect(loaded).not.toBeNull()
    // The current Piece is the second one.
    expect(loaded!.pieceId).toBe(piece2.pieceId)
    // Only one row remains.
    expect(await countPiecesForUser(db, 'user-3')).toBe(1)
  })

  it('the replaced Piece JSON is no longer the stored JSON', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-4', 'four@example.com')
    const params = unwrap(await loadOrCreateEtudeParams(db, 'user-4'))
    const piece1 = makePiece('ffffffff-0000-0000-0000-000000000001', params.workflowVersion)
    const piece2 = makePiece('11111111-0000-0000-0000-000000000001', params.workflowVersion)

    unwrap(await persistEtudePiece(db, 'user-4', params.aggregateEpoch, piece1))
    unwrap(await persistEtudePiece(db, 'user-4', params.aggregateEpoch, piece2))

    const loaded = unwrap(await loadEtudePiece(db, 'user-4'))
    expect(loaded).not.toBeNull()
    const stored = JSON.parse(loaded!.pieceJson) as Piece
    expect(stored.pieceId).toBe(piece2.pieceId)
  })
})

describe('loadEtudePiece - owner scoping', () => {
  it('never returns another user Piece', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-a', 'a@example.com')
    await insertUser(db, 'user-b', 'b@example.com')
    const paramsA = unwrap(await loadOrCreateEtudeParams(db, 'user-a'))
    unwrap(await loadOrCreateEtudeParams(db, 'user-b'))
    const piece = makePiece('22222222-0000-0000-0000-000000000001', paramsA.workflowVersion)

    unwrap(await persistEtudePiece(db, 'user-a', paramsA.aggregateEpoch, piece))

    // user-b has no Piece.
    const loadedB = unwrap(await loadEtudePiece(db, 'user-b'))
    expect(loadedB).toBeNull()

    // user-a has the Piece.
    const loadedA = unwrap(await loadEtudePiece(db, 'user-a'))
    expect(loadedA).not.toBeNull()
    expect(loadedA!.pieceId).toBe(piece.pieceId)
  })

  it('returns null when no Piece exists for the owner', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-c', 'c@example.com')
    unwrap(await loadOrCreateEtudeParams(db, 'user-c'))

    const loaded = unwrap(await loadEtudePiece(db, 'user-c'))
    expect(loaded).toBeNull()
  })
})

describe('persistEtudePiece + loadEtudePiece - cascade deletion', () => {
  it('removes the Piece record when the user row is deleted', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-d', 'd@example.com')
    const params = unwrap(await loadOrCreateEtudeParams(db, 'user-d'))
    const piece = makePiece('33333333-0000-0000-0000-000000000001', params.workflowVersion)
    unwrap(await persistEtudePiece(db, 'user-d', params.aggregateEpoch, piece))

    expect(await countPiecesForUser(db, 'user-d')).toBe(1)

    await db.delete(user).where(eq(user.id, 'user-d')).run()

    expect(await countPiecesForUser(db, 'user-d')).toBe(0)
  })
})

describe('persistEtudePiece - epoch-conditional commit', () => {
  it('rejects a stale epoch and leaves any prior Piece unchanged', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-e', 'e@example.com')
    const params = unwrap(await loadOrCreateEtudeParams(db, 'user-e'))
    const piece1 = makePiece('44444444-0000-0000-0000-000000000001', params.workflowVersion)
    const piece2 = makePiece('55555555-0000-0000-0000-000000000001', params.workflowVersion)

    // Persist the first Piece with the correct epoch.
    unwrap(await persistEtudePiece(db, 'user-e', params.aggregateEpoch, piece1))

    // Simulate Start Over: bump the epoch.
    await bumpEpoch(db, 'user-e')

    // Attempt to persist a second Piece with the now-stale epoch.
    const result = await persistEtudePiece(db, 'user-e', params.aggregateEpoch, piece2)
    expect(result.isErr).toBe(true)
    if (result.isErr) {
      expect(result.error.kind).toBe('epoch-mismatch')
    }

    // The prior Piece is unchanged.
    const loaded = unwrap(await loadEtudePiece(db, 'user-e'))
    expect(loaded).not.toBeNull()
    expect(loaded!.pieceId).toBe(piece1.pieceId)
  })

  it('rejects when no aggregate exists for the owner', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-f', 'f@example.com')
    const piece = makePiece('66666666-0000-0000-0000-000000000001', 1)

    const result = await persistEtudePiece(db, 'user-f', 1, piece)
    expect(result.isErr).toBe(true)
    if (result.isErr) {
      // No aggregate means no epoch to match — a safe conflict.
      expect(result.error.kind).toBe('epoch-mismatch')
    }
  })
})

describe('persistEtudePiece - round-trip JSON', () => {
  it('the stored pieceJson round-trips to the original Piece', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-g', 'g@example.com')
    const params = unwrap(await loadOrCreateEtudeParams(db, 'user-g'))
    const piece = makePiece('77777777-0000-0000-0000-000000000001', params.workflowVersion)

    unwrap(await persistEtudePiece(db, 'user-g', params.aggregateEpoch, piece))

    const loaded = unwrap(await loadEtudePiece(db, 'user-g'))
    expect(loaded).not.toBeNull()
    const restored = JSON.parse(loaded!.pieceJson) as Piece
    expect(restored).toEqual(piece)
  })
})

describe('ensureEtudeOperation - one per user', () => {
  it('creates one operation record for an owner', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-h', 'h@example.com')

    unwrap(await ensureEtudeOperation(db, 'user-h'))

    expect(await countOperationsForUser(db, 'user-h')).toBe(1)
  })

  it('does not create a second record on a second call', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-i', 'i@example.com')

    unwrap(await ensureEtudeOperation(db, 'user-i'))
    unwrap(await ensureEtudeOperation(db, 'user-i'))

    expect(await countOperationsForUser(db, 'user-i')).toBe(1)
  })

  it('cascade-deletes with the user row', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-j', 'j@example.com')
    unwrap(await ensureEtudeOperation(db, 'user-j'))

    expect(await countOperationsForUser(db, 'user-j')).toBe(1)

    await db.delete(user).where(eq(user.id, 'user-j')).run()

    expect(await countOperationsForUser(db, 'user-j')).toBe(0)
  })
})
