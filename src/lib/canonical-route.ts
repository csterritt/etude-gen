/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Canonical workflow state-to-route resolver.
 *
 * Maps an etude parameter aggregate snapshot to the canonical route for the
 * current workflow state, per cross-cutting contract section 5. Completion is
 * per-step confirmation: a step is confirmed by a successful POST to it, not
 * by having valid default values. Defaults pre-populate controls; they do not
 * pre-confirm steps.
 *
 * Rows handled: no aggregate → `/etude/setup`; setup unconfirmed →
 * `/etude/setup`; notes unconfirmed → `/etude/notes`; both hands, notes
 * confirmed, fewer than two stored pitches (corrupt state) → `/etude/notes`;
 * both hands, notes confirmed, split unconfirmed → `/etude/split`; one hand,
 * notes confirmed → `/etude/review` (split skipped); both hands, notes and
 * split confirmed → `/etude/review`. Later issues extend this resolver with
 * the score rows.
 * @module lib/canonical-route
 */
import { PATHS } from '../constants'
import type { EtudeParams } from './etude-params-repository'

/**
 * Count the selected pitches stored in a comma-separated string. Null or empty
 * means zero pitches. Used by the corrupt-state recovery check: a two-hand
 * aggregate holding fewer than two stored pitches is returned to the notes
 * step (cross-cutting contract section 5 "stored values no longer validate").
 */
const countSelectedPitches = (selectedPitches: string | null): number => {
  if (selectedPitches === null || selectedPitches === '') {
    return 0
  }
  return selectedPitches.split(',').filter((p) => p.length > 0).length
}

/**
 * Resolve the canonical route for the current aggregate state.
 *
 * Returns `/etude/setup` when no aggregate exists (the aggregate is created
 * with defaults first) and when setup is not yet confirmed. Returns
 * `/etude/notes` when the notes step is unconfirmed, and also when both hands
 * are selected but fewer than two pitches are stored (corrupt state — the
 * notes step is the earliest incomplete step because the two-hand minimum is
 * no longer met). Returns `/etude/split` when both hands are selected, the
 * notes step is confirmed, and the split step is unconfirmed. Returns
 * `/etude/review` when one hand is selected and notes are confirmed (split
 * skipped), or when both hands are selected and the split step is confirmed,
 * and no current Piece exists. Returns `/etude/score` when the review
 * predicate is satisfied and a current Piece exists (Issue 20).
 *
 * The `hasCurrentPiece` argument defaults to `false` for backward
 * compatibility with callers that do not yet load the Piece record.
 * @param params - The owner's aggregate snapshot, or null when none exists
 * @param hasCurrentPiece - Whether a current Piece record exists for the owner
 * @returns The canonical route path
 */
export const resolveCanonicalRoute = (
  params: EtudeParams | null,
  hasCurrentPiece: boolean = false,
): string => {
  if (params === null) {
    return PATHS.ETUDE_SETUP
  }

  if (!params.setupConfirmed) {
    return PATHS.ETUDE_SETUP
  }

  // Setup is confirmed. The notes step is the earliest incomplete step when
  // pitches or durations are unconfirmed (cross-cutting contract section 5:
  // the notes step is one coherent prerequisite — both halves must be
  // confirmed for it to count as complete).
  if (!params.notesConfirmed) {
    return PATHS.ETUDE_NOTES
  }

  // Notes are confirmed. When both hands are selected but fewer than two
  // pitches are stored (corrupt state from an out-of-band change or an
  // interrupted invalidation), the notes step is the earliest incomplete
  // step because the two-hand minimum is no longer met. The split step never
  // renders an empty or single-option boundary list.
  if (params.hand === 'both' && countSelectedPitches(params.selectedPitches) < 2) {
    return PATHS.ETUDE_NOTES
  }

  // Both hands, notes confirmed, enough pitches: the split step is the
  // earliest incomplete step when it is unconfirmed.
  if (params.hand === 'both' && !params.splitConfirmed) {
    return PATHS.ETUDE_SPLIT
  }

  // One hand with notes confirmed (split skipped), or both hands with split
  // confirmed: the review predicate is satisfied. When a current Piece
  // exists, the canonical route is /etude/score (Issue 20); otherwise it is
  // /etude/review.
  if (hasCurrentPiece) {
    return PATHS.ETUDE_SCORE
  }
  return PATHS.ETUDE_REVIEW
}
