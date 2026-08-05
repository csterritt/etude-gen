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

## etude/04-etude-setup-form.spec.ts

1 Playwright test covering the `GET /etude/setup` form from Issue 5:

- Renders a form (`etude-setup-form`) pre-populated with the saved aggregate defaults (8 measures, 4/4 meter, right hand), with native HTML constraints (number input with min=4, max=32, step=1, required; select with fixed option lists for meter and hands), accessible labels for every control, and a hidden `workflowVersion` field carrying the current version.

## etude/05-etude-setup-submit.spec.ts

9 Playwright tests covering the `POST /etude/setup` handler from Issue 5:

- A valid submission (16 measures, 3/4, both hands) redirects 303 to `/etude/setup`, persists the new values after reload, and increments the workflow version by 1.
- An out-of-range measure count (33) submitted via multipart POST (bypassing native constraints) is rejected with 303, no persistence, and no 500.
- An unsupported meter (6/8) is rejected with 303, no persistence, and no 500.
- An unknown hand value is rejected with 303, no persistence, and no 500.
- An empty measures value is rejected with 303 and no 500, and is not coerced to a default.
- An absent meter field is rejected with 303 and no 500.
- A repeated hands field (two values via browser fetch + FormData) is rejected with 303 and no 500, never coerced.
- An unexpected extra field is ignored and the expected fields are validated identically and accepted.
- Fields in an arbitrary order are validated identically and accepted.
