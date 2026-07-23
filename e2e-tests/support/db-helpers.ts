import type { APIRequestContext } from '@playwright/test'

import { SERVER_BASE_URL } from './test-data'

type RequestContext = Pick<APIRequestContext, 'delete' | 'post' | 'get'>

/**
 * Clear all data from authentication-related tables
 * Calls test-only server endpoint to clear database
 */
export const clearDatabase = async (request?: RequestContext): Promise<void> => {
  try {
    const response = request
      ? await request.delete('/test/database/clear')
      : await fetch(`${SERVER_BASE_URL}/test/database/clear`, { method: 'DELETE' })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = (await response.json()) as {
      success: boolean
      error?: string
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to clear database')
    }

    console.log('Database cleared successfully')
  } catch (error) {
    console.error('Failed to clear database:', error)
    throw error
  }
}

/**
 * Clear all data from authentication session table
 * Calls test-only server endpoint to clear database
 */
export const clearSessions = async (request?: RequestContext): Promise<void> => {
  try {
    const response = request
      ? await request.delete('/test/database/clear-sessions')
      : await fetch(`${SERVER_BASE_URL}/test/database/clear-sessions`, { method: 'DELETE' })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = (await response.json()) as {
      success: boolean
      error?: string
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to clear sessions')
    }

    console.log('Database sessions cleared successfully')
  } catch (error) {
    console.error('Failed to clear sessions:', error)
    throw error
  }
}

/**
 * Set lastVerificationEmailAt to now for the given email, starting the rate-limit cooldown.
 * Call this right before clicking resend in rate-limit tests so the window is always fresh.
 * @param email - The user email to update
 */
export const setVerificationTimestamp = async (
  email: string,
  request?: RequestContext,
): Promise<void> => {
  try {
    const path = `/test/database/set-verification-timestamp/${encodeURIComponent(email)}`
    const response = request
      ? await request.post(path)
      : await fetch(`${SERVER_BASE_URL}${path}`, { method: 'POST' })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = (await response.json()) as {
      success: boolean
      error?: string
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to set verification timestamp')
    }
  } catch (error) {
    console.error('Failed to set verification timestamp:', error)
    throw error
  }
}

/**
 * Check if a single-use code exists in the database
 * @param code - The code to check
 * @returns Promise<boolean> - true if code exists, false otherwise
 */
export const checkCodeExists = async (code: string, request?: RequestContext): Promise<boolean> => {
  try {
    const path = `/test/database/code-exists/${encodeURIComponent(code)}`
    const response = request
      ? await request.get(path)
      : await fetch(`${SERVER_BASE_URL}${path}`, { method: 'GET' })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = (await response.json()) as {
      success: boolean
      exists: boolean
      error?: string
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to check code existence')
    }

    return result.exists
  } catch (error) {
    console.error('Failed to check code existence:', error)
    throw error
  }
}

/**
 * Clear the in-memory password-reset rate-limit cache on the server
 * Calls test-only server endpoint to clear the cache
 */
export const clearRateLimitCache = async (request?: RequestContext): Promise<void> => {
  try {
    const response = request
      ? await request.delete('/test/database/clear-rate-limit-cache')
      : await fetch(`${SERVER_BASE_URL}/test/database/clear-rate-limit-cache`, { method: 'DELETE' })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = (await response.json()) as {
      success: boolean
      error?: string
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to clear rate limit cache')
    }
  } catch (error) {
    console.error('Failed to clear rate limit cache:', error)
    throw error
  }
}

/**
 * Seed database with test data
 * Calls test-only server endpoint to seed database
 */
export const seedDatabase = async (request?: RequestContext): Promise<void> => {
  try {
    const response = request
      ? await request.post('/test/database/seed', {
          headers: { 'Content-Type': 'application/json' },
        })
      : await fetch(`${SERVER_BASE_URL}/test/database/seed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = (await response.json()) as {
      success: boolean
      error?: string
      usersCreated?: number
      accountsCreated?: number
      singleUseCodesCreated?: number
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to seed database')
    }

    console.log(
      `Database seeded successfully: ${result.usersCreated} users, ${result.accountsCreated} accounts, ${result.singleUseCodesCreated} codes`,
    )
  } catch (error) {
    console.error('Failed to seed database:', error)
    throw error
  }
}
