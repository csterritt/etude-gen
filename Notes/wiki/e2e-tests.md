# E2E Tests

A catalog and summaries of all end-to-end tests under `e2e-tests/`.

## general/06-correlation-id-and-safe-error.spec.ts

2 Playwright tests covering the correlation identifier and safe error surface from Issue 2:

- Every response carries an `X-Correlation-ID` header containing a UUID v4 (asserted against `/auth/sign-in`).
- A forced unexpected error (`GET /test/forced-error`, a test-only endpoint gated by the test-route flag) renders the safe message with a visible correlation identifier matching the response header, and the rendered body contains no SQL, service detail, or stack-like text.
