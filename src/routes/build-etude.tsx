/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude entry path.
 * @module routes/buildEtude
 */
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { PATHS, STANDARD_SECURE_HEADERS } from '../constants'
import { Bindings } from '../local-types'
import { useLayout } from './build-layout'
import { signedInAccess } from '../middleware/signed-in-access'

/**
 * Render the JSX for the etude entry page.
 */
const renderEtude = () => {
  return (
    <div data-testid='etude-page-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Etude Generator</h2>
          <p className='text-gray-600 mb-6'>
            Welcome to the etude generator. Your workflow will appear here.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Attach the etude entry route to the app.
 * @param app - Hono app instance
 */
export const buildEtude = (app: Hono<{ Bindings: Bindings }>): void => {
  app.get(PATHS.ETUDE, secureHeaders(STANDARD_SECURE_HEADERS), signedInAccess, (c) =>
    c.render(useLayout(c, renderEtude())),
  )
}
