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


## etude/10-etude-setup-invalid-redisplay.spec.ts

8 Playwright tests covering the POST invalid submission redirect and GET form redisplay from Issue 8:

**POST /etude/setup invalid submission redirect:**

- An invalid measures value (33) returns a 303 redirect to /etude/setup with a nonce cookie containing no submitted value, field name, or error text, and no domain state is persisted.
- An invalid meter (6/8) returns a 303 with a nonce cookie and no persistence.
- An empty measures value returns a 303 with a nonce cookie and no coercion to a default.

**GET /etude/setup form redisplay with safe values and field errors:**

- After an invalid submission, the redisplayed form shows the valid submitted values preserved and a field-level error on the offending field.
- The stored aggregate is unchanged after an invalid submission — reload confirms measures is still the default.
- Reloading the step a second time no longer shows the stale error or the redisplayed safe values (single-use nonce).
- A forged or foreign nonce yields a clean step with no errors and no redisplayed values.
- A submitted value containing HTML and quote characters is rendered escaped, not interpreted as markup.

## etude/11-etude-setup-error-summary.spec.ts

10 Playwright tests covering the accessible error summary and form accessibility from Issue 9:

**Error summary and focus:**

- After an invalid submission, the error summary receives programmatic focus on load (the inline focus script moves focus to the `#error-summary` element).
- Each summary entry is a link whose `href` resolves to an existing control, and following it moves focus to the linked control.

**Form accessibility:**

- Every form control has an accessible name (label or aria-label): measures, time signature, hand, key, and each octave checkbox ("Octave N"); the octaves group is a `<fieldset>` with a `<legend>` resolvable as a group.
- Bounded fields carry native HTML constraint attributes (min/max/step/required on measures; required on selects).
- Each field-level error element is programmatically associated with its control via `aria-describedby` (referencing the unique `<field>-error-<index>` id).
- A field error summary entry uses the unique anchor pattern `<field>-error-<index>` that supports multiple errors per field.
- A group-level octaves error targets the first octave checkbox (`octaves-field-2`) and is associated with the group via `aria-describedby` on the fieldset.
- All control ids on the page are unique.

**Edge cases:**

- No error summary element renders when the submission is valid (clean step).
- Multiple invalid fields each produce a summary entry, and the entries are ordered by field appearance (measures before meter).

## etude/12-etude-setup-stale-version.spec.ts

1 Playwright test covering the setup parameter-form stale-version rejection from Issue 10 (two-tab scenario):

- Two browser tabs load `/etude/setup` (both see version 1); tab A submits a change (measures 16, meter 3/4, hands both) and succeeds (version becomes 2); tab B submits a different change (measures 12) carrying the stale version 1 and is rejected with a 303 to `/etude/setup`; on reload tab B sees the newly current saved state (tab A's values: measures 16, meter 3/4, hands both) with an explanatory error, NOT tab B's submitted values (measures 12). The workflow version field on the redisplayed page shows `2`.

## etude/13-etude-operation-precondition-stale.spec.ts

1 Playwright test covering the operation-POST precondition refusal from Issue 10 (two-tab scenario):

- Two browser tabs load `/etude/setup` (both see version 1); tab A submits a setup change (version becomes 2); tab B POSTs to the test-only operation route (`POST /test/etude/operation-precondition`) carrying the stale version 1 and the captured epoch 1; the route refuses with a 303 to the canonical route (`/etude/setup`) with an explanatory error, having acquired no lock, made no external call, and changed no state. The aggregate is unchanged (still tab A's values, version still 2).

## etude/14-etude-downstream-invalidation.spec.ts

2 Playwright tests covering the Issue 11 dependent-downstream invalidation end-to-end:

- Changing the key clears pitches and split, retains durations, and makes review unreachable: signs in, submits a valid setup (measures 16 to force a write), seeds downstream state via the test-only `POST /test/etude/seed-downstream-state` route (notesConfirmed, splitConfirmed, selectedPitches, selectedDurations, splitBoundary), inspects via `GET /test/etude/aggregate-state` to confirm review is reachable, then changes the key to G major via the real setup form and inspects again — selectedPitches and splitBoundary are null, selectedDurations is retained, notesConfirmed and splitConfirmed are false, isReviewReachable is false, and the workflow version incremented by 1.
- An identical setup resubmit retains all downstream state: after seeding downstream state, resubmits the exact stored setup values via the real form and inspects — all downstream data and confirmation flags are retained, isReviewReachable is true, and the workflow version is unchanged.

## etude/15-etude-notes-pitch-selection.spec.ts

8 Playwright tests covering the Issue 13 notes-step pitch selection end-to-end:

- A newly derived notes step has every available pitch selected by default (C major octave 4: C4 through C5, all checked).
- Select all without scripting restores the full available pitch set: deselect several pitches, submit via the Select all button, assert a 303 redirect back to /etude/notes, and confirm every pitch is checked and the full set was persisted.
- Two-hand mode: submitting one pitch is rejected with the exact cardinality message "Select at least two pitches when using both hands.", the error summary is present and focused, and nothing was persisted.
- One-hand mode: submitting zero pitches is rejected with a cardinality error and nothing is persisted.
- A narrowed selection is persisted and not re-expanded on re-render: save three pitches, reload, and confirm exactly those three are checked (not re-expanded to all).
- A stale workflow version is rejected and the currently saved selection is shown (not the submitted stale one).
- A rejected two-hand submission redisplays the one submitted pitch checked alongside the cardinality error, the error summary is focused, and the prior valid selection is still stored.
- The error summary links into the pitch group: each summary entry's href resolves to an existing control and following it moves focus there.
