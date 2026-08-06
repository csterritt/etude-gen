// ====================================
// Tests for the Etude Params repository.
// Verifies one aggregate per owner, default values on creation, idempotent
// load-or-create, owner-scoped reads, database-level uniqueness, the
// losing-caller uniqueness-violation-as-load path, Promise.all idempotency,
// no confirmed steps on a fresh aggregate, and cascade deletion with the
// user row.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { eq } from 'drizzle-orm'
import Result from 'true-myth/result'

import { user, etudeParams } from '../src/db/schema'
import type { DrizzleClient } from '../src/local-types'
import {
  loadOrCreateEtudeParams,
  loadEtudeParams,
  updateEtudeSetup,
  type EtudeParams,
} from '../src/lib/etude-params-repository'
import type { ValidSetup } from '../src/lib/setup-validator'
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

const countEtudeParamsForUser = async (db: DrizzleClient, userId: string): Promise<number> => {
  const rows = await db
    .select({ id: etudeParams.id })
    .from(etudeParams)
    .where(eq(etudeParams.userId, userId))
    .all()
  return rows.length
}

const assertDefaults = (params: EtudeParams): void => {
  expect(params.measureCount).toBe(8)
  expect(params.timeSignature).toBe('4/4')
  expect(params.keySignature).toBe('C major')
  expect(params.octaveRange).toBe(4)
  expect(params.hand).toBe('right')
  expect(params.workflowVersion).toBe(1)
  expect(params.aggregateEpoch).toBe(1)
}

describe('loadOrCreateEtudeParams', () => {
  it('creates one record with the default values for a new user', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-1', 'one@example.com')

    const result = await loadOrCreateEtudeParams(db, 'user-1')

    const params = unwrap(result)
    expect(params.userId).toBe('user-1')
    assertDefaults(params)
    expect(await countEtudeParamsForUser(db, 'user-1')).toBe(1)
  })

  it('does not create a second record on a second call and returns the same aggregate', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-2', 'two@example.com')

    const first = unwrap(await loadOrCreateEtudeParams(db, 'user-2'))
    const second = unwrap(await loadOrCreateEtudeParams(db, 'user-2'))

    expect(second.id).toBe(first.id)
    expect(await countEtudeParamsForUser(db, 'user-2')).toBe(1)
  })

  it('reports no confirmed steps on a freshly created aggregate', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-3', 'three@example.com')

    const params = unwrap(await loadOrCreateEtudeParams(db, 'user-3'))

    expect(params.setupConfirmed).toBe(false)
    expect(params.notesConfirmed).toBe(false)
    expect(params.splitConfirmed).toBe(false)
  })

  it('treats a uniqueness violation as a load of the winner aggregate, not an error', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-4', 'four@example.com')
    // Pre-insert the winner row so the loadOrCreate insert hits the UNIQUE
    // constraint on userId and must fall back to a load.
    const winner = unwrap(await loadOrCreateEtudeParams(db, 'user-4'))

    const result = await loadOrCreateEtudeParams(db, 'user-4')

    const loaded = unwrap(result)
    expect(loaded.id).toBe(winner.id)
    expect(await countEtudeParamsForUser(db, 'user-4')).toBe(1)
  })

  it('results in exactly one aggregate when two concurrent calls race for the same new user', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-5', 'five@example.com')

    const [a, b] = await Promise.all([
      loadOrCreateEtudeParams(db, 'user-5'),
      loadOrCreateEtudeParams(db, 'user-5'),
    ])

    const paramsA = unwrap(a)
    const paramsB = unwrap(b)
    expect(paramsA.id).toBe(paramsB.id)
    expect(await countEtudeParamsForUser(db, 'user-5')).toBe(1)
  })
})

describe('database uniqueness constraint', () => {
  it('rejects a direct second insert for a user who already has one aggregate', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-6', 'six@example.com')

    void db
      .insert(etudeParams)
      .values({
        id: 'ep-6-a',
        userId: 'user-6',
        createdAt: new Date(0),
        updatedAt: new Date(0),
      })
      .run()

    expect(() => {
      void db
        .insert(etudeParams)
        .values({
          id: 'ep-6-b',
          userId: 'user-6',
          createdAt: new Date(0),
          updatedAt: new Date(0),
        })
        .run()
    }).toThrow()
  })
})

describe('loadEtudeParams', () => {
  it('is owner-scoped and never returns another user aggregate', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-7', 'seven@example.com')
    await insertUser(db, 'user-8', 'eight@example.com')
    await loadOrCreateEtudeParams(db, 'user-7')

    const result = await loadEtudeParams(db, 'user-8')

    expect(unwrap(result)).toBeNull()
  })

  it('returns the owner aggregate when one exists', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-9', 'nine@example.com')
    const created = unwrap(await loadOrCreateEtudeParams(db, 'user-9'))

    const result = await loadEtudeParams(db, 'user-9')

    expect(unwrap(result)?.id).toBe(created.id)
  })
})

describe('cascade deletion', () => {
  it('removes the etude_params row when the user row is deleted', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-10', 'ten@example.com')
    await loadOrCreateEtudeParams(db, 'user-10')
    expect(await countEtudeParamsForUser(db, 'user-10')).toBe(1)

    await db.delete(user).where(eq(user.id, 'user-10')).run()

    expect(await countEtudeParamsForUser(db, 'user-10')).toBe(0)
  })
})

const validSetup: ValidSetup = {
  measureCount: 16,
  timeSignature: '3/4',
  hand: 'both',
  keySignature: 'C major',
}

/**
 * Set the notesConfirmed and splitConfirmed flags directly in the test DB
 * so a subsequent updateEtudeSetup can be observed clearing them on a key
 * change (or leaving them on an identical key resubmit).
 */
const confirmNotesAndSplit = async (db: DrizzleClient, userId: string): Promise<void> => {
  await db
    .update(etudeParams)
    .set({ notesConfirmed: true, splitConfirmed: true })
    .where(eq(etudeParams.userId, userId))
    .run()
}

describe('updateEtudeSetup', () => {
  it('persists the measure count, time signature, and hand values', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-20', 'twenty@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-20'))

    const result = await updateEtudeSetup(db, 'user-20', before.aggregateEpoch, validSetup)

    const after = unwrap(result)
    expect(after.measureCount).toBe(16)
    expect(after.timeSignature).toBe('3/4')
    expect(after.hand).toBe('both')
  })

  it('increments workflowVersion by exactly 1', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-21', 'twentyone@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-21'))

    const result = await updateEtudeSetup(db, 'user-21', before.aggregateEpoch, validSetup)

    const after = unwrap(result)
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
  })

  it('sets setupConfirmed to true', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-22', 'twentytwo@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-22'))

    const result = await updateEtudeSetup(db, 'user-22', before.aggregateEpoch, validSetup)

    const after = unwrap(result)
    expect(after.setupConfirmed).toBe(true)
  })

  it('leaves notesConfirmed and splitConfirmed unchanged', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-23', 'twentythree@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-23'))

    const result = await updateEtudeSetup(db, 'user-23', before.aggregateEpoch, validSetup)

    const after = unwrap(result)
    expect(after.notesConfirmed).toBe(false)
    expect(after.splitConfirmed).toBe(false)
  })

  it('rejects when the supplied epoch no longer matches the stored epoch and persists nothing', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-24', 'twentyfour@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-24'))

    const staleEpoch = before.aggregateEpoch - 1
    const result = await updateEtudeSetup(db, 'user-24', staleEpoch, validSetup)

    expect(result.isErr).toBe(true)
    // Reload and confirm the stored aggregate is unchanged.
    const reloaded = unwrap(await loadEtudeParams(db, 'user-24'))
    expect(reloaded?.measureCount).toBe(before.measureCount)
    expect(reloaded?.timeSignature).toBe(before.timeSignature)
    expect(reloaded?.hand).toBe(before.hand)
    expect(reloaded?.workflowVersion).toBe(before.workflowVersion)
    expect(reloaded?.setupConfirmed).toBe(false)
  })

  it('returns an error and creates no row when the user owns no aggregate', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-25', 'twentyfive@example.com')

    const result = await updateEtudeSetup(db, 'user-25', 1, validSetup)

    expect(result.isErr).toBe(true)
    expect(await countEtudeParamsForUser(db, 'user-25')).toBe(0)
  })

  it('is owner-scoped and never affects another user aggregate', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-26', 'twentysix@example.com')
    await insertUser(db, 'user-27', 'twentyseven@example.com')
    const ownerBefore = unwrap(await loadOrCreateEtudeParams(db, 'user-26'))
    const other = unwrap(await loadOrCreateEtudeParams(db, 'user-27'))

    const result = await updateEtudeSetup(db, 'user-26', ownerBefore.aggregateEpoch, validSetup)

    const ownerAfter = unwrap(result)
    expect(ownerAfter.userId).toBe('user-26')
    // The other user's aggregate is untouched.
    const otherReloaded = unwrap(await loadEtudeParams(db, 'user-27'))
    expect(otherReloaded?.id).toBe(other.id)
    expect(otherReloaded?.measureCount).toBe(other.measureCount)
    expect(otherReloaded?.workflowVersion).toBe(other.workflowVersion)
    expect(otherReloaded?.setupConfirmed).toBe(false)
  })
})

describe('updateEtudeSetup key persistence and key-change invalidation', () => {
  it('persists the keySignature value and increments the workflow version', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-30', 'thirty@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-30'))

    const result = await updateEtudeSetup(db, 'user-30', before.aggregateEpoch, {
      ...validSetup,
      keySignature: 'E-flat major',
    })

    const after = unwrap(result)
    expect(after.keySignature).toBe('E-flat major')
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
    expect(after.setupConfirmed).toBe(true)
  })

  it('clears notesConfirmed and splitConfirmed when the submitted key differs from the stored key', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-31', 'thirtyone@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-31'))
    // Confirm the downstream steps directly so a key change can be observed
    // clearing them in the same committed transition.
    await confirmNotesAndSplit(db, 'user-31')
    const confirmed = unwrap(await loadEtudeParams(db, 'user-31'))
    expect(confirmed?.notesConfirmed).toBe(true)
    expect(confirmed?.splitConfirmed).toBe(true)

    const result = await updateEtudeSetup(db, 'user-31', before.aggregateEpoch, {
      ...validSetup,
      keySignature: 'A minor',
    })

    const after = unwrap(result)
    expect(after.keySignature).toBe('A minor')
    expect(after.notesConfirmed).toBe(false)
    expect(after.splitConfirmed).toBe(false)
  })

  it('leaves notesConfirmed and splitConfirmed unchanged when the submitted key is identical to the stored key', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-32', 'thirtytwo@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-32'))
    await confirmNotesAndSplit(db, 'user-32')

    // Resubmit with the same key but a different non-key field so the
    // version still increments; the confirmation flags must survive.
    const result = await updateEtudeSetup(db, 'user-32', before.aggregateEpoch, {
      measureCount: 12,
      timeSignature: '2/4',
      hand: 'left',
      keySignature: before.keySignature,
    })

    const after = unwrap(result)
    expect(after.keySignature).toBe(before.keySignature)
    expect(after.notesConfirmed).toBe(true)
    expect(after.splitConfirmed).toBe(true)
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
  })

  it('does not increment the workflow version and changes no flags when all submitted values are identical to the stored ones', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-33', 'thirtythree@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-33'))
    await confirmNotesAndSplit(db, 'user-33')

    // Resubmit the exact stored values.
    const result = await updateEtudeSetup(db, 'user-33', before.aggregateEpoch, {
      measureCount: before.measureCount,
      timeSignature: before.timeSignature,
      hand: before.hand,
      keySignature: before.keySignature,
    })

    const after = unwrap(result)
    expect(after.workflowVersion).toBe(before.workflowVersion)
    expect(after.notesConfirmed).toBe(true)
    expect(after.splitConfirmed).toBe(true)
    expect(after.setupConfirmed).toBe(before.setupConfirmed)
  })

  it('changing only a non-key field increments the version but does not clear notesConfirmed or splitConfirmed', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-34', 'thirtyfour@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-34'))
    await confirmNotesAndSplit(db, 'user-34')

    const result = await updateEtudeSetup(db, 'user-34', before.aggregateEpoch, {
      measureCount: 20,
      timeSignature: before.timeSignature,
      hand: before.hand,
      keySignature: before.keySignature,
    })

    const after = unwrap(result)
    expect(after.measureCount).toBe(20)
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
    expect(after.notesConfirmed).toBe(true)
    expect(after.splitConfirmed).toBe(true)
  })

  it('still rejects an epoch mismatch and performs no invalidation', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-35', 'thirtyfive@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-35'))
    await confirmNotesAndSplit(db, 'user-35')

    const staleEpoch = before.aggregateEpoch - 1
    const result = await updateEtudeSetup(db, 'user-35', staleEpoch, {
      ...validSetup,
      keySignature: 'E minor',
    })

    expect(result.isErr).toBe(true)
    // Reload and confirm nothing changed — no invalidation took place.
    const reloaded = unwrap(await loadEtudeParams(db, 'user-35'))
    expect(reloaded?.keySignature).toBe(before.keySignature)
    expect(reloaded?.workflowVersion).toBe(before.workflowVersion)
    expect(reloaded?.notesConfirmed).toBe(true)
    expect(reloaded?.splitConfirmed).toBe(true)
  })
})
