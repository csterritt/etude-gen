// ====================================
// Tests for the workflow service generate operation (Issue 20).
//
// Covers each row of the issue's failure-redirect table at the workflow-service
// level: success creates and persists a Piece; stale/missing/tampered version
// redirects to the canonical route; prerequisites not satisfied redirects to
// the earliest incomplete step; stored values invalid redirects to the
// earliest invalid step; typed generator invariant failure redirects to
// /etude/review; stale aggregate epoch at commit redirects to the canonical
// route with nothing published.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { eq } from 'drizzle-orm'
import Result from 'true-myth/result'

import { user, etudeParams } from '../src/db/schema'
import type { DrizzleClient } from '../src/local-types'
import {
  loadOrCreateEtudeParams,
  updateEtudeSetup,
  updateEtudeNotes,
  updateEtudeSplit,
  type EtudeParams,
} from '../src/lib/etude-params-repository'
import { loadEtudePiece } from '../src/lib/etude-piece-repository'
import {
  generateEtude,
} from '../src/lib/workflow-service'
import { PATHS } from '../src/constants'
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

/**
 * A deterministic fake random source for reproducible tests.
 */
const makeFakeRandom = (seed: number = 0) => {
  let state = seed
  const nextInt = (maxExclusive: number): number => {
    if (maxExclusive <= 0) {
      return 0
    }
    const value = state % maxExclusive
    state += 1
    return value
  }
  return { nextInt }
}

/**
 * Complete a one-hand (right) workflow to the review step: confirm setup,
 * notes, and return the final params. Uses the repository functions directly
 * so the test exercises the same path the routes do.
 *
 * Uses non-default setup values (measureCount: 4) so `updateEtudeSetup`
 * does not treat the submission as an identical-to-defaults no-op.
 */
const completeOneHandWorkflow = async (
  db: DrizzleClient,
  userId: string,
): Promise<EtudeParams> => {
  const initial = unwrap(await loadOrCreateEtudeParams(db, userId))

  // Confirm setup: 4 measures (non-default), 4/4, C major, octave 4, right hand.
  const afterSetup = unwrap(
    await updateEtudeSetup(db, userId, initial.aggregateEpoch, initial.workflowVersion, {
      measureCount: 4,
      timeSignature: '4/4',
      hand: 'right',
      keySignature: 'C major',
      octaves: [4],
    }),
  )

  // Confirm notes: select C4, D4, E4, F4 and Q, E durations.
  const afterNotes = unwrap(
    await updateEtudeNotes(
      db,
      userId,
      afterSetup.aggregateEpoch,
      afterSetup.workflowVersion,
      ['C4', 'D4', 'E4', 'F4'],
      ['Q', 'E'],
    ),
  )

  return afterNotes
}

/**
 * Complete a two-hand workflow to the review step: confirm setup, notes, and
 * split, and return the final params.
 */
const completeTwoHandWorkflow = async (
  db: DrizzleClient,
  userId: string,
): Promise<EtudeParams> => {
  const initial = unwrap(await loadOrCreateEtudeParams(db, userId))

  const afterSetup = unwrap(
    await updateEtudeSetup(db, userId, initial.aggregateEpoch, initial.workflowVersion, {
      measureCount: 4,
      timeSignature: '3/4',
      hand: 'both',
      keySignature: 'C major',
      octaves: [4],
    }),
  )

  const afterNotes = unwrap(
    await updateEtudeNotes(
      db,
      userId,
      afterSetup.aggregateEpoch,
      afterSetup.workflowVersion,
      ['C4', 'D4', 'E4', 'F4'],
      ['H', 'Q'],
    ),
  )

  // Confirm split: boundary between D4 and E4 (left=C4,D4, right=E4,F4).
  const afterSplit = unwrap(
    await updateEtudeSplit(
      db,
      userId,
      afterNotes.aggregateEpoch,
      afterNotes.workflowVersion,
      'D4|E4',
    ),
  )

  return afterSplit
}

/**
 * Bump the aggregate epoch directly in the database to simulate Start Over
 * between acquisition and commit.
 */
const bumpEpoch = async (db: DrizzleClient, userId: string): Promise<void> => {
  await db
    .update(etudeParams)
    .set({ aggregateEpoch: 999, updatedAt: new Date() })
    .where(eq(etudeParams.userId, userId))
    .run()
}

/**
 * Directly corrupt the stored selectedDurations in the database to a value
 * that passes offerable validation but has no eligible rhythm, so the
 * generator returns a typed invariant failure.
 */
const corruptDurations = async (db: DrizzleClient, userId: string): Promise<void> => {
  await db
    .update(etudeParams)
    .set({ selectedDurations: 'R' })
    .where(eq(etudeParams.userId, userId))
    .run()
}

describe('generateEtude - success', () => {
  it('creates and persists a Piece and returns a score-bound success', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-gen-1', 'gen1@example.com')
    const params = await completeOneHandWorkflow(db, 'user-gen-1')

    const outcome = await generateEtude(
      db,
      'user-gen-1',
      String(params.workflowVersion),
      params.aggregateEpoch,
      makeFakeRandom(0),
      'corr-1',
    )

    expect(outcome.kind).toBe('success')
    if (outcome.kind === 'success') {
      expect(outcome.redirectTarget).toBe(PATHS.ETUDE_SCORE)
      expect(outcome.piece).toBeDefined()
      expect(outcome.piece.sourceParameterVersion).toBe(params.workflowVersion)
      expect(outcome.piece.measures).toHaveLength(4)
    }

    // The Piece was persisted.
    const loaded = unwrap(await loadEtudePiece(db, 'user-gen-1'))
    expect(loaded).not.toBeNull()
    expect(loaded!.sourceParameterVersion).toBe(params.workflowVersion)
  })

  it('creates and persists a two-hand Piece', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-gen-2', 'gen2@example.com')
    const params = await completeTwoHandWorkflow(db, 'user-gen-2')

    const outcome = await generateEtude(
      db,
      'user-gen-2',
      String(params.workflowVersion),
      params.aggregateEpoch,
      makeFakeRandom(0),
      'corr-2',
    )

    expect(outcome.kind).toBe('success')
    if (outcome.kind === 'success') {
      expect(outcome.piece.hand).toBe('both')
      expect(outcome.piece.measures).toHaveLength(4)
      // Both hands have notes in every measure.
      for (const measure of outcome.piece.measures) {
        expect(measure.rightHand.length).toBeGreaterThan(0)
        expect(measure.leftHand.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('generateEtude - stale version', () => {
  it('a stale workflow version redirects to the canonical route with no Piece created', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-gen-3', 'gen3@example.com')
    const params = await completeOneHandWorkflow(db, 'user-gen-3')
    const staleVersion = String(params.workflowVersion - 1)

    const outcome = await generateEtude(
      db,
      'user-gen-3',
      staleVersion,
      params.aggregateEpoch,
      makeFakeRandom(0),
      'corr-3',
    )

    expect(outcome.kind).toBe('stale-version')
    if (outcome.kind === 'stale-version') {
      // The canonical route for a complete workflow is /etude/review.
      expect(outcome.redirectTarget).toBe(PATHS.ETUDE_REVIEW)
    }

    // No Piece was created.
    const loaded = unwrap(await loadEtudePiece(db, 'user-gen-3'))
    expect(loaded).toBeNull()
  })

  it('a missing (empty) workflow version redirects to the canonical route', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-gen-4', 'gen4@example.com')
    await completeOneHandWorkflow(db, 'user-gen-4')

    const outcome = await generateEtude(db, 'user-gen-4', '', 1, makeFakeRandom(0), 'corr-4')

    expect(outcome.kind).toBe('stale-version')
  })

  it('a tampered (non-numeric) workflow version redirects to the canonical route', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-gen-5', 'gen5@example.com')
    const params = await completeOneHandWorkflow(db, 'user-gen-5')

    const outcome = await generateEtude(
      db,
      'user-gen-5',
      'not-a-number',
      params.aggregateEpoch,
      makeFakeRandom(0),
      'corr-5',
    )

    expect(outcome.kind).toBe('stale-version')
  })
})

describe('generateEtude - prerequisites not satisfied', () => {
  it('when the review predicate is false (notes unconfirmed), redirects to the earliest incomplete step', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-gen-6', 'gen6@example.com')
    const params = await completeOneHandWorkflow(db, 'user-gen-6')

    // Unconfirm the notes step by corrupting the database.
    await db
      .update(etudeParams)
      .set({ notesConfirmed: false })
      .where(eq(etudeParams.userId, 'user-gen-6'))
      .run()

    const outcome = await generateEtude(
      db,
      'user-gen-6',
      String(params.workflowVersion),
      params.aggregateEpoch,
      makeFakeRandom(0),
      'corr-6',
    )

    expect(outcome.kind).toBe('prerequisites-not-met')
    if (outcome.kind === 'prerequisites-not-met') {
      // The earliest incomplete step is /etude/notes.
      expect(outcome.redirectTarget).toBe(PATHS.ETUDE_NOTES)
    }

    // No Piece was created.
    const loaded = unwrap(await loadEtudePiece(db, 'user-gen-6'))
    expect(loaded).toBeNull()
  })
})

describe('generateEtude - stored values invalid', () => {
  it('when stored pitches are invalid, redirects to the earliest invalid step', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-gen-7', 'gen7@example.com')
    const params = await completeOneHandWorkflow(db, 'user-gen-7')

    // Corrupt the stored pitches to an invalid value.
    await db
      .update(etudeParams)
      .set({ selectedPitches: 'Z9' })
      .where(eq(etudeParams.userId, 'user-gen-7'))
      .run()

    const outcome = await generateEtude(
      db,
      'user-gen-7',
      String(params.workflowVersion),
      params.aggregateEpoch,
      makeFakeRandom(0),
      'corr-7',
    )

    expect(outcome.kind).toBe('stored-values-invalid')
    if (outcome.kind === 'stored-values-invalid') {
      expect(outcome.redirectTarget).toBe(PATHS.ETUDE_NOTES)
    }

    const loaded = unwrap(await loadEtudePiece(db, 'user-gen-7'))
    expect(loaded).toBeNull()
  })
})

describe('generateEtude - generator invariant failure', () => {
  it('a typed generator failure redirects to /etude/review with no Piece created', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-gen-8', 'gen8@example.com')
    const params = await completeOneHandWorkflow(db, 'user-gen-8')

    // Corrupt the stored durations so the generator returns
    // no-eligible-rhythms. 'R' (dotted quarter) alone has no eligible
    // complete-measure pattern for 4/4, but it is offerable for 4/4 so the
    // stored-value validation does not catch it.
    await corruptDurations(db, 'user-gen-8')

    const outcome = await generateEtude(
      db,
      'user-gen-8',
      String(params.workflowVersion),
      params.aggregateEpoch,
      makeFakeRandom(0),
      'corr-8',
    )

    expect(outcome.kind).toBe('generator-failure')
    if (outcome.kind === 'generator-failure') {
      expect(outcome.redirectTarget).toBe(PATHS.ETUDE_REVIEW)
    }

    // No Piece was created.
    const loaded = unwrap(await loadEtudePiece(db, 'user-gen-8'))
    expect(loaded).toBeNull()
  })
})

describe('generateEtude - stale aggregate epoch at commit', () => {
  it('a stale epoch at the precondition check redirects to the canonical route with nothing published', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-gen-9', 'gen9@example.com')
    const params = await completeOneHandWorkflow(db, 'user-gen-9')

    // Bump the epoch before calling generate (simulating Start Over in
    // another tab before this request was submitted).
    await bumpEpoch(db, 'user-gen-9')

    const outcome = await generateEtude(
      db,
      'user-gen-9',
      String(params.workflowVersion),
      params.aggregateEpoch,
      makeFakeRandom(0),
      'corr-9',
    )

    // The precondition check detects the stale epoch.
    expect(outcome.kind).toBe('stale-version')
    if (outcome.kind === 'stale-version') {
      // The canonical route for the current state (epoch was bumped,
      // params are unchanged) is still /etude/review.
      expect(outcome.redirectTarget).toBe(PATHS.ETUDE_REVIEW)
    }

    // Nothing was published.
    const loaded = unwrap(await loadEtudePiece(db, 'user-gen-9'))
    expect(loaded).toBeNull()
  })
})

describe('generateEtude - no aggregate', () => {
  it('when no aggregate exists, redirects to the canonical route', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-gen-10', 'gen10@example.com')

    const outcome = await generateEtude(db, 'user-gen-10', '1', 1, makeFakeRandom(0), 'corr-10')

    // No aggregate means the precondition cannot be satisfied.
    expect(outcome.kind).toBe('stale-version')
    if (outcome.kind === 'stale-version') {
      expect(outcome.redirectTarget).toBe(PATHS.ETUDE_SETUP)
    }
  })
})
