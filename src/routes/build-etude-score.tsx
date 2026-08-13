/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude score step (Issue 20).
 *
 * `GET /etude/score` renders the current immutable Piece. It loads the
 * owner's aggregate and current Piece record; when the canonical route for
 * the current state is not `/etude/score` (no Piece, prerequisites not met,
 * stored values invalid), it redirects 303 to the canonical route with a safe
 * prerequisite-redirect message. When the canonical route is `/etude/score`,
 * it renders the Piece's metadata (key, time signature, hand, measure count)
 * in a read-only presentation.
 *
 * The score page is a safe, side-effect-free GET: it must not mark anything,
 * write anything, or increment the workflow version. It inherits
 * cross-cutting contract section 1: auth + no-cache via the
 * `signedInAccess` middleware, owner-scoped via `c.get('user')`.
 * @module routes/buildEtudeScore
 */
import type { Context } from 'hono'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { PATHS, STANDARD_SECURE_HEADERS } from '../constants'
import { type AppEnv, type AuthUser, type DrizzleClient } from '../local-types'
import { useLayout } from './build-layout'
import { signedInAccess } from '../middleware/signed-in-access'
import { loadEtudeParams } from '../lib/etude-params-repository'
import { loadEtudePiece } from '../lib/etude-piece-repository'
import {
  computeCanonicalRoute,
  PREREQUISITE_REDIRECT_MESSAGE,
} from '../lib/workflow-service'
import { handleUnexpectedError } from './build-safe-error'
import { logError, sanitizeError } from '../lib/logger'
import { redirectWithMessage, redirectWithPrerequisiteMessage } from '../lib/redirects'
import type { Piece } from '../lib/piece-generator'

/**
 * Render the JSX for the score step: a read-only presentation of the current
 * Piece's metadata. The full SVG render arrives in Issue 30; this slice
 * shows the Piece's key, time signature, hand, and measure count so the
 * student can see that a Piece was generated.
 */
const renderEtudeScore = (piece: Piece) => {
  return (
    <div data-testid='etude-score-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Your etude</h2>
          <div data-testid='etude-score-content' className='space-y-2'>
            <p className='text-sm text-gray-700'>
              <span className='font-semibold'>Key:</span> {piece.key}
            </p>
            <p className='text-sm text-gray-700'>
              <span className='font-semibold'>Time signature:</span> {piece.timeSignature}
            </p>
            <p className='text-sm text-gray-700'>
              <span className='font-semibold'>Hand:</span>{' '}
              {piece.hand === 'both' ? 'Both hands' : piece.hand === 'left' ? 'Left hand' : 'Right hand'}
            </p>
            <p className='text-sm text-gray-700'>
              <span className='font-semibold'>Measures:</span> {piece.measures.length}
            </p>
          </div>
          <div className='card-actions justify-end mt-4'>
            <a
              href={PATHS.ETUDE_REVIEW}
              className='btn btn-ghost'
              data-testid='score-back-action'
            >
              Back to review
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Attach the etude score route to the app.
 * @param app - Hono app instance
 */
export const buildEtudeScore = (app: Hono<{ Bindings: any }>): void => {
  app.get(
    PATHS.ETUDE_SCORE,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithMessage(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      // Load the owner's aggregate.
      const paramsResult = await loadEtudeParams(db, user.id)
      if (paramsResult.isErr) {
        logError('etude score load params failed', { error: sanitizeError(paramsResult.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, paramsResult.error)
      }
      if (paramsResult.value === null) {
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }
      const params = paramsResult.value

      // Load the owner's current Piece record.
      const pieceResult = await loadEtudePiece(db, user.id)
      if (pieceResult.isErr) {
        logError('etude score load piece failed', { error: sanitizeError(pieceResult.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, pieceResult.error)
      }
      const hasCurrentPiece = pieceResult.value !== null

      // Compute the canonical route with the current-Piece flag.
      const canonical = computeCanonicalRoute(params, hasCurrentPiece)

      // If the canonical route is not /etude/score, redirect to it with a
      // safe prerequisite-redirect message.
      if (canonical !== PATHS.ETUDE_SCORE) {
        return redirectWithPrerequisiteMessage(c, canonical, PREREQUISITE_REDIRECT_MESSAGE)
      }

      // Parse the Piece JSON from the stored record.
      const pieceRecord = pieceResult.value!
      let piece: Piece
      try {
        piece = JSON.parse(pieceRecord.pieceJson) as Piece
      } catch (e) {
        logError('etude score parse piece json failed', { error: sanitizeError(e as Error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, e as Error)
      }

      return c.render(useLayout(c, renderEtudeScore(piece)))
    },
  )
}
