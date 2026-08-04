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

## middleware/

### correlation-id.ts

Generates a UUID v4 per request, stores it on the Hono context (`correlationId`), and sets it on the `X-Correlation-ID` response header after downstream handlers run, so every response — including error responses — carries the identifier. Wired globally as the first middleware in `src/index.ts`. Exports `correlationIdMiddleware` and `CORRELATION_ID_HEADER`.

## routes/

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
