/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Refusal logging.
 *
 * Lost-lock, stale-operation, stale-epoch, and stale-Piece refusals are logged
 * with a typed category and enough context to diagnose them without logging
 * user identifiers, Piece content, LilyPond source, grant identifiers, or
 * credentials. The refusal decisions themselves are owned by later issues;
 * this slice provides only the logging surface.
 *
 * @module lib/refusal-logger
 */
import { logWarn } from './logger'

/** The four typed refusal categories. */
export type RefusalCategory = 'lost-lock' | 'stale-operation' | 'stale-epoch' | 'stale-Piece'

/** The canonical list of refusal categories, for runtime checks and tests. */
export const REFUSAL_CATEGORIES: readonly RefusalCategory[] = [
  'lost-lock',
  'stale-operation',
  'stale-epoch',
  'stale-Piece',
]

/**
 * Safe, diagnosable context for a refusal. Only these fields are emitted; any
 * forbidden fields (user identifiers, Piece content, LilyPond source, grant
 * identifiers, credentials) supplied by callers are ignored.
 */
export interface RefusalContext {
  /** The typed refusal category. */
  readonly category: RefusalCategory
  /** The correlation identifier for the request or operation. */
  readonly correlationId: string
  /** Optional safe, non-identifying diagnostic reason. */
  readonly reason?: string
}

/**
 * Log a refusal with its typed category and correlation identifier. Emits one
 * structured warning line via the redacting logger. Only the safe fields of
 * `RefusalContext` are passed through; forbidden fields are never emitted.
 *
 * @param ctx - The refusal context.
 */
export const logRefusal = (ctx: RefusalContext): void => {
  logWarn('refusal', {
    category: ctx.category,
    correlationId: ctx.correlationId,
    reason: ctx.reason,
  })
}
