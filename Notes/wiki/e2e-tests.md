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

9 Playwright tests covering the `POST /etude/setup` handler from Issue 5 (updated in Issue 6 to include the key field):

- A valid submission (16 measures, 3/4, both hands, C major) redirects 303 to `/etude/setup`, persists the new values after reload, and increments the workflow version by 1.
- An out-of-range measure count (33) submitted via multipart POST (bypassing native constraints) is rejected with 303, no persistence, and no 500.
- An unsupported meter (6/8) is rejected with 303, no persistence, and no 500.
- An unknown hand value is rejected with 303, no persistence, and no 500.
- An empty measures value is rejected with 303 and no 500, and is not coerced to a default.
- An absent meter field is rejected with 303 and no 500.
- A repeated hands field (two values via browser fetch + FormData) is rejected with 303 and no 500, never coerced.
- An unexpected extra field is ignored and the expected fields (including the key) are validated identically and accepted.
- Fields in an arbitrary order are validated identically and accepted.

## etude/06-etude-setup-key-form.spec.ts

3 Playwright tests covering the `GET /etude/setup` key field and derived-pitch display from Issue 6:

- Renders a key `<select>` (`data-testid="key-field"`) offering exactly the eighteen supported keys (no key with more than four accidentals), with the stored key (C major) pre-selected, an accessible label, and the seven derived pitch names displayed (`data-testid="key-pitches"`) for C major.
- After submitting E-flat major the derived pitches show E-flat and B-flat (not A-sharp and D-sharp).
- After submitting F-sharp minor the derived pitches contain F-sharp and C-sharp.

## etude/07-etude-setup-key-submit.spec.ts

7 Playwright tests covering the `POST /etude/setup` key submission from Issue 6:

- A valid key submission (E-flat major) redirects 303 to `/etude/setup`, the form re-displays with the new key selected, and the derived pitches update to the new key spelling.
- An unsupported key (B major — five sharps) submitted bypassing native constraints is rejected with 303, no persistence, and no 500.
- An empty key value is rejected with 303, no persistence, no 500, and no silent fallback to the stored or default key.
- A repeated key field (two values via browser fetch + FormData) is rejected with a deterministic 303 and no 500.
- An extra unexpected field alongside a valid key does not affect the outcome for the expected fields.
- Resubmitting the identical values (same measures, meter, hands, key, octaves as stored) does not increment the workflow version.
- Changing only the key (from C major to A minor) increments the workflow version and the form re-displays with the new key and its derived pitches.

## etude/08-etude-setup-octave-form.spec.ts

4 Playwright tests covering the `GET /etude/setup` octave field and derived-range display from Issue 7:

- Renders five checkboxes (`data-testid="octaves-field"`) for octaves 2 through 6, each with `name="octaves"` and the correct value, with the stored octave (4) pre-checked and the others unchecked, and accessible labels ("Octave 2" through "Octave 6").
- Displays the lowest and highest available pitch for the default key and octave (C major, octave 4: C4 to C5) via `data-testid="available-range"`.
- After checking octaves 2 and 5 (and unchecking 4) the range covers the continuous expansion from octave 2 through 5 (C2 to C6).
- After checking octave 6 in C major the highest available pitch becomes C7 (C natural in key, C7 at the top of the expanded range).

## etude/09-etude-setup-octave-submit.spec.ts

6 Playwright tests covering the `POST /etude/setup` octave submission from Issue 7:

- A valid octave submission (2, 4, 6) redirects 303 to `/etude/setup` and the form re-displays with those octaves checked.
- An out-of-range octave (7) submitted bypassing native constraints is rejected with 303 and no persistence.
- An empty octave submission (no octaves field at all) is rejected with 303 and no persistence.
- Arbitrary-order and duplicate octaves (5, 2, 5, 3, 2) are normalized to the same stored selection (2, 3, 5).
- Changing only the octaves (from 4 to 2,3,4,5,6) increments the workflow version.
- Resubmitting the identical values (including the same octaves) does not increment the workflow version.
