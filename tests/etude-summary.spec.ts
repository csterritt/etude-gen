// ====================================
// Tests for the etude step-summary model (Issue 17).
// Verifies that deriveStepSummary produces the read-only summary model for
// each step level (notes, split, review), that the notes step is treated as
// one coherent pitches-and-durations prerequisite, that invalidated or stale
// values are filtered out, and that the function is pure.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import { loadRhythmCatalog } from '../src/lib/duration-selection-validator'
import { RHYTHM_CATALOG_TEXT } from '../src/lib/rhythm-catalog-data'
import {
  deriveStepSummary,
  type SummaryParams,
} from '../src/lib/etude-summary'

/**
 * Build a minimal `SummaryParams`-shaped object for the summary tests. The
 * summary reads only the listed fields.
 */
const baseParams = (overrides: Partial<SummaryParams> = {}): SummaryParams => ({
  measureCount: 8,
  timeSignature: '4/4',
  keySignature: 'C major',
  selectedOctaves: '4',
  hand: 'right',
  selectedPitches: null,
  selectedDurations: null,
  splitBoundary: null,
  ...overrides,
})

describe('deriveStepSummary — notes level', () => {
  it('contains exactly the setup answers and nothing else', () => {
    const params = baseParams({
      measureCount: 16,
      timeSignature: '3/4',
      keySignature: 'G major',
      selectedOctaves: '2,4,6',
      hand: 'both',
    })
    const summary = deriveStepSummary(params, 'notes')
    expect(summary.measureCount).toBe(16)
    expect(summary.timeSignature).toBe('3/4')
    expect(summary.keySignature).toBe('G major')
    expect(summary.hand).toBe('both')
    // The expanded octave range is the contiguous min-to-max of the
    // selection: octaves 2 through 6.
    expect(summary.octaveRangeMin).toBe(2)
    expect(summary.octaveRangeMax).toBe(6)
    // The notes step shows no pitches or durations.
    expect(summary.selectedPitches).toBeUndefined()
    expect(summary.selectedDurations).toBeUndefined()
    expect(summary.splitBoundary).toBeUndefined()
    expect(summary.leftHandPitches).toBeUndefined()
    expect(summary.rightHandPitches).toBeUndefined()
  })

  it('expands a single-octave selection to a one-octave range', () => {
    const summary = deriveStepSummary(baseParams({ selectedOctaves: '4' }), 'notes')
    expect(summary.octaveRangeMin).toBe(4)
    expect(summary.octaveRangeMax).toBe(4)
  })

  it('expands a non-contiguous selection to the contiguous range', () => {
    const summary = deriveStepSummary(baseParams({ selectedOctaves: '3,5' }), 'notes')
    expect(summary.octaveRangeMin).toBe(3)
    expect(summary.octaveRangeMax).toBe(5)
  })
})

describe('deriveStepSummary — split level', () => {
  it('contains the setup answers plus the selected pitches and durations together', () => {
    const params = baseParams({
      hand: 'both',
      selectedPitches: 'C4,D4,E4,F4',
      selectedDurations: 'Q,E',
    })
    const summary = deriveStepSummary(params, 'split')
    expect(summary.measureCount).toBe(8)
    expect(summary.timeSignature).toBe('4/4')
    expect(summary.keySignature).toBe('C major')
    expect(summary.hand).toBe('both')
    expect(summary.octaveRangeMin).toBe(4)
    expect(summary.octaveRangeMax).toBe(4)
    expect(summary.selectedPitches).toEqual(['C4', 'D4', 'E4', 'F4'])
    expect(summary.selectedDurations).toEqual(['Q', 'E'])
    // No split boundary at the split level.
    expect(summary.splitBoundary).toBeUndefined()
    expect(summary.leftHandPitches).toBeUndefined()
    expect(summary.rightHandPitches).toBeUndefined()
  })

  it('shows both pitches and durations, never one alone (coherent prerequisite)', () => {
    // Even when only pitches are stored (durations null), both halves are
    // populated together — durations as an empty array, not omitted.
    const params = baseParams({
      hand: 'both',
      selectedPitches: 'C4,D4',
      selectedDurations: null,
    })
    const summary = deriveStepSummary(params, 'split')
    expect(summary.selectedPitches).toEqual(['C4', 'D4'])
    expect(summary.selectedDurations).toEqual([])
  })

  it('filters out a stored pitch that is no longer in the available set', () => {
    // C major octave 4 yields C4..C5. A stored pitch outside that set
    // (e.g. F-sharp4, not in C major) is filtered out.
    const params = baseParams({
      keySignature: 'C major',
      selectedOctaves: '4',
      selectedPitches: 'C4,F-sharp4,G4',
      selectedDurations: 'Q',
    })
    const summary = deriveStepSummary(params, 'split')
    expect(summary.selectedPitches).toEqual(['C4', 'G4'])
  })

  it('filters out a stored duration that is no longer offerable for the meter', () => {
    // 2/4 does not offer whole (W) or dotted half (D). A stored W is
    // filtered out.
    const params = baseParams({
      timeSignature: '2/4',
      selectedDurations: 'W,Q',
      selectedPitches: 'C4',
      hand: 'right',
    })
    const summary = deriveStepSummary(params, 'split')
    expect(summary.selectedDurations).toEqual(['Q'])
  })

  it('yields empty arrays for null/empty selections, never stale or invented values', () => {
    const params = baseParams({
      selectedPitches: null,
      selectedDurations: null,
    })
    const summary = deriveStepSummary(params, 'split')
    expect(summary.selectedPitches).toEqual([])
    expect(summary.selectedDurations).toEqual([])
  })
})

describe('deriveStepSummary — review level (two-hand)', () => {
  it('contains everything split shows plus the boundary and each hand pitch set', () => {
    const params = baseParams({
      hand: 'both',
      selectedPitches: 'C4,D4,E4,F4',
      selectedDurations: 'Q,E',
      splitBoundary: 'D4|E4',
    })
    const summary = deriveStepSummary(params, 'review')
    expect(summary.measureCount).toBe(8)
    expect(summary.selectedPitches).toEqual(['C4', 'D4', 'E4', 'F4'])
    expect(summary.selectedDurations).toEqual(['Q', 'E'])
    expect(summary.splitBoundary).toBe('D4|E4')
    expect(summary.leftHandPitches).toEqual(['C4', 'D4'])
    expect(summary.rightHandPitches).toEqual(['E4', 'F4'])
  })

  it('omits the boundary and hand pitch sets when the stored boundary is stale', () => {
    // The stored boundary references pitches no longer in the selected set
    // (stale after an upstream change). It must not be rendered.
    const params = baseParams({
      hand: 'both',
      selectedPitches: 'C4,D4',
      selectedDurations: 'Q',
      splitBoundary: 'E4|G4',
    })
    const summary = deriveStepSummary(params, 'review')
    expect(summary.splitBoundary).toBeUndefined()
    expect(summary.leftHandPitches).toBeUndefined()
    expect(summary.rightHandPitches).toBeUndefined()
    // The pitches and durations are still shown.
    expect(summary.selectedPitches).toEqual(['C4', 'D4'])
    expect(summary.selectedDurations).toEqual(['Q'])
  })

  it('omits the boundary and hand pitch sets when the boundary is no longer between adjacent selected pitches', () => {
    // Selected pitches C4, E4 (after filtering). A stored boundary
    // 'C4|D4' is no longer eligible because D4 is not selected.
    const params = baseParams({
      hand: 'both',
      selectedPitches: 'C4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'C4|D4',
    })
    const summary = deriveStepSummary(params, 'review')
    expect(summary.splitBoundary).toBeUndefined()
    expect(summary.leftHandPitches).toBeUndefined()
    expect(summary.rightHandPitches).toBeUndefined()
  })

  it('omits the boundary and hand pitch sets when fewer than two pitches are selected', () => {
    const params = baseParams({
      hand: 'both',
      selectedPitches: 'C4',
      selectedDurations: 'Q',
      splitBoundary: 'C4|D4',
    })
    const summary = deriveStepSummary(params, 'review')
    expect(summary.splitBoundary).toBeUndefined()
    expect(summary.leftHandPitches).toBeUndefined()
    expect(summary.rightHandPitches).toBeUndefined()
  })
})

describe('deriveStepSummary — review level (one-hand)', () => {
  it('omits the boundary and hand pitch sets because no boundary applies', () => {
    const params = baseParams({
      hand: 'right',
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      // A stale boundary from a prior two-hand selection.
      splitBoundary: 'C4|D4',
    })
    const summary = deriveStepSummary(params, 'review')
    expect(summary.selectedPitches).toEqual(['C4', 'D4', 'E4'])
    expect(summary.selectedDurations).toEqual(['Q'])
    expect(summary.splitBoundary).toBeUndefined()
    expect(summary.leftHandPitches).toBeUndefined()
    expect(summary.rightHandPitches).toBeUndefined()
  })
})

describe('deriveStepSummary — purity', () => {
  it('does not mutate its argument', () => {
    const params = baseParams({
      hand: 'both',
      selectedPitches: 'C4,D4,E4',
      selectedDurations: 'Q',
      splitBoundary: 'C4|D4',
    })
    const snapshot = JSON.stringify(params)
    deriveStepSummary(params, 'review')
    expect(JSON.stringify(params)).toBe(snapshot)
  })

  it('does not throw for any step level on an empty aggregate', () => {
    const params = baseParams({
      selectedPitches: null,
      selectedDurations: null,
      splitBoundary: null,
    })
    expect(() => deriveStepSummary(params, 'notes')).not.toThrow()
    expect(() => deriveStepSummary(params, 'split')).not.toThrow()
    expect(() => deriveStepSummary(params, 'review')).not.toThrow()
  })
})

describe('deriveStepSummary — catalog-driven offerable filtering', () => {
  it('uses the packaged rhythm catalog to filter durations for the meter', () => {
    // Sanity: confirm the catalog is loaded and 4/4 offers all six tokens.
    const catalog = loadRhythmCatalog(RHYTHM_CATALOG_TEXT)
    const params = baseParams({
      timeSignature: '4/4',
      selectedDurations: 'W,H,D,Q,R,E',
      selectedPitches: 'C4',
    })
    const summary = deriveStepSummary(params, 'split')
    expect(summary.selectedDurations).toEqual(['W', 'H', 'D', 'Q', 'R', 'E'])
    // Touch the catalog variable so the import is used in this test.
    expect(catalog.meters['4/4']).toBeDefined()
  })
})
