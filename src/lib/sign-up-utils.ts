/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Shared utilities for sign-up handlers.
 * @module lib/sign-up-utils
 */
import { Context } from 'hono'

import { redirectWithError, redirectWithMessage } from './redirects'
import { addCookie } from './cookie-support'
import {
  getUserIdByEmail,
  updateVerificationEmailTimestamp,
  claimSingleUseCode,
  releaseSingleUseCode,
} from './db-access'
import { normalizeEmail } from './email-utils'
import { createAuth } from './auth'
import { createDbClient } from '../db/client'
import { PATHS, COOKIES, MESSAGES, LOG_MESSAGES } from '../constants'
import type { Bindings, DrizzleClient } from '../local-types'

/**
 * Data required for gated sign-up
 */
export interface GatedSignUpData {
  code: string
  name: string
  email: string
  password: string
}

/**
 * Patterns that indicate a duplicate email error
 */
const DUPLICATE_EMAIL_PATTERNS = [
  'already exists',
  'duplicate',
  'unique constraint',
  'unique',
  'violates unique',
]

/**
 * Patterns that indicate a database constraint error (likely duplicate)
 */
const CONSTRAINT_ERROR_PATTERNS = ['constraint', 'sqlite_constraint']

/**
 * Patterns that indicate the unique violation is on the user's name column,
 * not the email column. SQLite/D1 report the offending column/index in the
 * message (e.g. "UNIQUE constraint failed: user.name").
 */
const DUPLICATE_NAME_PATTERNS = ['user.name', 'user_name_unique']

interface SignUpErrorResponse {
  error?: { message?: string }
}

interface StatusResponse {
  status: number
}

interface SyntheticDuplicateResponse {
  token: null
  user: { emailVerified: boolean }
}

/**
 * Detect better-auth's synthetic duplicate response.
 * When requireEmailVerification=true and a duplicate email is used,
 * better-auth returns { token: null, user: { emailVerified: false } }
 * instead of throwing an error.
 */
export const isSyntheticDuplicateResponse = (
  response: unknown,
): response is SyntheticDuplicateResponse => {
  if (typeof response !== 'object' || response === null || response instanceof Response) {
    return false
  }

  const r = response as Record<string, unknown>
  return (
    'token' in r &&
    r.token === null &&
    typeof r.user === 'object' &&
    r.user !== null &&
    (r.user as Record<string, unknown>).emailVerified === false
  )
}

const isErrorResponse = (response: unknown): response is SignUpErrorResponse => {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response &&
    typeof (response as SignUpErrorResponse).error === 'object'
  )
}

export const getResponseStatus = (response: unknown): number | null => {
  if (response instanceof Response) {
    return response.status
  }

  if (
    typeof response === 'object' &&
    response !== null &&
    'status' in response &&
    typeof (response as StatusResponse).status === 'number'
  ) {
    return (response as StatusResponse).status
  }

  return null
}

/**
 * Check if an error message indicates a duplicate email
 * @param errorMessage - Error message to check
 * @returns True if the error indicates a duplicate email
 */
export const isDuplicateEmailError = (errorMessage: string): boolean => {
  const lowerMessage = errorMessage.toLowerCase()

  const hasDuplicatePattern = DUPLICATE_EMAIL_PATTERNS.some((pattern) =>
    lowerMessage.includes(pattern),
  )

  const hasEmailExists = lowerMessage.includes('email') && lowerMessage.includes('exists')

  return hasDuplicatePattern || hasEmailExists
}

/**
 * Check if an error message indicates a database constraint error
 * @param errorMessage - Error message to check
 * @returns True if the error indicates a constraint violation
 */
export const isConstraintError = (errorMessage: string): boolean => {
  const lowerMessage = errorMessage.toLowerCase()
  return CONSTRAINT_ERROR_PATTERNS.some((pattern) => lowerMessage.includes(pattern))
}

/**
 * Check if a constraint error is specifically a duplicate display-name (user.name)
 * violation rather than a duplicate email. Used to show an accurate message.
 * @param errorMessage - Error message to check
 * @returns True if the error indicates a duplicate name
 */
export const isDuplicateNameError = (errorMessage: string): boolean => {
  const lowerMessage = errorMessage.toLowerCase()
  return DUPLICATE_NAME_PATTERNS.some((pattern) => lowerMessage.includes(pattern))
}

/**
 * Extract error message from an unknown error
 * @param error - Unknown error value
 * @returns String error message
 */
export const extractErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

/**
 * Handle sign-up API response errors
 * @param c - Hono context
 * @param response - Sign-up API response
 * @param email - User email for cookie
 * @param fallbackPath - Path to redirect on generic error
 * @returns Response if error handled, null if no error
 */
export const handleSignUpResponseError = (
  c: Context<{ Bindings: Bindings }>,
  response: unknown,
  email: string,
  fallbackPath: string,
): Response | null => {
  if (!isErrorResponse(response)) {
    return null
  }

  const errorMessage = response.error?.message || 'Registration failed'
  console.error('Sign-up response error:', errorMessage)

  if (isDuplicateNameError(errorMessage)) {
    return redirectWithError(c, fallbackPath, MESSAGES.DISPLAY_NAME_TAKEN)
  }

  if (isDuplicateEmailError(errorMessage)) {
    addCookie(c, COOKIES.EMAIL_ENTERED, email)
    return redirectWithMessage(c, PATHS.AUTH.AWAIT_VERIFICATION, MESSAGES.ACCOUNT_ALREADY_EXISTS)
  }

  return redirectWithError(c, fallbackPath, MESSAGES.REGISTRATION_GENERIC_ERROR)
}

/**
 * Handle sign-up API exceptions
 * @param c - Hono context
 * @param error - Caught error
 * @param email - User email for cookie
 * @param fallbackPath - Path to redirect on generic error
 * @returns Response
 */
export const handleSignUpApiError = (
  c: Context<{ Bindings: Bindings }>,
  error: unknown,
  email: string,
  fallbackPath: string,
): Response => {
  console.error('Better-auth sign-up API error:', error)

  const errorMessage = extractErrorMessage(error)

  if (isDuplicateNameError(errorMessage)) {
    return redirectWithError(c, fallbackPath, MESSAGES.DISPLAY_NAME_TAKEN)
  }

  if (isDuplicateEmailError(errorMessage) || isConstraintError(errorMessage)) {
    addCookie(c, COOKIES.EMAIL_ENTERED, email)
    return redirectWithMessage(c, PATHS.AUTH.AWAIT_VERIFICATION, MESSAGES.ACCOUNT_ALREADY_EXISTS)
  }

  return redirectWithError(c, fallbackPath, MESSAGES.REGISTRATION_GENERIC_ERROR)
}

/**
 * Record the verification-email rate-limit timestamp after a successful sign-up.
 * Sign-up sends a verification email, so this starts the resend cooldown.
 * @param db - Database client
 * @param email - User email to find
 */
export const updateAccountTimestampAfterSignUp = async (
  db: DrizzleClient,
  email: string,
): Promise<void> => {
  try {
    const userIdResult = await getUserIdByEmail(db, email)

    if (userIdResult.isOk && userIdResult.value.length > 0) {
      const updateResult = await updateVerificationEmailTimestamp(db, userIdResult.value[0].id)

      if (updateResult.isErr) {
        console.error(LOG_MESSAGES.DB_UPDATE_ACCOUNT_TS, updateResult.error)
      }
    }
  } catch (dbError) {
    console.error('Error updating account timestamp:', dbError)
  }
}

/**
 * Redirect to await verification page with email cookie
 * @param c - Hono context
 * @param email - User email for cookie
 * @returns Redirect response
 */
export const redirectToAwaitVerification = (c: Context, email: string): Response => {
  addCookie(c, COOKIES.EMAIL_ENTERED, email)
  return redirectWithMessage(c, PATHS.AUTH.AWAIT_VERIFICATION, '')
}

/**
 * Process gated sign-up: claim code, create account, update timestamp, redirect
 * Shared logic used by both handle-gated-sign-up and handle-gated-interest-sign-up
 * @param c - Hono context
 * @param data - Validated gated sign-up form data
 * @returns Response (redirect)
 */
export const processGatedSignUp = async (
  c: Context<{ Bindings: Bindings }>,
  data: GatedSignUpData,
): Promise<Response> => {
  const { code, name, password } = data
  const email = normalizeEmail(data.email)
  const trimmedCode = code.trim()
  const dbClient = createDbClient(c.env.PROJECT_DB)

  // Atomically claim the sign-up code before creating account
  const claimResult = await claimSingleUseCode(dbClient, trimmedCode, email)

  if (claimResult.isErr) {
    console.error('Database error claiming sign-up code:', claimResult.error)
    return redirectWithError(c, PATHS.AUTH.SIGN_UP, MESSAGES.GENERIC_ERROR_TRY_AGAIN)
  }

  if (!claimResult.value) {
    return redirectWithError(
      c,
      PATHS.AUTH.SIGN_UP,
      'Invalid or expired sign-up code. Please check your code and try again.',
    )
  }

  // The code is now claimed. If account creation fails for any reason, release
  // it so a legitimate user doesn't permanently lose their one-time invite.
  const releaseClaimedCode = async (): Promise<void> => {
    const releaseResult = await releaseSingleUseCode(dbClient, trimmedCode, email)
    if (releaseResult.isErr) {
      console.error('Failed to release sign-up code after failed sign-up:', releaseResult.error)
    }
  }

  // Check if user already exists before attempting sign-up
  const existingUserResult = await getUserIdByEmail(dbClient, email)
  const userAlreadyExists =
    existingUserResult.isOk && existingUserResult.value.length > 0

  // Code claimed successfully - proceed with account creation
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
      await releaseClaimedCode()
      return redirectWithError(c, PATHS.AUTH.SIGN_UP, 'Failed to create account. Please try again.')
    }

    const errorResponse = handleSignUpResponseError(c, signUpResponse, email, PATHS.AUTH.SIGN_UP)

    if (errorResponse) {
      await releaseClaimedCode()
      return errorResponse
    }

    if (isSyntheticDuplicateResponse(signUpResponse)) {
      addCookie(c, COOKIES.EMAIL_ENTERED, email)
      if (userAlreadyExists) {
        await releaseClaimedCode()
        return redirectWithMessage(c, PATHS.AUTH.AWAIT_VERIFICATION, MESSAGES.ACCOUNT_ALREADY_EXISTS)
      }
      return redirectToAwaitVerification(c, email)
    }

    const responseStatus = getResponseStatus(signUpResponse)
    if (responseStatus !== null && responseStatus !== 200) {
      await releaseClaimedCode()
      return redirectWithError(c, PATHS.AUTH.SIGN_UP, MESSAGES.GENERIC_ERROR_TRY_AGAIN)
    }
  } catch (apiError: unknown) {
    await releaseClaimedCode()
    return handleSignUpApiError(c, apiError, email, PATHS.AUTH.SIGN_UP)
  }

  await updateAccountTimestampAfterSignUp(dbClient, email)

  return redirectToAwaitVerification(c, email)
}
