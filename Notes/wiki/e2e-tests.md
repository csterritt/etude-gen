# E2E Tests

A catalog and summaries of all end-to-end tests under `e2e-tests/`.

## general/06-correlation-id-and-safe-error.spec.ts

2 Playwright tests covering the correlation identifier and safe error surface from Issue 2:

- Every response carries an `X-Correlation-ID` header containing a UUID v4 (asserted against `/auth/sign-in`).
- A forced unexpected error (`GET /test/forced-error`, a test-only endpoint gated by the test-route flag) renders the safe message with a visible correlation identifier matching the response header, and the rendered body contains no SQL, service detail, or stack-like text.

## etude/01-etude-protected-route.spec.ts

2 Playwright tests covering the `/etude` authenticated entry route from Issue 3:

- A signed-out visitor requesting `/etude` is redirected to sign-in with the "You must sign in to visit that page" alert and is not shown etude content.
- A signed-in student requesting `/etude` is redirected to `/etude/setup` and sees the setup-step banner (`etude-setup-banner`); the response carries no-cache headers (`Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0`).

## etude/02-etude-destinations-and-private-removal.spec.ts

4 Playwright tests covering the `/private` → `/etude` swap from Issue 3:

- A successful sign-in lands on `/etude` (redirects through to `/etude/setup`).
- The profile page's protected-area navigation link (`go-back-action`) targets `/etude`.
- The root page's protected-content link (`visit-etude-action`) targets `/etude`.
- A signed-in request to `/private` receives the standard not-found response (`404-page-banner`) with no redirect.

## etude/03-etude-resume.spec.ts

2 Playwright tests covering the resume-on-return behavior from Issue 4:

- A signed-in student with no aggregate visiting `/etude` is redirected to `/etude/setup` and sees the setup-step banner (`etude-setup-banner`).
- A returning student visiting `/etude` again resumes the same workflow — redirected to `/etude/setup` with the banner visible and no error alert (no duplicate aggregate).

## Shared helper changes (Issue 3)

- `BASE_URLS.PRIVATE` → `BASE_URLS.ETUDE` in `e2e-tests/support/test-data.ts`.
- `verifyOnProtectedPage` → `verifyOnEtudePage` (checks `etude-setup-banner`) in `e2e-tests/support/page-verifiers.ts`.
- `navigateToPrivatePage` → `navigateToEtudePage` in `e2e-tests/support/navigation-helpers.ts`.
- `auth-helpers.ts` and `workflow-helpers.ts` updated to call `verifyOnEtudePage`.
- All existing specs that referenced `/private`, `verifyOnProtectedPage`, `BASE_URLS.PRIVATE`, or `private-page-banner` updated to the etude equivalents.

## Shared helper changes (Issue 4)

- `verifyOnEtudePage` now checks `etude-setup-banner` (was `etude-page-banner`) since `GET /etude` redirects to `/etude/setup`.
- `e2e-tests/etude/01-etude-protected-route.spec.ts` and `02-etude-destinations-and-private-removal.spec.ts` updated to assert `etude-setup-banner`.
