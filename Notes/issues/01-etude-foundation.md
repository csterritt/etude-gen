## Issue 1: Etude foundation — schema, repository, `/etude` entry, auth gating

**Type**: AFK
**Blocked by**: None — can start immediately

### Parent PRD

`PRD-etude-generator.md`

### What to build

The end-to-end skeleton every later slice hangs off. Add the three user-owned, one-to-one D1 records from "Data and concurrency" (`etude_params` plus the current-Piece and operation companion tables, with uniqueness and cascade-deletion on the user) and the Etude Repository's owner-scoped load/create-by-version operations. Replace the `/private` protected placeholder with the `/etude` experience: `GET /etude` is the stable entry point, requires the existing authenticated session middleware and no-cache behavior, creates a fresh aggregate with PRD defaults (8 measures, 4/4, C major, octave range 4, right hand) on first visit, and redirects to the canonical route for the saved current state (the setup step for a new workflow). Successful sign-in destinations and profile navigation now target `/etude`. A signed-out visitor requesting any etude page is redirected to sign-in with an explanatory message.

### How to verify

- **Manual**: sign in, visit `/etude`, land on `/etude/setup` showing defaults; sign out, request `/etude` and each step URL, and confirm redirect to sign-in with the explanation; sign in again and confirm the same workflow resumes rather than resetting.
- **Automated**: Bun tests for repository create/load, one-record-per-user enforcement, and cascade behavior; Playwright tests for signed-out denial, entry redirect, and resume (extend the existing protected-page sign-in test prior art).

### Acceptance criteria

- [ ] Given a signed-in student with no etude data, when they GET `/etude`, then an aggregate with the PRD defaults is persisted and they are redirected to the canonical setup route.
- [ ] Given a signed-in student with a saved workflow, when they GET `/etude`, then they are redirected to the canonical route for the saved state with no data changed.
- [ ] Given a signed-out visitor, when they request any `/etude*` page, then they are redirected to sign-in with a safe explanatory message and no-cache headers.
- [ ] Given a second sign-in for the same user, then there is still exactly one `etude_params` record and sign-in/profile navigation targets `/etude` instead of `/private`.

### User stories addressed

- User story 1: sign in before using the etude generator
- User story 2: signed-out explanation and path to sign in
- User story 3: resume the one current workflow
- User story 25: redirect to earliest incomplete step (plumbing only; step rules land in later slices)

---
