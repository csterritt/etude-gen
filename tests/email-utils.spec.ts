// ====================================
// Tests for email-utils.ts
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { normalizeEmail } from '../src/lib/email-utils'

describe('normalizeEmail', () => {
  it('lowercases mixed-case addresses', () => {
    assert.strictEqual(normalizeEmail('User@Example.COM'), 'user@example.com')
  })

  it('trims surrounding whitespace', () => {
    assert.strictEqual(normalizeEmail('  user@example.com  '), 'user@example.com')
  })

  it('trims and lowercases together', () => {
    assert.strictEqual(normalizeEmail('\t Foo.Bar@Example.Com \n'), 'foo.bar@example.com')
  })

  it('leaves an already-normalized address unchanged', () => {
    assert.strictEqual(normalizeEmail('user@example.com'), 'user@example.com')
  })
})
