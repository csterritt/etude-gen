// ====================================
// Tests for the canonical-route extension: current Piece -> /etude/score
// (Issue 20).
//
// When the review predicate is satisfied (all steps confirmed with valid
// stored values) AND a current Piece exists, the canonical route is
// /etude/score. When no current Piece exists, the canonical route remains
// /etude/review. The extension is layered on top of the existing flag-based
// and stored-value validation rows.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import { resolveCanonicalRoute } from '../src/lib/canonical-route'
import { computeCanonicalRoute } from '../src/lib/workflow-service'
import { PATHS } from '../src/constants'
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

const completeOneHandParams = (overrides: Partial<EtudeParams> = {}): EtudeParams =>
  baseParams({
    setupConfirmed: true,
    notesConfirmed: true,
    hand: 'right',
    selectedPitches: 'C4,D4,E4,F4',
    selectedDurations: 'Q,E',
    ...overrides,
  })

const completeTwoHandParams = (overrides: Partial<EtudeParams> = {}): EtudeParams =>
  baseParams({
    setupConfirmed: true,
    notesConfirmed: true,
    hand: 'both',
    splitConfirmed: true,
    selectedPitches: 'C4,D4,E4,F4',
    selectedDurations: 'Q,E',
    splitBoundary: 'D4|E4',
    ...overrides,
  })

describe('resolveCanonicalRoute - current Piece extension', () => {
  it('routes to /etude/score when a current Piece exists and the review predicate is satisfied (one hand)', () => {
    const params = completeOneHandParams()
    expect(resolveCanonicalRoute(params, true)).toBe(PATHS.ETUDE_SCORE)
  })

  it('routes to /etude/score when a current Piece exists and the review predicate is satisfied (both hands)', () => {
    const params = completeTwoHandParams()
    expect(resolveCanonicalRoute(params, true)).toBe(PATHS.ETUDE_SCORE)
  })

  it('routes to /etude/review when no current Piece exists and the review predicate is satisfied', () => {
    const params = completeOneHandParams()
    expect(resolveCanonicalRoute(params, false)).toBe(PATHS.ETUDE_REVIEW)
  })

  it('routes to /etude/review when the hasCurrentPiece argument is omitted (backward-compatible default)', () => {
    const params = completeOneHandParams()
    expect(resolveCanonicalRoute(params)).toBe(PATHS.ETUDE_REVIEW)
  })

  it('does not route to /etude/score when setup is unconfirmed even if a current Piece exists', () => {
    const params = completeOneHandParams({ setupConfirmed: false })
    expect(resolveCanonicalRoute(params, true)).toBe(PATHS.ETUDE_SETUP)
  })

  it('does not route to /etude/score when notes are unconfirmed even if a current Piece exists', () => {
    const params = completeOneHandParams({ notesConfirmed: false })
    expect(resolveCanonicalRoute(params, true)).toBe(PATHS.ETUDE_NOTES)
  })

  it('does not route to /etude/score when split is unconfirmed (both hands) even if a current Piece exists', () => {
    const params = completeTwoHandParams({ splitConfirmed: false })
    expect(resolveCanonicalRoute(params, true)).toBe(PATHS.ETUDE_SPLIT)
  })

  it('does not route to /etude/score when no aggregate exists even if hasCurrentPiece is true', () => {
    expect(resolveCanonicalRoute(null, true)).toBe(PATHS.ETUDE_SETUP)
  })
})

describe('computeCanonicalRoute - current Piece extension', () => {
  it('routes to /etude/score when a current Piece exists and all stored values validate (one hand)', () => {
    const params = completeOneHandParams()
    expect(computeCanonicalRoute(params, true)).toBe(PATHS.ETUDE_SCORE)
  })

  it('routes to /etude/score when a current Piece exists and all stored values validate (both hands)', () => {
    const params = completeTwoHandParams()
    expect(computeCanonicalRoute(params, true)).toBe(PATHS.ETUDE_SCORE)
  })

  it('routes to /etude/review when no current Piece exists and all stored values validate', () => {
    const params = completeOneHandParams()
    expect(computeCanonicalRoute(params, false)).toBe(PATHS.ETUDE_REVIEW)
  })

  it('routes to /etude/review when hasCurrentPiece is omitted (backward-compatible default)', () => {
    const params = completeOneHandParams()
    expect(computeCanonicalRoute(params)).toBe(PATHS.ETUDE_REVIEW)
  })

  it('routes to /etude/notes when stored pitches are invalid even if a current Piece exists', () => {
    const params = completeOneHandParams({ selectedPitches: 'Z9' })
    expect(computeCanonicalRoute(params, true)).toBe(PATHS.ETUDE_NOTES)
  })

  it('routes to /etude/split when the stored boundary is invalid even if a current Piece exists', () => {
    const params = completeTwoHandParams({ splitBoundary: 'Z9|Z10' })
    expect(computeCanonicalRoute(params, true)).toBe(PATHS.ETUDE_SPLIT)
  })

  it('does not route to /etude/score when no aggregate exists even if hasCurrentPiece is true', () => {
    expect(computeCanonicalRoute(null, true)).toBe(PATHS.ETUDE_SETUP)
  })
})

describe('computeCanonicalRoute - purity with current Piece extension', () => {
  it('does not mutate its argument when hasCurrentPiece is provided', () => {
    const params = completeOneHandParams()
    const snapshot = JSON.stringify(params)
    computeCanonicalRoute(params, true)
    expect(JSON.stringify(params)).toBe(snapshot)
  })
})
