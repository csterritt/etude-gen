## Issue 4: Etude parameter aggregate with practical defaults and resume

**Type**: AFK
**Blocked by**: Issue 3

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Create the required `etude_params` D1 record and the Etude Repository operations that load and create one owner-scoped aggregate, so a student has exactly one current workflow that resumes across visits. Covers the "Data and concurrency" decisions for the required parameters table and the PRD's default aggregate: 8 measures, 4/4, C major, octave range 4, right hand, with a workflow version.

The record references the authenticated user with uniqueness and cascade-deletion semantics. `GET /etude` loads the owner's snapshot, creating the default aggregate when none exists, and redirects to the canonical route for the saved state (at this stage, `/etude/setup`). Physical columns stay encapsulated behind the repository interface — routes and tests must not depend on them.

Follow the existing Drizzle schema patterns in `src/db/schema.ts` and the `build-schema-update.sh` migration flow, and the `Result`-returning data access style in `src/lib/db-access.ts`.

### How to verify

- **Manual**: sign in as a new user, visit `/etude`, and confirm the setup step shows the default settings; navigate away, return, and confirm the same values are still there.
- **Automated**: Bun tests over the repository asserting one record per user, default values on creation, idempotent load-or-create, owner-scoped reads that never return another user's aggregate, and cascade deletion with the user row. A Playwright test asserts that a returning student resumes the saved workflow rather than a fresh one.

### Acceptance criteria

- [ ] Given a signed-in student with no aggregate, when they visit `/etude`, then one aggregate is created with 8 measures, 4/4, C major, octave range 4, and right hand, and they are redirected to the canonical step.
- [ ] Given a student who already has an aggregate, when they visit `/etude` again, then no second aggregate is created and the saved state is resumed.
- [ ] Given two students, when each loads their aggregate, then neither can read or affect the other's.
- [ ] Given a deleted user row, then the etude parameter record is removed by cascade.

### User stories addressed

- User story 3: Resume the one current workflow on return
- User story 4: Sensible initial settings for a new workflow

---
