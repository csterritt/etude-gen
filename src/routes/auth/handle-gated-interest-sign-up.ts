/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Handler for combined gated + interest sign-up form submissions.
 * Handles both the gated sign-up (with code) and interest sign-up (waitlist) forms.
 * @module routes/auth/handleGatedInterestSignUp
 */
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { redirectWithError, redirectWithMessage } from '../../lib/redirects'
import { PATHS, STANDARD_SECURE_HEADERS, MESSAGES, COOKIES } from '../../constants'
import type { Bindings, DrizzleClient } from '../../local-types'
import { addInterestedEmail } from '../../lib/db-access'
import { addCookie } from '../../lib/cookie-support'
import {
  validateRequest,
  GatedSignUpFormSchema,
  InterestSignUpFormSchema,
} from '../../lib/validators'
import { processGatedSignUp, GatedSignUpData } from '../../lib/sign-up-utils'

/**
 * Handle gated sign-up form submission with code validation
 * Processes registration via better-auth only after validating and consuming single-use code
 */
export const handleGatedInterestSignUp = (app: Hono<{ Bindings: Bindings }>): void => {
  // Handle gated sign-up (with code)
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

  // Handle interest sign-up (waitlist)
  app.post(PATHS.AUTH.INTEREST_SIGN_UP, secureHeaders(STANDARD_SECURE_HEADERS), async (c) => {
    // Check if user is already signed in
    const user = c.get('user')
    if (user) {
      return redirectWithMessage(c, PATHS.PRIVATE, MESSAGES.ALREADY_SIGNED_IN)
    }

    // Get form data and validate
    const body = await c.req.parseBody()
    const [ok, data, err] = validateRequest(body, InterestSignUpFormSchema)
    if (!ok) {
      const emailEntered =
        typeof body === 'object' && body !== null && 'email' in body
          ? String(body.email)
          : undefined
      if (emailEntered) {
        addCookie(c, COOKIES.EMAIL_ENTERED, emailEntered)
      }

      return redirectWithError(c, PATHS.AUTH.SIGN_UP, err || MESSAGES.INVALID_INPUT)
    }

    const email = data!.email as string
    const trimmedEmail = email.trim().toLowerCase()

    // Get database instance
    const db = c.get('db') as DrizzleClient

    try {
      // Add email to interested emails list
      const addResult = await addInterestedEmail(db, trimmedEmail)

      if (addResult.isErr) {
        console.error('Database error adding interested email:', addResult.error)
        addCookie(c, COOKIES.EMAIL_ENTERED, email)
        return redirectWithError(
          c,
          PATHS.AUTH.SIGN_UP,
          'Sorry, there was an error processing your request. Please try again.',
        )
      }

      if (!addResult.value) {
        // Email already exists in the list
        return redirectWithMessage(
          c,
          PATHS.AUTH.SIGN_IN,
          "Thanks! Your email is already on our waitlist. We'll notify you when we're accepting new accounts.",
        )
      }

      // Successfully added to waitlist
      return redirectWithMessage(
        c,
        PATHS.AUTH.SIGN_IN,
        "Thanks! You've been added to our waitlist. We'll notify you when we start accepting new accounts.",
      )
    } catch (error) {
      console.error('Unexpected error in handleInterestSignUp:', error)
      addCookie(c, COOKIES.EMAIL_ENTERED, email)
      return redirectWithError(
        c,
        PATHS.AUTH.SIGN_UP,
        'Sorry, there was an error processing your request. Please try again.',
      )
    }
  })
}
