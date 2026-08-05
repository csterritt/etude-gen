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
  type EtudeParams,
} from '../src/lib/etude-params-repository'
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
