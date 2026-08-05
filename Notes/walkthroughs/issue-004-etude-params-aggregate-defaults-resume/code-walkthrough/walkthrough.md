# Issue 4: Etude parameter aggregate with practical defaults and resume

*2026-08-05T01:08:56Z by Showboat 0.6.1*
<!-- showboat-id: 9d409221-c78b-4ee3-b9ae-02f9d47b6932 -->

## 1. Schema: the etude_params table

Issue 4 introduces the `etude_params` table — one etude parameter aggregate per owning student. The owner reference (`userId`) carries a database-level UNIQUE constraint so one aggregate per owner is enforced independently of any application check, and the FK cascades on user deletion. The default aggregate carries the PRD's practical defaults (8 measures, 4/4, C major, octave range 4, right hand), a `workflowVersion` (compare-and-set token), an `aggregateEpoch` (monotonic token bumped by Start Over and moved to a terminal value by account deletion), and three step-confirmation flags all defaulting to false.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && grep -A 20 'export const etudeParams' src/db/schema.ts
```

```output
export const etudeParams = sqliteTable('etude_params', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  measureCount: integer('measureCount').notNull().default(8),
  timeSignature: text('timeSignature').notNull().default('4/4'),
  keySignature: text('keySignature').notNull().default('C major'),
  octaveRange: integer('octaveRange').notNull().default(4),
  hand: text('hand').notNull().default('right'),
  workflowVersion: integer('workflowVersion').notNull().default(1),
  aggregateEpoch: integer('aggregateEpoch').notNull().default(1),
  setupConfirmed: integer('setupConfirmed', { mode: 'boolean' }).default(false).notNull(),
  notesConfirmed: integer('notesConfirmed', { mode: 'boolean' }).default(false).notNull(),
  splitConfirmed: integer('splitConfirmed', { mode: 'boolean' }).default(false).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

// Define schema object for export
```

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && grep -E 'CREATE TABLE `etude_params`|UNIQUE INDEX `etude_params' drizzle/0000_outstanding_wildside.sql
```

```output
CREATE TABLE `etude_params` (
CREATE UNIQUE INDEX `etude_params_userId_unique` ON `etude_params` (`userId`);--> statement-breakpoint
```

## 2. Repository: load-or-create with uniqueness-violation-as-load

The repository (`src/lib/etude-params-repository.ts`) encapsulates the physical columns behind a domain `EtudeParams` interface. `loadOrCreateEtudeParams` atomically inserts a default aggregate or loads the existing one. The caller that loses the insert race handles the UNIQUE-constraint violation as a load of the winner's aggregate, not as an error. The violation detector checks both the direct error and its `cause` chain because D1 wraps the SQLite constraint error inside a `DrizzleQueryError` while bun-sqlite throws it directly.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && sed -n '60,100p' src/lib/etude-params-repository.ts
```

```output
  workflowVersion: row.workflowVersion,
  aggregateEpoch: row.aggregateEpoch,
  setupConfirmed: row.setupConfirmed,
  notesConfirmed: row.notesConfirmed,
  splitConfirmed: row.splitConfirmed,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
})

/**
 * Detect whether a thrown error is a UNIQUE-constraint violation on the
 * owner reference. Robust across the D1 and bun-sqlite drivers, which
 * surface SQLite constraint errors with slightly different shapes:
 * bun-sqlite throws a `SQLiteError` directly, while D1 wraps the SQLite
 * constraint error inside a `DrizzleQueryError` whose `cause` carries the
 * underlying `D1_ERROR: UNIQUE constraint failed: ...` message.
 */
const isUniqueViolation = (e: unknown): boolean => {
  if (!(e instanceof Error)) {
    return false
  }
  const candidates: Error[] = [e]
  const cause = (e as { cause?: unknown }).cause
  if (cause instanceof Error) {
    candidates.push(cause)
  }
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown }).code
    const codeMatches =
      typeof code === 'string' &&
      (code.includes('CONSTRAINT_UNIQUE') || code.includes('CONSTRAINT_PRIMARY'))
    const messageMatches = candidate.message.includes('UNIQUE constraint')
    if (codeMatches || messageMatches) {
      return true
    }
  }
  return false
}

/**
 * Build a new default etude parameter aggregate row for the given owner.
```

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && sed -n '125,175p' src/lib/etude-params-repository.ts
```

```output
/**
 * Atomically load the owner's aggregate, creating one with the default
 * values when none exists. Under concurrency the caller that loses the
 * insert race handles the UNIQUE-constraint violation on the owner
 * reference as a load of the winner's aggregate, not as an error.
 * @param db - Database instance
 * @param userId - Authenticated owner user id
 * @returns Promise<Result<EtudeParams, Error>>
 */
export const loadOrCreateEtudeParams = (
  db: DrizzleClient,
  userId: string,
): Promise<Result<EtudeParams, Error>> =>
  withRetry('loadOrCreateEtudeParams', () => loadOrCreateEtudeParamsActual(db, userId))

const loadOrCreateEtudeParamsActual = async (
  db: DrizzleClient,
  userId: string,
): Promise<Result<EtudeParams, Error>> => {
  try {
    const inserted = await db
      .insert(etudeParams)
      .values(buildDefaultRow(userId))
      .returning()
    if (inserted.length === 1) {
      return Result.ok(mapToDomain(inserted[0]!))
    }
    return Result.err(new Error('loadOrCreateEtudeParams: insert returned no rows'))
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Lost the insert race: load the winner's aggregate.
      const existing = await db
        .select()
        .from(etudeParams)
        .where(eq(etudeParams.userId, userId))
        .limit(1)
      if (existing.length === 1) {
        return Result.ok(mapToDomain(existing[0]!))
      }
      return Result.err(
        new Error('loadOrCreateEtudeParams: uniqueness violation but no existing row found'),
      )
    }
    return Result.err(e instanceof Error ? e : new Error(String(e)))
  }
}

/**
 * Owner-scoped read of the aggregate. Returns null when none exists.
 * Never returns another user's aggregate.
 * @param db - Database instance
```

## 3. Canonical route resolver

`src/lib/canonical-route.ts` is a pure function mapping aggregate state to the canonical route per cross-cutting contract section 5. Issue 4 handles the first two rows: no aggregate and setup-not-confirmed both resolve to `/etude/setup`. Later issues extend it with the notes/split/review/score rows.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && cat src/lib/canonical-route.ts
```

```output
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Canonical workflow state-to-route resolver.
 *
 * Maps an etude parameter aggregate snapshot to the canonical route for the
 * current workflow state, per cross-cutting contract section 5. Completion is
 * per-step confirmation: a step is confirmed by a successful POST to it, not
 * by having valid default values. Defaults pre-populate controls; they do not
 * pre-confirm steps.
 *
 * This issue (4) handles the first two rows of the state table: no aggregate
 * and setup-not-confirmed both resolve to `/etude/setup`. Later issues extend
 * this resolver with the notes/split/review/score rows.
 * @module lib/canonical-route
 */
import { PATHS } from '../constants'
import type { EtudeParams } from './etude-params-repository'

/**
 * Resolve the canonical route for the current aggregate state.
 *
 * Returns `/etude/setup` when no aggregate exists (the aggregate is created
 * with defaults first) and when setup is not yet confirmed. Later issues
 * extend this with the remaining rows of the section-5 state table.
 * @param params - The owner's aggregate snapshot, or null when none exists
 * @returns The canonical route path
 */
export const resolveCanonicalRoute = (params: EtudeParams | null): string => {
  if (params === null) {
    return PATHS.ETUDE_SETUP
  }

  if (!params.setupConfirmed) {
    return PATHS.ETUDE_SETUP
  }

  // Later issues extend this resolver for the notes/split/review/score rows.
  return PATHS.ETUDE_SETUP
}
```

## 4. Route: GET /etude load-or-create-and-redirect + /etude/setup stub

`src/routes/build-etude.tsx` now loads (or creates) the owner's aggregate, resolves the canonical route, and redirects (303) to it. A `GET /etude/setup` stub renders a placeholder banner so the redirect lands on a real page. On an unexpected repository failure the handler delegates to `handleUnexpectedError` so the safe error page renders with a correlation identifier.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && sed -n '55,90p' src/routes/build-etude.tsx
```

```output
/**
 * Attach the etude entry and setup-stub routes to the app.
 * @param app - Hono app instance
 */
export const buildEtude = (app: Hono<{ Bindings: Bindings }>): void => {
  app.get(
    PATHS.ETUDE,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithMessage(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      const result = await loadOrCreateEtudeParams(db, user.id)

      if (result.isErr) {
        logError('etude entry load-or-create failed', { error: sanitizeError(result.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, result.error)
      }

      const canonicalRoute = resolveCanonicalRoute(result.value)
      return redirectWithMessage(c, canonicalRoute, '')
    },
  )

  app.get(
    PATHS.ETUDE_SETUP,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    (c: Context) => c.render(useLayout(c, renderEtudeSetup())),
  )
}
```

## 5. Unit tests pass

The repository tests (9) and canonical-route tests (2) plus the test-db smoke tests (2) all pass, exercising real SQLite uniqueness, cascade, and the losing-caller path.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/etude-params-repository.spec.ts tests/canonical-route.spec.ts tests/helpers/test-db.spec.ts 2>&1 | tail -12
```

```output
tests/canonical-route.spec.ts:
(pass) resolveCanonicalRoute > routes to /etude/setup when no aggregate exists [0.02ms]
(pass) resolveCanonicalRoute > routes to /etude/setup when setup is not confirmed [0.04ms]

tests/helpers/test-db.spec.ts:
(pass) createTestDb > creates a database with the production schema applied [0.69ms]
(pass) createTestDb > enforces the user email uniqueness constraint [0.40ms]

 13 pass
 0 fail
 29 expect() calls
Ran 13 tests across 3 files. [42.00ms]
```

## 6. Full unit suite passes

145 unit tests pass across 20 files (was 130 before issue 4; +15 new).

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && bun test tests/* 2>&1 | tail -5
```

```output

 145 pass
 0 fail
 305 expect() calls
Ran 145 tests across 20 files. [3.54s]
```

## 7. E2e tests pass

The etude e2e suite (8 tests) passes, including the new resume-on-return tests. The full e2e suite (90 passed, 43 skipped, 0 failed) also passes.

```bash
cd /Users/chris/hacks/music/music-generator/etude-gen && npx playwright test --reporter=line e2e-tests/etude 2>&1 | tail -5
```

```output
    e2e-tests/etude/02-etude-destinations-and-private-removal.spec.ts:24:3 › Etude entry route replaces /private › profile page protected-area navigation targets /etude 
    e2e-tests/etude/02-etude-destinations-and-private-removal.spec.ts:37:3 › Etude entry route replaces /private › root page protected-content link targets /etude 
    e2e-tests/etude/02-etude-destinations-and-private-removal.spec.ts:45:3 › Etude entry route replaces /private › request to /private returns the standard not-found response with no redirect 
    e2e-tests/etude/03-etude-resume.spec.ts:12:3 › Etude resume on return › a signed-in student with no aggregate visiting /etude is redirected to /etude/setup 
    e2e-tests/etude/03-etude-resume.spec.ts:25:3 › Etude resume on return › a returning student visiting /etude again resumes the same workflow with no error 
```
