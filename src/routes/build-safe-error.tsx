/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Safe error page and global unexpected-error handler.
 *
 * When an unexpected error reaches `app.onError`, this module logs it with the
 * request's correlation identifier (and no PII, secrets, stack traces, SQL, or
 * service detail) and renders a generic safe message plus the visible
 * correlation identifier. The `X-Correlation-ID` response header is preserved.
 *
 * @module routes/build-safe-error
 */
import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { CORRELATION_ID_HEADER } from '../middleware/correlation-id'
import { logError } from '../lib/logger'
import { PATHS } from '../constants'
import type { AppEnv } from '../local-types'

/** `data-testid` for the visible correlation identifier element. */
export const SAFE_ERROR_TESTID = 'safe-error-correlation-id' as const

const SAFE_ERROR_MESSAGE = 'Something went wrong. Please try again.'

/**
 * Render the safe error page JSX. Shows a generic message and the request's
 * correlation identifier, and nothing technical.
 *
 * @param correlationId - The request's correlation identifier.
 */
export const renderSafeError = (correlationId: string) => {
  return (
    <div data-testid='safe-error-page' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body text-center'>
          <h2 className='card-title text-2xl font-bold justify-center'>
            Something went wrong
          </h2>
          <p className='py-4' data-testid='safe-error-message'>
            {SAFE_ERROR_MESSAGE}
          </p>
          <p className='text-sm text-gray-500' data-testid={SAFE_ERROR_TESTID}>
            Reference: {correlationId}
          </p>
          <div className='card-actions justify-center mt-4'>
            <a href={PATHS.ROOT} className='btn btn-primary' data-testid='safe-error-home-action'>
              Return Home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Build the Response for an unexpected error. Logs the error with the
 * correlation identifier (no PII or secrets) and renders the safe error page
 * with the `X-Correlation-ID` header set.
 *
 * @param c - Hono context carrying the correlation identifier.
 * @param err - The unexpected error. Its message is never rendered or logged.
 */
export const handleUnexpectedError = (
  c: Context<AppEnv>,
  err: unknown,
): Response | Promise<Response> => {
  const correlationId = c.get('correlationId') ?? 'no-correlation-id'

  // HTTPException carries an intentional HTTP response (e.g. CSRF's 403).
  // Preserve its status and body instead of masking it as a 500. This
  // restores Hono's default error-handler behavior, which the custom
  // onError handler would otherwise override.
  if (err instanceof HTTPException) {
    const res = err.getResponse()
    c.header(CORRELATION_ID_HEADER, correlationId)
    return c.newResponse(res.body, res)
  }

  // Log only safe fields. The error message is intentionally excluded because
  // it may contain PII, SQL, stack traces, or service detail; the redacting
  // logger only redacts context fields, not the `message` argument.
  const errorName = err instanceof Error ? err.name : 'UnknownError'
  logError('unexpected error', { correlationId, errorName })

  c.header(CORRELATION_ID_HEADER, correlationId)
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.html(renderSafeError(correlationId), 500)
}
