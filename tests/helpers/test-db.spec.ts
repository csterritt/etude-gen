// ====================================
// Smoke test for the test-database helper.
// Verifies a table can be created, a row inserted, and the row read back.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'
import { eq } from 'drizzle-orm'

import { user } from '../../src/db/schema'
import { createTestDb } from './test-db'

describe('createTestDb', () => {
  it('creates a database with the production schema applied', async () => {
    const db = createTestDb()
    const inserted = {
      id: 'user-1',
      name: 'test-user',
      email: 'test@example.com',
      emailVerified: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }
    await db.insert(user).values(inserted).run()
    const rows = await db.select().from(user).where(eq(user.id, 'user-1')).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe('user-1')
    expect(rows[0]!.email).toBe('test@example.com')
  })

  it('enforces the user email uniqueness constraint', () => {
    const db = createTestDb()
    const base = {
      name: 'dup-user',
      email: 'dup@example.com',
      emailVerified: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }
    void db.insert(user).values({ id: 'dup-1', ...base }).run()
    expect(() => {
      void db.insert(user).values({ id: 'dup-2', ...base }).run()
    }).toThrow()
  })
})
