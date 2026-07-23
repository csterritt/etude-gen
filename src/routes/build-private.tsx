/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the private path.
 * @module routes/buildPrivate
 */
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { PATHS, STANDARD_SECURE_HEADERS } from '../constants'
import { Bindings } from '../local-types'
import { useLayout } from './build-layout'
import { signedInAccess } from '../middleware/signed-in-access'

/**
 * Render the JSX for the private page.
 */
const renderPrivate = () => {
  return (
    <div data-testid='private-page-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Private Area</h2>
          <p className='text-gray-600 mb-6'>
            This is a protected area that requires authentication to access.
          </p>

          <div className='card-actions flex-col gap-3'>
            <a
              href={PATHS.PROFILE}
              className='btn btn-primary w-full'
              data-testid='visit-profile-action'
            >
              Go to Profile
            </a>

            <a
              href={PATHS.ROOT}
              className='btn btn-outline btn-secondary w-full'
              data-testid='visit-home-action'
            >
              Return Home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Attach the private route to the app.
 * @param app - Hono app instance
 */
export const buildPrivate = (app: Hono<{ Bindings: Bindings }>): void => {
  app.get(PATHS.PRIVATE, secureHeaders(STANDARD_SECURE_HEADERS), signedInAccess, (c) =>
    c.render(useLayout(c, renderPrivate())),
  )
}
