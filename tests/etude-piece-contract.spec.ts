// ====================================
// Schema-level contract test for the persisted Piece record (Issue 20).
//
// Asserts that the persisted Piece record — read through the repository's
// stable interface and the migration's declared shape (schema.sql) — exposes
// no seed, no RNG state, and no field from which the music could be
// regenerated. The assertion is expressed against the repository's stable
// interface and the migration's declared shape, never against physical column
// names, so route tests never couple to columns.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Result from 'true-myth/result'

import { user } from '../src/db/schema'
import type { DrizzleClient } from '../src/local-types'
import { loadOrCreateEtudeParams } from '../src/lib/etude-params-repository'
import {
  persistEtudePiece,
  loadEtudePiece,
  type PieceRecord,
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

const makePiece = (): Piece => ({
  pieceId: 'aaaaaaaa-0000-0000-0000-000000000001',
  key: 'C major',
  timeSignature: '4/4',
  hand: 'right',
  sourceParameterVersion: 1,
  measures: [
    {
      rightHand: [{ duration: 'Q', pitch: 'C4', rest: false }],
      leftHand: [],
    },
  ],
})

/**
 * Column names that would indicate a seed, RNG state, or a field from which
 * the music could be regenerated. The persisted Piece record must contain
 * none of these.
 */
const FORBIDDEN_COLUMN_NAMES = [
  'seed',
  'rng',
  'random',
  'randomseed',
  'random_source',
  'rngstate',
  'rng_state',
  'generatorstate',
  'generator_state',
]

/**
 * Read the generated schema.sql and extract the column names declared for the
 * `etude_piece` table. This asserts against the migration's declared shape
 * rather than inspecting the live database, so the test is a build-time
 * guardrail.
 */
const getEtudePieceColumnNames = (): string[] => {
  const schemaPath = resolve(process.cwd(), 'schema.sql')
  const sql = readFileSync(schemaPath, 'utf8')
  // Find the etude_piece CREATE TABLE block.
  const match = sql.match(/CREATE TABLE IF NOT EXISTS `etude_piece` \(([\s\S]*?)\);/)
  if (!match) {
    throw new Error('etude_piece table not found in schema.sql')
  }
  const body = match[1]!
  // Extract column names from lines like `columnName` type ...
  const columns: string[] = []
  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('FOREIGN KEY')) {
      continue
    }
    const colMatch = trimmed.match(/`(\w+)`/)
    if (colMatch) {
      columns.push(colMatch[1]!.toLowerCase())
    }
  }
  return columns
}

describe('Piece record contract - no seed or RNG state', () => {
  it('the PieceRecord domain interface exposes no seed, RNG, or regenerable field', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-contract', 'contract@example.com')
    const params = unwrap(await loadOrCreateEtudeParams(db, 'user-contract'))
    const piece = makePiece()

    unwrap(await persistEtudePiece(db, 'user-contract', params.aggregateEpoch, piece))

    const loaded = unwrap(await loadEtudePiece(db, 'user-contract'))
    expect(loaded).not.toBeNull()
    const record = loaded as PieceRecord

    // The domain interface exposes only immutable Piece JSON, identity, and
    // render-metadata fields. Assert none of the keys match forbidden names.
    const keys = Object.keys(record).map((k) => k.toLowerCase())
    for (const forbidden of FORBIDDEN_COLUMN_NAMES) {
      expect(keys).not.toContain(forbidden)
    }

    // The stored pieceJson is the only authority for the music. Assert it
    // contains no seed or RNG field either.
    const parsed = JSON.parse(record.pieceJson) as Record<string, unknown>
    const pieceKeys = Object.keys(parsed).map((k) => k.toLowerCase())
    for (const forbidden of FORBIDDEN_COLUMN_NAMES) {
      expect(pieceKeys).not.toContain(forbidden)
    }
  })

  it('the etude_piece table in schema.sql declares no seed, RNG, or regenerable column', () => {
    const columns = getEtudePieceColumnNames()
    expect(columns.length).toBeGreaterThan(0)
    for (const forbidden of FORBIDDEN_COLUMN_NAMES) {
      expect(columns).not.toContain(forbidden)
    }
  })

  it('the stored pieceJson is the only authority for its content', async () => {
    const db = createTestDb()
    await insertUser(db, 'user-authority', 'authority@example.com')
    const params = unwrap(await loadOrCreateEtudeParams(db, 'user-authority'))
    const piece = makePiece()

    unwrap(await persistEtudePiece(db, 'user-authority', params.aggregateEpoch, piece))

    const loaded = unwrap(await loadEtudePiece(db, 'user-authority'))
    expect(loaded).not.toBeNull()
    const record = loaded as PieceRecord

    // The pieceJson round-trips to the original Piece — the stored JSON is
    // the authority, not any derived column.
    const restored = JSON.parse(record.pieceJson) as Piece
    expect(restored).toEqual(piece)

    // The pieceId and sourceParameterVersion columns match the JSON's fields
    // (they are denormalized for lookup efficiency, not independent
    // authorities).
    expect(record.pieceId).toBe(restored.pieceId)
    expect(record.sourceParameterVersion).toBe(restored.sourceParameterVersion)
  })
})
