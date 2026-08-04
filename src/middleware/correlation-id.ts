/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Correlation identifier middleware.
 *
 * Generates a UUID v4 per request, stores it on the Hono context, and sets it
 * on the `X-Correlation-ID` response header so every response — including
 * error responses — carries the identifier. Downstream handlers, loggers, and
 * service stubs read the identifier from context.
 *
 * @module middleware/correlation-id
 */
import { createMiddleware } from 'hono/factory'

import { generateCorrelationId } from '../lib/correlation-id'
import type { AppEnv } from '../local-types'

/** The response header carrying the request correlation identifier. */
export const CORRELATION_ID_HEADER = 'X-Correlation-ID' as const

/**
 * Middleware that attaches a fresh correlation identifier to each request,
 * stores it in context, and emits it on the response header.
 */
export const correlationIdMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const correlationId = generateCorrelationId()
  c.set('correlationId', correlationId)
  await next()
  c.header(CORRELATION_ID_HEADER, correlationId)
})
