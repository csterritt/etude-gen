/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Shared helpers for normalizing email addresses.
 * @module lib/email-utils
 */

/**
 * Normalize an email address for storage and lookup.
 * better-auth stores emails lowercased, so app-level queries must use the same
 * normalized form to match.
 * @param email - Raw email input
 * @returns Trimmed, lowercased email
 */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase()
