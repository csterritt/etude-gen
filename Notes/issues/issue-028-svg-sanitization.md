## Issue 28: SVG sanitization before storage

**Type**: AFK
**Blocked by**: Issue 27

### Parent PRD

`Notes/PRD-etude-generator.md`

### What to build

Sanitize service SVG output with DOMPurify in a jsdom-compatible environment before it is stored, and treat the result as untrusted presentation data again when it is embedded. Scripts, event handlers, external resource loads, foreign interactive content, and unsafe links are removed or rejected. Sanitization that cannot produce a valid inert SVG is a typed failure, not a degraded result.

Add the DOMPurify and jsdom-compatible dependencies noted in the PRD's "Further Notes" — they are not currently in the project. Malformed SVG that does not parse is also a typed failure.

### How to verify

- **Manual**: feed a crafted SVG containing a script element and an external image reference through the sanitizer and confirm both are gone from the stored output.
- **Automated**: Bun tests asserting removal or rejection of script elements, inline event handler attributes, `javascript:` and other unsafe links, external resource references, and embedded foreign or interactive content; that legitimate engraving markup survives intact; that malformed SVG produces a typed failure; and that a document which cannot be reduced to a valid inert SVG produces a typed sanitization failure rather than empty output.

### Acceptance criteria

- [ ] Given SVG containing a script element, event handler attribute, or unsafe link, when it is sanitized, then those are removed and the result contains no executable or navigable content.
- [ ] Given SVG referencing an external resource, then the reference is removed or the document is rejected.
- [ ] Given valid engraving markup, then it survives sanitization unchanged in visual meaning.
- [ ] Given malformed SVG, then a typed sanitization failure is returned and nothing is stored.
- [ ] Given a document that cannot be reduced to a valid inert SVG, then a typed failure is returned rather than partial output.

### User stories addressed

- User story 41: The embedded SVG contains no unsafe or inaccessible interactive content

---
