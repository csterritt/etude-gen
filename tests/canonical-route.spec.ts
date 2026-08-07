// ====================================
// Tests for the canonical route resolver.
// Verifies the section-5 state-table rows in scope for issue 4:
// no aggregate -> /etude/setup, setup unconfirmed -> /etude/setup.
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import { resolveCanonicalRoute } from '../src/lib/canonical-route'
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
})
