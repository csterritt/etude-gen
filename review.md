# Code Review (src/)

## Assumptions

- Review scoped to `src/` only (no infra/config files).
- Worker runtime is Cloudflare Workers without Node globals unless `nodejs_compat` is enabled.
- Test-only routes are gated by runtime config and not exposed by default.

## Answer (Findings)

### Low / Maintainability / Performance

- **Sign-up handlers and pages are duplicated**, raising divergence risk; consider shared helpers/components. @src/routes/auth/handle-gated-sign-up.ts#37-133 @src/routes/auth/handle-gated-interest-sign-up.ts#52-148 @src/routes/auth/build-gated-sign-up.tsx#29-139 @src/routes/auth/build-gated-interest-sign-up.tsx#29-189
- **Test DB status endpoint pulls full tables.** Use `count(*)` instead of `select()` to reduce overhead. @src/routes/test/database.ts#238-244
- **Hard-coded CSS asset name** risks stale references after rebuilds; consider a manifest or constant. @src/renderer.tsx#17-20
- **Docs/tests:** Core helpers (DB access, sign-up error mapping) lack unit tests; add targeted tests around retries and error handling. @src/lib/db-access.ts#38-60 @src/lib/sign-up-utils.ts#120-175

## Plan

1. Make gated sign-up code usage atomic (delete+check before account creation, or use a DB transaction).
2. Fix retry semantics to throw on failures or move retries into DB calls; add unit tests for retry + sign-up error mapping.
3. Harden runtime safety: consolidate env validation, validate callback URLs, and remove Node-global usage in worker paths; trim user-facing error details.

## Pitfalls

- Avoid creating duplicate accounts when adding retries/transactions; ensure idempotency and consistent error handling.
- Tightening error messages can reduce UX clarity—keep detailed logs for operators.
- If you rely on Node globals (nodemailer/test tooling), document the required compatibility flags for local/dev vs production.
