## Issue 3: Authenticated `/etude` entry route replaces `/private`

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Replace the `/private` protected placeholder with `/etude` as the stable authenticated entry point for the etude experience, per the PRD's "Product and workflow" and "HTTP routes and interaction contract" sections. Successful sign-in destinations and profile navigation must target `/etude`.

Follow the existing route conventions: a `build-*.tsx` page builder registered in `src/index.ts`, protected by the `signedInAccess` middleware with the standard secure headers and no-cache behavior. A signed-out visitor requesting `/etude` gets the existing redirect-with-error path to sign in with an explanation of why access was denied. At this stage `/etude` may render a placeholder heading; later slices give it real workflow state.

The `/private` route and its page builder are removed entirely. There is no redirect from `/private` to `/etude` and no placeholder left behind: the registration is deleted, so a request to `/private` falls through to the application's standard 404 response for an unknown path. No sign-in destination, profile navigation target, or other link references it.

### Cross-cutting contract

Inherits `Notes/issues/etude-cross-cutting-contract.md`:

- Section 1: universal route requirements — this slice builds the authenticated, no-cache, owner-scoped baseline that every later etude route inherits.

### How to verify

- **Manual**: sign out and request `/etude` — confirm you land on sign-in with an explanatory message; sign in and confirm you land on the etude entry rather than `/private`.
- **Automated**: Playwright tests in a new `e2e-tests/etude/` folder, using the existing `signInUser` and `signOutAndVerify` helpers, covering signed-out denial with the explanation, signed-in access, sign-in redirect destination, and the profile navigation link. A further test requests `/private` while signed in and asserts the standard not-found response with no redirect. Existing `/private` tests are updated or removed so the suite stays green.

### Acceptance criteria

- [ ] Given a signed-out visitor, when they request `/etude`, then they are redirected to sign in with an explanation and are not shown etude content.
- [ ] Given a signed-in student, when they request `/etude`, then the etude entry page renders with no-cache headers.
- [ ] Given a successful sign-in, then the student is sent to the etude entry route.
- [ ] Given the profile page, then its protected-area navigation targets the etude entry route.
- [ ] Given a request to `/private`, then the route is absent and the application answers with its standard not-found response, with no redirect and no placeholder page.
- [ ] Given the application's sign-in destinations, navigation targets, and links, then none of them references `/private`.

### User stories addressed

- User story 1: Sign in before using the etude generator
- User story 2: Explanation and path to sign in when access is denied

---
