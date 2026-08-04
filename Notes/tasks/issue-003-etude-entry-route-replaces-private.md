# Tasks for #3: Authenticated `/etude` entry route replaces `/private`

Parent issue: #3
Parent PRD: `Notes/PRD-etude-generator.md`

## Tasks

### 1. E2e tests for the `/etude` protected route

**Type**: RED
**Output**: A new `e2e-tests/etude/` folder containing failing Playwright tests asserting that a signed-out visitor requesting `/etude` is redirected to sign-in with the explanatory "You must sign in to visit that page" message and is not shown etude content, and that a signed-in student requesting `/etude` sees the etude entry page (its placeholder banner) with no-cache response headers.
**Depends on**: none

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, kebab-case filenames, `data-testid` attributes named `name-action` for actionable elements, look in `e2e-tests/support` for helpers and `e2e-tests/sign-in` for examples before writing).

Create `e2e-tests/etude/` and write Playwright specs that drive the not-yet-existing `/etude` route. Use the existing `signInUser` and `signOutAndVerify` helpers from `e2e-tests/support/auth-helpers.ts`, the `verifyOnSignInPage` and `verifyAlert` finders, and the `testWithDatabase` wrapper where a signed-in user is required. Assert: (a) a signed-out `page.goto('/etude')` lands on the sign-in page with the "You must sign in to visit that page" alert and no etude banner is present; (b) a signed-in `page.goto('/etude')` renders the etude entry banner (use a new `data-testid` such as `etude-page-banner`) and the response carries no-cache headers (`Cache-Control: no-store` or the project's existing no-cache header set — inspect `src/lib/setup-no-cache-headers.ts` for the exact header name(s) to assert). These tests must fail because `/etude` does not exist yet. Do not reference `/private` in these new tests — they are scoped to the new route only.

---

### 2. Add the `/etude` route and path constant

**Type**: GREEN
**Output**: `src/constants.ts` gains a `PATHS.ETUDE` (`/etude`) entry; a new `src/routes/build-etude.tsx` page builder renders a placeholder etude entry banner (`data-testid='etude-page-banner'`) and is registered in `src/index.ts` with `secureHeaders(STANDARD_SECURE_HEADERS)` and the `signedInAccess` middleware, making the task-1 tests pass. `/private` is left intact for now.
**Depends on**: 1

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style matching existing routes, `data-testid` naming for actionable elements, DaisyUI components for layout, one export per file where practical).

Add `ETUDE: '/etude' as const` to the `PATHS` object in `src/constants.ts` (do not remove `PRIVATE` yet). Create `src/routes/build-etude.tsx` modeled exactly on `src/routes/build-private.tsx`: a `renderEtude` arrow function returning a placeholder heading inside a card with `data-testid='etude-page-banner'`, and a `buildEtude` arrow export that registers `app.get(PATHS.ETUDE, secureHeaders(STANDARD_SECURE_HEADERS), signedInAccess, (c) => c.render(useLayout(c, renderEtude())))`. Import and call `buildEtude(app)` in `src/index.ts` next to the existing `buildPrivate(app)` call. The `signedInAccess` middleware already supplies the redirect-with-error to sign-in and the no-cache headers, so no new auth logic is needed. Do not add navigation links or repoint any destinations in this task — that is task 4. Run the task-1 e2e tests to confirm they now pass.

---

### 3. E2e tests for repointed destinations and `/private` removal

**Type**: RED
**Output**: Failing Playwright tests (in `e2e-tests/etude/`) asserting that a successful sign-in lands on `/etude` (not `/private`), that the profile page's protected-area navigation link targets `/etude`, that the root page's protected-content link targets `/etude`, and that a signed-in request to `/private` receives the application's standard not-found response (the `404-page-banner`) with no redirect and no placeholder page.
**Depends on**: 2

Before writing any production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (red-green-refactor, Playwright for e2e, `data-testid` naming, look in `e2e-tests/support` and `e2e-tests/sign-in` for helpers/examples).

Add Playwright specs to `e2e-tests/etude/` that assert the post-swap behavior. Use `signInUser` to authenticate and assert the resulting URL contains `/etude` and the etude banner is visible. Navigate to the profile page and assert the protected-area navigation link (the existing `go-back-action` anchor, or its renamed equivalent) has an `href` resolving to `/etude`. Navigate to the root page and assert the protected-content link has an `href` resolving to `/etude`. Finally, while signed in, `page.goto('/private')` and assert the `404-page-banner` renders and the URL remains `/private` (no redirect to `/etude` or anywhere else) — use `verifyOn404Page` from `e2e-tests/support/page-verifiers.ts`. These tests must fail because destinations still point at `/private` and `/private` still resolves. Do not modify the shared helpers or existing specs in this task — only add new failing assertions.

---

### 4. Repoint destinations to `/etude`, remove `/private`, update shared helpers and existing tests

**Type**: GREEN
**Output**: Every sign-in destination, already-signed-in redirect, profile navigation link, and root link targets `/etude`; `src/routes/build-private.tsx` and its `PATHS.PRIVATE` constant and `buildPrivate(app)` registration are deleted; `src/lib/auth.ts` `redirectTo` points to `/etude`; the shared e2e helpers (`BASE_URLS`, `verifyOnProtectedPage`/`navigateToPrivatePage`) are updated to the etude equivalents and all existing specs that referenced `/private` are updated so the full suite stays green. Tasks 1 and 3 pass.
**Depends on**: 3

Before writing production code, read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md` (arrow functions, explicit types, no `any`, braces around all `if`/`while` bodies, Hono route style, `data-testid` naming, DaisyUI components). Follow the existing route-builder and redirect-helper patterns (`redirectWithMessage`/`redirectWithError` from `src/lib/redirects.tsx`, never `c.redirect`).

Make the swap in one coherent change. In `src/constants.ts` remove `PRIVATE` and keep `ETUDE`. Repoint every `PATHS.PRIVATE` reference to `PATHS.ETUDE`: `src/lib/auth.ts` (`redirectTo`), `src/routes/auth/better-auth-response-interceptor.ts` (`handleVerifiedSignIn`), and the already-signed-in redirects in `src/routes/auth/build-sign-in.tsx`, `build-sign-up.tsx`, `build-gated-sign-up.tsx`, `build-interest-sign-up.tsx`, `build-gated-interest-sign-up.tsx`, `handle-interest-sign-up.ts`, and `handle-gated-interest-sign-up.ts`. Update `src/routes/profile/build-profile.tsx` so the `go-back-action` anchor `href` is `PATHS.ETUDE`. Update `src/routes/build-root.tsx` so the protected-content link `href` is `PATHS.ETUDE` (rename its `data-testid` from `visit-private-action` to `visit-etude-action`). Delete `src/routes/build-private.tsx` and remove its import and `buildPrivate(app)` call from `src/index.ts`. A request to `/private` must now fall through to the existing `build404(app)` not-found handler — add no redirect and no placeholder. Update the shared e2e support: in `e2e-tests/support/test-data.ts` replace `BASE_URLS.PRIVATE` with `BASE_URLS.ETUDE`; in `e2e-tests/support/page-verifiers.ts` rename `verifyOnProtectedPage` to `verifyOnEtudePage` and assert the `etude-page-banner` testid; in `e2e-tests/support/navigation-helpers.ts` rename `navigateToPrivatePage` to `navigateToEtudePage` using `BASE_URLS.ETUDE`; update `e2e-tests/support/auth-helpers.ts` and `e2e-tests/support/workflow-helpers.ts` to call `verifyOnEtudePage`. Update every existing spec that imported `verifyOnProtectedPage`, `BASE_URLS.PRIVATE`, `navigateToPrivatePage`, or asserted `private-page-banner` / `visit-private-action` / a `/private` URL — including `e2e-tests/sign-in/02-can-sign-in-with-known-email.spec.ts`, `04-cant-visit-protected-page-signed-out.spec.ts`, `05-sign-out-successfully.spec.ts`, `e2e-tests/sign-up/03-can-validate-email.spec.ts`, `04-cannot-access-private-before-verification.spec.ts`, `05-can-resend-verification-email.spec.ts`, `e2e-tests/reset-password/03-complete-password-reset-flow.spec.ts`, `e2e-tests/profile/02-can-change-password.spec.ts`, `05-delete-account-cancel.spec.ts`, and `e2e-tests/interest-sign-up/03-navigation-and-ui-tests.spec.ts` (which asserts `page.url()` contains `/private` — change it to `/etude`). Run the full Playwright suite and confirm it is green.

---

### 5. Sweep for stray `/private` references and finalize helper naming

**Type**: REFACTOR
**Output**: No remaining references to `/private`, `PATHS.PRIVATE`, `BASE_URLS.PRIVATE`, `private-page-banner`, `visit-private-action`, `navigateToPrivatePage`, `verifyOnProtectedPage`, or `buildPrivate` anywhere in `src/`, `e2e-tests/`, or `tests/` (Notes task/issue/walkthrough history excepted). The etude helper names are the only protected-page verifier names in use.
**Depends on**: 4

Read and follow the coding standards in `Notes/skills/AGENTS.md` and the project `AGENTS.md`. Search the codebase for any lingering `/private`-related identifiers in `src/`, `e2e-tests/`, and `tests/` and remove or rename them. If a backward-compatibility alias for `verifyOnProtectedPage` was kept during task 4, remove it now in favor of the single `verifyOnEtudePage` name. Confirm `npm run cf-typegen` / typecheck and the full Playwright suite still pass. Do not modify the parent issue, the parent PRD, or prior task/issue/walkthrough files in `Notes/` — those are historical artifacts that legitimately mention `/private`.

---

### 6. Document the `/etude` entry route and `/private` removal

**Type**: DOCUMENT
**Output**: Wiki and Notes updates describing `/etude` as the authenticated entry point, the removal of `/private`, the repointed sign-in destinations, and the profile/root navigation changes. Follow `Notes/wiki/wiki-rules.md` and `Notes/wiki/AGENTS.md` for wiki ingestion.
**Depends on**: 5

Update the relevant wiki pages: `Notes/wiki/source-code.md` (remove the `build-private.tsx` entry, add `build-etude.tsx`; note the `PATHS.ETUDE` constant and the repointed destinations in `auth.ts`, the response interceptor, and the already-signed-in redirects), `Notes/wiki/e2e-tests.md` (catalog the new `e2e-tests/etude/` specs and the renamed helpers `verifyOnEtudePage` / `navigateToEtudePage` / `BASE_URLS.ETUDE`), `Notes/wiki/project-overview.md` (describe `/etude` as the authenticated entry route), and `Notes/wiki/index.md` if new sections are added. Append a `## [YYYY-MM-DD] ingest | issue-003 etude entry route` entry to `Notes/wiki/log.md`. Do not modify the parent issue or the parent PRD.

---

### 7. Code walkthrough

**Type**: CODE WALKTHROUGH
**Output**: `Notes/walkthroughs/issue-003-etude-entry-route-replaces-private/code-walkthrough/` containing the files generated by `uvx showboat` for this implementation.
**Depends on**: 6

Run `uvx showboat --help` for current usage, then generate a walkthrough of the issue-003 implementation into a new directory `Notes/walkthroughs/issue-003-etude-entry-route-replaces-private/code-walkthrough/`. Place all generated files there.

---

### 8. Human review against the PRD and cross-cutting contract

**Type**: REVIEW
**Output**: A human verifies the implementation against the PRD's "Product and workflow" and "HTTP routes and interaction contract" sections and cross-cutting contract section 1, confirming every acceptance criterion in the parent issue is met.
**Depends on**: 7

This is a human-in-the-loop step. The human must verify: a signed-out visitor requesting `/etude` is redirected to sign-in with the explanation and shown no etude content; a signed-in student requesting `/etude` sees the etude entry page with no-cache headers; a successful sign-in lands on `/etude`; the profile page's protected-area navigation targets `/etude`; a request to `/private` receives the standard not-found response with no redirect and no placeholder; and no sign-in destination, navigation target, or link anywhere in the application references `/private`. Record the result in the review notes. Do not modify the parent issue or the parent PRD.

---
