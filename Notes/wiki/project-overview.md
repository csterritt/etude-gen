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
