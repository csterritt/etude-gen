/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { redirectWithError } from '../../lib/redirects'
import { PATHS, STANDARD_SECURE_HEADERS, MESSAGES } from '../../constants'
import type { Bindings } from '../../local-types'
import { validateRequest, GatedSignUpFormSchema } from '../../lib/validators'
import { processGatedSignUp, GatedSignUpData } from '../../lib/sign-up-utils'

/**
 * Handle gated sign-up form submission with code validation
 * Processes registration via better-auth only after validating and consuming single-use code
 */
export const handleGatedSignUp = (app: Hono<{ Bindings: Bindings }>): void => {
  app.post(PATHS.AUTH.SIGN_UP, secureHeaders(STANDARD_SECURE_HEADERS), async (c) => {
    try {
      const body = await c.req.parseBody()
      const [ok, data, err] = validateRequest(body, GatedSignUpFormSchema)

      if (!ok) {
        return redirectWithError(c, PATHS.AUTH.SIGN_UP, err || MESSAGES.INVALID_INPUT)
      }

      return await processGatedSignUp(c, data as GatedSignUpData)
    } catch (error) {
      console.error('Gated sign-up error:', error)
      return redirectWithError(c, PATHS.AUTH.SIGN_UP, MESSAGES.REGISTRATION_GENERIC_ERROR)
    }
  })
}
