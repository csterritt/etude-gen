/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Shared read-only step-summary component (Issue 17).
 *
 * Renders the prior answers for the current step as read-only text — never
 * as editable controls. Every value comes from the committed aggregate
 * snapshot via `deriveStepSummary`; the component reveals no internal
 * identifiers (no aggregate id, no workflow version, no epoch) and asserts
 * no ownership from request input (cross-cutting contract section 1).
 *
 * The component is presentational: it calls `deriveStepSummary` and renders
 * the resulting model. Fields beyond the requested step level are absent
 * from the model and so are omitted from the DOM entirely.
 * @module components/etudeSummary
 */
import { deriveStepSummary, type SummaryStep, type SummaryParams } from '../lib/etude-summary'
import { DURATION_LABELS } from '../lib/duration-selection-validator'

/**
 * Props for the {@link EtudeSummary} component.
 */
interface EtudeSummaryProps {
  params: SummaryParams
  step: SummaryStep
}

/**
 * Format the expanded octave range as a label. A single-octave selection
 * shows just the number; a multi-octave range shows `min–max`.
 */
const formatOctaveRange = (min: number, max: number): string => {
  if (min === max) {
    return String(min)
  }
  return `${min}–${max}`
}

/**
 * Format a list of pitch names for display as a comma-separated phrase.
 */
const formatPitches = (pitches: readonly string[]): string => {
  if (pitches.length === 0) {
    return 'None'
  }
  return pitches.join(', ')
}

/**
 * Format a list of duration tokens for display using their human-readable
 * labels. Returns 'None' for an empty list.
 */
const formatDurations = (durations: readonly string[]): string => {
  if (durations.length === 0) {
    return 'None'
  }
  return durations.map((token) => DURATION_LABELS[token] ?? token).join(', ')
}

/**
 * Render a single summary row as a definition-list entry with a stable
 * `data-testid`. The row is read-only text — no form controls.
 */
const SummaryRow = ({
  testId,
  label,
  value,
}: {
  testId: string
  label: string
  value: string
}) => (
  <div className='flex justify-between gap-4 py-1'>
    <dt className='text-sm text-gray-500'>{label}</dt>
    <dd data-testid={testId} className='text-sm text-gray-800 text-right'>
      {value}
    </dd>
  </div>
)

/**
 * Render the read-only step summary. The summary is a `<section>` with a
 * `<dl>` of labeled values. Each value is rendered as text only — no
 * `input`, `select`, `textarea`, or `button` elements. The section carries
 * `data-testid='etude-summary'` so tests can locate it and assert it
 * contains no editable controls.
 * @param params - The owner's committed aggregate snapshot
 * @param step - The step level the summary is being built for
 * @returns A TSX section element
 */
export const EtudeSummary = ({
  params,
  step,
}: EtudeSummaryProps) => {
  const summary = deriveStepSummary(params, step)
  return (
    <section
      data-testid='etude-summary'
      aria-label='Current settings'
      className='card bg-base-200 mb-4'
    >
      <div className='card-body p-4'>
        <h3 className='text-sm font-semibold text-gray-700 mb-2'>
          Current settings
        </h3>
        <dl>
          <SummaryRow
            testId='summary-measures'
            label='Measures'
            value={String(summary.measureCount)}
          />
          <SummaryRow
            testId='summary-meter'
            label='Meter'
            value={summary.timeSignature}
          />
          <SummaryRow
            testId='summary-key'
            label='Key'
            value={summary.keySignature}
          />
          <SummaryRow
            testId='summary-octaves'
            label='Octaves'
            value={formatOctaveRange(summary.octaveRangeMin, summary.octaveRangeMax)}
          />
          <SummaryRow
            testId='summary-hands'
            label='Hands'
            value={summary.hand}
          />
          {summary.selectedPitches !== undefined && (
            <SummaryRow
              testId='summary-pitches'
              label='Pitches'
              value={formatPitches(summary.selectedPitches)}
            />
          )}
          {summary.selectedDurations !== undefined && (
            <SummaryRow
              testId='summary-durations'
              label='Durations'
              value={formatDurations(summary.selectedDurations)}
            />
          )}
          {summary.splitBoundary !== undefined && (
            <SummaryRow
              testId='summary-split-boundary'
              label='Split boundary'
              value={summary.splitBoundary}
            />
          )}
          {summary.leftHandPitches !== undefined && (
            <SummaryRow
              testId='summary-left-hand-pitches'
              label='Left hand'
              value={formatPitches(summary.leftHandPitches)}
            />
          )}
          {summary.rightHandPitches !== undefined && (
            <SummaryRow
              testId='summary-right-hand-pitches'
              label='Right hand'
              value={formatPitches(summary.rightHandPitches)}
            />
          )}
        </dl>
      </div>
    </section>
  )
}
