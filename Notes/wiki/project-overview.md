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

## Correlation, logging, and safe errors

Every request carries an application-generated UUID v4 correlation identifier:

- The correlation-id middleware (`src/middleware/correlation-id.ts`) generates the identifier, stores it on the Hono context, and sets it on the `X-Correlation-ID` response header. It is wired globally as the first middleware so every response — including error responses — carries the header.
- The structured logger (`src/lib/logger.ts`) redacts sensitive fields (names, email, session values, Bearer tokens, secrets, service credentials, LilyPond request bodies) and passes the `correlationId` through verbatim. Routine successful operations are not logged; only failures, refusals, and cleanup outcomes are.
- The correlation context (`src/lib/correlation-context.ts`) threads the identifier into Workflow Service, renderer, repository, and artifact-store calls, and into deferred cleanup. Deferred work with no remaining request context generates its own operation identifier labelled as such, so an operation-originated line is distinguishable from a request-originated one.
- Refusals (`src/lib/refusal-logger.ts`) — lost-lock, stale-operation, stale-epoch, stale-Piece — are logged with a typed category and no user identifier, Piece content, LilyPond source, grant identifier, or credential.
- Unexpected errors are handled by `app.onError` (`src/routes/build-safe-error.tsx`), which logs the error with the correlation identifier and renders a generic safe message plus the visible identifier — no stack trace, SQL, or service detail.

## Authenticated entry route

The `/etude` route (`src/routes/build-etude.tsx`) is the stable authenticated entry point for the etude experience, replacing the former `/private` placeholder. It is protected by the `signedInAccess` middleware with standard secure headers and no-cache behavior. A signed-out visitor is redirected to sign-in with an explanatory message; a signed-in student sees the etude entry page. All sign-in destinations, already-signed-in redirects, profile navigation, and the root page link target `/etude`. The `/private` route is unregistered and falls through to the standard 404 handler — there is no redirect from `/private` to `/etude` and no placeholder left behind.
