/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Centralized database access layer with retry logic and Result types
 * @module lib/db-access
 */
import retry from 'async-retry'
import Result from 'true-myth/result'
import { eq, and, isNull } from 'drizzle-orm'

import { user, account, singleUseCode, interestedEmail } from '../db/schema'
import { STANDARD_RETRY_OPTIONS } from '../constants'
import type { DrizzleClient } from '../local-types'

/**
 * Type definitions for database operations
 */
export interface UserWithAccountData {
  userId: string
  userName: string | null
  userEmail: string
  emailVerified: boolean
  accountUpdatedAt: Date | null
  lastResetEmailAt: Date | null
  lastVerificationEmailAt: Date | null
}

export interface UserIdData {
  id: string
}

/**
 * Wrap a database operation with retry logic and Result type handling
 * @param operationName - Name of the operation for logging
 * @param operation - The async operation to execute
 * @returns Promise<Result<T, Error>>
 */
export const withRetry = async <T>(
  operationName: string,
  operation: () => Promise<Result<T, Error>>,
): Promise<Result<T, Error>> => {
  try {
    return await retry(async () => {
      const result = await operation()
      if (result.isErr) {
        throw result.error
      }
      return result
    }, STANDARD_RETRY_OPTIONS)
  } catch (err) {
    console.log(`${operationName} final error:`, err)
    return Result.err(err instanceof Error ? err : new Error(String(err)))
  }
}

/**
 * Wrap a value in Result.ok, or wrap an error in Result.err
 * @param fn - The async function to execute
 * @returns Promise<Result<T, Error>>
 */
const toResult = async <T>(fn: () => Promise<T>): Promise<Result<T, Error>> => {
  try {
    return Result.ok(await fn())
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Get user with account data for rate limiting checks
 * @param db - Database instance
 * @param email - User email to look up
 * @returns Promise<Result<UserWithAccountData[], Error>>
 */
export const getUserWithAccountByEmail = (
  db: DrizzleClient,
  email: string,
): Promise<Result<UserWithAccountData[], Error>> =>
  withRetry('getUserWithAccountByEmail', () => getUserWithAccountByEmailActual(db, email))

const getUserWithAccountByEmailActual = (
  db: DrizzleClient,
  email: string,
): Promise<Result<UserWithAccountData[], Error>> =>
  toResult(() =>
    db
      .select({
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        emailVerified: user.emailVerified,
        accountUpdatedAt: account.updatedAt,
        lastResetEmailAt: account.lastResetEmailAt,
        lastVerificationEmailAt: account.lastVerificationEmailAt,
      })
      .from(user)
      // Scope the join to the credential account so future multi-provider
      // accounts don't yield an arbitrary/stale row for rate-limit checks.
      .leftJoin(account, and(eq(account.userId, user.id), eq(account.providerId, 'credential')))
      .where(eq(user.email, email))
      .limit(1),
  )

/**
 * Find user by email and return user ID
 * @param db - Database instance
 * @param email - User email to look up
 * @returns Promise<Result<UserIdData[], Error>>
 */
export const getUserIdByEmail = (
  db: DrizzleClient,
  email: string,
): Promise<Result<UserIdData[], Error>> =>
  withRetry('getUserIdByEmail', () => getUserIdByEmailActual(db, email))

const getUserIdByEmailActual = (
  db: DrizzleClient,
  email: string,
): Promise<Result<UserIdData[], Error>> =>
  toResult(() => db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1))

/**
 * Update the password-reset rate-limit timestamp for a user's account.
 * @param db - Database instance
 * @param userId - User ID whose account to update
 * @returns Promise<Result<boolean, Error>>
 */
export const updateResetEmailTimestamp = (
  db: DrizzleClient,
  userId: string,
): Promise<Result<boolean, Error>> =>
  withRetry('updateResetEmailTimestamp', () => updateResetEmailTimestampActual(db, userId))

const updateResetEmailTimestampActual = async (
  db: DrizzleClient,
  userId: string,
): Promise<Result<boolean, Error>> => {
  try {
    await db
      .update(account)
      .set({ lastResetEmailAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    return Result.ok(true)
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Update the verification-email rate-limit timestamp for a user's account.
 * @param db - Database instance
 * @param userId - User ID whose account to update
 * @returns Promise<Result<boolean, Error>>
 */
export const updateVerificationEmailTimestamp = (
  db: DrizzleClient,
  userId: string,
): Promise<Result<boolean, Error>> =>
  withRetry('updateVerificationEmailTimestamp', () =>
    updateVerificationEmailTimestampActual(db, userId),
  )

const updateVerificationEmailTimestampActual = async (
  db: DrizzleClient,
  userId: string,
): Promise<Result<boolean, Error>> => {
  try {
    await db
      .update(account)
      .set({ lastVerificationEmailAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
    return Result.ok(true)
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Atomically claim a single-use code for an email address.
 * Uses UPDATE with WHERE email IS NULL to ensure only one request wins the race.
 * @param db - Database instance
 * @param code - The code to claim
 * @param email - The email address claiming the code
 * @returns Promise<Result<boolean, Error>> - true if code was claimed, false if invalid or already claimed
 */
export const claimSingleUseCode = (
  db: DrizzleClient,
  code: string,
  email: string,
): Promise<Result<boolean, Error>> =>
  withRetry('claimSingleUseCode', () => claimSingleUseCodeActual(db, code, email))

const claimSingleUseCodeActual = async (
  db: DrizzleClient,
  code: string,
  email: string,
): Promise<Result<boolean, Error>> => {
  try {
    const result = await db
      .update(singleUseCode)
      .set({ email })
      .where(and(eq(singleUseCode.code, code), isNull(singleUseCode.email)))
    const rowsUpdated = result.meta?.changes || 0
    return Result.ok(rowsUpdated === 1)
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Release a previously claimed single-use code so it can be used again.
 * Only releases the code if it is still claimed by the given email, preventing
 * one request from releasing a code another request legitimately claimed.
 * @param db - Database instance
 * @param code - The code to release
 * @param email - The email the code was claimed by
 * @returns Promise<Result<boolean, Error>> - true if the code was released
 */
export const releaseSingleUseCode = (
  db: DrizzleClient,
  code: string,
  email: string,
): Promise<Result<boolean, Error>> =>
  withRetry('releaseSingleUseCode', () => releaseSingleUseCodeActual(db, code, email))

const releaseSingleUseCodeActual = async (
  db: DrizzleClient,
  code: string,
  email: string,
): Promise<Result<boolean, Error>> => {
  try {
    const result = await db
      .update(singleUseCode)
      .set({ email: null })
      .where(and(eq(singleUseCode.code, code), eq(singleUseCode.email, email)))
    const rowsUpdated = result.meta?.changes || 0
    return Result.ok(rowsUpdated === 1)
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Add an email to the interested emails list
 * @param db - Database instance
 * @param email - Email address to add
 * @returns Promise<Result<boolean, Error>> - true if added successfully, false if already exists
 */
export const addInterestedEmail = (
  db: DrizzleClient,
  email: string,
): Promise<Result<boolean, Error>> =>
  withRetry('addInterestedEmail', () => addInterestedEmailActual(db, email))

/**
 * Check if an email is already in the interested emails list
 * @param db - Database instance
 * @param email - Email address to check
 * @returns Promise<Result<boolean, Error>> - true if email exists, false otherwise
 */
export const checkInterestedEmailExists = (
  db: DrizzleClient,
  email: string,
): Promise<Result<boolean, Error>> =>
  withRetry('checkInterestedEmailExists', () => checkInterestedEmailExistsActual(db, email))

const isUniqueConstraintError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const message = error.message.toUpperCase()
    if (
      message.includes('UNIQUE CONSTRAINT') ||
      message.includes('UNIQUE_CONSTRAINT') ||
      message.includes('SQLITE_CONSTRAINT_UNIQUE') ||
      message.includes('SQLITE_CONSTRAINT') ||
      message.includes('DUPLICATE KEY') ||
      message.includes('D1_ERROR: UNIQUE')
    ) {
      return true
    }
    // Check the cause property for nested errors (Drizzle wraps D1 errors)
    const cause = (error as { cause?: unknown }).cause
    if (cause) {
      return isUniqueConstraintError(cause)
    }
  }
  return false
}

const addInterestedEmailActual = async (
  db: DrizzleClient,
  email: string,
): Promise<Result<boolean, Error>> => {
  try {
    await db.insert(interestedEmail).values({ email })
    return Result.ok(true)
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return Result.ok(false)
    }
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

const checkInterestedEmailExistsActual = async (
  db: DrizzleClient,
  email: string,
): Promise<Result<boolean, Error>> => {
  try {
    const existingEmails = await db
      .select()
      .from(interestedEmail)
      .where(eq(interestedEmail.email, email))
    return Result.ok(existingEmails.length > 0)
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Delete a user account by user ID
 * FK cascade will automatically delete associated sessions and accounts
 * @param db - Database instance
 * @param userId - User ID to delete
 * @returns Promise<Result<boolean, Error>> - true if user was deleted
 */
export const deleteUserAccount = (
  db: DrizzleClient,
  userId: string,
): Promise<Result<boolean, Error>> =>
  withRetry('deleteUserAccount', () => deleteUserAccountActual(db, userId))

const deleteUserAccountActual = async (
  db: DrizzleClient,
  userId: string,
): Promise<Result<boolean, Error>> => {
  try {
    const result = await db.delete(user).where(eq(user.id, userId))
    // D1 returns changes in meta.changes, but fallback to rowsAffected for compatibility
    const rowsDeleted =
      result.meta?.changes ?? (result as { rowsAffected?: number }).rowsAffected ?? 0
    return Result.ok(rowsDeleted >= 1)
  } catch (e) {
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}
