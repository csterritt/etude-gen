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
  updateEtudePitches,
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

/**
 * Seed the downstream selection data and confirmation flags directly in the
 * test DB so a subsequent updateEtudeSetup can be observed clearing or
 * retaining downstream state per the Issue 11 dependency map. Mirrors what the
 * notes and split steps (Issues 13, 14, 16) will write when they exist.
 */
const seedDownstreamState = async (
  db: DrizzleClient,
  userId: string,
  overrides: {
    selectedPitches?: string | null
    selectedDurations?: string | null
    splitBoundary?: string | null
    notesConfirmed?: boolean
    splitConfirmed?: boolean
  } = {},
): Promise<void> => {
  await db
    .update(etudeParams)
    .set({
      notesConfirmed: overrides.notesConfirmed ?? true,
      splitConfirmed: overrides.splitConfirmed ?? true,
      selectedPitches: overrides.selectedPitches ?? 'C4,D4',
      selectedDurations: overrides.selectedDurations ?? 'quarter,eighth',
      splitBoundary: overrides.splitBoundary ?? 'D4',
    })
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

  it('clears selectedPitches and splitBoundary (not selectedDurations) when the key changes', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-31b', 'thirtyone-b@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-31b'))
    await seedDownstreamState(db, 'user-31b')

    // Only the key changes — meter, hand, and octaves stay at the stored
    // defaults so only the key row of the dependency map applies.
    const result = await updateEtudeSetup(db, 'user-31b', before.aggregateEpoch, before.workflowVersion, {
      measureCount: before.measureCount,
      timeSignature: before.timeSignature,
      hand: before.hand,
      keySignature: 'A minor',
      octaves: [4],
    })

    const after = unwrap(result)
    expect(after.selectedPitches).toBeNull()
    expect(after.splitBoundary).toBeNull()
    expect(after.selectedDurations).toBe('quarter,eighth')
    expect(after.notesConfirmed).toBe(false)
    expect(after.splitConfirmed).toBe(false)
  })

  it('leaves notesConfirmed and splitConfirmed unchanged when the submitted key is identical to the stored key', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-32', 'thirtytwo@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-32'))
    await confirmNotesAndSplit(db, 'user-32')

    // Resubmit with the same key, octaves, meter, and hand — only the measure
    // count changes (the one setup field that invalidates nothing downstream,
    // per the Issue 11 dependency map) — so the version still increments but
    // the confirmation flags must survive.
    const result = await updateEtudeSetup(db, 'user-32', before.aggregateEpoch, before.workflowVersion, {
      measureCount: 12,
      timeSignature: before.timeSignature,
      hand: before.hand,
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

  it('clears selectedPitches and splitBoundary (not selectedDurations) when only the octaves change', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-41b', 'fortyone-b@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-41b'))
    await seedDownstreamState(db, 'user-41b')

    // Only the octaves change — key, meter, and hand stay at the stored
    // defaults so only the octave-range row of the dependency map applies.
    const result = await updateEtudeSetup(db, 'user-41b', before.aggregateEpoch, before.workflowVersion, {
      measureCount: before.measureCount,
      timeSignature: before.timeSignature,
      hand: before.hand,
      keySignature: before.keySignature,
      octaves: [2, 3, 4, 5, 6],
    })

    const after = unwrap(result)
    expect(after.selectedPitches).toBeNull()
    expect(after.splitBoundary).toBeNull()
    expect(after.selectedDurations).toBe('quarter,eighth')
  })

  it('leaves notesConfirmed and splitConfirmed unchanged when octaves are identical but another field changes', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-42', 'fortytwo@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-42'))
    await confirmNotesAndSplit(db, 'user-42')

    // Only the measure count changes (the one setup field that invalidates
    // nothing downstream, per the Issue 11 dependency map); key, octaves,
    // meter, and hand are all identical to the stored values.
    const result = await updateEtudeSetup(db, 'user-42', before.aggregateEpoch, before.workflowVersion, {
      measureCount: 12,
      timeSignature: before.timeSignature,
      hand: before.hand,
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

describe('updateEtudeSetup full dependent-downstream invalidation (Issue 11)', () => {
  it('clears selectedDurations (not pitches or split) when the meter changes', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-60', 'sixty@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-60'))
    await seedDownstreamState(db, 'user-60')

    // Only the meter changes — key, octaves, and hand stay at the stored
    // defaults so only the meter row of the dependency map applies.
    const result = await updateEtudeSetup(db, 'user-60', before.aggregateEpoch, before.workflowVersion, {
      measureCount: before.measureCount,
      timeSignature: '3/4',
      hand: before.hand,
      keySignature: before.keySignature,
      octaves: [4],
    })

    const after = unwrap(result)
    expect(after.selectedDurations).toBeNull()
    expect(after.selectedPitches).toBe('C4,D4')
    expect(after.splitBoundary).toBe('D4')
    expect(after.notesConfirmed).toBe(false)
    expect(after.splitConfirmed).toBe(true)
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
  })

  it('retains all downstream state when only the measure count changes', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-61', 'sixtyone@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-61'))
    await seedDownstreamState(db, 'user-61')

    // Only measureCount changes — key, octaves, meter, and hand are identical
    // to the stored defaults, so nothing downstream is invalidated.
    const result = await updateEtudeSetup(db, 'user-61', before.aggregateEpoch, before.workflowVersion, {
      measureCount: 12,
      timeSignature: before.timeSignature,
      hand: before.hand,
      keySignature: before.keySignature,
      octaves: [4],
    })

    const after = unwrap(result)
    expect(after.selectedPitches).toBe('C4,D4')
    expect(after.selectedDurations).toBe('quarter,eighth')
    expect(after.splitBoundary).toBe('D4')
    expect(after.notesConfirmed).toBe(true)
    expect(after.splitConfirmed).toBe(true)
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
  })

  it('clears splitBoundary and unconfirms notes when switching to both hands with fewer than two pitches', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-62', 'sixtytwo@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-62'))
    await seedDownstreamState(db, 'user-62', {
      selectedPitches: 'C4',
      splitBoundary: null,
    })

    // Only the hand changes to 'both' — key, octaves, and meter stay at the
    // stored defaults. With fewer than two stored pitches, the notes step is
    // unconfirmed (two-hand revalidation).
    const result = await updateEtudeSetup(db, 'user-62', before.aggregateEpoch, before.workflowVersion, {
      measureCount: before.measureCount,
      timeSignature: before.timeSignature,
      hand: 'both',
      keySignature: before.keySignature,
      octaves: [4],
    })

    const after = unwrap(result)
    expect(after.splitBoundary).toBeNull()
    expect(after.selectedPitches).toBe('C4')
    expect(after.selectedDurations).toBe('quarter,eighth')
    expect(after.notesConfirmed).toBe(false)
    expect(after.splitConfirmed).toBe(false)
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
  })

  it('clears splitBoundary but keeps notes confirmed when switching to both hands with two or more pitches', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-63', 'sixtythree@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-63'))
    await seedDownstreamState(db, 'user-63', { selectedPitches: 'C4,D4' })

    // Only the hand changes to 'both' — key, octaves, and meter stay at the
    // stored defaults. With two stored pitches, the notes step stays confirmed.
    const result = await updateEtudeSetup(db, 'user-63', before.aggregateEpoch, before.workflowVersion, {
      measureCount: before.measureCount,
      timeSignature: before.timeSignature,
      hand: 'both',
      keySignature: before.keySignature,
      octaves: [4],
    })

    const after = unwrap(result)
    expect(after.splitBoundary).toBeNull()
    expect(after.selectedPitches).toBe('C4,D4')
    expect(after.notesConfirmed).toBe(true)
    expect(after.splitConfirmed).toBe(false)
  })

  it('clears splitBoundary but keeps notes confirmed when switching to one hand', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-64', 'sixtyfour@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-64'))
    await seedDownstreamState(db, 'user-64', { selectedPitches: 'C4,D4' })

    // Only the hand changes to 'left' — key, octaves, and meter stay at the
    // stored defaults. One-hand mode never requires the split step.
    const result = await updateEtudeSetup(db, 'user-64', before.aggregateEpoch, before.workflowVersion, {
      measureCount: before.measureCount,
      timeSignature: before.timeSignature,
      hand: 'left',
      keySignature: before.keySignature,
      octaves: [4],
    })

    const after = unwrap(result)
    expect(after.splitBoundary).toBeNull()
    expect(after.selectedPitches).toBe('C4,D4')
    expect(after.notesConfirmed).toBe(true)
    expect(after.splitConfirmed).toBe(false)
  })

  it('clears the union of dependents when key and meter both change in one submission', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-65', 'sixtyfive@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-65'))
    await seedDownstreamState(db, 'user-65')

    // Key and meter both change — hand and octaves stay at the stored defaults.
    // The union of their dependents (pitches, durations, split) is cleared in
    // this single committed transition, and the version increments exactly once.
    const result = await updateEtudeSetup(db, 'user-65', before.aggregateEpoch, before.workflowVersion, {
      measureCount: before.measureCount,
      timeSignature: '3/4',
      hand: before.hand,
      keySignature: 'G major',
      octaves: [4],
    })

    const after = unwrap(result)
    expect(after.selectedPitches).toBeNull()
    expect(after.selectedDurations).toBeNull()
    expect(after.splitBoundary).toBeNull()
    expect(after.notesConfirmed).toBe(false)
    expect(after.splitConfirmed).toBe(false)
    expect(after.workflowVersion).toBe(before.workflowVersion + 1)
  })

  it('retains all downstream state on an identical resubmit', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-66', 'sixtysix@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-66'))
    // First, commit a setup so the stored values match validSetup.
    const first = unwrap(
      await updateEtudeSetup(db, 'user-66', before.aggregateEpoch, before.workflowVersion, validSetup),
    )
    await seedDownstreamState(db, 'user-66')

    // Resubmit the exact stored values.
    const result = await updateEtudeSetup(db, 'user-66', first.aggregateEpoch, first.workflowVersion, {
      measureCount: validSetup.measureCount,
      timeSignature: validSetup.timeSignature,
      hand: validSetup.hand,
      keySignature: validSetup.keySignature,
      octaves: validSetup.octaves,
    })

    const after = unwrap(result)
    expect(after.selectedPitches).toBe('C4,D4')
    expect(after.selectedDurations).toBe('quarter,eighth')
    expect(after.splitBoundary).toBe('D4')
    expect(after.notesConfirmed).toBe(true)
    expect(after.splitConfirmed).toBe(true)
    expect(after.workflowVersion).toBe(first.workflowVersion)
  })

  it('rejects a stale version alongside upstream changes before any invalidation takes place', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-67', 'sixtyseven@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(db, 'user-67'))
    await seedDownstreamState(db, 'user-67')
    // Bump the stored version with a first successful update.
    const first = unwrap(
      await updateEtudeSetup(db, 'user-67', before.aggregateEpoch, before.workflowVersion, {
        ...validSetup,
        measureCount: 12,
      }),
    )
    // Re-seed downstream state because the first update changed only measureCount
    // (no invalidation), but seedDownstreamState was called before the update.
    await seedDownstreamState(db, 'user-67')

    // Submit a key change carrying the stale version.
    const staleVersion = before.workflowVersion
    const result = await updateEtudeSetup(db, 'user-67', first.aggregateEpoch, staleVersion, {
      ...validSetup,
      keySignature: 'G major',
    })

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('version-mismatch')
    }
    // Reload and confirm the prior upstream values, downstream selections, and
    // version are all still in place — the CAS rejected first, nothing cleared.
    const reloaded = unwrap(await loadEtudeParams(db, 'user-67'))
    expect(reloaded?.keySignature).toBe(first.keySignature)
    expect(reloaded?.selectedPitches).toBe('C4,D4')
    expect(reloaded?.selectedDurations).toBe('quarter,eighth')
    expect(reloaded?.splitBoundary).toBe('D4')
    expect(reloaded?.notesConfirmed).toBe(true)
    expect(reloaded?.splitConfirmed).toBe(true)
    expect(reloaded?.workflowVersion).toBe(first.workflowVersion)
  })

  it('returns a db-error and persists nothing when the invalidating write throws', async () => {
    const realDb = createTestDb()
    await insertUser(realDb, 'user-68', 'sixtyeight@example.com')
    const before = unwrap(await loadOrCreateEtudeParams(realDb, 'user-68'))
    await seedDownstreamState(realDb, 'user-68')

    // Wrap the realDb so the update() call throws, but select() still works.
    const throwingDb = new Proxy(realDb, {
      get(target, prop, receiver) {
        if (prop === 'update') {
          return () => {
            throw new Error('injected failure')
          }
        }
        return Reflect.get(target, prop, receiver)
      },
    }) as unknown as DrizzleClient

    const result = await updateEtudeSetup(
      throwingDb,
      'user-68',
      before.aggregateEpoch,
      before.workflowVersion,
      { ...validSetup, keySignature: 'G major' },
    )

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('db-error')
    }
    // Confirm via the real client that nothing was persisted — prior upstream
    // values, downstream selections, and version are all unchanged.
    const reloaded = unwrap(await loadEtudeParams(realDb, 'user-68'))
    expect(reloaded?.keySignature).toBe(before.keySignature)
    expect(reloaded?.selectedPitches).toBe('C4,D4')
    expect(reloaded?.selectedDurations).toBe('quarter,eighth')
    expect(reloaded?.splitBoundary).toBe('D4')
    expect(reloaded?.notesConfirmed).toBe(true)
    expect(reloaded?.splitConfirmed).toBe(true)
    expect(reloaded?.workflowVersion).toBe(before.workflowVersion)
  })
})

/**
 * Confirm the setup step by calling updateEtudeSetup with validSetup and the
 * current epoch/version, so the notes step (which requires setupConfirmed) is
 * reachable. Returns the post-update aggregate.
 */
const confirmSetup = async (db: DrizzleClient, userId: string): Promise<EtudeParams> => {
  const before = unwrap(await loadOrCreateEtudeParams(db, userId))
  return unwrap(
    await updateEtudeSetup(db, userId, before.aggregateEpoch, before.workflowVersion, validSetup),
  )
}

describe('updateEtudePitches', () => {
  it('persists selectedPitches and increments the workflow version', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-100', 'onehundred@example.com')
    const confirmed = await confirmSetup(db, 'user-100')
    const versionBefore = confirmed.workflowVersion

    const result = await updateEtudePitches(
      db,
      'user-100',
      confirmed.aggregateEpoch,
      confirmed.workflowVersion,
      ['C4', 'D4', 'E4'],
    )

    const after = unwrap(result)
    expect(after.selectedPitches).toBe('C4,D4,E4')
    expect(after.workflowVersion).toBe(versionBefore + 1)
    expect(after.setupConfirmed).toBe(true)
    // notesConfirmed stays false — durations are Issue 14.
    expect(after.notesConfirmed).toBe(false)
    // Other downstream state is unchanged.
    expect(after.selectedDurations).toBe(confirmed.selectedDurations)
    expect(after.splitBoundary).toBe(confirmed.splitBoundary)
    expect(after.splitConfirmed).toBe(confirmed.splitConfirmed)
  })

  it('rejects a stale workflow version and persists nothing', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-101', 'onehundredone@example.com')
    const confirmed = await confirmSetup(db, 'user-101')

    const staleVersion = confirmed.workflowVersion - 1
    const result = await updateEtudePitches(
      db,
      'user-101',
      confirmed.aggregateEpoch,
      staleVersion,
      ['C4', 'D4'],
    )

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('version-mismatch')
    }
    // Reload and confirm nothing changed.
    const reloaded = unwrap(await loadEtudeParams(db, 'user-101'))
    expect(reloaded?.selectedPitches).toBeNull()
    expect(reloaded?.workflowVersion).toBe(confirmed.workflowVersion)
  })

  it('rejects a stale epoch and persists nothing', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-102', 'onehundredtwo@example.com')
    const confirmed = await confirmSetup(db, 'user-102')

    const staleEpoch = confirmed.aggregateEpoch - 1
    const result = await updateEtudePitches(
      db,
      'user-102',
      staleEpoch,
      confirmed.workflowVersion,
      ['C4', 'D4'],
    )

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('epoch-mismatch')
    }
    const reloaded = unwrap(await loadEtudeParams(db, 'user-102'))
    expect(reloaded?.selectedPitches).toBeNull()
    expect(reloaded?.workflowVersion).toBe(confirmed.workflowVersion)
  })

  it('wraps an injected update failure as a db-error and persists nothing', async () => {
    const realDb = createTestDb()
    await insertUser(realDb, 'user-103', 'onehundredthree@example.com')
    const confirmed = await confirmSetup(realDb, 'user-103')
    // First save a pitch selection on the real DB so we can confirm the
    // injected failure does not clobber it.
    const firstSave = unwrap(
      await updateEtudePitches(
        realDb,
        'user-103',
        confirmed.aggregateEpoch,
        confirmed.workflowVersion,
        ['C4', 'D4'],
      ),
    )

    // Build a DrizzleClient wrapper whose update throws.
    const throwingDb = {
      ...realDb,
      update: () => {
        throw new Error('injected update failure')
      },
    } as unknown as DrizzleClient

    const result = await updateEtudePitches(
      throwingDb,
      'user-103',
      firstSave.aggregateEpoch,
      firstSave.workflowVersion,
      ['C4', 'D4', 'E4'],
    )

    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('db-error')
    }
    // Confirm via the real client that nothing was persisted.
    const reloaded = unwrap(await loadEtudeParams(realDb, 'user-103'))
    expect(reloaded?.selectedPitches).toBe('C4,D4')
    expect(reloaded?.workflowVersion).toBe(firstSave.workflowVersion)
  })

  it('an identical resubmit is a no-op (no version increment, no write)', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-104', 'onehundredfour@example.com')
    const confirmed = await confirmSetup(db, 'user-104')
    const firstSave = unwrap(
      await updateEtudePitches(
        db,
        'user-104',
        confirmed.aggregateEpoch,
        confirmed.workflowVersion,
        ['C4', 'D4'],
      ),
    )
    const versionAfterFirstSave = firstSave.workflowVersion

    // Resubmit the exact same pitches with the current version.
    const result = await updateEtudePitches(
      db,
      'user-104',
      firstSave.aggregateEpoch,
      firstSave.workflowVersion,
      ['C4', 'D4'],
    )

    const after = unwrap(result)
    expect(after.selectedPitches).toBe('C4,D4')
    expect(after.workflowVersion).toBe(versionAfterFirstSave)
  })

  it('saving a different pitch set after a prior save updates and increments again', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-105', 'onehundredfive@example.com')
    const confirmed = await confirmSetup(db, 'user-105')
    const firstSave = unwrap(
      await updateEtudePitches(
        db,
        'user-105',
        confirmed.aggregateEpoch,
        confirmed.workflowVersion,
        ['C4', 'D4'],
      ),
    )
    const versionAfterFirstSave = firstSave.workflowVersion

    const result = await updateEtudePitches(
      db,
      'user-105',
      firstSave.aggregateEpoch,
      firstSave.workflowVersion,
      ['C4', 'D4', 'E4', 'F4'],
    )

    const after = unwrap(result)
    expect(after.selectedPitches).toBe('C4,D4,E4,F4')
    expect(after.workflowVersion).toBe(versionAfterFirstSave + 1)
  })

  it('returns version-mismatch when no aggregate exists for the owner', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-106', 'onehundredsix@example.com')
    // No aggregate created — call updateEtudePitches directly.
    const result = await updateEtudePitches(db, 'user-106', 1, 1, ['C4'])
    expect(result.isErr).toBe(true)
    if (!result.isOk) {
      expect(result.error.kind).toBe('version-mismatch')
    }
  })
})
