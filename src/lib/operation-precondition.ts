/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Operation-POST precondition checker.
 *
 * A pure function that verifies the `workflowVersion` precondition and the
 * `aggregateEpoch` check for operation POSTs (generate, render retry, pdf,
 * start-over). Operation POSTs do not edit parameters, so they do not
 * increment the workflow version — they use it as a precondition that is
 * checked but never incremented (cross-cutting contract section 3).
 *
 * The workflow version alone is not sufficient because Start Over resets
 * parameters to defaults and a naive version comparison could coincide. The
 * epoch check guards against this: every conditional write performed by an
 * operation POST requires the epoch captured at acquisition to still be
 * current (cross-cutting contract section 4).
 *
 * This function is the gate every operation POST calls before any lock
 * acquisition, any external call, and any state change. It is pure: no DB,
 * no side effects, no mutation, no throws.
 * @module lib/operation-precondition
 */
import Result from 'true-myth/result'

import type { EtudeParams } from './etude-params-repository'
import { parseWorkflowVersionField } from './workflow-version-field'

/**
 * Typed failure returned by `checkOperationPrecondition`. The caller
 * distinguishes stale-version rejections (`version-mismatch`) from
 * epoch-mismatch rejections (`epoch-mismatch`). Both are deterministic and
 * must not be retried.
 */
export type OperationPreconditionFailure =
  | { kind: 'version-mismatch' }
  | { kind: 'epoch-mismatch' }

/**
 * Verify the workflow-version precondition and the aggregate-epoch check
 * for an operation POST.
 *
 * Parses the submitted `workflowVersion` string via `parseWorkflowVersionField`;
 * a missing, non-numeric, tampered, or negative value is treated the same as
 * a stale version — a `version-mismatch` (cross-cutting contract section 3
 * rule 1). Then compares the parsed version to `current.workflowVersion`;
 * on inequality returns `version-mismatch`. Then compares `capturedEpoch` to
 * `current.aggregateEpoch`; on inequality returns `epoch-mismatch`.
 * Otherwise returns Ok with the parsed workflow version.
 *
 * The function does not mutate its arguments, touch the DB, or throw.
 * @param current - The current aggregate loaded from the repository
 * @param submittedWorkflowVersion - The raw string from the form field
 * @param capturedEpoch - The aggregate epoch captured at acquisition
 * @returns Result<{ workflowVersion: number }, OperationPreconditionFailure>
 */
export const checkOperationPrecondition = (
  current: EtudeParams,
  submittedWorkflowVersion: string,
  capturedEpoch: number,
): Result<{ workflowVersion: number }, OperationPreconditionFailure> => {
  const parsed = parseWorkflowVersionField(submittedWorkflowVersion, 'workflowVersion')
  if (parsed.isErr) {
    return Result.err({ kind: 'version-mismatch' })
  }
  if (!parsed.isOk) {
    return Result.err({ kind: 'version-mismatch' })
  }
  if (parsed.value !== current.workflowVersion) {
    return Result.err({ kind: 'version-mismatch' })
  }
  if (capturedEpoch !== current.aggregateEpoch) {
    return Result.err({ kind: 'epoch-mismatch' })
  }
  return Result.ok({ workflowVersion: parsed.value })
}
