// ====================================
// Tests for the workflow service canonical-route resolver.
// Verifies the section-5 state-table rows in scope for issue 18:
// the workflow service delegates to `resolveCanonicalRoute` for the
// flag-based rows and layers stored-value validation for the
// "stored values no longer validate" row.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import { computeCanonicalRoute, isStepReachable, PREREQUISITE_REDIRECT_MESSAGE } from '../src/lib/workflow-service'
import { resolveCanonicalRoute } from '../src/lib/canonical-route'
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

describe('computeCanonicalRoute flag-based rows (delegates to resolveCanonicalRoute)', () => {
  it('routes to /etude/setup when no aggregate exists', () => {
    expect(computeCanonicalRoute(null)).toBe('/etude/setup')
    expect(computeCanonicalRoute(null)).toBe(resolveCanonicalRoute(null))
  })

  it('routes to /etude/setup when setup is not confirmed', () => {
    const params = baseParams({ setupConfirmed: false })
    expect(computeCanonicalRoute(params)).toBe('/etude/setup')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('routes to /etude/notes when setup is confirmed and notes are unconfirmed', () => {
    const params = baseParams({ setupConfirmed: true, notesConfirmed: false })
    expect(computeCanonicalRoute(params)).toBe('/etude/notes')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('routes to /etude/notes when pitches are saved but durations are not yet confirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: false,
      selectedPitches: 'C4,D4',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/notes')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('routes to /etude/split when both hands, notes confirmed, split unconfirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: false,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/split')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('routes to /etude/review when both hands, notes confirmed, split confirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'D4|E4',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/review')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('routes to /etude/review when one hand (left), notes confirmed, split skipped', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'left',
      splitConfirmed: false,
      selectedPitches: 'C4,D4',
      selectedDurations: 'Q',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/review')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('routes to /etude/review when one hand (right), notes confirmed, split skipped', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'right',
      splitConfirmed: false,
      selectedPitches: 'C4,D4',
      selectedDurations: 'Q',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/review')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('routes to /etude/notes when both hands, notes confirmed, fewer than two stored pitches (corrupt state)', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: false,
      selectedPitches: 'C4',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/notes')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('routes to /etude/notes when both hands, notes confirmed, no stored pitches (corrupt state)', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: false,
      selectedPitches: null,
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/notes')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('routes to /etude/setup for a fresh aggregate whose defaults are valid but unconfirmed', () => {
    // A fresh aggregate has no confirmed steps. The defaults (C major,
    // octave 4, right hand) are valid but do not pre-confirm setup, so
    // the canonical route is /etude/setup rather than a later step.
    const params = baseParams({ setupConfirmed: false, notesConfirmed: false })
    expect(computeCanonicalRoute(params)).toBe('/etude/setup')
  })
})

describe('computeCanonicalRoute stored-value validation rows (Issue 18)', () => {
  it('routes to /etude/notes when stored pitches are not in the available set', () => {
    // Stored pitch 'Z9' is not in the C-major octave-4 available set
    // (C4..C5). The notes step is the earliest step whose stored values
    // are now invalid.
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'right',
      splitConfirmed: true,
      selectedPitches: 'Z9',
      selectedDurations: 'Q',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/notes')
  })

  it('routes to /etude/notes when some stored pitches are valid and others are not', () => {
    // Mixed: C4 is valid, Z9 is not. The notes step is the earliest
    // invalid step.
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'right',
      splitConfirmed: true,
      selectedPitches: 'C4,Z9',
      selectedDurations: 'Q',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/notes')
  })

  it('routes to /etude/notes when stored durations are not offerable for the current meter', () => {
    // 'X' is not a supported duration token, so it is not offerable for
    // 4/4. The notes step is the earliest invalid step.
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'X',
      splitBoundary: 'C4|D4',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/notes')
  })

  it('routes to /etude/notes when stored durations are a mix of offerable and non-offerable', () => {
    // Q is offerable for 4/4, X is not. The notes step is the earliest
    // invalid step.
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q,X',
      splitBoundary: 'C4|D4',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/notes')
  })

  it('routes to /etude/split when the stored boundary is not among the eligible boundaries', () => {
    // 'Z9|Z10' is not a boundary between two adjacent selected pitches
    // (C4,D4,E4). The split step is the earliest invalid step (pitches
    // and durations are valid).
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'Z9|Z10',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/split')
  })

  it('routes to /etude/split when the stored boundary is stale after a pitch change', () => {
    // The stored boundary 'C4|D4' was eligible for a prior pitch set but
    // the current stored pitches are D4,E4,F4 — so 'C4|D4' is no longer
    // eligible. The split step is the earliest invalid step.
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'D4,E4,F4',
      selectedDurations: 'Q',
      splitBoundary: 'C4|D4',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/split')
  })

  it('routes to /etude/notes when pitches are invalid and the boundary is also invalid (earliest step wins)', () => {
    // Both the notes step (invalid pitch) and the split step (invalid
    // boundary) have invalid stored values. The earliest invalid step
    // is the notes step.
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'Z9',
      selectedDurations: 'Q',
      splitBoundary: 'Z9|Z10',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/notes')
  })

  it('routes to /etude/review when all stored values validate', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'C4|D4',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/review')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('routes to /etude/review when one hand and all stored values validate (no split validation)', () => {
    // One-hand mode skips the split step, so the boundary is not
    // validated even if it is stale.
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'right',
      splitConfirmed: true,
      selectedPitches: 'C4,D4',
      selectedDurations: 'Q',
      splitBoundary: 'stale-but-irrelevant',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/review')
    expect(computeCanonicalRoute(params)).toBe(resolveCanonicalRoute(params))
  })

  it('does not validate stored pitches when the notes step is unconfirmed', () => {
    // The notes step is unconfirmed, so the canonical route is
    // /etude/notes regardless of whether the stored pitches validate.
    // The value validation only applies when the flag-based resolver
    // has moved past a step.
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: false,
      selectedPitches: 'Z9',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/notes')
  })

  it('does not validate the stored boundary when the split step is unconfirmed', () => {
    // The split step is unconfirmed, so the canonical route is
    // /etude/split regardless of whether the stored boundary validates.
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: false,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'Z9|Z10',
    })
    expect(computeCanonicalRoute(params)).toBe('/etude/split')
  })
})

describe('computeCanonicalRoute purity', () => {
  it('does not mutate its argument', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'C4|D4',
    })
    const snapshot = JSON.stringify(params)
    computeCanonicalRoute(params)
    expect(JSON.stringify(params)).toBe(snapshot)
  })

  it('does not throw on invalid stored values', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'right',
      splitConfirmed: true,
      selectedPitches: 'not-a-pitch',
      selectedDurations: 'not-a-duration',
    })
    expect(() => computeCanonicalRoute(params)).not.toThrow()
  })

  it('does not throw on a null aggregate', () => {
    expect(() => computeCanonicalRoute(null)).not.toThrow()
  })
})

describe('isStepReachable', () => {
  it('returns true for /etude/setup when no aggregate exists', () => {
    expect(isStepReachable(null, PATHS.ETUDE_SETUP)).toBe(true)
  })

  it('returns false for later steps when no aggregate exists', () => {
    expect(isStepReachable(null, PATHS.ETUDE_NOTES)).toBe(false)
    expect(isStepReachable(null, PATHS.ETUDE_SPLIT)).toBe(false)
    expect(isStepReachable(null, PATHS.ETUDE_REVIEW)).toBe(false)
  })

  it('returns true for /etude/setup when an aggregate exists (always reachable)', () => {
    const params = baseParams()
    expect(isStepReachable(params, PATHS.ETUDE_SETUP)).toBe(true)
  })

  it('returns false for later steps when setup is unconfirmed', () => {
    const params = baseParams({ setupConfirmed: false })
    expect(isStepReachable(params, PATHS.ETUDE_NOTES)).toBe(false)
    expect(isStepReachable(params, PATHS.ETUDE_SPLIT)).toBe(false)
    expect(isStepReachable(params, PATHS.ETUDE_REVIEW)).toBe(false)
  })

  it('returns true for /etude/notes when setup is confirmed (even if notes is also confirmed)', () => {
    const params = baseParams({ setupConfirmed: true, notesConfirmed: true })
    expect(isStepReachable(params, PATHS.ETUDE_NOTES)).toBe(true)
  })

  it('returns true for /etude/split when split is confirmed (student can revisit to edit)', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'C4|D4',
    })
    expect(isStepReachable(params, PATHS.ETUDE_SPLIT)).toBe(true)
  })

  it('returns true for /etude/review when all steps are confirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'C4|D4',
    })
    expect(isStepReachable(params, PATHS.ETUDE_REVIEW)).toBe(true)
  })

  it('returns false for /etude/split when one hand (split is skipped)', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'right',
      splitConfirmed: false,
    })
    expect(isStepReachable(params, PATHS.ETUDE_SPLIT)).toBe(false)
  })

  it('returns false for /etude/split when one hand even if all confirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'right',
      splitConfirmed: true,
    })
    expect(isStepReachable(params, PATHS.ETUDE_SPLIT)).toBe(false)
  })

  it('returns false for /etude/review when split is unconfirmed (both hands)', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: false,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
    })
    expect(isStepReachable(params, PATHS.ETUDE_REVIEW)).toBe(false)
  })

  it('returns false for /etude/split when notes are unconfirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: false,
      hand: 'both',
    })
    expect(isStepReachable(params, PATHS.ETUDE_SPLIT)).toBe(false)
  })

  it('returns false for /etude/review when notes are unconfirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: false,
      hand: 'right',
    })
    expect(isStepReachable(params, PATHS.ETUDE_REVIEW)).toBe(false)
  })

  it('returns false for /etude/split when stored pitches are invalid', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'Z9',
      selectedDurations: 'Q',
      splitBoundary: 'C4|D4',
    })
    expect(isStepReachable(params, PATHS.ETUDE_SPLIT)).toBe(false)
    expect(isStepReachable(params, PATHS.ETUDE_REVIEW)).toBe(false)
  })

  it('returns false for /etude/review when stored boundary is invalid', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'Z9|Z10',
    })
    expect(isStepReachable(params, PATHS.ETUDE_REVIEW)).toBe(false)
    // /etude/split is still reachable (its prerequisites are met — the
    // boundary issue is a split-level problem, not a notes-level one).
    expect(isStepReachable(params, PATHS.ETUDE_SPLIT)).toBe(true)
  })

  it('does not mutate its argument', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'C4|D4',
    })
    const snapshot = JSON.stringify(params)
    isStepReachable(params, PATHS.ETUDE_REVIEW)
    expect(JSON.stringify(params)).toBe(snapshot)
  })

  it('does not throw on a null aggregate', () => {
    expect(() => isStepReachable(null, PATHS.ETUDE_SETUP)).not.toThrow()
  })
})

describe('PREREQUISITE_REDIRECT_MESSAGE', () => {
  it('is a non-empty string', () => {
    expect(PREREQUISITE_REDIRECT_MESSAGE.length).toBeGreaterThan(0)
  })

  it('does not expose internal state or identifiers', () => {
    const forbidden = [
      'ep-',
      'user-',
      'workflowVersion',
      'workflow_version',
      'aggregateEpoch',
      'aggregate_epoch',
      'C4',
      'D4',
      'E4',
      'F4',
      'G4',
      'A4',
      'B4',
      'C5',
      '|',
    ]
    for (const substring of forbidden) {
      expect(PREREQUISITE_REDIRECT_MESSAGE).not.toContain(substring)
    }
  })
})
