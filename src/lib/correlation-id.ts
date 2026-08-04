/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Correlation identifier generation.
 * @module lib/correlation-id
 */

/**
 * Generate a fresh UUID v4 correlation identifier.
 *
 * Uses the platform `crypto.randomUUID()` available in the Cloudflare Workers
 * runtime and in Node/Bun. Each call returns a new identifier.
 *
 * @returns A freshly generated UUID v4 string.
 */
export const generateCorrelationId = (): string => crypto.randomUUID()
