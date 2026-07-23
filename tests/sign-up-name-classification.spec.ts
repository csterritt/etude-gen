// ====================================
// Tests for distinguishing duplicate-name vs duplicate-email constraint errors
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { isDuplicateNameError, isDuplicateEmailError } from '../src/lib/sign-up-utils'

describe('isDuplicateNameError', () => {
  it('matches a SQLite unique violation on user.name', () => {
    assert.strictEqual(isDuplicateNameError('UNIQUE constraint failed: user.name'), true)
  })

  it('matches the named unique index on the name column', () => {
    assert.strictEqual(
      isDuplicateNameError('D1_ERROR: UNIQUE constraint failed: user_name_unique'),
      true,
    )
  })

  it('is case-insensitive', () => {
    assert.strictEqual(isDuplicateNameError('Unique Constraint Failed: USER.NAME'), true)
  })

  it('does not match an email constraint violation', () => {
    assert.strictEqual(isDuplicateNameError('UNIQUE constraint failed: user.email'), false)
  })

  it('does not match unrelated errors', () => {
    assert.strictEqual(isDuplicateNameError('SQLITE_BUSY: database is locked'), false)
  })
})

describe('name vs email classification ordering', () => {
  // A name-column violation must be detected as a name error and NOT be
  // misreported as a duplicate email.
  it('treats a user.name violation as a name error, not an email error', () => {
    const message = 'UNIQUE constraint failed: user.name'
    assert.strictEqual(isDuplicateNameError(message), true)
    // It also matches the broad email/unique heuristic, which is why callers
    // must check the name case first.
    assert.strictEqual(isDuplicateEmailError(message), true)
  })

  it('treats a user.email violation as an email error only', () => {
    const message = 'UNIQUE constraint failed: user.email'
    assert.strictEqual(isDuplicateNameError(message), false)
    assert.strictEqual(isDuplicateEmailError(message), true)
  })
})
