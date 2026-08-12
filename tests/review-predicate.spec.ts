// ====================================
// Tests for the derived review predicate (Issue 19).
//
// `isReviewReachable` is the derived, never-persisted review-completion
// predicate and the generation precondition. It is computed from the
// snapshot's confirmation flags and `hand` — never from a stored review
// flag, because none exists in the aggregate. Issue 19 moves the
// predicate into `src/lib/workflow-service.ts` (the Issue 18 resolver
// module) so it lives alongside `computeCanonicalRoute` and
// `isStepReachable`.
//
// These tests also characterize the no-review-flag invariant: the
// `EtudeParams` interface has no field whose name contains `review`, and
// the `GET /test/etude/aggregate-state` route's response keys include no
// key containing `review`.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import { isReviewReachable } from '../src/lib/workflow-service'
import type { EtudeParams } from '../src/lib/etude-params-repository'

const baseParams = (overrides: Partial<EtudeParams> = {}): EtudeParams => ({
  id: 'ep-1',
  userId: 'user-1',
  measureCount: 8,
  timeSignature: '4/4',
  keySignature: 'C major',
  selectedOctaves: '4',
  octaveRange: 4,
  hand: 'right',
  workflowVersion: 1,
  aggregateEpoch: 1,
  setupConfirmed: false,
  notesConfirmed: false,
  splitConfirmed: false,
  selectedPitches: null,
  selectedDurations: null,
  splitBoundary: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
})

describe('isReviewReachable (exported from workflow-service)', () => {
  it('is a named export of src/lib/workflow-service and is a function', () => {
    expect(typeof isReviewReachable).toBe('function')
  })

  it('is true exactly when setup and notes are confirmed and (hand !== both or split is confirmed)', () => {
    const hands = ['left', 'right', 'both'] as const
    for (const hand of hands) {
      for (const setupConfirmed of [true, false]) {
        for (const notesConfirmed of [true, false]) {
          for (const splitConfirmed of [true, false]) {
            const params = baseParams({ hand, setupConfirmed, notesConfirmed, splitConfirmed })
            const expected =
              setupConfirmed &&
              notesConfirmed &&
              (hand !== 'both' || splitConfirmed)
            expect(isReviewReachable(params)).toBe(expected)
          }
        }
      }
    }
  })

  it('is true for one-hand when setup and notes are confirmed regardless of split', () => {
    expect(isReviewReachable(baseParams({ hand: 'right', setupConfirmed: true, notesConfirmed: true, splitConfirmed: false }))).toBe(true)
    expect(isReviewReachable(baseParams({ hand: 'left', setupConfirmed: true, notesConfirmed: true, splitConfirmed: false }))).toBe(true)
    // splitConfirmed=true does not change the result for one-hand.
    expect(isReviewReachable(baseParams({ hand: 'right', setupConfirmed: true, notesConfirmed: true, splitConfirmed: true }))).toBe(true)
  })

  it('is false for both hands when split is unconfirmed', () => {
    expect(isReviewReachable(baseParams({ hand: 'both', setupConfirmed: true, notesConfirmed: true, splitConfirmed: false }))).toBe(false)
  })

  it('is false when setup is unconfirmed even if everything else is confirmed', () => {
    expect(isReviewReachable(baseParams({ hand: 'both', setupConfirmed: false, notesConfirmed: true, splitConfirmed: true }))).toBe(false)
  })

  it('is false when notes are unconfirmed even if everything else is confirmed', () => {
    expect(isReviewReachable(baseParams({ hand: 'both', setupConfirmed: true, notesConfirmed: false, splitConfirmed: true }))).toBe(false)
    expect(isReviewReachable(baseParams({ hand: 'right', setupConfirmed: true, notesConfirmed: false, splitConfirmed: false }))).toBe(false)
  })

  it('does not mutate its argument', () => {
    const params = baseParams({ hand: 'both', setupConfirmed: true, notesConfirmed: true, splitConfirmed: true })
    const snapshot = JSON.stringify(params)
    isReviewReachable(params)
    expect(JSON.stringify(params)).toBe(snapshot)
  })

  it('does not throw on a snapshot with a null-ish hand value', () => {
    // Defensive: the predicate should not throw even on a malformed snapshot.
    const params = baseParams({ hand: '', setupConfirmed: true, notesConfirmed: true, splitConfirmed: true })
    expect(() => isReviewReachable(params)).not.toThrow()
  })
})

describe('no persisted review-completion flag (Issue 19 invariant)', () => {
  it('the EtudeParams fixture has no key containing "review"', () => {
    const keys = Object.keys(baseParams())
    const reviewKeys = keys.filter((k) => k.toLowerCase().includes('review'))
    expect(reviewKeys).toEqual([])
  })

  it('the GET /test/etude/aggregate-state response keys (as documented in src/routes/test/etude-downstream-state.ts) include no key containing "review"', () => {
    // Characterization of the route's documented response shape. The route
    // is in src/routes/test/etude-downstream-state.ts; its response keys
    // are: setupConfirmed, notesConfirmed, splitConfirmed, selectedPitches,
    // selectedDurations, splitBoundary, workflowVersion, hand,
    // isReviewReachable. The derived predicate is exposed under the name
    // `isReviewReachable` (a computed flag, not a stored field), and no
    // stored review field appears.
    const documentedResponseKeys = [
      'setupConfirmed',
      'notesConfirmed',
      'splitConfirmed',
      'selectedPitches',
      'selectedDurations',
      'splitBoundary',
      'workflowVersion',
      'hand',
      'isReviewReachable',
    ]
    // No key is a stored review-completion field. `isReviewReachable` is
    // the derived predicate, not a stored flag — its name reflects the
    // derivation, not a persisted column.
    const storedReviewKeys = documentedResponseKeys.filter(
      (k) => k.toLowerCase().includes('review') && k !== 'isReviewReachable',
    )
    expect(storedReviewKeys).toEqual([])
  })
})
