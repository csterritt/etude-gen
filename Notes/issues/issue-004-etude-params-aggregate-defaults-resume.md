## Issue 4: Etude parameter aggregate with practical defaults and resume

**Type**: AFK
**Blocked by**: Issue 3

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Create the required `etude_params` D1 record and the Etude Repository operations that load and create one owner-scoped aggregate, so a student has exactly one current workflow that resumes across visits. Covers the "Data and concurrency" decisions for the required parameters table and the PRD's default aggregate: 8 measures, 4/4, C major, octave range 4, right hand, with a workflow version.

The record references the authenticated user under a database-level uniqueness constraint on the owning user reference, not merely an application-level check, plus cascade deletion with the user row. Load-or-create is therefore atomic under concurrency: the caller that loses the insert race handles the constraint violation as a load of the winner's aggregate, not as an error. `GET /etude` loads the owner's snapshot, creating the default aggregate when none exists, and redirects to the canonical route for the saved state. Physical columns stay encapsulated behind the repository interface — routes and tests must not depend on them.

The aggregate carries both the workflow version and the aggregate epoch defined in section 4 of the cross-cutting contract. A freshly created aggregate has no confirmed steps, so by the state table in section 5 the canonical route is `/etude/setup`: the defaults pre-populate the setup controls but do not pre-confirm the setup step or any later one.

Follow the existing Drizzle schema patterns in `src/db/schema.ts` and the `build-schema-update.sh` migration flow, and the `Result`-returning data access style in `src/lib/db-access.ts`.

### Cross-cutting contract

Inherits `Notes/issues/etude-cross-cutting-contract.md`:

- Section 1: universal route requirements for `GET /etude`.
- Section 4: this slice builds the workflow version and the aggregate epoch that operation POSTs later use as preconditions.
- Section 5: canonical state-to-route mapping — a new aggregate has no confirmed steps and resolves to `/etude/setup`.

### How to verify

- **Manual**: sign in as a new user, visit `/etude`, and confirm the setup step shows the default settings; navigate away, return, and confirm the same values are still there.
- **Automated**: Bun tests over the repository asserting one record per user, default values on creation, idempotent load-or-create, owner-scoped reads that never return another user's aggregate, and cascade deletion with the user row. A concurrency test issues two simultaneous load-or-create calls for the same new user and asserts exactly one aggregate exists and both callers observe the same one, with the losing caller treating the uniqueness violation as a load. A further test asserts a direct second insert for the same user is rejected by the database constraint, and that a freshly created aggregate reports no confirmed steps. A Playwright test asserts that a returning student resumes the saved workflow rather than a fresh one.

### Acceptance criteria

- [ ] Given a signed-in student with no aggregate, when they visit `/etude`, then one aggregate is created with 8 measures, 4/4, C major, octave range 4, and right hand, and they are redirected to the canonical step.
- [ ] Given a student who already has an aggregate, when they visit `/etude` again, then no second aggregate is created and the saved state is resumed.
- [ ] Given two students, when each loads their aggregate, then neither can read or affect the other's.
- [ ] Given a deleted user row, then the etude parameter record is removed by cascade.
- [ ] Given a second aggregate insert for a user who already has one, then the database uniqueness constraint on the owning user reference rejects it independently of any application-level check.
- [ ] Given two concurrent load-or-create calls for the same new user, then exactly one aggregate exists, both callers observe that same aggregate, and the losing caller handles the constraint violation as a load rather than an error.
- [ ] Given a freshly created aggregate, then it carries a workflow version and an aggregate epoch, has no confirmed steps, and the canonical route is `/etude/setup` with the defaults pre-populated but not pre-confirmed.

### User stories addressed

- User story 3: Resume the one current workflow on return
- User story 4: Sensible initial settings for a new workflow

---
