/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Validation-state redirect/consume helpers.
 *
 * Bridges the validation-state repository and the HTTP layer: on a rejected
 * POST, `redirectWithValidationState` stores the shaped payload server-side
 * and issues a 303 redirect with an opaque, single-use nonce cookie; on the
 * following GET, `consumeValidationStateFromRequest` reads the nonce cookie,
 * consumes the server-side record, and deletes the cookie.
 *
 * The cookie value is only the opaque nonce — no submitted value, field name,
 * or error text is ever placed in it. When the store fails, the helper falls
 * back to `redirectWithError` with a generic corrective message so the user
 * still sees a 303 redirect, never a 500.
 * @module lib/validation-state-helpers
 */
import type { Context } from 'hono'
import { getCookie } from 'hono/cookie'

import { COOKIES, HTML_STATUS } from '../constants'
import type { Bindings, DrizzleClient } from '../local-types'
import { redirectWithError } from './redirects'
import {
  storeValidationState,
  consumeValidationState,
  type ValidationStatePayload,
} from './validation-state-repository'
import Result from 'true-myth/result'

/**
 * Generic corrective message used when the validation-state store fails. The
 * user is told to check their entries and try again — no internal detail is
 * leaked.
 */
const STORAGE_FAILURE_MESSAGE =
  'Your submission could not be processed. Please check your entries and try again.'

/**
 * Map a cookie-option key from the constants object to its conventional
 * Set-Cookie attribute name. Boolean keys map to bare attribute names;
 * `maxAge` maps to `Max-Age`; `sameSite` maps to `SameSite`; `path` and
 * `httpOnly`/`secure` map to their conventional capitalizations.
 */
const cookieAttrName = (key: string): string => {
  switch (key) {
    case 'httpOnly':
      return 'HttpOnly'
    case 'sameSite':
      return 'SameSite'
    case 'maxAge':
      return 'Max-Age'
    case 'path':
      return 'Path'
    case 'secure':
      return 'Secure'
    default:
      return key.charAt(0).toUpperCase() + key.slice(1)
  }
}

/**
 * Build a Set-Cookie header value for the nonce cookie from the
 * `VALIDATION_STATE_COOKIE_OPTIONS` constant. Boolean attributes
 * (`httpOnly`, `secure`) are emitted as bare attribute names; other
 * attributes are emitted as `name=value` pairs with conventional
 * capitalization.
 */
const buildNonceCookieHeader = (nonce: string): string => {
  const opts = COOKIES.VALIDATION_STATE_COOKIE_OPTIONS
  const parts: string[] = [`${COOKIES.VALIDATION_STATE_NONCE}=${nonce}`]
  for (const [key, value] of Object.entries(opts)) {
    if (typeof value === 'boolean') {
      if (value) {
        parts.push(cookieAttrName(key))
      }
    } else {
      parts.push(`${cookieAttrName(key)}=${value}`)
    }
  }
  return parts.join('; ')
}

/**
 * Build a Set-Cookie header value that deletes (expires) the nonce cookie.
 * Reuses the same path/sameSite/httpOnly/secure attributes so the deletion
 * matches the cookie's scope, and sets Max-Age=0 to expire immediately.
 */
const buildDeleteNonceCookieHeader = (): string => {
  const opts = COOKIES.VALIDATION_STATE_COOKIE_OPTIONS
  const parts: string[] = [`${COOKIES.VALIDATION_STATE_NONCE}=`]
  for (const [key, value] of Object.entries(opts)) {
    if (key === 'maxAge') {
      parts.push('Max-Age=0')
      continue
    }
    if (typeof value === 'boolean') {
      if (value) {
        parts.push(cookieAttrName(key))
      }
    } else {
      parts.push(`${cookieAttrName(key)}=${value}`)
    }
  }
  return parts.join('; ')
}

/**
 * Store the validation-state payload server-side and return a 303 redirect
 * response with the opaque nonce cookie set. On storage failure, fall back to
 * `redirectWithError` with a generic corrective message so the user still
 * sees a 303 redirect, never a 500.
 * @param c - Hono context
 * @param redirectUrl - URL to redirect to (the same step)
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @param payload - Shaped redisplay payload to store
 * @returns Response with status 303, Location header, and Set-Cookie header
 */
export const redirectWithValidationState = <E extends { Bindings: Bindings }>(
  c: Context<E>,
  redirectUrl: string,
  db: DrizzleClient,
  userId: string,
  payload: ValidationStatePayload,
): Promise<Response> => {
  const store = storeValidationState(db, userId, payload)
  return store.then((result) => {
    if (result.isErr) {
      // Storage failure: fall back to the generic corrective error path.
      return redirectWithError(c, redirectUrl, STORAGE_FAILURE_MESSAGE)
    }
    const nonce = result.value
    const response = c.redirect(redirectUrl, HTML_STATUS.SEE_OTHER)
    response.headers.append('Set-Cookie', buildNonceCookieHeader(nonce))
    return response
  })
}

/**
 * Read the nonce cookie from the request, consume the server-side
 * validation-state record, and return the payload (or null). Always sets a
 * Set-Cookie header that deletes the nonce cookie (single-use). An unknown,
 * expired, already-consumed, or foreign-user nonce all yield
 * `Result.ok(null)` identically — no error, no partial data, no indication
 * of which case occurred.
 * @param c - Hono context
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @returns Promise<Result<ValidationStatePayload | null, Error>>
 */
export const consumeValidationStateFromRequest = <E extends { Bindings: Bindings }>(
  c: Context<E>,
  db: DrizzleClient,
  userId: string,
): Promise<Result<ValidationStatePayload | null, Error>> => {
  const nonce = getCookie(c, COOKIES.VALIDATION_STATE_NONCE)
  // Always set a deletion cookie so the nonce is consumed client-side too,
  // even when no nonce was presented.
  c.header('Set-Cookie', buildDeleteNonceCookieHeader(), { append: true })
  if (nonce === undefined) {
    return Promise.resolve(Result.ok(null))
  }
  return consumeValidationState(db, nonce, userId)
}
