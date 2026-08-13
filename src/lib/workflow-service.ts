/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Workflow service: canonical state-to-route resolution with stored-value
 * validation (Issue 18), step reachability, and the derived review predicate
 * (Issue 19).
 *
 * `computeCanonicalRoute` is the single entry point routes call to determine
 * the canonical route for the current workflow state. It delegates to
 * `resolveCanonicalRoute` for the flag-based rows of cross-cutting contract
 * section 5 (no aggregate, setup unconfirmed, notes unconfirmed, split
 * unconfirmed, one-hand skip, all confirmed) and layers stored-value
 * validation on top: when the flag-based resolver has moved past a step, the
 * stored values for that step are validated against the current constraints
 * (available pitches for the stored key and octaves, offerable durations for
 * the stored meter, eligible boundaries for the stored selected pitches). If
 * any stored value no longer validates, the workflow service routes to the
 * earliest step whose stored values are now invalid, treated as unconfirmed.
 *
 * `isStepReachable` reports whether a step's prerequisites are met so a
 * student can revisit a completed step to edit it without being redirected
 * forward.
 *
 * `isReviewReachable` is the derived, never-persisted review-completion
 * predicate and the generation precondition (Issue 19, cross-cutting contract
 * section 5). It is computed from the snapshot's confirmation flags and
 * `hand` — never from a stored review flag, because none exists in the
 * aggregate. There is nothing for Issue 11 to clear: review simply stops
 * being reachable when a downstream step loses its confirmation.
 *
 * The score-related rows of section 5 (current Piece, render failure, stale
 * Piece) are deferred to Issues 20, 30, 31, and 32, which build the Piece and
 * render infrastructure. This module will be extended by those issues.
 *
 * The functions are pure: they read only the aggregate snapshot and the
 * packaged rhythm catalog constant, never mutate their argument, never throw
 * on invalid stored values (they route instead), and never touch the DB.
 * @module lib/workflow-service
 */
import { PATHS } from '../constants'
import type { DrizzleClient } from '../local-types'
import type { EtudeParams } from './etude-params-repository'
import { loadEtudeParams } from './etude-params-repository'
import { resolveCanonicalRoute } from './canonical-route'
import {
  deriveAvailablePitches,
  parseStoredOctaves,
  parseStoredPitches,
  deriveEligibleBoundaries,
} from './music-domain'
import {
  computeOfferableDurations,
  loadRhythmCatalog,
} from './duration-selection-validator'
import { RHYTHM_CATALOG_TEXT } from './rhythm-catalog-data'
import { checkOperationPrecondition } from './operation-precondition'
import {
  generatePiece,
  type Piece,
  type GenerationSettings,
  type RandomSource,
  type GeneratorFailure,
} from './piece-generator'
import {
  persistEtudePiece,
  type PiecePersistError,
} from './etude-piece-repository'

/**
 * The safe explanatory message displayed when a student is redirected from a
 * directly requested step to the earliest incomplete step. The message exposes
 * no internal state or identifiers: no ids, no version numbers, no epoch
 * values, no pitch names, no boundary ids (cross-cutting contract section 1
 * rule 6 and Issue 18 acceptance criterion on safe messages).
 */
export const PREREQUISITE_REDIRECT_MESSAGE =
  'That step isn\u2019t available yet. You\u2019ve been taken to where you left off.'

/**
 * Parse the stored selected-durations string into an array of duration tokens.
 * Null or empty yields an empty array. Whitespace around individual tokens is
 * trimmed and empty segments are dropped.
 */
const parseStoredDurations = (stored: string | null): string[] => {
  if (stored === null || stored.trim() === '') {
    return []
  }
  return stored
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
}

/**
 * Return `true` when every stored pitch is in the available set derived from
 * the stored key and octaves. An empty stored set is considered valid (the
 * flag-based resolver handles the "no stored pitches" corrupt-state row
 * separately). The function is pure and never throws.
 */
const storedPitchesValidate = (params: EtudeParams): boolean => {
  const stored = parseStoredPitches(params.selectedPitches)
  if (stored.length === 0) {
    return true
  }
  const octaves = parseStoredOctaves(params.selectedOctaves)
  const available = deriveAvailablePitches(params.keySignature, octaves).pitches
  const availableSet = new Set(available)
  for (const pitch of stored) {
    if (!availableSet.has(pitch)) {
      return false
    }
  }
  return true
}

/**
 * Return `true` when every stored duration token is offerable for the stored
 * meter. An empty stored set is considered valid (the flag-based resolver
 * handles the "no stored durations" case separately). The function is pure and
 * never throws.
 */
const storedDurationsValidate = (params: EtudeParams): boolean => {
  const stored = parseStoredDurations(params.selectedDurations)
  if (stored.length === 0) {
    return true
  }
  const catalog = loadRhythmCatalog(RHYTHM_CATALOG_TEXT)
  const offerable = computeOfferableDurations(catalog, params.timeSignature)
  const offerableSet = new Set(offerable)
  for (const token of stored) {
    if (!offerableSet.has(token)) {
      return false
    }
  }
  return true
}

/**
 * Return `true` when the stored split boundary id is among the eligible
 * boundaries derived from the stored selected pitches (filtered to the
 * available set). An empty or null stored boundary is considered valid (the
 * flag-based resolver handles the "split unconfirmed" case separately). The
 * function is pure and never throws.
 */
const storedBoundaryValidates = (params: EtudeParams): boolean => {
  if (params.splitBoundary === null || params.splitBoundary.trim() === '') {
    return true
  }
  const octaves = parseStoredOctaves(params.selectedOctaves)
  const availablePitches = deriveAvailablePitches(params.keySignature, octaves).pitches
  const availableSet = new Set(availablePitches)
  const storedPitches = parseStoredPitches(params.selectedPitches).filter((p) =>
    availableSet.has(p),
  )
  const eligible = deriveEligibleBoundaries(storedPitches)
  const eligibleIds = new Set(eligible.map((b) => b.id))
  return eligibleIds.has(params.splitBoundary)
}

/**
 * Resolve the canonical route for the current aggregate state, validating
 * stored values against current constraints.
 *
 * Delegates to `resolveCanonicalRoute` for the flag-based rows, then layers
 * stored-value validation on top. The value validation only applies when the
 * flag-based resolver has moved past a step, because only then are the stored
 * values for that step relied upon:
 *
 * - When the notes step is confirmed, the stored pitches and durations are
 *   validated. If either no longer validates, the canonical route is
 *   `/etude/notes` (the earliest step whose stored values are now invalid).
 * - When the split step is confirmed and both hands are selected, the stored
 *   boundary is validated. If it no longer validates, the canonical route is
 *   `/etude/split`.
 *
 * When all stored values validate, the flag-based result is returned. The
 * function is pure: it reads only `params` and the packaged rhythm catalog
 * constant, never mutates its argument, never throws on invalid stored values
 * (it routes instead), and never touches the DB.
 * @param params - The owner's aggregate snapshot, or null when none exists
 * @param hasCurrentPiece - Whether a current Piece record exists for the owner
 * @returns The canonical route path
 */
export const computeCanonicalRoute = (
  params: EtudeParams | null,
  hasCurrentPiece: boolean = false,
): string => {
  if (params === null) {
    return resolveCanonicalRoute(null)
  }

  const flagBased = resolveCanonicalRoute(params, hasCurrentPiece)

  // The value validation only applies when the flag-based resolver has
  // moved past a step. When the notes step is unconfirmed, the canonical
  // route is already /etude/notes (or earlier), so there is nothing to
  // validate — the student will re-enter the notes step and re-confirm.
  if (params.notesConfirmed) {
    if (!storedPitchesValidate(params) || !storedDurationsValidate(params)) {
      return PATHS.ETUDE_NOTES
    }
  }

  // The split step is only validated when both hands are selected and the
  // split step is confirmed. One-hand mode skips the split step entirely,
  // so a stale boundary is irrelevant. When the split step is unconfirmed,
  // the canonical route is already /etude/split (or earlier).
  if (params.hand === 'both' && params.splitConfirmed) {
    if (!storedBoundaryValidates(params)) {
      return PATHS.ETUDE_SPLIT
    }
  }

  return flagBased
}

/**
 * Step ordering for reachability comparison. A step is reachable when the
 * canonical route is at or after it in this ordering. The split step is
 * special-cased separately for one-hand workflows (it is skipped).
 */
const STEP_ORDER: Record<string, number> = {
  [PATHS.ETUDE_SETUP]: 0,
  [PATHS.ETUDE_NOTES]: 1,
  [PATHS.ETUDE_SPLIT]: 2,
  [PATHS.ETUDE_REVIEW]: 3,
  [PATHS.ETUDE_SCORE]: 4,
}

/**
 * Return `true` when a step's prerequisites are met — i.e., the student is
 * allowed to visit this step directly. A step is reachable when the canonical
 * route is at or after it in the step ordering (meaning all prior steps are
 * confirmed with valid stored values). The split step is never reachable for
 * one-hand workflows (it is skipped). The setup step is always reachable when
 * an aggregate exists.
 *
 * This lets a student revisit a completed step to edit it (e.g., following a
 * Back link from the review step to the split step) without being redirected
 * forward — the step's prerequisites are still met even though the canonical
 * route has moved past it. The entry route (`GET /etude`) uses
 * `computeCanonicalRoute` directly rather than this predicate.
 *
 * The function is pure: it reads only `params` and the packaged rhythm catalog
 * constant, never mutates its argument, never throws, and never touches the DB.
 * @param params - The owner's aggregate snapshot, or null when none exists
 * @param stepPath - The step path to check for reachability
 * @returns `true` when the step's prerequisites are met
 */
export const isStepReachable = (
  params: EtudeParams | null,
  stepPath: string,
): boolean => {
  if (params === null) {
    return stepPath === PATHS.ETUDE_SETUP
  }
  // The split step is never reachable for one-hand workflows (it is skipped).
  if (stepPath === PATHS.ETUDE_SPLIT && params.hand !== 'both') {
    return false
  }
  const canonical = computeCanonicalRoute(params)
  return STEP_ORDER[canonical] >= STEP_ORDER[stepPath]
}

/**
 * Derive whether the review step is reachable from the current aggregate
 * state, without consulting any stored review flag (none exists).
 *
 * Review is reachable exactly when setup is confirmed, the notes step is
 * confirmed, and — when both hands are selected — the split step is also
 * confirmed. For one-hand mode the split step is never required
 * (cross-cutting contract section 5). This predicate is the generation
 * precondition (Issue 19): `POST /etude/generate` is offered on the review
 * page exactly when this returns `true`, and a stale review (after an
 * upstream change that unconfirms a downstream step) simply stops being
 * reachable — no review flag is written or cleared, because none exists.
 *
 * The function is pure: it reads only the confirmation flags and `hand`, and
 * does not touch the DB or mutate its argument.
 * @param params - The current aggregate snapshot
 * @returns `true` when the review step is reachable
 */
export const isReviewReachable = (params: EtudeParams): boolean => {
  if (!params.setupConfirmed) {
    return false
  }
  if (!params.notesConfirmed) {
    return false
  }
  if (params.hand === 'both' && !params.splitConfirmed) {
    return false
  }
  return true
}

/**
 * The typed outcome of `generateEtude`. Each variant carries the redirect
 * target the route should use; the `success` variant also carries the
 * generated Piece. Variants:
 *
 * - `success`: a Piece was generated and persisted; redirect to `/etude/score`.
 * - `stale-version`: the submitted workflow version is stale, missing,
 *   tampered, or the aggregate epoch no longer matches (Start Over bumped it
 *   or the aggregate is gone). Redirect to the canonical route for the
 *   current state. Nothing was published.
 * - `prerequisites-not-met`: the review predicate is false (an upstream step
 *   lost its confirmation). Redirect to the canonical route (the earliest
 *   incomplete step). Nothing was published.
 * - `stored-values-invalid`: the review predicate is true but a stored value
 *   no longer validates against the current constraints. Redirect to the
 *   canonical route (the earliest invalid step). Nothing was published.
 * - `generator-failure`: the Piece Generator returned a typed invariant
 *   failure (no eligible rhythms or an empty pitch set). Redirect to
 *   `/etude/review`. Nothing was published.
 * - `db-error`: a transient DB error occurred during persistence. Redirect
 *   to `/etude/review`. The route surfaces a generic error message.
 */
export type GenerateOutcome =
  | { kind: 'success'; redirectTarget: string; piece: Piece }
  | { kind: 'stale-version'; redirectTarget: string }
  | { kind: 'prerequisites-not-met'; redirectTarget: string }
  | { kind: 'stored-values-invalid'; redirectTarget: string }
  | { kind: 'generator-failure'; redirectTarget: string }
  | { kind: 'db-error'; redirectTarget: string }

/**
 * Resolve the right- and left-hand pitch sets from the aggregate for a
 * two-hand workflow, using the stored split boundary. Returns `null` when the
 * boundary cannot be resolved (it is no longer eligible), so the caller can
 * redirect to the split step.
 */
const resolveHandPitches = (
  params: EtudeParams,
): { right: string[]; left: string[] } | null => {
  const storedPitches = parseStoredPitches(params.selectedPitches)
  if (params.hand === 'right') {
    return { right: storedPitches, left: [] }
  }
  if (params.hand === 'left') {
    return { left: storedPitches, right: [] }
  }
  // Both hands: split the stored pitches at the stored boundary.
  if (params.splitBoundary === null || params.splitBoundary.trim() === '') {
    return null
  }
  const eligible = deriveEligibleBoundaries(storedPitches)
  const match = eligible.find((b) => b.id === params.splitBoundary)
  if (!match) {
    return null
  }
  return { right: match.right, left: match.left }
}

/**
 * Build `GenerationSettings` from the aggregate snapshot. Returns `null` when
 * the hand pitches cannot be resolved (the boundary is stale), so the caller
 * can redirect to the split step.
 */
const buildGenerationSettings = (
  params: EtudeParams,
): GenerationSettings | null => {
  const handPitches = resolveHandPitches(params)
  if (handPitches === null) {
    return null
  }
  const selectedDurations = parseStoredDurations(params.selectedDurations)
  return {
    measureCount: params.measureCount,
    timeSignature: params.timeSignature,
    key: params.keySignature,
    hand: params.hand as 'left' | 'right' | 'both',
    rightHandPitches: handPitches.right,
    leftHandPitches: handPitches.left,
    selectedDurations,
    sourceParameterVersion: params.workflowVersion,
  }
}

/**
 * Map a `GeneratorFailure` to a redirect target. The generator's typed
 * invariant failures are safe: they redirect to `/etude/review` so the
 * student can adjust their selections. No internal state is exposed.
 */
const generatorFailureRedirect = (_failure: GeneratorFailure): string => PATHS.ETUDE_REVIEW

/**
 * Perform the generate operation (Issue 20).
 *
 * Steps:
 * 1. Load the current aggregate. When none exists, return `stale-version`
 *    with the canonical route (setup) as the redirect target.
 * 2. Verify the operation precondition (submitted workflow version matches
 *    the stored version and the captured epoch matches the stored epoch). On
 *    failure, return `stale-version` with the canonical route as the redirect
 *    target. Nothing is published.
 * 3. Check the review predicate (`isReviewReachable`). When false, return
 *    `prerequisites-not-met` with the canonical route (the earliest
 *    incomplete step) as the redirect target. Nothing is published.
 * 4. Check stored-value validation via `computeCanonicalRoute`. When the
 *    canonical route is not `/etude/review`, a stored value no longer
 *    validates: return `stored-values-invalid` with the canonical route (the
 *    earliest invalid step) as the redirect target. Nothing is published.
 * 5. Build `GenerationSettings` from the aggregate. When the boundary is
 *    stale (two-hand with an ineligible boundary), `buildGenerationSettings`
 *    returns null — return `stored-values-invalid` with `/etude/split` as the
 *    redirect target. (This is a defensive path: step 4 should already have
 *    caught this.)
 * 6. Call `generatePiece` with the settings and the injectable random
 *    source. On a typed invariant failure, return `generator-failure` with
 *    `/etude/review` as the redirect target. Nothing is published.
 * 7. Persist the Piece via `persistEtudePiece` with the captured epoch. On
 *    `epoch-mismatch`, return `stale-version` with the canonical route as the
 *    redirect target (the epoch changed between the precondition check and
 *    the commit — a rare race that Issue 33's lock will prevent). On
 *    `db-error`, return `db-error` with `/etude/review` as the redirect
 *    target.
 * 8. On success, return `success` with `/etude/score` as the redirect target
 *    and the generated Piece.
 *
 * The function is async (it touches the DB) but never throws: every failure
 * is returned as a typed variant. The route maps each variant to a redirect
 * and, for `success`, sets the score cookie.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @param submittedWorkflowVersion - The raw workflow-version string from the form
 * @param capturedEpoch - The aggregate epoch captured at form acquisition (review-page render)
 * @param random - Injectable random-number source
 * @param correlationId - Correlation id for logging (unused in Issue 20)
 * @returns Promise<GenerateOutcome>
 */
export const generateEtude = async (
  db: DrizzleClient,
  userId: string,
  submittedWorkflowVersion: string,
  capturedEpoch: number,
  random: RandomSource,
  _correlationId: string,
): Promise<GenerateOutcome> => {
  // 1. Load the current aggregate.
  const loaded = await loadEtudeParams(db, userId)
  if (loaded.isErr) {
    return { kind: 'db-error', redirectTarget: PATHS.ETUDE_REVIEW }
  }
  const current = loaded.value
  if (current === null) {
    return { kind: 'stale-version', redirectTarget: computeCanonicalRoute(null) }
  }

  // 2. Verify the operation precondition (version + epoch).
  const precondition = checkOperationPrecondition(
    current,
    submittedWorkflowVersion,
    capturedEpoch,
  )
  if (precondition.isErr) {
    return { kind: 'stale-version', redirectTarget: computeCanonicalRoute(current) }
  }

  // 3. Check the review predicate.
  if (!isReviewReachable(current)) {
    return { kind: 'prerequisites-not-met', redirectTarget: computeCanonicalRoute(current) }
  }

  // 4. Check stored-value validation.
  const canonical = computeCanonicalRoute(current)
  if (canonical !== PATHS.ETUDE_REVIEW) {
    return { kind: 'stored-values-invalid', redirectTarget: canonical }
  }

  // 5. Build generation settings.
  const settings = buildGenerationSettings(current)
  if (settings === null) {
    // Defensive: the boundary is stale. Step 4 should have caught this.
    return { kind: 'stored-values-invalid', redirectTarget: PATHS.ETUDE_SPLIT }
  }

  // 6. Generate the Piece.
  const generated = generatePiece(settings, random)
  if (generated.isErr) {
    return { kind: 'generator-failure', redirectTarget: generatorFailureRedirect(generated.error) }
  }
  const piece = generated.value

  // 7. Persist the Piece with the captured epoch.
  const persisted = await persistEtudePiece(db, userId, current.aggregateEpoch, piece)
  if (persisted.isErr) {
    const failure: PiecePersistError = persisted.error
    if (failure.kind === 'epoch-mismatch') {
      return { kind: 'stale-version', redirectTarget: computeCanonicalRoute(current) }
    }
    return { kind: 'db-error', redirectTarget: PATHS.ETUDE_REVIEW }
  }

  // 8. Success.
  return { kind: 'success', redirectTarget: PATHS.ETUDE_SCORE, piece }
}
