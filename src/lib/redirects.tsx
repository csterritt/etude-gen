/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Context } from 'hono'
import { getCookie } from 'hono/cookie'

import { COOKIES, HTML_STATUS } from '../constants'
import { Bindings } from '../local-types'

/**
 * Helper function to redirect with a message cookie
 * @param c - Hono context
 * @param redirectUrl - URL to redirect to
 * @param message - The message to display
 * @returns Response object with redirect and cookie
 */
export const redirectWithMessage = <E extends { Bindings: Bindings }>(
  c: Context<E>,
  redirectUrl: string,
  message: string,
): Response => {
  const response = c.redirect(redirectUrl, HTML_STATUS.SEE_OTHER)
  if (message.trim() !== '') {
    // Set cookie on the response directly
    const cookieOptions = Object.entries(COOKIES.STANDARD_COOKIE_OPTIONS)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
    const cookieValue = `${COOKIES.MESSAGE_FOUND}=${encodeURIComponent(message)}; ${cookieOptions}`
    response.headers.append('Set-Cookie', cookieValue)
  }
  return response
}

/**
 * Helper function to redirect with an error cookie
 * @param c - Hono context
 * @param redirectUrl - URL to redirect to
 * @param errorMessage - The error message to display
 * @returns Response object with redirect and cookie
 */
export const redirectWithError = <E extends { Bindings: Bindings }>(
  c: Context<E>,
  redirectUrl: string,
  errorMessage: string,
): Response => {
  const response = c.redirect(redirectUrl, HTML_STATUS.SEE_OTHER)
  const cookieOptions = Object.entries(COOKIES.STANDARD_COOKIE_OPTIONS)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ')
    const cookieValue = `${COOKIES.ERROR_FOUND}=${encodeURIComponent(errorMessage)}; ${cookieOptions}`
  response.headers.append('Set-Cookie', cookieValue)
  return response
}
