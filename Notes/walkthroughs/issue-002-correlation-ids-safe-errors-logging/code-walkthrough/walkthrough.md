# Issue 2: Correlation IDs, safe errors, and PII-free logging

*2026-08-04T16:43:54Z by Showboat 0.6.1*
<!-- showboat-id: 2b191752-6327-4697-b1e1-da23934feac2 -->

This walkthrough demonstrates the Issue 2 implementation: per-request UUID v4 correlation identifiers, PII-free structured logging, a safe error page, correlation propagation stubs, and typed refusal logging. Each section shows the relevant source and runs its tests as proof.

## 1. Correlation ID generator

```bash
cat /Users/chris/hacks/music/music-generator/etude-gen/src/lib/correlation-id.ts
```

```output
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
```

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/correlation-id.spec.ts 2>&1 | tail -8
```

```output
(pass) generateCorrelationId > should return a string matching the UUID v4 format [0.12ms]
(pass) generateCorrelationId > should return a different identifier on each call [0.05ms]
(pass) generateCorrelationId > should produce many unique identifiers in a sequence [0.11ms]

 3 pass
 0 fail
 6 expect() calls
Ran 3 tests across 1 file. [8.00ms]
```

## 2. Logger redaction and correlation passthrough

```bash
sed -n '1,60p' /Users/chris/hacks/music/music-generator/etude-gen/src/lib/logger.ts
```

```output
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Structured logging utility that redacts sensitive user data.
 * @module lib/logger
 */

/**
 * Substrings that mark a context key as sensitive. Values for keys whose
 * lowercased form contains any of these are replaced with a redaction marker
 * before the log line is serialized. The `correlationId` key is intentionally
 * not sensitive and is passed through verbatim so a log line can be traced to
 * its request or operation.
 */
const SENSITIVE_KEY_FRAGMENTS: readonly string[] = [
  'name',
  'email',
  'session',
  'token',
  'secret',
  'key',
  'authorization',
  'bearer',
  'credential',
  'password',
  'lilypondbody',
  'lilypondrequest',
]

const REDACTED = '[REDACTED]'

/**
 * Keys that are always passed through verbatim even if they would otherwise
 * match a sensitive fragment.
 */
const PASSTHROUGH_KEYS: readonly string[] = ['correlationId']

const isSensitiveKey = (key: string): boolean => {
  if (PASSTHROUGH_KEYS.includes(key)) {
    return false
  }
  const lower = key.toLowerCase()
  return SENSITIVE_KEY_FRAGMENTS.some((frag) => lower.includes(frag))
}

/**
 * Return a copy of the context with every sensitive field replaced by a
 * redaction marker. Non-sensitive fields and the `correlationId` field are
 * preserved. Nested objects are redacted one level deep.
 */
export const redactContext = (context: Record<string, unknown>): Record<string, unknown> => {
  const redacted: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(context)) {
    if (isSensitiveKey(k)) {
      redacted[k] = REDACTED
    } else if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      redacted[k] = redactContext(v as Record<string, unknown>)
    } else {
```

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/logger-redaction.spec.ts 2>&1 | tail -6
```

```output
(pass) logRoutineSuccess - no log line for routine success > should be a no-op that returns nothing [0.01ms]

 14 pass
 0 fail
 29 expect() calls
Ran 14 tests across 1 file. [9.00ms]
```

## 3. Correlation middleware

```bash
cat /Users/chris/hacks/music/music-generator/etude-gen/src/middleware/correlation-id.ts
```

```output
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
```

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/correlation-middleware.spec.ts 2>&1 | tail -6
```

```output
(pass) correlationIdMiddleware > should produce different identifiers for two separate requests [0.14ms]

 3 pass
 0 fail
 7 expect() calls
Ran 3 tests across 1 file. [13.00ms]
```

## 4. Safe error page and global error handler

```bash
cat /Users/chris/hacks/music/music-generator/etude-gen/src/routes/build-safe-error.tsx
```

```output
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
): Response => {
  const correlationId = c.get('correlationId') ?? 'no-correlation-id'

  // Log only safe fields. The error message is intentionally excluded because
  // it may contain PII, SQL, stack traces, or service detail; the redacting
  // logger only redacts context fields, not the `message` argument.
  const errorName = err instanceof Error ? err.name : 'UnknownError'
  logError('unexpected error', { correlationId, errorName })

  c.header(CORRELATION_ID_HEADER, correlationId)
  c.header('Content-Type', 'text/html; charset=utf-8')
  return c.html(renderSafeError(correlationId), 500)
}
```

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/safe-error-page.spec.ts 2>&1 | tail -6
```

```output
(pass) safe error page and global error handler > should log the error with the correlation identifier and no PII or secret values [0.17ms]

 5 pass
 0 fail
 16 expect() calls
Ran 5 tests across 1 file. [18.00ms]
```

## 5. Correlation propagation stubs and deferred cleanup

```bash
sed -n '1,80p' /Users/chris/hacks/music/music-generator/etude-gen/src/lib/correlation-context.ts
```

```output
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Correlation context and propagation stubs.
 *
 * Defines the typed correlation context that threads a request's correlation
 * identifier into every Workflow Service operation, renderer call, repository
 * call, and artifact-store call it triggers, and into deferred work that
 * outlives the response. Deferred work with no remaining request context
 * generates its own operation correlation identifier and labels it as such,
 * so an operation-originated line is distinguishable from a request-originated
 * one.
 *
 * The service interfaces here are contracts that later issues will fill with
 * real behavior; this slice provides only the typed surface and trivial stub
 * implementations sufficient for the correlation-propagation tests.
 *
 * @module lib/correlation-context
 */
import { generateCorrelationId } from './correlation-id'

/** Whether a correlation identifier originated from a request or an operation. */
export type CorrelationKind = 'request' | 'operation'

/**
 * A correlation context carrying an identifier and a kind discriminator so a
 * request-originated identifier is distinguishable from an operation-originated
 * one.
 */
export interface CorrelationContext {
  /** The correlation identifier. */
  readonly correlationId: string
  /** Whether this identifier originated from a request or an operation. */
  readonly kind: CorrelationKind
}

/**
 * Build a request-originated correlation context around an existing
 * identifier (typically the one set by the correlation-id middleware).
 */
export const createRequestCorrelation = (correlationId: string): CorrelationContext => ({
  correlationId,
  kind: 'request',
})

/**
 * Build an operation-originated correlation context. When no identifier is
 * supplied, a fresh UUID v4 is generated, modelling deferred work that runs
 * with no remaining request context.
 */
export const createOperationCorrelation = (correlationId?: string): CorrelationContext => ({
  correlationId: correlationId ?? generateCorrelationId(),
  kind: 'operation',
})

/**
 * Contract for the Workflow Service. Real behavior is owned by later issues;
 * this slice provides only the typed surface.
 */
export interface WorkflowService {
  runOperation: (ctx: CorrelationContext) => Promise<void>
}

/**
 * Contract for the renderer. Real behavior is owned by later issues.
 */
export interface Renderer {
  render: (ctx: CorrelationContext) => Promise<void>
}

/**
 * Contract for the repository. Real behavior is owned by later issues.
 */
export interface Repository {
  save: (ctx: CorrelationContext) => Promise<void>
}

/**
```

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/correlation-propagation.spec.ts 2>&1 | tail -6
```

```output
(pass) deferred cleanup correlation > should label deferred cleanup without context as an operation identifier [0.05ms]

 9 pass
 0 fail
 21 expect() calls
Ran 9 tests across 1 file. [8.00ms]
```

## 6. Refusal logging

```bash
cat /Users/chris/hacks/music/music-generator/etude-gen/src/lib/refusal-logger.ts
```

```output
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Refusal logging.
 *
 * Lost-lock, stale-operation, stale-epoch, and stale-Piece refusals are logged
 * with a typed category and enough context to diagnose them without logging
 * user identifiers, Piece content, LilyPond source, grant identifiers, or
 * credentials. The refusal decisions themselves are owned by later issues;
 * this slice provides only the logging surface.
 *
 * @module lib/refusal-logger
 */
import { logWarn } from './logger'

/** The four typed refusal categories. */
export type RefusalCategory = 'lost-lock' | 'stale-operation' | 'stale-epoch' | 'stale-Piece'

/** The canonical list of refusal categories, for runtime checks and tests. */
export const REFUSAL_CATEGORIES: readonly RefusalCategory[] = [
  'lost-lock',
  'stale-operation',
  'stale-epoch',
  'stale-Piece',
]

/**
 * Safe, diagnosable context for a refusal. Only these fields are emitted; any
 * forbidden fields (user identifiers, Piece content, LilyPond source, grant
 * identifiers, credentials) supplied by callers are ignored.
 */
export interface RefusalContext {
  /** The typed refusal category. */
  readonly category: RefusalCategory
  /** The correlation identifier for the request or operation. */
  readonly correlationId: string
  /** Optional safe, non-identifying diagnostic reason. */
  readonly reason?: string
}

/**
 * Log a refusal with its typed category and correlation identifier. Emits one
 * structured warning line via the redacting logger. Only the safe fields of
 * `RefusalContext` are passed through; forbidden fields are never emitted.
 *
 * @param ctx - The refusal context.
 */
export const logRefusal = (ctx: RefusalContext): void => {
  logWarn('refusal', {
    category: ctx.category,
    correlationId: ctx.correlationId,
    reason: ctx.reason,
  })
}
```

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/refusal-logging.spec.ts 2>&1 | tail -6
```

```output
(pass) logRefusal - no forbidden fields > should include the correlation identifier in every refusal log line [0.03ms]

 10 pass
 0 fail
 30 expect() calls
Ran 10 tests across 1 file. [9.00ms]
```

## 7. Full unit suite and build

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && npm run test:unit 2>&1 | tail -4
```

```output
 130 pass
 0 fail
 273 expect() calls
Ran 130 tests across 17 files. [3.45s]
```

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && npm run build 2>&1 | tail -3
```

```output
env.LILYPOND_TIMEOUT_MS ("")                      Environment Variable      

--dry-run: exiting now.
```
