// ====================================
// Tests for the canonical route resolver.
// Verifies the section-5 state-table rows in scope for issue 4:
// no aggregate -> /etude/setup, setup unconfirmed -> /etude/setup.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

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

describe('resolveCanonicalRoute', () => {
  it('routes to /etude/setup when no aggregate exists', () => {
    expect(resolveCanonicalRoute(null)).toBe('/etude/setup')
  })

  it('routes to /etude/setup when setup is not confirmed', () => {
    const params = baseParams({ setupConfirmed: false })
    expect(resolveCanonicalRoute(params)).toBe('/etude/setup')
  })

  it('routes to /etude/notes when setup is confirmed and notes are unconfirmed', () => {
    const params = baseParams({ setupConfirmed: true, notesConfirmed: false })
    expect(resolveCanonicalRoute(params)).toBe('/etude/notes')
  })

  it('routes to /etude/notes when pitches are saved but durations are not yet confirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: false,
      selectedPitches: 'C4,D4',
    })
    expect(resolveCanonicalRoute(params)).toBe('/etude/notes')
  })

  it('routes past /etude/notes when notes are confirmed (one hand, no split needed)', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'right',
    })
    // The split/review/score rows are later issues — the resolver currently
    // falls through to /etude/setup as a stub for post-notes states. The
    // important assertion is that it does NOT route to /etude/notes.
    expect(resolveCanonicalRoute(params)).not.toBe('/etude/notes')
  })

  it('still routes to /etude/setup when setup is not confirmed even if notes are confirmed', () => {
    const params = baseParams({ setupConfirmed: false, notesConfirmed: true })
    expect(resolveCanonicalRoute(params)).toBe('/etude/setup')
  })
})

describe('resolveCanonicalRoute split and review rows (Issue 16)', () => {
  it('exposes PATHS.ETUDE_SPLIT as /etude/split', () => {
    expect(PATHS.ETUDE_SPLIT).toBe('/etude/split')
  })

  it('exposes PATHS.ETUDE_REVIEW as /etude/review', () => {
    expect(PATHS.ETUDE_REVIEW).toBe('/etude/review')
  })

  it('routes to /etude/split when both hands, notes confirmed, split unconfirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: false,
      selectedPitches: 'C4,D4,E4',
    })
    expect(resolveCanonicalRoute(params)).toBe('/etude/split')
  })

  it('routes to /etude/review when both hands, notes confirmed, split confirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: true,
      selectedPitches: 'C4,D4,E4',
      splitBoundary: 'D4|E4',
    })
    expect(resolveCanonicalRoute(params)).toBe('/etude/review')
  })

  it('routes to /etude/review when one hand (left), notes confirmed, split skipped', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'left',
      splitConfirmed: false,
    })
    expect(resolveCanonicalRoute(params)).toBe('/etude/review')
  })

  it('routes to /etude/review when one hand (right), notes confirmed, split skipped', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'right',
      splitConfirmed: false,
    })
    expect(resolveCanonicalRoute(params)).toBe('/etude/review')
  })

  it('routes to /etude/notes when both hands, notes confirmed, fewer than two stored pitches (corrupt state)', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: false,
      selectedPitches: 'C4',
    })
    expect(resolveCanonicalRoute(params)).toBe('/etude/notes')
  })

  it('routes to /etude/notes when both hands, notes confirmed, no stored pitches (corrupt state)', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: true,
      hand: 'both',
      splitConfirmed: false,
      selectedPitches: null,
    })
    expect(resolveCanonicalRoute(params)).toBe('/etude/notes')
  })

  it('still routes to /etude/notes when both hands and notes are unconfirmed', () => {
    const params = baseParams({
      setupConfirmed: true,
      notesConfirmed: false,
      hand: 'both',
    })
    expect(resolveCanonicalRoute(params)).toBe('/etude/notes')
  })
})
