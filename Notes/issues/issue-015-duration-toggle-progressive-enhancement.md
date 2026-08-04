## Issue 15: Progressive enhancement for duration toggles and Select all

**Type**: HITL
**Blocked by**: Issue 14

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Add the minimal approved client TypeScript that prevents a student from reaching review with an impossible rhythm set: disable duration toggles whose deselection would leave no eligible rhythm, and enhance Select all so it does not require a server round trip. Covers the PRD's single approved progressive-enhancement decision.

This is HITL because the project's coding rules require explicit permission before any client-side code, and the reviewer must confirm the enhancement's scope, its build/serving approach, and that it stays strictly additive. The server-side behavior from Issues 13 and 14 remains authoritative and the no-script path must keep working unchanged.

A toggle that must not be deselected is marked with `aria-disabled="true"` rather than the native `disabled` attribute, and the enhancement suppresses the deselection client-side. The control therefore stays focusable and stays in the accessibility tree, so a screen-reader or keyboard user can reach it and hear why it cannot be deselected. The reason is carried in visible text that is programmatically associated with the control through `aria-describedby`; it is never conveyed by a `title` attribute, by colour, or by styling alone, and the state change is announced through a polite live region rather than left silent.

Initialization is computed before any interaction: on first paint the enhancement derives the disabled set from the server-rendered selection state, so the page is never briefly inconsistent with what the server would accept. If the enhancement fails to load or fails to initialize, no control is marked or suppressed — every duration toggle stays fully usable and the server rejection from Issue 14 is the only guard.

### How to verify

- **Manual**: with scripting enabled, deselect durations until only one eligible pattern remains and confirm the remaining required toggles become disabled rather than silently producing an invalid set; reach a disabled toggle with the keyboard and confirm a screen reader announces both its state and the reason; disable scripting and confirm both Select all and duration submission still work through the server.
- **Automated**: Playwright tests running with and without JavaScript, asserting that the enhanced page disables the toggles that would eliminate every eligible rhythm, that a disabled toggle exposes `aria-disabled="true"`, remains focusable, and resolves its `aria-describedby` to visible reason text, that the disabled set is already correct on first paint before any interaction, that a simulated initialization failure leaves every toggle usable, that Select all works in both modes, and that a scripted bypass still hits the server rejection from Issue 14.

### Acceptance criteria

- [ ] Given scripting is available, when deselecting a duration would leave no eligible rhythm, then that toggle is marked `aria-disabled="true"`, its deselection is suppressed client-side, and it is not given the native `disabled` attribute.
- [ ] Given a toggle in that state, then it remains focusable and present in the accessibility tree, and its reason text is programmatically associated with it rather than conveyed by a `title` attribute or by colour alone.
- [ ] Given a toggle enters or leaves that state, then the change is announced to assistive technology rather than only styled.
- [ ] Given the enhancement loads, then on first paint it computes the disabled set from the server-rendered state before any interaction, so no intermediate state contradicts what the server would accept.
- [ ] Given the enhancement fails to load or initialize, then every duration toggle stays fully usable and the Issue 14 server rejection is the only guard.
- [ ] Given scripting is unavailable, then every duration toggle remains usable and the server rejection provides the guidance instead.
- [ ] Given Select all with scripting available, then the full pitch set is selected without a page reload.
- [ ] Given the enhancement is bypassed, then the server still rejects an impossible set.
- [ ] Given the enhancement, then it adds no new client-side authority over validation, ownership, or persisted state.

### User stories addressed

- User story 19: Duration controls prevent a selection that cannot form any complete measure

---
