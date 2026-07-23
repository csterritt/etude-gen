/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * URL validation utilities for preventing open redirect vulnerabilities
 * @module lib/url-validation
 */

import { PATHS } from '../constants'

/**
 * Validates a callback URL to prevent open redirect attacks.
 * Only allows relative paths (starting with /) that don't escape to external origins.
 * @param callbackUrl - The URL to validate
 * @param requestOrigin - The origin of the current request (e.g., "https://example.com")
 * @returns The validated URL if safe, otherwise the default sign-in path
 */
export const validateCallbackUrl = (
  callbackUrl: string | undefined,
  requestOrigin: string,
): string => {
  const defaultUrl = PATHS.AUTH.SIGN_IN

  if (!callbackUrl) {
    return defaultUrl
  }

  // Reject protocol-relative URLs (//evil.com)
  if (callbackUrl.startsWith('//')) {
    return defaultUrl
  }

  // Allow simple relative paths starting with /
  if (callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
    // Additional check: ensure it doesn't contain backslashes that could be normalized
    if (callbackUrl.includes('\\')) {
      return defaultUrl
    }
    return callbackUrl
  }

  // For absolute URLs, verify same origin
  try {
    const parsed = new URL(callbackUrl, requestOrigin)
    const origin = new URL(requestOrigin)

    if (parsed.origin === origin.origin) {
      return parsed.pathname + parsed.search + parsed.hash
    }
  } catch {
    // Malformed URL, return default
  }

  return defaultUrl
}
