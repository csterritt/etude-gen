# Source Code

A catalog and summaries of all source files under `src/`.

## lib/

### config-validator.ts

Validates the etude feature's required configuration bindings in one pass, collecting every defect rather than failing on the first. Checks the D1 binding (`PROJECT_DB`), the private R2 binding (`ETUDE_GEN_STORAGE`), `LILYPOND_SERVICE_URL`, `LILYPOND_API_KEY`, and `LILYPOND_TIMEOUT_MS`. The timeout defaults to 30,000 milliseconds when absent and must be a positive finite number when present. Defect messages name the affected value but never include resolved secret values. Exports `validateEtudeConfig`, `DEFAULT_LILYPOND_TIMEOUT_MS`, and the `ConfigDefect` / `ConfigValidationResult` / `EtudeConfigInput` types.

### correlation-id.ts

Generates a fresh UUID v4 correlation identifier per call using the platform `crypto.randomUUID()` (available in the Cloudflare Workers runtime and in Node/Bun). Focused on generation only — middleware, header, and logging behavior live elsewhere. Exports `generateCorrelationId`.

### logger.ts

Structured logging utility that redacts sensitive data. `logInfo`, `logError`, and `logWarn` serialize a JSON line with `level` and `message`, then run the context through `redactContext` before serialization. Sensitive keys (names, email, session/token/secret/key/authorization/bearer/credential/password fields, and LilyPond request bodies) are replaced with `[REDACTED]`; the `correlationId` key is passed through verbatim so a log line can be traced to its request or operation. `sanitizeError` preserves the existing error-shrinking behavior. `logRoutineSuccess` is a no-op: per the project logging policy, routine successful operations are not logged merely for completeness — only failures, refusals, and cleanup outcomes are logged. Exports `redactContext`, `sanitizeError`, `logInfo`, `logError`, `logWarn`, `logRoutineSuccess`.

### correlation-context.ts

Defines the typed correlation context that threads a request's correlation identifier into every Workflow Service operation, renderer call, repository call, and artifact-store call, and into deferred work that outlives the response. A `CorrelationContext` carries a `correlationId` and a `kind` discriminator (`'request' | 'operation'`) so an operation-originated line is distinguishable from a request-originated one. `createRequestCorrelation` wraps an existing identifier; `createOperationCorrelation` generates a fresh UUID v4 when none is supplied, modelling deferred work with no remaining request context. The four service interfaces (`WorkflowService`, `Renderer`, `Repository`, `ArtifactStore`) are contracts that later issues fill with real behavior; this slice provides typed surfaces and trivial recording stubs (`makeWorkflowServiceStub`, `makeRendererStub`, `makeRepositoryStub`, `makeArtifactStoreStub`). `runDeferredCleanup` carries forward an originating request context, or generates a labelled operation identifier when none remains.

### refusal-logger.ts

Logs lost-lock, stale-operation, stale-epoch, and stale-Piece refusals with a typed category and enough context to diagnose them without logging user identifiers, Piece content, LilyPond source, grant identifiers, or credentials. Defines a `RefusalCategory` string-literal union and a `RefusalContext` carrying only safe fields (`category`, `correlationId`, optional `reason`); `logRefusal` emits one structured warning line via the redacting `logWarn`, passing only the safe fields through. The refusal decisions themselves are owned by later issues. Exports `RefusalCategory`, `REFUSAL_CATEGORIES`, `RefusalContext`, `logRefusal`.

### etude-params-repository.ts

Repository for the `etude_params` aggregate, encapsulating the physical Drizzle columns behind a domain `EtudeParams` interface. `loadOrCreateEtudeParams(db, userId)` atomically inserts a default aggregate or loads the existing one — the caller that loses the insert race handles the UNIQUE-constraint violation on the owner reference as a load of the winner's aggregate, not as an error (the violation is detected across both the D1 and bun-sqlite drivers, which surface it with different error shapes). `loadEtudeParams(db, userId)` is an owner-scoped read returning `null` when none exists. `updateEtudeSetup(db, userId, expectedEpoch, values)` conditionally updates the setup-step fields (measure count, time signature, hand, key signature, selected octaves) using a compare-and-set on `aggregateEpoch`: the function first loads the current aggregate to compare the submitted values against the stored ones — when every submitted value is identical (including the normalized octave string), the request is a no-op (no version increment, no write, no flag changes), avoiding spurious version bumps from a double submission of the same form. Otherwise it performs a single conditional Drizzle `update` with a `where` clause matching both `userId` and `aggregateEpoch === expectedEpoch`, so a request whose captured epoch no longer matches the stored value updates zero rows and returns `Result.err`. On success the same committed transition increments `workflowVersion` by 1, sets `setupConfirmed` to true, and updates the measure/meter/hand/key/selected-octaves columns. The `selectedOctaves` column stores the normalized ascending octave selection as a comma-separated string (e.g. `'2,4,6'`). When the submitted key or octaves differ from the stored values, the same transition also clears `notesConfirmed` and `splitConfirmed` to false (Issue 11 dependency map rows for Key and Octave Range clear pitch selection and split boundary); when neither key nor octaves changed but another field changed, those flags are left untouched. All three functions follow the `withRetry`/`toResult` Result-returning pattern from `src/lib/db-access.ts`. The default aggregate carries the PRD's practical defaults (8 measures, 4/4, C major, selected octaves `'4'`, octave range 4, right hand), `workflowVersion` 1, `aggregateEpoch` 1, and all three step-confirmation flags (`setupConfirmed`, `notesConfirmed`, `splitConfirmed`) false. Exports `EtudeParams`, `loadOrCreateEtudeParams`, `loadEtudeParams`, `updateEtudeSetup`.

### setup-validator.ts

Authoritative domain validator for the setup step's five parameters: measure count (4-32 inclusive integer), time signature (one of 2/4, 3/4, 4/4), hand (left, right, both), key (one of the eighteen supported keys), and octaves (one or more values from 2 through 6). Lives in the Music Domain module so the route never trusts submitted values. `validateSetup(input)` narrows untrusted `unknown` values from the form parser and returns `Result<ValidSetup, SetupValidationFailure[]>` — multiple invalid fields are reported together so a student can correct them in one round. Invalid values are never silently coerced into plausible defaults: an empty string, null, undefined, a wrong type, or an out-of-range value is a rejection. The key field is delegated to `validateKey` from `src/lib/key-domain.ts`; the octaves field is delegated to `validateOctaves` from `src/lib/music-domain.ts`, which normalizes arbitrary order and duplicates to one ascending `number[]` and rejects an empty array, null, undefined, a non-numeric element, or an out-of-range element. Exports `MEASURE_MIN`, `MEASURE_MAX`, `SUPPORTED_METERS`, `SUPPORTED_HANDS`, `ValidSetup`, `SetupInput`, `SetupValidationFailure`, `validateSetup`.

### music-domain.ts

Music domain module for octave validation, contiguous range expansion, and the available-pitch derivation with the C7 cap (Issue 7). `validateOctaves(values)` accepts an array of unknown values (typically strings from a multi-value form field), rejects a non-array, null, undefined, an empty array, a non-numeric element, and any element outside 2-6, each returning a typed `OctaveValidationFailure` with `field: 'octaves'`; for a valid array it parses each element to an integer, deduplicates, sorts ascending, and returns the sorted unique `number[]`. `expandOctaveRange(octaves)` derives the contiguous min/max expanded range from the lowest and highest selected octaves (input order does not matter). `deriveScaleRangePitches(key, octave)` returns the eight tonic-to-tonic pitches for a single octave using the key's diatonic spelling from `deriveKeyPitches`, with the octave number incrementing at the B-to-C crossing (e.g. the seventh degree of D major in the octave-4 range is C-sharp5, not C-sharp4). `deriveAvailablePitches(key, octaves)` builds the full available pitch set by expanding the selection, collecting each scale range's pitches (deduplicating boundary tonics), and applying the C7 cap: every octave-7 pitch is removed except C7, and C7 is kept only when C natural belongs to the key. Returns `{ pitches, lowest, highest }` so the setup form can display the expansion and the cap without generating music. Exports `OCTAVE_MIN`, `OCTAVE_MAX`, `OctaveValidationFailure`, `validateOctaves`, `ExpandedRange`, `expandOctaveRange`, `deriveScaleRangePitches`, `AvailablePitches`, `deriveAvailablePitches`.

### key-domain.ts

Key domain catalog and pitch derivation for the setup step (Issue 6). The authoritative source for the eighteen supported keys and their diatonic pitch spellings, per the PRD's "Supported musical domain" section: nine major keys (C, G, D, A, E, F, B-flat, E-flat, A-flat) and nine natural-minor keys (A, E, B, F-sharp, C-sharp, D, G, C, F). No supported key has more than four accidentals. `validateKey(value)` accepts exactly one of the supported keys (after trimming) and rejects anything else — an empty string, null, undefined, a wrong type, an unsupported key, or an over-four-accidental key — returning a typed `KeyValidationFailure` and never coercing to a default. `deriveKeyPitches(key)` returns the seven diatonic pitch names in scale order using the key signature's conventional spelling (flat keys spell flats as flats, sharp keys spell sharps as sharps, no enharmonic duplicates) from a static lookup table; natural-minor keys use the natural minor scale (flat third, flat sixth, flat seventh relative to the relative major), never harmonic or melodic minor. Exports `SUPPORTED_KEYS`, `MAX_ACCIDENTALS`, `KeyValidationFailure`, `validateKey`, `deriveKeyPitches`.

### etude-form-parser.ts

Reusable parameter-form parser, not specific to the setup form. Extracts typed raw values from a `FormData` submission, tolerating the hostile shapes of cross-cutting contract section 2 rule 5: an absent field, an empty string, a repeated field (multi-value), an unexpected extra field, and fields in an arbitrary order each resolve to a deterministic accept or field-addressable reject. None of them produces a thrown error, and none is silently coerced. Each caller supplies a `FieldSpec` declaring the expected field names, their target types, and an optional repeated-field policy (`reject` default, or `first-wins`). Two field types are supported: `string` (single-value, governed by the `repeated` policy) and `string-multi` (multi-value, collects all submitted values into a `string[]` in submission order, preserving duplicates and arbitrary order — normalization is the validator's responsibility; an absent field with zero values is a field-addressable failure). The setup form declares the octave field as `string-multi` and the other four fields as `string` with no normalization, so a repeated single-value field is a reject. Designed for reuse by Issues 6, 7, 13, 14, and 16. Exports `RepeatedFieldPolicy`, `FieldSpecEntry`, `FieldSpec`, `ParseFailure`, `RawValues`, `parseParameterForm`.

### canonical-route.ts

Pure resolver mapping an `EtudeParams` snapshot (or `null` when no aggregate exists) to the canonical route for the current workflow state, per cross-cutting contract section 5. Completion is per-step confirmation: defaults pre-populate controls but do not pre-confirm steps. Issue 4 handles the first two rows of the state table — no aggregate and setup-not-confirmed both resolve to `/etude/setup`. Later issues extend the resolver with the notes/split/review/score rows. Exports `resolveCanonicalRoute`.

## db/

### schema.ts

Drizzle ORM schema for the D1 database. Defines the `user`, `session`, `account`, `verification`, `singleUseCode`, `interestedEmail`, and `etude_params` tables. The `etude_params` table (added in Issue 4) carries one etude parameter aggregate per owning student: a text primary key, a `userId` column referencing `user.id` with `onDelete: 'cascade'` and a database-level `UNIQUE` constraint, default-value columns (8 measures, 4/4, C major, octave range 4, right hand), `workflowVersion` and `aggregateEpoch` integers, three step-confirmation boolean flags, and `createdAt`/`updatedAt` timestamps. Exports the table definitions, the `schema` object, and inferred `*Select`/`*Insert` types.

## middleware/

### correlation-id.ts

Generates a UUID v4 per request, stores it on the Hono context (`correlationId`), and sets it on the `X-Correlation-ID` response header after downstream handlers run, so every response — including error responses — carries the identifier. Wired globally as the first middleware in `src/index.ts`. Exports `correlationIdMiddleware` and `CORRELATION_ID_HEADER`.

## routes/

### build-etude.tsx

The authenticated etude workflow entry route and setup-step form, registered in `src/index.ts` with `secureHeaders(STANDARD_SECURE_HEADERS)` and the `signedInAccess` middleware. `GET /etude` loads (or creates) the owner's etude parameter aggregate via `loadOrCreateEtudeParams`, resolves the canonical route for the current workflow state via `resolveCanonicalRoute`, and redirects (303) to it — a freshly created aggregate has no confirmed steps, so the canonical route is `/etude/setup`. `GET /etude/setup` renders the real setup form (`data-testid="etude-setup-form"`) pre-populated with the saved aggregate's values, with native HTML constraints on every control (min/max/step/required on measures, fixed option lists on meter, hands, and key), accessible labels, a hidden `workflowVersion` field, and a derived-pitch display (`data-testid="key-pitches"`) showing the seven diatonic pitch names for the selected key via `deriveKeyPitches`. `POST /etude/setup` parses the submitted form via `parseParameterForm` (tolerating hostile shapes without a 500), validates the four fields (measures, meter, hands, key) via `validateSetup`, loads the current aggregate to obtain the epoch for compare-and-set, and calls `updateEtudeSetup` — on success it redirects (303) back to `/etude/setup` with a success message; on any parse, validation, or epoch failure it redirects (303) back with a safe error message, never a 500. The `SETUP_FIELD_SPEC` declares four expected string fields with no repeated-field normalization, so a repeated field is a reject. A signed-out visitor is redirected to sign-in by `signedInAccess`. On an unexpected repository failure the handler delegates to `handleUnexpectedError` so the safe error page renders with a correlation identifier rather than a 500. Exports `buildEtude`.

### build-health.tsx

The health route for the etude feature, split into two surfaces sharing one validation pass:

- **Anonymous liveness**: returns only `{ healthy: boolean }` — no value names, no resolved values, no binding names, no defect detail, no secrets.
- **Privileged detailed report**: available only to a privileged operator context (gated by `OPERATOR_TOKEN` via the `X-Operator-Token` header) and to the deployment/startup log via `logInfo`/`logError`. Names every defect and includes the resolved `lilypondTimeoutMs`, but still contains no secret values.

The rhythm-catalog health surface is a pluggable `CatalogHealthContribution` type; the catalog parsing and validation rules are owned by Issue 12. This slice only provides the surface the catalog reports through. Exports `runHealthCheck`, `buildAnonymousLiveness`, `buildDetailedReport`, and the `HealthResult` / `CatalogHealthContribution` / `AnonymousLivenessPayload` / `DetailedHealthReport` types.

### build-safe-error.tsx

The safe error page and global unexpected-error handler. `handleUnexpectedError` reads the request's correlation identifier from context, logs `unexpected error` with the identifier and the error name (never the error message, which may contain PII, SQL, stack traces, or service detail), sets the `X-Correlation-ID` header, and renders `renderSafeError` — a generic safe message plus the visible correlation identifier (`data-testid="safe-error-correlation-id"`) and a return-home action. Wired as `app.onError` in `src/index.ts`. Exports `renderSafeError`, `handleUnexpectedError`, `SAFE_ERROR_TESTID`.

## routes/test/

### forced-error.ts

Test-only endpoint (`GET /test/forced-error`) that throws an error carrying SQL, a stack-like string, and a service snippet, so the e2e test can assert the global error handler renders the safe message with a visible correlation identifier and leaks nothing technical. Gated by the existing test-route flag and wrapped in `PRODUCTION:REMOVE` markers; never available in production. Exports `testForcedErrorRouter`.

## Configuration bindings

The etude feature depends on the following bindings declared in `wrangler.jsonc` and typed in `src/local-types.ts`:

| Binding | Type | Purpose |
|---|---|---|
| `PROJECT_DB` | D1Database | Existing D1 binding (authoritative for ownership and artifact reachability) |
| `ETUDE_GEN_STORAGE` | R2Bucket | Private R2 bucket for etude score/PDF artifacts — no public URL |
| `LILYPOND_SERVICE_URL` | string (secret) | Base URL of the external LilyPond engraving service |
| `LILYPOND_API_KEY` | string (secret) | Bearer token for LilyPond service authentication |
| `LILYPOND_TIMEOUT_MS` | string (var) | LilyPond request timeout in ms; defaults to 30,000 when absent |
| `OPERATOR_TOKEN` | string (secret) | Gates the privileged detailed health report |

The R2 bucket is private — no public URL, no user-derived key namespace. The reported LilyPond version is retained only with SVG render metadata for diagnosis; no permanent version string is embedded in the application or the Piece contract. Deployment acceptance checks the service-reported version against the then-current stable release as a human step.
