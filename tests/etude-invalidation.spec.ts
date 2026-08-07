// ====================================
// Tests for computeDownstreamInvalidation — a pure function encoding the
// Issue 11 dependency map: which downstream state (pitch selection, duration
// selection, split boundary, and the notes/split confirmation flags) must be
// cleared when a given upstream setup field changes. Also tests isReviewReachable,
// the derived (never persisted) review-completion predicate.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import {
  computeDownstreamInvalidation,
  isReviewReachable,
} from '../src/lib/etude-invalidation'
import type { InvalidationPlan } from '../src/lib/etude-invalidation'
import type { EtudeParams } from '../src/lib/etude-params-repository'
import type { ValidSetup } from '../src/lib/setup-validator'

const baseParams = (overrides: Partial<EtudeParams> = {}): EtudeParams => ({
  id: 'ep-1',
  userId: 'user-1',
  measureCount: 16,
  timeSignature: '3/4',
  keySignature: 'C major',
  selectedOctaves: '4',
  octaveRange: 4,
  hand: 'both',
  workflowVersion: 1,
  aggregateEpoch: 1,
  setupConfirmed: true,
  notesConfirmed: true,
  splitConfirmed: true,
  selectedPitches: 'C4,D4',
  selectedDurations: 'quarter,eighth',
  splitBoundary: 'D4',
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
})

const baseSetup = (overrides: Partial<ValidSetup> = {}): ValidSetup => ({
  measureCount: 16,
  timeSignature: '3/4',
  hand: 'both',
  keySignature: 'C major',
  octaves: [4],
  ...overrides,
})

const planAllFalse = (): InvalidationPlan => ({
  clearPitches: false,
  clearDurations: false,
  clearSplit: false,
  unconfirmNotes: false,
  unconfirmSplit: false,
})

describe('computeDownstreamInvalidation', () => {
  it('is a pure function: does not mutate its arguments', () => {
    const stored = baseParams()
    const submitted = baseSetup()
    const storedBefore = JSON.stringify(stored)
    const submittedBefore = JSON.stringify(submitted)
    computeDownstreamInvalidation(stored, submitted)
    expect(JSON.stringify(stored)).toBe(storedBefore)
    expect(JSON.stringify(submitted)).toBe(submittedBefore)
  })

  it('clears pitches and split (not durations) when the key changes', () => {
    const stored = baseParams()
    const submitted = baseSetup({ keySignature: 'G major' })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan.clearPitches).toBe(true)
    expect(plan.clearSplit).toBe(true)
    expect(plan.clearDurations).toBe(false)
    expect(plan.unconfirmNotes).toBe(true)
    expect(plan.unconfirmSplit).toBe(true)
  })

  it('clears pitches and split (not durations) when the octaves change', () => {
    const stored = baseParams()
    const submitted = baseSetup({ octaves: [4, 5] })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan.clearPitches).toBe(true)
    expect(plan.clearSplit).toBe(true)
    expect(plan.clearDurations).toBe(false)
    expect(plan.unconfirmNotes).toBe(true)
    expect(plan.unconfirmSplit).toBe(true)
  })

  it('clears durations (not pitches or split) when the meter changes', () => {
    const stored = baseParams()
    const submitted = baseSetup({ timeSignature: '4/4' })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan.clearDurations).toBe(true)
    expect(plan.clearPitches).toBe(false)
    expect(plan.clearSplit).toBe(false)
    expect(plan.unconfirmNotes).toBe(true)
    expect(plan.unconfirmSplit).toBe(false)
  })

  it('invalidates nothing downstream when only the measure count changes', () => {
    const stored = baseParams()
    const submitted = baseSetup({ measureCount: 12 })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan).toEqual(planAllFalse())
  })

  it('clears split and unconfirms notes when switching to both hands with fewer than two pitches', () => {
    const stored = baseParams({ hand: 'right', selectedPitches: 'C4' })
    const submitted = baseSetup({ hand: 'both' })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan.clearSplit).toBe(true)
    expect(plan.unconfirmNotes).toBe(true)
    expect(plan.clearPitches).toBe(false)
    expect(plan.clearDurations).toBe(false)
  })

  it('clears split but keeps notes confirmed when switching to both hands with two or more pitches', () => {
    const stored = baseParams({ hand: 'right', selectedPitches: 'C4,D4' })
    const submitted = baseSetup({ hand: 'both' })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan.clearSplit).toBe(true)
    expect(plan.unconfirmNotes).toBe(false)
    expect(plan.clearPitches).toBe(false)
  })

  it('clears split but keeps notes confirmed when switching to one hand', () => {
    const stored = baseParams({ hand: 'both' })
    const submitted = baseSetup({ hand: 'left' })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan.clearSplit).toBe(true)
    expect(plan.unconfirmNotes).toBe(false)
    expect(plan.clearPitches).toBe(false)
  })

  it('unconfirms notes when switching to both hands with null pitches', () => {
    const stored = baseParams({ hand: 'right', selectedPitches: null })
    const submitted = baseSetup({ hand: 'both' })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan.unconfirmNotes).toBe(true)
    expect(plan.clearSplit).toBe(true)
  })

  it('unconfirms notes when switching to both hands with empty pitches', () => {
    const stored = baseParams({ hand: 'right', selectedPitches: '' })
    const submitted = baseSetup({ hand: 'both' })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan.unconfirmNotes).toBe(true)
  })

  it('clears the union of dependents when key and meter both change', () => {
    const stored = baseParams()
    const submitted = baseSetup({ keySignature: 'G major', timeSignature: '4/4' })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan.clearPitches).toBe(true)
    expect(plan.clearDurations).toBe(true)
    expect(plan.clearSplit).toBe(true)
    expect(plan.unconfirmNotes).toBe(true)
    expect(plan.unconfirmSplit).toBe(true)
  })

  it('clears the union of dependents when key and hand both change (to both, <2 pitches)', () => {
    const stored = baseParams({ hand: 'right', selectedPitches: 'C4' })
    const submitted = baseSetup({ keySignature: 'G major', hand: 'both' })
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan.clearPitches).toBe(true)
    expect(plan.clearSplit).toBe(true)
    expect(plan.clearDurations).toBe(false)
    expect(plan.unconfirmNotes).toBe(true)
    expect(plan.unconfirmSplit).toBe(true)
  })

  it('invalidates nothing when no upstream field changes', () => {
    const stored = baseParams()
    const submitted = baseSetup()
    const plan = computeDownstreamInvalidation(stored, submitted)
    expect(plan).toEqual(planAllFalse())
  })

  it('does not throw for any hostile input shape', () => {
    const stored = baseParams({ selectedPitches: null, selectedDurations: null, splitBoundary: null })
    const submitted = baseSetup()
    expect(() => computeDownstreamInvalidation(stored, submitted)).not.toThrow()
  })
})

describe('isReviewReachable', () => {
  const reviewBase = (overrides: Partial<EtudeParams> = {}): EtudeParams => ({
    ...baseParams(),
    setupConfirmed: true,
    notesConfirmed: true,
    hand: 'right',
    splitConfirmed: false,
    ...overrides,
  })

  it('is true when setup and notes are confirmed for one hand', () => {
    expect(isReviewReachable(reviewBase({ hand: 'right' }))).toBe(true)
  })

  it('is true when setup, notes, and split are confirmed for both hands', () => {
    expect(isReviewReachable(reviewBase({ hand: 'both', splitConfirmed: true }))).toBe(true)
  })

  it('is false when notes are not confirmed', () => {
    expect(isReviewReachable(reviewBase({ notesConfirmed: false }))).toBe(false)
  })

  it('is false when split is not confirmed for both hands', () => {
    expect(isReviewReachable(reviewBase({ hand: 'both', splitConfirmed: false }))).toBe(false)
  })

  it('is false when setup is not confirmed', () => {
    expect(isReviewReachable(reviewBase({ setupConfirmed: false }))).toBe(false)
  })

  it('is false after an invalidation that clears notesConfirmed (recomputed from flags, not a stored review flag)', () => {
    const stored = baseParams({ notesConfirmed: true, splitConfirmed: true, hand: 'both' })
    const submitted = baseSetup({ keySignature: 'G major' })
    const plan = computeDownstreamInvalidation(stored, submitted)
    const after = { ...stored, notesConfirmed: !plan.unconfirmNotes, splitConfirmed: !plan.unconfirmSplit }
    expect(isReviewReachable(after)).toBe(false)
  })

  it('does not consult a stored review flag (EtudeParams has no reviewConfirmed field)', () => {
    const params = reviewBase()
    expect((params as unknown as Record<string, unknown>).reviewConfirmed).toBeUndefined()
  })
})
