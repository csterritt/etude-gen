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
 * This issue (4) handles the first two rows of the state table: no aggregate
 * and setup-not-confirmed both resolve to `/etude/setup`. Later issues extend
 * this resolver with the notes/split/review/score rows.
 * @module lib/canonical-route
 */
import { PATHS } from '../constants'
import type { EtudeParams } from './etude-params-repository'

/**
 * Resolve the canonical route for the current aggregate state.
 *
 * Returns `/etude/setup` when no aggregate exists (the aggregate is created
 * with defaults first) and when setup is not yet confirmed. Later issues
 * extend this with the remaining rows of the section-5 state table.
 * @param params - The owner's aggregate snapshot, or null when none exists
 * @returns The canonical route path
 */
export const resolveCanonicalRoute = (params: EtudeParams | null): string => {
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

  // Later issues extend this resolver for the split/review/score rows.
  return PATHS.ETUDE_SETUP
}
