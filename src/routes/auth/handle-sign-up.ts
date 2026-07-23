/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { createAuth } from '../../lib/auth'
import { redirectWithError, redirectWithMessage } from '../../lib/redirects'
import { PATHS, STANDARD_SECURE_HEADERS, COOKIES, MESSAGES } from '../../constants'
import type { Bindings } from '../../local-types'
import { createDbClient } from '../../db/client'
import { validateRequest, SignUpFormSchema } from '../../lib/validators'
import {
  handleSignUpResponseError,
  handleSignUpApiError,
  getResponseStatus,
  updateAccountTimestampAfterSignUp,
  redirectToAwaitVerification,
  isSyntheticDuplicateResponse,
} from '../../lib/sign-up-utils'
import { normalizeEmail } from '../../lib/email-utils'
import { addCookie } from '../../lib/cookie-support'

interface SignUpData {
  name: string
  email: string
  password: string
}

/**
 * Handle sign-up form submission with proper UX flow
 * Processes registration via better-auth and redirects to appropriate page
 */
export const handleSignUp = (app: Hono<{ Bindings: Bindings }>): void => {
  app.post(PATHS.AUTH.SIGN_UP, secureHeaders(STANDARD_SECURE_HEADERS), async (c) => {
    try {
      const body = await c.req.parseBody()
      const [ok, data, err] = validateRequest(body, SignUpFormSchema)

      if (!ok) {
        return redirectWithError(c, PATHS.AUTH.SIGN_IN, err || MESSAGES.INVALID_INPUT)
      }

      const { name, password } = data as SignUpData
      const email = normalizeEmail((data as SignUpData).email)
      const auth = createAuth(c.env)

      try {
        const signUpResponse = await auth.api.signUpEmail({
          body: {
            name,
            email,
            password,
            callbackURL: `${PATHS.AUTH.SIGN_IN}/true`,
          },
        })

        if (!signUpResponse) {
          return redirectWithError(c, PATHS.AUTH.SIGN_IN, MESSAGES.GENERIC_ERROR_TRY_AGAIN)
        }

        const errorResponse = handleSignUpResponseError(
          c,
          signUpResponse,
          email,
          PATHS.AUTH.SIGN_IN,
        )

        if (errorResponse) {
          return errorResponse
        }

        if (isSyntheticDuplicateResponse(signUpResponse)) {
          addCookie(c, COOKIES.EMAIL_ENTERED, email)
          return redirectWithMessage(
            c,
            PATHS.AUTH.AWAIT_VERIFICATION,
            MESSAGES.ACCOUNT_ALREADY_EXISTS,
          )
        }

        const responseStatus = getResponseStatus(signUpResponse)
        if (responseStatus !== null && responseStatus !== 200) {
          return redirectWithError(c, PATHS.AUTH.SIGN_IN, MESSAGES.GENERIC_ERROR_TRY_AGAIN)
        }
      } catch (apiError: unknown) {
        return handleSignUpApiError(c, apiError, email, PATHS.AUTH.SIGN_IN)
      }

      const dbClient = createDbClient(c.env.PROJECT_DB)
      await updateAccountTimestampAfterSignUp(dbClient, email)

      return redirectToAwaitVerification(c, email)
    } catch (error) {
      console.error('Sign-up error:', error)
      return redirectWithError(c, PATHS.AUTH.SIGN_IN, MESSAGES.REGISTRATION_GENERIC_ERROR)
    }
  })
}
