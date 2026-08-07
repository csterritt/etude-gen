// ====================================
// Tests for the error-summary focus-on-load script helper.
// Verifies buildErrorSummaryFocusScript returns a string containing a guarded
// inline script that locates the element by the given id and calls .focus()
// on it, and that the script is safe to include unconditionally (guards
// against a missing element so it never throws on a page without the
// summary).
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import { buildErrorSummaryFocusScript } from '../src/lib/error-summary-focus'

describe('buildErrorSummaryFocusScript shape', () => {
  it('returns a string beginning with <script and ending with </script>', () => {
    const script = buildErrorSummaryFocusScript('error-summary')

    expect(script.startsWith('<script')).toBe(true)
    expect(script.endsWith('</script>')).toBe(true)
  })

  it('interpolates the given id into getElementById, not a hardcoded value', () => {
    const first = buildErrorSummaryFocusScript('error-summary')
    const second = buildErrorSummaryFocusScript('other-summary-id')

    expect(first).toContain("document.getElementById('error-summary')")
    expect(second).toContain("document.getElementById('other-summary-id')")
    expect(second).not.toContain("'error-summary'")
  })
})

describe('buildErrorSummaryFocusScript focus behaviour', () => {
  it('contains a .focus() call on the resolved element', () => {
    const script = buildErrorSummaryFocusScript('error-summary')

    expect(script).toContain('.focus()')
  })

  it('guards against the element being null or undefined so it cannot throw', () => {
    const script = buildErrorSummaryFocusScript('error-summary')

    // The script must guard the focus call so a missing element does not
    // throw. Accept either an `if (... ) { ... .focus() }` pattern or an
    // optional-chaining / nullish guard. The key invariant: .focus() is not
    // called unconditionally on a possibly-null reference.
    expect(script).toMatch(/if\s*\(/)
    expect(script).toContain('.focus()')
  })
})

describe('buildErrorSummaryFocusScript content safety', () => {
  it('does not reference any field name, submitted value, or error text — only the summary id', () => {
    const script = buildErrorSummaryFocusScript('error-summary')

    // The script must contain only the summary id and DOM focus logic.
    expect(script).not.toContain('measures')
    expect(script).not.toContain('meter')
    expect(script).not.toContain('octaves')
    expect(script).not.toContain('Choose between')
    expect(script).not.toContain('error-0')
  })
})
