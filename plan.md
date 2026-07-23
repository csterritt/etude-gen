# Task 5: E2E Test Isolation Helpers — Fix Hardcoded localhost

## Problem
DB helper functions and mode-detection helpers called `fetch('http://localhost:3000/...')` directly
instead of using Playwright's `request` fixture or a configured `baseURL`.

## Changes Made

- **`playwright.config.ts`**: Added `testDir: './e2e-tests'` so Playwright discovers tests in the
  correct directory. Added `use.baseURL: 'http://localhost:3000'` so Playwright's `page` and
  `request` fixtures resolve relative URLs against the configured base.

- **`package.json`**: Added `"test:e2e": "npx playwright test"` script.

- **`e2e-tests/support/test-data.ts`**: Exported `SERVER_BASE_URL = 'http://localhost:3000'`
  constant; `BASE_URLS` now derived from it (single point of change for port/host).

- **`e2e-tests/support/db-helpers.ts`**: All functions (`clearDatabase`, `clearSessions`,
  `seedDatabase`, `clearRateLimitCache`, `setVerificationTimestamp`, `checkCodeExists`) now accept
  an optional `request: RequestContext` parameter. When provided, relative paths are used with
  the Playwright `APIRequestContext`; otherwise falls back to `fetch` with `SERVER_BASE_URL`.

- **`e2e-tests/support/mode-helpers.ts`**: `detectSignUpMode` accepts optional `request`
  fixture; uses `SERVER_BASE_URL` for fallback instead of hardcoded string.

- **`e2e-tests/support/test-helpers.ts`**: `testWithDatabase` passes the `request` fixture
  through to all db-helper setup/cleanup calls.
