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
  expect(params.selectedOctaves).toBe('4')
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
  octaves: [4],
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

    const result = await updateEtudeSetup(db, 'user-20', before.aggregateEpoch, before.workflowVersion, validSetup)

    const after = unwrap(result)
    expect(after.measureCount).toBe(16)
    expect(after.timeSignature).toBe('3/4')
    expect(after.hand).toBe('both')
  })

  it('increments workflowVersion by exactly 1', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-21', 'twentyone@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-21'))

    const result = await updateEtudeSetup(db, 'user-21', before.aggregateEpoch, before.workflowVersion, validSetup)

    const after = unwrap(result)
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
  })

  it('sets setupConfirmed to true', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-22', 'twentytwo@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-22'))

    const result = await updateEtudeSetup(db, 'user-22', before.aggregateEpoch, before.workflowVersion, validSetup)

    const after = unwrap(result)
    expect(after.setupConfirmed).toBe(true)
  })

  it('leaves notesConfirmed and splitConfirmed unchanged', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-23', 'twentythree@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-23'))

    const result = await updateEtudeSetup(db, 'user-23', before.aggregateEpoch, before.workflowVersion, validSetup)

    const after = unwrap(result)
    expect(after.notesConfirmed).toBe(false)
    expect(after.splitConfirmed).toBe(false)
  })

  it('rejects when the supplied epoch no longer matches the stored epoch and persists nothing', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-24', 'twentyfour@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-24'))

    const staleEpoch = before.aggregateEpoch - 1
    const result = await updateEtudeSetup(db, 'user-24', staleEpoch, before.workflowVersion, validSetup)

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('epoch-mismatch')
    }
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

    const result = await updateEtudeSetup(db, 'user-25', 1, 1, validSetup)

    expect(result.isErr).toBe(true)
    expect(await countEtudeParamsForUser(db, 'user-25')).toBe(0)
  })

  it('is owner-scoped and never affects another user aggregate', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-26', 'twentysix@example.com')
    await insertUser(db, 'user-27', 'twentyseven@example.com')
    const ownerBefore = unwrap(await loadOrCreateEtudeParams(db, 'user-26'))
    const other = unwrap(await loadOrCreateEtudeParams(db, 'user-27'))

    const result = await updateEtudeSetup(db, 'user-26', ownerBefore.aggregateEpoch, ownerBefore.workflowVersion, validSetup)

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

    const result = await updateEtudeSetup(db, 'user-30', before.aggregateEpoch, before.workflowVersion, {
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

    const result = await updateEtudeSetup(db, 'user-31', before.aggregateEpoch, before.workflowVersion, {
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
    const result = await updateEtudeSetup(db, 'user-32', before.aggregateEpoch, before.workflowVersion, {
      measureCount: 12,
      timeSignature: '2/4',
      hand: 'left',
      keySignature: before.keySignature,
      octaves: [4],
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
    const result = await updateEtudeSetup(db, 'user-33', before.aggregateEpoch, before.workflowVersion, {
      measureCount: before.measureCount,
      timeSignature: before.timeSignature,
      hand: before.hand,
      keySignature: before.keySignature,
      octaves: [4],
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

    const result = await updateEtudeSetup(db, 'user-34', before.aggregateEpoch, before.workflowVersion, {
      measureCount: 20,
      timeSignature: before.timeSignature,
      hand: before.hand,
      keySignature: before.keySignature,
      octaves: [4],
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
    const result = await updateEtudeSetup(db, 'user-35', staleEpoch, before.workflowVersion, {
      ...validSetup,
      keySignature: 'E minor',
    })

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('epoch-mismatch')
    }
    // Reload and confirm nothing changed — no invalidation took place.
    const reloaded = unwrap(await loadEtudeParams(db, 'user-35'))
    expect(reloaded?.keySignature).toBe(before.keySignature)
    expect(reloaded?.workflowVersion).toBe(before.workflowVersion)
    expect(reloaded?.notesConfirmed).toBe(true)
    expect(reloaded?.splitConfirmed).toBe(true)
  })
})

describe('updateEtudeSetup octave persistence and octave-change invalidation', () => {
  it('persists the selectedOctaves value as a normalized comma-separated string', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-40', 'forty@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-40'))

    const result = await updateEtudeSetup(db, 'user-40', before.aggregateEpoch, before.workflowVersion, {
      ...validSetup,
      octaves: [2, 4, 6],
    })

    const after = unwrap(result)
    expect(after.selectedOctaves).toBe('2,4,6')
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
    expect(after.setupConfirmed).toBe(true)
  })

  it('clears notesConfirmed and splitConfirmed when only the octaves change', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-41', 'fortyone@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-41'))
    await confirmNotesAndSplit(db, 'user-41')
    const confirmed = unwrap(await loadEtudeParams(db, 'user-41'))
    expect(confirmed?.notesConfirmed).toBe(true)
    expect(confirmed?.splitConfirmed).toBe(true)

    const result = await updateEtudeSetup(db, 'user-41', before.aggregateEpoch, before.workflowVersion, {
      ...validSetup,
      octaves: [2, 3, 4, 5, 6],
    })

    const after = unwrap(result)
    expect(after.selectedOctaves).toBe('2,3,4,5,6')
    expect(after.notesConfirmed).toBe(false)
    expect(after.splitConfirmed).toBe(false)
  })

  it('leaves notesConfirmed and splitConfirmed unchanged when octaves are identical but another field changes', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-42', 'fortytwo@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-42'))
    await confirmNotesAndSplit(db, 'user-42')

    const result = await updateEtudeSetup(db, 'user-42', before.aggregateEpoch, before.workflowVersion, {
      measureCount: 12,
      timeSignature: '2/4',
      hand: 'left',
      keySignature: before.keySignature,
      octaves: [4],
    })

    const after = unwrap(result)
    expect(after.notesConfirmed).toBe(true)
    expect(after.splitConfirmed).toBe(true)
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
  })

  it('does not increment the workflow version when all five fields are identical to the stored ones', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-43', 'fortythree@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-43'))
    await confirmNotesAndSplit(db, 'user-43')

    const result = await updateEtudeSetup(db, 'user-43', before.aggregateEpoch, before.workflowVersion, {
      measureCount: before.measureCount,
      timeSignature: before.timeSignature,
      hand: before.hand,
      keySignature: before.keySignature,
      octaves: [4],
    })

    const after = unwrap(result)
    expect(after.workflowVersion).toBe(before.workflowVersion)
    expect(after.notesConfirmed).toBe(true)
    expect(after.splitConfirmed).toBe(true)
  })

  it('clears notesConfirmed and splitConfirmed when both key and octaves change', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-44', 'fortyfour@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-44'))
    await confirmNotesAndSplit(db, 'user-44')

    const result = await updateEtudeSetup(db, 'user-44', before.aggregateEpoch, before.workflowVersion, {
      ...validSetup,
      keySignature: 'A minor',
      octaves: [2, 3, 4, 5, 6],
    })

    const after = unwrap(result)
    expect(after.keySignature).toBe('A minor')
    expect(after.selectedOctaves).toBe('2,3,4,5,6')
    expect(after.notesConfirmed).toBe(false)
    expect(after.splitConfirmed).toBe(false)
  })

  it('still rejects an epoch mismatch and performs no octave invalidation', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-45', 'fortyfive@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-45'))
    await confirmNotesAndSplit(db, 'user-45')

    const staleEpoch = before.aggregateEpoch - 1
    const result = await updateEtudeSetup(db, 'user-45', staleEpoch, before.workflowVersion, {
      ...validSetup,
      octaves: [2, 3, 4, 5, 6],
    })

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('epoch-mismatch')
    }
    const reloaded = unwrap(await loadEtudeParams(db, 'user-45'))
    expect(reloaded?.selectedOctaves).toBe(before.selectedOctaves)
    expect(reloaded?.workflowVersion).toBe(before.workflowVersion)
    expect(reloaded?.notesConfirmed).toBe(true)
    expect(reloaded?.splitConfirmed).toBe(true)
  })
})

describe('updateEtudeSetup workflowVersion compare-and-set', () => {
  it('succeeds and increments the version when the expected version matches the stored version', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-50', 'fifty@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-50'))

    const result = await updateEtudeSetup(
      db,
      'user-50',
      before.aggregateEpoch,
      before.workflowVersion,
      validSetup,
    )

    const after = unwrap(result)
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
    expect(after.measureCount).toBe(16)
  })

  it('rejects with a typed version-mismatch when the expected version is older than the stored version and persists nothing', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-51', 'fiftyone@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-51'))
    // Bump the stored version by doing a first successful update.
    const firstUpdate = unwrap(
      await updateEtudeSetup(db, 'user-51', before.aggregateEpoch, before.workflowVersion, validSetup),
    )
    expect(firstUpdate.workflowVersion).toBe(before.workflowVersion + 1)

    // Now submit with the old (stale) version.
    const staleVersion = before.workflowVersion
    const result = await updateEtudeSetup(
      db,
      'user-51',
      firstUpdate.aggregateEpoch,
      staleVersion,
      { ...validSetup, measureCount: 20 },
    )

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('version-mismatch')
    }
    // Reload and confirm nothing changed — the stale submission persisted nothing.
    const reloaded = unwrap(await loadEtudeParams(db, 'user-51'))
    expect(reloaded?.workflowVersion).toBe(firstUpdate.workflowVersion)
    expect(reloaded?.measureCount).toBe(16)
  })

  it('rejects with a typed version-mismatch when the expected version is newer than the stored version and persists nothing', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-52', 'fiftytwo@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-52'))

    // Submit a version that is ahead of the current stored version.
    const newerVersion = before.workflowVersion + 5
    const result = await updateEtudeSetup(
      db,
      'user-52',
      before.aggregateEpoch,
      newerVersion,
      validSetup,
    )

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('version-mismatch')
    }
    // Reload and confirm nothing changed.
    const reloaded = unwrap(await loadEtudeParams(db, 'user-52'))
    expect(reloaded?.workflowVersion).toBe(before.workflowVersion)
    expect(reloaded?.measureCount).toBe(before.measureCount)
    expect(reloaded?.setupConfirmed).toBe(false)
  })

  it('rejects at most one of two concurrent updates with the same expected version', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-53', 'fiftythree@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-53'))

    const [a, b] = await Promise.all([
      updateEtudeSetup(db, 'user-53', before.aggregateEpoch, before.workflowVersion, {
        ...validSetup,
        measureCount: 12,
      }),
      updateEtudeSetup(db, 'user-53', before.aggregateEpoch, before.workflowVersion, {
        ...validSetup,
        measureCount: 20,
      }),
    ])

    const okCount = [a, b].filter((r) => r.isOk).length
    const errCount = [a, b].filter((r) => r.isErr).length
    expect(okCount).toBe(1)
    expect(errCount).toBe(1)
    // The error is a typed version-mismatch (the row that lost the CAS).
    const errResult = [a, b].find((r) => r.isErr)!
    if (!errResult.isOk) {
      expect(errResult.error.kind).toBe('version-mismatch')
    }

    // Reload and confirm the version incremented exactly once.
    const reloaded = unwrap(await loadEtudeParams(db, 'user-53'))
    expect(reloaded?.workflowVersion).toBe(before.workflowVersion + 1)
    // The winner's measureCount is persisted — either 12 or 20.
    expect([12, 20]).toContain(reloaded!.measureCount)
  })

  it('rejects an identical resubmit with a stale version as a version-mismatch', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-54', 'fiftyfour@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-54'))
    // First update succeeds, version increments.
    const firstUpdate = unwrap(
      await updateEtudeSetup(db, 'user-54', before.aggregateEpoch, before.workflowVersion, validSetup),
    )

    // Resubmit the exact same values but with the stale version.
    const result = await updateEtudeSetup(
      db,
      'user-54',
      firstUpdate.aggregateEpoch,
      before.workflowVersion,
      validSetup,
    )

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('version-mismatch')
    }
    const reloaded = unwrap(await loadEtudeParams(db, 'user-54'))
    expect(reloaded?.workflowVersion).toBe(firstUpdate.workflowVersion)
  })
})
