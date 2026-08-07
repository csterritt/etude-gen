# Project Overview

The etude-gen project is a Cloudflare Worker application that lets signed-in piano students generate short, playable practice pieces (etudes) tailored to their practice goals. It uses Hono, Drizzle ORM, Better Auth, Tailwind CSS, and DaisyUI.

## Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: Cloudflare D1 (via Drizzle ORM)
- **Object storage**: Cloudflare R2 (private bucket for score/PDF artifacts)
- **Auth**: Better Auth
- **Styling**: Tailwind CSS + DaisyUI
- **External service**: LilyPond engraving service (authenticated via Bearer token)
- **Testing**: `bun:test` for unit tests, Playwright for e2e tests

## Etude feature infrastructure

The etude feature requires additional configuration beyond the existing auth and D1 setup:

- A private R2 bucket binding (`ETUDE_GEN_STORAGE`) for score and PDF artifacts — no public URL.
- `LILYPOND_SERVICE_URL` and `LILYPOND_API_KEY` secrets for the external engraving service.
- `LILYPOND_TIMEOUT_MS` variable (defaults to 30,000 ms).
- A health route (`/health`) that validates all required configuration before the application is considered healthy, split into an anonymous liveness surface and a privileged detailed operator report.

## Rhythm catalog (Issue 12)

The curated rhythm catalog at `Notes/all-rhythms.txt` is the authoritative, hand-maintained source of complete-measure rhythm patterns. Each supported time-signature heading (`2/4`, `3/4`, `4/4`) is followed by one token sequence per line over the six supported tokens:

| Token | Duration (quarter-note beats) | Meaning |
| --- | --- | --- |
| `W` | 4 | whole |
| `H` | 2 | half |
| `D` | 3 | dotted-half |
| `Q` | 1 | quarter |
| `R` | 1.5 | dotted-quarter |
| `E` | 0.5 | eighth |

Measure lengths are fixed per supported meter: 2/4 = 2, 3/4 = 3, 4/4 = 4 quarter-note beats. The parser and eligible-rhythm calculation live in `src/lib/rhythm-catalog.ts`:

- `parseRhythmCatalog(text)` validates syntax (supported tokens and headings only), exact measure length for every pattern under its heading, and at least one pattern per supported meter, collecting every defect in one pass. Each defect names the offending meter and the 1-based line number. Length validation uses exact arithmetic — durations and measure lengths are counted in eighth-note units (quarter beats × 2) and compared as integers, never accumulated floating-point sums with a tolerance, so a pattern of eighths and dotted quarters is judged exactly. Duplicate identical patterns under the same heading are deliberately allowed in the curated file (it is maintained by hand and an accidental repeat must not break the build); the parsed catalog de-duplicates them, preserving first-appearance order, so each distinct pattern appears exactly once and the recency-weighted repeat selection in Issue 24 is not skewed by a curation accident.
- `computeEligibleRhythms(catalog, meter, selectedTokens)` returns the patterns for the given meter whose every token is in the selected set; a selection with no qualifying pattern returns an empty array (never an error), and an unsupported meter returns an empty array.

The catalog is packaged into the worker at build time: `scripts/package-rhythm-catalog.ts` reads `Notes/all-rhythms.txt` and emits a generated, gitignored `src/lib/rhythm-catalog-data.ts` exporting the text as `RHYTHM_CATALOG_TEXT`. The `prebuild` npm hook regenerates it before every `wrangler build`, so the runtime parser imports the string with no runtime file-system read.

Catalog validation contributes to the health check from Issue 1: `buildCatalogHealthContribution` in `src/routes/build-health.tsx` runs the packaged catalog through the parser and maps any defects to `ConfigDefect` entries with `valueName: 'rhythm-catalog'` and a message naming the meter and line. A malformed catalog makes the aggregate health result unhealthy rather than failing at generation time, while the anonymous liveness payload still carries only the healthy flag and leaks no defect detail.

## Correlation, logging, and safe errors

Every request carries an application-generated UUID v4 correlation identifier:

- The correlation-id middleware (`src/middleware/correlation-id.ts`) generates the identifier, stores it on the Hono context, and sets it on the `X-Correlation-ID` response header. It is wired globally as the first middleware so every response — including error responses — carries the header.
- The structured logger (`src/lib/logger.ts`) redacts sensitive fields (names, email, session values, Bearer tokens, secrets, service credentials, LilyPond request bodies) and passes the `correlationId` through verbatim. Routine successful operations are not logged; only failures, refusals, and cleanup outcomes are.
- The correlation context (`src/lib/correlation-context.ts`) threads the identifier into Workflow Service, renderer, repository, and artifact-store calls, and into deferred cleanup. Deferred work with no remaining request context generates its own operation identifier labelled as such, so an operation-originated line is distinguishable from a request-originated one.
- Refusals (`src/lib/refusal-logger.ts`) — lost-lock, stale-operation, stale-epoch, stale-Piece — are logged with a typed category and no user identifier, Piece content, LilyPond source, grant identifier, or credential.
- Unexpected errors are handled by `app.onError` (`src/routes/build-safe-error.tsx`), which logs the error with the correlation identifier and renders a generic safe message plus the visible identifier — no stack trace, SQL, or service detail.

## Authenticated entry route

The `/etude` route (`src/routes/build-etude.tsx`) is the stable authenticated entry point for the etude experience, replacing the former `/private` placeholder. It is protected by the `signedInAccess` middleware with standard secure headers and no-cache behavior. A signed-out visitor is redirected to sign-in with an explanatory message. All sign-in destinations, already-signed-in redirects, profile navigation, and the root page link target `/etude`. The `/private` route is unregistered and falls through to the standard 404 handler — there is no redirect from `/private` to `/etude` and no placeholder left behind.

## Etude parameter aggregate and resume

Each signed-in student has exactly one current etude workflow, persisted as an `etude_params` record in D1. The record is owner-scoped under a database-level `UNIQUE` constraint on the owning user reference (not merely an application-level check), with cascade deletion when the user row is removed. `GET /etude` loads (or creates) the owner's aggregate via the repository (`src/lib/etude-params-repository.ts`) and redirects (303) to the canonical route for the current workflow state, resolved by `src/lib/canonical-route.ts`. A returning student resumes their saved workflow rather than starting fresh; load-or-create is atomic under concurrency — the caller that loses the insert race handles the uniqueness violation as a load of the winner's aggregate, not as an error.

The default aggregate carries the PRD's practical defaults: 8 measures, 4/4, C major, octave range 4, right hand. It also carries a `workflowVersion` (the compare-and-set token incremented by parameter-form POSTs) and an `aggregateEpoch` (the monotonic token bumped by Start Over and moved to a terminal value by account deletion), per cross-cutting contract section 4. A freshly created aggregate has no confirmed steps — `setupConfirmed`, `notesConfirmed`, and `splitConfirmed` are all false — so the canonical route is `/etude/setup` with the defaults pre-populated but not pre-confirmed (section 5). The `/etude/setup` route renders the real setup form (Issue 5 added measures/meter/hands; Issue 6 added the key field and derived-pitch display). Physical columns are encapsulated behind the repository's `EtudeParams` domain interface; routes and tests depend only on that interface, never on the raw Drizzle row type.

## Setup step: key selection and pitch spelling

The setup step's key field (Issue 6) lets the student choose one of eighteen supported keys: nine major keys (C, G, D, A, E, F, B-flat, E-flat, A-flat) and nine natural-minor keys (A, E, B, F-sharp, C-sharp, D, G, C, F), per the PRD's "Supported musical domain" section. No supported key has more than four accidentals. The key domain catalog and pitch derivation live in `src/lib/key-domain.ts`: `validateKey` rejects unsupported and over-four-accidental keys with a typed failure and never coerces to a default, and `deriveKeyPitches` returns the seven diatonic pitch names using the key signature's conventional spelling (flat keys spell flats as flats, sharp keys spell sharps as sharps, no enharmonic duplicates) from a static lookup table. Natural-minor keys use the natural minor scale (flat third, flat sixth, flat seventh relative to the relative major), never harmonic or melodic minor. The setup form displays the derived pitches (`data-testid="key-pitches"`) so the spelling is observable end-to-end. The setup validator (`src/lib/setup-validator.ts`) delegates key validation to `validateKey`, and the repository (`src/lib/etude-params-repository.ts`) persists the key and clears the downstream `notesConfirmed` and `splitConfirmed` flags when the key changes (Issue 11 dependency map row for Key), while a resubmission of identical values does not increment the workflow version.

## Invalid submission redisplay (Issue 8)

When a setup-step POST fails parsing or validation, the server shapes the submitted values and field errors via `src/lib/safe-redisplay.ts` (enforcing documented size bounds as drops, never truncations), stores the shaped payload server-side via the validation-state repository (`src/lib/validation-state-repository.ts`) with a 5-minute TTL, and redirects (303) with an opaque, single-use nonce cookie. The GET handler consumes the nonce, reads the payload, and redisplay the form with safe values pre-populated and field-level errors rendered near each offending field. The nonce cookie contains only the opaque identifier — no submitted value, field name, or error text is ever placed in it. An unknown, expired, already-consumed, or foreign-user nonce all yield a clean step identically.

## Accessible error summary and form accessibility (Issue 9)

The setup step's form is accessible to keyboard and screen-reader users via a shared error-summary pattern established in Issue 9 and inherited by future parameter forms (Issues 6, 7, 13, 14, 16) per the cross-cutting contract:

- **Shared ErrorSummary component** (`src/components/error-summary.tsx`): renders a `<section role="alert" aria-labelledby tabindex="-1">` with a heading and an ordered list of anchor links — one per error — only when errors exist. Each link's `href` resolves to the invalid control's id so activating it moves focus there. The pure `buildErrorSummaryEntries` function deduplicates identical error messages per field, assigns each error a unique anchor id following the `<field>-error-<index>` pattern (supporting multiple errors per field), orders entries by the field's visual appearance, and routes group-field errors (e.g. octaves) to the group's first member control.
- **Focus-on-load script** (`src/lib/error-summary-focus.ts`): a minimal, server-rendered inline `<script>` that moves programmatic focus to the error summary after an invalid submission reloads the step. This is the first and only client-side script in the project; its SHA-256 hash is whitelisted in the CSP so the `ALLOW_SCRIPTS_SECURE_HEADERS` configuration permits its execution.
- **Instruction association**: each form control's `aria-describedby` references both its instructions element and its field-level error elements, so screen readers announce the instructions and the errors together.
- **Group-level errors**: the octaves field is a `<fieldset>` with a `<legend>`; a group-level error targets the first member checkbox (`octaves-field-2`) and is associated with the fieldset via `aria-describedby`.
- **Native HTML constraints**: bounded fields carry `min`/`max`/`step`/`required` attributes, with independent server enforcement behind them.
- **Unique stable ids**: every control id on the page is unique and stable across renders for the same value.

## Optimistic concurrency control (Issue 10)

The etude workflow uses optimistic concurrency control to prevent stale submissions from overwriting newer decisions. Two concurrency tokens protect the aggregate:

- **`workflowVersion`** — a compare-and-set token incremented by every successful parameter-form POST (setup, notes, split). The form carries the current version as a hidden field; the POST handler parses it via `parseWorkflowVersionField` (`src/lib/workflow-version-field.ts`) and passes it to `updateEtudeSetup` as `expectedWorkflowVersion`. The repository's `where` clause matches both `aggregateEpoch` and `workflowVersion`, so a stale submission (one carrying an older, newer, or tampered version) updates zero rows. On a zero-row update the repository re-loads the current row to disambiguate the conflict kind and returns a typed `EtudeUpdateError` (`version-mismatch`, `epoch-mismatch`, or `db-error`). The route handler redirects to `/etude/setup` with `redirectWithError` (NOT validation-state redisplay) so the GET redisplays the committed aggregate — the newly current saved state — rather than the rejected submitted values. A missing, non-numeric, negative, or tampered version is treated the same as a stale one.
- **`aggregateEpoch`** — a monotonic token bumped by Start Over and moved to a terminal value by account deletion. Operation POSTs (generate, render retry, pdf, start-over) use the workflow version as a precondition that is checked but never incremented (cross-cutting contract section 3). The pure `checkOperationPrecondition` function (`src/lib/operation-precondition.ts`) verifies both the version and the epoch before any lock acquisition, external call, or state change. The epoch check guards against Start Over / deletion races that the version alone cannot detect.

The typed conflict results (`EtudeUpdateError` for parameter-form CAS, `OperationPreconditionFailure` for operation-POST preconditions) let the caller distinguish stale-version rejections from transient DB failures and from epoch-mismatch rejections, all without leaking internal state. This issue establishes the concurrency-token contract inherited by Issues 6, 7, 13, 14, 16, 20, 30, 31, 32, 33, 34, 35, 37, and 38.

## Dependent-downstream invalidation (Issue 11)

When a student changes an upstream setup parameter, the dependent downstream selections and confirmation flags are cleared in the same committed compare-and-set transition as the upstream change — there is no second, separate transition (cross-cutting contract section 4). The dependency map is encoded in the pure `computeDownstreamInvalidation` function (`src/lib/etude-invalidation.ts`):

- **Key change** → clears pitch selection (`selectedPitches`) and split boundary (`splitBoundary`); retains duration selection (`selectedDurations`).
- **Octave-range change** → clears pitch selection and split boundary; retains duration selection.
- **Meter change** → clears duration selection; retains pitch selection and split boundary.
- **Measure-count change** → clears nothing downstream (the version still increments).
- **Hands change** → clears split boundary; retains pitch selection but revalidates the two-hand minimum. Switching to both hands with fewer than two stored pitches unconfirms the notes step (the pitch selection is retained, not cleared); switching to both hands with two or more pitches keeps the notes step confirmed; switching to one hand keeps the notes step confirmed (one-hand mode never requires the split step).

Multiple changes in one submission clear the union of their dependents, and the version increments exactly once. An identical resubmission (all five setup fields equal to the stored values) is a no-op: no write, no version increment, no flag changes, no data clearing — so all downstream state is retained. A submission carrying a stale workflow version is rejected by the compare-and-set first, before any invalidation takes place, so no downstream state is cleared. An injected failure during the invalidating write leaves the prior upstream values, downstream selections, and version all unchanged (the write is a single committed transition).

The downstream data fields (`selectedPitches`, `selectedDurations`, `splitBoundary`) are nullable text columns on the `etude_params` table, populated by the notes and split steps (Issues 13, 14, 16) and null until a step (or a test) writes them. The confirmation flags (`notesConfirmed`, `splitConfirmed`) are cleared alongside the data fields per the dependency map; the single `notesConfirmed` flag covers both pitch and duration selection (the notes step is one prerequisite that becomes unconfirmed whenever either half is cleared).

Review completion is derived, never persisted (cross-cutting contract section 5): the pure `isReviewReachable` predicate (`src/lib/etude-invalidation.ts`) recomputes from the confirmation flags and hand selection — true exactly when `setupConfirmed && notesConfirmed && (hand !== 'both' || splitConfirmed)` — and there is no stored review flag to clear. After an invalidation that unconfirms the notes or split step, `isReviewReachable` returns false. The actual canonical-route redirect to the earliest incomplete step is wired by Issue 18 once the notes, split, and review routes exist; until then, the derived predicate and the flag states are verified directly.
