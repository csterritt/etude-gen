# Issue 8: Invalid submission redisplay — server-side validation state, nonce cookie, and safe redisplay

*2026-08-06T20:30:00Z by Showboat 0.6.1*
<!-- showboat-id: a1b8c3d4-e5f6-4789-abcd-ef1234567890 -->

This walkthrough covers the Issue 8 implementation: invalid submission redisplay with server-side validation state storage, an opaque nonce cookie, and safe redisplay value shaping. It walks through (1) the safe-redisplay value shaping module with its documented bounds and drop-not-truncate policy, (2) the validation-state repository with nonce-keyed, owner-scoped, single-use storage and a 5-minute TTL, (3) the HTTP-layer helpers bridging the repository and Hono routes with the nonce cookie and storage-failure fallback, (4) the schema change adding the `etude_validation_state` table, (5) the POST handler wiring to store validation state and redirect with a nonce, (6) the GET handler wiring to consume validation state and redisplay safe values with field-level errors, and (7) the e2e tests verifying the full POST-redirect-GET round trip. Each section includes executable test runs as proof.

## 1. Safe-redisplay value shaping module

The safe-redisplay module (src/lib/safe-redisplay.ts) is a pure function that takes the raw submitted values (`Record<string, string | string[]>` from the form parser) and the field-addressable errors, and produces a redisplay payload with `safeValues`, `fieldErrors`, and `droppedFields`. It is the single source of truth for the documented redisplay bounds: `MAX_FIELD_ENTRIES` (32), `MAX_VALUES_PER_FIELD` (64), `MAX_VALUE_BYTES` (128), `MAX_ERROR_BYTES` (256), and `MAX_TOTAL_BYTES` (16 KB). Each bound is enforced as a drop, never a truncation: an offending field is removed from redisplay entirely (and its name added to `droppedFields`) rather than being cut into a different value. An invalid value that passes the bounds (e.g. `'abc'` for a numeric field) is redisplayed as-is — it is never coerced into a plausible default. The validation-state repository imports these constants and the shaping function so both modules share a single source of truth.

Run the safe-redisplay unit tests to verify the bounds, the drop-not-truncate policy, and the no-coercion guarantee:

```bash
cd /home/chris/etude-gen && bun test tests/safe-redisplay.spec.ts 2>&1 | tail -5
```

```output

 16 pass
 0 fail
 114 expect() calls
Ran 16 tests across 1 file. [46.00ms]
```

## 2. Validation-state repository

The validation-state repository (src/lib/validation-state-repository.ts) persists a nonce-keyed, owner-scoped redisplay payload with a 5-minute `expiresAt` TTL in the `etude_validation_state` table. `storeValidationState(db, userId, payload)` shapes the payload via `shapeRedisplayPayload` (applying the documented bounds), generates an opaque cryptographically random nonce (UUID v4), and inserts the record — returning `Result.ok(nonce)` on success or `Result.err` on storage failure so the caller can fall back to a generic corrective error path. `consumeValidationState(db, nonce, userId)` returns the payload for a matching nonce and owner, deletes the record (single-use), and returns `null` for expired, unknown, or foreign-user nonces — all identically, revealing nothing about which case occurred. The repository re-exports the bound constants and `FieldError` type from `safe-redisplay.ts` so callers can import from either module.

Run the validation-state repository unit tests to verify the nonce generation, TTL, single-use consumption, owner-scoping, size bounds, and storage-failure handling:

```bash
cd /home/chris/etude-gen && bun test tests/validation-state-repository.spec.ts 2>&1 | tail -5
```

```output

 14 pass
 0 fail
 114 expect() calls
Ran 14 tests across 1 file. [1284.00ms]
```

## 3. Validation-state HTTP helpers

The HTTP-layer helpers (src/lib/validation-state-helpers.ts) bridge the validation-state repository and Hono routes. `redirectWithValidationState(c, redirectUrl, db, userId, payload)` stores the shaped payload server-side and issues a 303 redirect with an opaque, single-use nonce cookie (`VALIDATION_STATE_NONCE`, HttpOnly, SameSite=Lax, Path=/etude, Max-Age=300). The cookie value is only the opaque nonce — no submitted value, field name, or error text is ever placed in it. On storage failure, falls back to `redirectWithError` with a generic corrective message so the user still sees a 303, never a 500. `consumeValidationStateFromRequest(c, db, userId)` reads the nonce cookie, consumes the server-side record, always sets a Set-Cookie header that deletes the nonce cookie (single-use client-side too), and returns `Result.ok(payload | null)`. An unknown, expired, already-consumed, or foreign-user nonce all yield `Result.ok(null)` identically — no error, no partial data, no indication of which case occurred.

Run the validation-state helpers unit tests to verify the cookie attributes, the nonce-only cookie value, the consume-and-delete behavior, the null-identical failure cases, and the storage-failure fallback:

```bash
cd /home/chris/etude-gen && bun test tests/validation-state-helpers.spec.ts 2>&1 | tail -5
```

```output

 6 pass
 0 fail
 33 expect() calls
Ran 6 tests across 1 file. [1209.00ms]
```

## 4. Schema change: etude_validation_state table

The Drizzle ORM schema (src/db/schema.ts) now defines the `etude_validation_state` table for nonce-keyed, owner-scoped redisplay payloads. The table has a text `nonce` primary key, a `userId` column referencing `user.id` with `onDelete: 'cascade'`, a `payload` text column (JSON-serialized redisplay payload), and `expiresAt`/`createdAt` integer columns (epoch milliseconds). The `expiresAt` column is a plain integer (not a timestamp mode) so it comes back as a number, not a Date object. A new migration was generated for this table.

Run the full unit test suite to verify the schema change doesn't break existing tests:

```bash
cd /home/chris/etude-gen && bun test tests/* 2>&1 | tail -5
```

```output

 309 pass
 0 fail
 1307 expect() calls
Ran 309 tests across 27 files. [9.90s]
```

## 5. POST handler: store validation state and redirect with nonce

The POST handler (src/routes/build-etude.tsx) now stores the validation state server-side and redirects with a nonce cookie on parse or validation failure. On a parse failure, the handler collects the parse failures as field-addressable errors, shapes an empty redisplay payload (no safe values since parsing failed entirely), and calls `redirectWithValidationState`. On a validation failure, the handler collects the validation failures as field-addressable errors, shapes the raw submitted values via `shapeRedisplayPayload` (applying the documented bounds), and calls `redirectWithValidationState`. In both cases the user sees a 303 redirect to `/etude/setup` with an opaque nonce cookie — never a 500. The cookie value contains only the nonce; no submitted value, field name, or error text is ever placed in it. On a storage failure (the `storeValidationState` call returns `Result.err`), the helper falls back to `redirectWithError` with a generic corrective message.

The constants (src/constants.ts) define the `VALIDATION_STATE_NONCE` cookie name and the `VALIDATION_STATE_COOKIE_OPTIONS` with the required attributes: `path: '/etude'`, `httpOnly: true`, `sameSite: 'Lax'`, `maxAge: 300`, and `secure` toggled via the PRODUCTION comment convention (false for local HTTP testing, true in production).

Run the POST e2e tests to verify the 303 redirect, the nonce cookie, and the no-persistence guarantee:

```bash
cd /home/chris/etude-gen && npx playwright test e2e-tests/etude/10-etude-setup-invalid-redisplay.spec.ts --reporter=line -g "POST" 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  3 passed (9.5s)
```

## 6. GET handler: consume validation state and redisplay safe values

The GET handler (src/routes/build-etude.tsx) now consumes any pending validation-state record from a rejected POST via `consumeValidationStateFromRequest`. When a payload is present, its `safeValues` override the committed aggregate values for redisplay, and its `fieldErrors` are rendered near each offending field with `data-testid="<field>-error"` and `aria-describedby` wiring. The form's `renderEtudeSetupForm` function accepts an optional `RedisplayData` parameter: for each field, if a safe value is present in `safeValues`, it populates the form control's `value` attribute instead of the committed aggregate value; if the field is in `droppedFields`, the committed aggregate value is used. TSX contextual encoding automatically escapes redisplayed values — no manual sanitization or markup stripping is needed. The nonce is single-use: the consume path deletes the server-side record and sets a Set-Cookie header that deletes the client-side cookie, so a reload shows the committed aggregate values with no errors.

Run the GET e2e tests to verify the safe-value redisplay, the field-level errors, the single-use nonce, the forged-nonce null behavior, and the HTML escaping:

```bash
cd /home/chris/etude-gen && npx playwright test e2e-tests/etude/10-etude-setup-invalid-redisplay.spec.ts --reporter=line -g "GET" 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  5 passed (12.1s)
```

## 7. No regressions in existing etude tests

The existing etude e2e tests (Issues 5, 6, 7) were updated to clear the nonce cookie before checking the committed aggregate values after an invalid submission (since the GET handler now consumes and redisplays the validation state). They continue to pass, confirming no regressions.

Run the full etude e2e test suite to verify no regressions:

```bash
cd /home/chris/etude-gen && npx playwright test e2e-tests/etude/ --reporter=line 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  46 passed (1.3m)
```
