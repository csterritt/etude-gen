/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude workflow entry path.
 *
 * `GET /etude` loads (or creates) the owner's etude parameter aggregate,
 * resolves the canonical route for the current workflow state, and redirects
 * (303) to it. A freshly created aggregate has no confirmed steps, so the
 * canonical route is `/etude/setup`.
 *
 * `GET /etude/setup` is a minimal stub rendering a placeholder setup-step
 * banner so the redirect lands on a real page. Issue 5 replaces this stub
 * with the real setup form.
 *
 * Both routes inherit cross-cutting contract section 1: auth + no-cache via
 * the `signedInAccess` middleware, correlation via the existing
 * `correlationIdMiddleware`, owner-scoped via `c.get('user')`.
 * @module routes/buildEtude
 */
import type { Context } from 'hono'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { PATHS, STANDARD_SECURE_HEADERS } from '../constants'
import { Bindings, type AppEnv, type AuthUser, type DrizzleClient } from '../local-types'
import { useLayout } from './build-layout'
import { signedInAccess } from '../middleware/signed-in-access'
import { redirectWithMessage } from '../lib/redirects'
import { loadOrCreateEtudeParams } from '../lib/etude-params-repository'
import { resolveCanonicalRoute } from '../lib/canonical-route'
import { handleUnexpectedError } from './build-safe-error'
import { logError, sanitizeError } from '../lib/logger'

/**
 * Render the JSX for the setup-step placeholder page. Issue 5 replaces this
 * with the real setup form pre-populated with the default settings.
 */
const renderEtudeSetup = () => {
  return (
    <div data-testid='etude-setup-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Set up your etude</h2>
          <p className='text-gray-600 mb-6'>
            The setup form will appear here. Your default settings will be pre-populated.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Attach the etude entry and setup-stub routes to the app.
 * @param app - Hono app instance
 */
export const buildEtude = (app: Hono<{ Bindings: Bindings }>): void => {
  app.get(
    PATHS.ETUDE,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithMessage(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      const result = await loadOrCreateEtudeParams(db, user.id)

      if (result.isErr) {
        logError('etude entry load-or-create failed', { error: sanitizeError(result.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, result.error)
      }

      const canonicalRoute = resolveCanonicalRoute(result.value)
      return redirectWithMessage(c, canonicalRoute, '')
    },
  )

  app.get(
    PATHS.ETUDE_SETUP,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    (c: Context) => c.render(useLayout(c, renderEtudeSetup())),
  )
}
