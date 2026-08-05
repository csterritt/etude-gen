// ====================================
// Test-database helper for repository unit tests.
// Builds a real in-memory SQLite database with the production schema so
// repository tests can exercise uniqueness constraints, cascade deletion,
// and the losing-caller insert-then-load path.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import * as schema from '../../src/db/schema'
import type { DrizzleClient } from '../../src/local-types'

/**
 * Path to the generated schema.sql (concatenation of all drizzle migrations
 * with CREATE TABLE IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
 */
const SCHEMA_SQL_PATH = resolve(process.cwd(), 'schema.sql')

/**
 * Read the generated schema.sql, split on the drizzle statement-breakpoint
 * marker, and execute each statement. Returns once all tables/indexes exist.
 */
const applySchema = (db: Database): void => {
  const sql = readFileSync(SCHEMA_SQL_PATH, 'utf8')
  const statements = sql
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  for (const statement of statements) {
    db.run(statement)
  }
}

/**
 * Create a fresh in-memory SQLite database with the production schema applied
 * and return a Drizzle client whose query-builder API is compatible with the
 * repository functions. The client is typed as the production DrizzleClient
 * (the D1 client type) via an `unknown` cast for test use only — both drivers
 * implement the same query-builder surface the repository uses.
 *
 * Foreign-key enforcement is enabled so cascade deletion and the UNIQUE
 * constraint on etude_params.userId behave as they do in production.
 */
export const createTestDb = (): DrizzleClient => {
  const raw = new Database(':memory:')
  // SQLite disables foreign keys by default; turn them on so cascade
  // deletion and FK constraints match production D1 behavior.
  raw.exec('PRAGMA foreign_keys = ON;')
  applySchema(raw)
  const drizzleClient = drizzle(raw, { schema })
  return drizzleClient as unknown as DrizzleClient
}
