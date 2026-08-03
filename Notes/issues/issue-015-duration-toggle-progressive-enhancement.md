## Issue 15: Progressive enhancement for duration toggles and Select all

**Type**: HITL
**Blocked by**: Issue 14

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add the minimal approved client TypeScript that prevents a student from reaching review with an impossible rhythm set: disable duration toggles whose deselection would leave no eligible rhythm, and enhance Select all so it does not require a server round trip. Covers the PRD's single approved progressive-enhancement decision.

This is HITL because the project's coding rules require explicit permission before any client-side code, and the reviewer must confirm the enhancement's scope, its build/serving approach, and that it stays strictly additive. The server-side behavior from Issues 13 and 14 remains authoritative and the no-script path must keep working unchanged.

### How to verify

- **Manual**: with scripting enabled, deselect durations until only one eligible pattern remains and confirm the remaining required toggles become disabled rather than silently producing an invalid set; disable scripting and confirm both Select all and duration submission still work through the server.
- **Automated**: Playwright tests running with and without JavaScript, asserting that the enhanced page disables the toggles that would eliminate every eligible rhythm, that Select all works in both modes, and that a scripted bypass still hits the server rejection from Issue 14.

### Acceptance criteria

- [ ] Given scripting is available, when deselecting a duration would leave no eligible rhythm, then that toggle is disabled with an accessible explanation.
- [ ] Given scripting is unavailable, then every duration toggle remains usable and the server rejection provides the guidance instead.
- [ ] Given Select all with scripting available, then the full pitch set is selected without a page reload.
- [ ] Given the enhancement is bypassed, then the server still rejects an impossible set.
- [ ] Given the enhancement, then it adds no new client-side authority over validation, ownership, or persisted state.

### User stories addressed

- User story 19: Duration controls prevent a selection that cannot form any complete measure

---
