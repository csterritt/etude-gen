# Issue 3: Authenticated /etude entry route replaces /private

*2026-08-04T19:51:26Z by Showboat 0.6.1*
<!-- showboat-id: 6ae65596-fbb0-457b-9d1e-d581e0ab7720 -->

## Overview

Issue 3 replaces the `/private` protected placeholder with `/etude` as the stable authenticated entry point for the etude experience. The `/private` route is removed entirely — no redirect, no placeholder. All sign-in destinations, already-signed-in redirects, profile navigation, and the root page link are repointed to `/etude`.

This walkthrough demonstrates the key changes: the new route, the repointed destinations, the removal of `/private`, and the passing tests.

## 1. The new /etude route

`src/routes/build-etude.tsx` is modeled on the former `build-private.tsx`. It registers `GET /etude` with `secureHeaders(STANDARD_SECURE_HEADERS)` and the `signedInAccess` middleware, which handles the signed-out redirect to sign-in and sets no-cache headers for signed-in users.

```bash
cat src/routes/build-etude.tsx
```

```output
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Route builder for the etude entry path.
 * @module routes/buildEtude
 */
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { PATHS, STANDARD_SECURE_HEADERS } from '../constants'
import { Bindings } from '../local-types'
import { useLayout } from './build-layout'
import { signedInAccess } from '../middleware/signed-in-access'

/**
 * Render the JSX for the etude entry page.
 */
const renderEtude = () => {
  return (
    <div data-testid='etude-page-banner' className='flex justify-center'>
      <div className='card w-full max-w-md bg-base-100 shadow-xl'>
        <div className='card-body'>
          <h2 className='card-title text-2xl font-bold mb-4'>Etude Generator</h2>
          <p className='text-gray-600 mb-6'>
            Welcome to the etude generator. Your workflow will appear here.
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * Attach the etude entry route to the app.
 * @param app - Hono app instance
 */
export const buildEtude = (app: Hono<{ Bindings: Bindings }>): void => {
  app.get(PATHS.ETUDE, secureHeaders(STANDARD_SECURE_HEADERS), signedInAccess, (c) =>
    c.render(useLayout(c, renderEtude())),
  )
}
```

## 2. PATHS constant change

`PATHS.PRIVATE` was removed and `PATHS.ETUDE` was added in `src/constants.ts`.

```bash
grep -A3 'ROOT:' src/constants.ts | head -5
```

```output
  ROOT: '/' as const,
  ETUDE: '/etude' as const,
  HEALTH: '/health' as const,

```

## 3. Repointed sign-in destinations

All sign-in destinations and already-signed-in redirects now target `PATHS.ETUDE` instead of `PATHS.PRIVATE`. This includes `src/lib/auth.ts` (`redirectTo`), the better-auth response interceptor, and 7 already-signed-in redirect sites across sign-in, sign-up, gated-sign-up, interest-sign-up, and gated-interest-sign-up routes.

```bash
grep -rn 'PATHS.ETUDE' src/ | grep -v 'build-etude'
```

```output
src/routes/build-root.tsx:28:            <a href={PATHS.ETUDE} className='btn btn-primary' data-testid='visit-etude-action'>
src/routes/auth/build-sign-up.tsx:124:      return redirectWithMessage(c, PATHS.ETUDE, MESSAGES.ALREADY_SIGNED_IN)
src/routes/auth/build-interest-sign-up.tsx:102:      return redirectWithMessage(c, PATHS.ETUDE, MESSAGES.ALREADY_SIGNED_IN)
src/routes/auth/build-sign-in.tsx:134:        return redirectWithMessage(c, PATHS.ETUDE, MESSAGES.ALREADY_SIGNED_IN)
src/routes/auth/handle-gated-interest-sign-up.ts:52:      return redirectWithMessage(c, PATHS.ETUDE, MESSAGES.ALREADY_SIGNED_IN)
src/routes/auth/build-gated-interest-sign-up.tsx:113:      return redirectWithMessage(c, PATHS.ETUDE, MESSAGES.ALREADY_SIGNED_IN)
src/routes/auth/build-gated-sign-up.tsx:64:      return redirectWithMessage(c, PATHS.ETUDE, MESSAGES.ALREADY_SIGNED_IN)
src/routes/auth/handle-interest-sign-up.ts:30:        return redirectWithMessage(c, PATHS.ETUDE, MESSAGES.ALREADY_SIGNED_IN)
src/routes/auth/better-auth-response-interceptor.ts:60:  const redirectResponse = redirectWithMessage(c, PATHS.ETUDE, ERROR_MESSAGES.WELCOME)
src/routes/profile/build-profile.tsx:71:            <a href={PATHS.ETUDE} className='btn btn-secondary' data-testid='go-back-action'>
```

## 4. /private is gone

`src/routes/build-private.tsx` was deleted and its import/call removed from `src/index.ts`. A request to `/private` now falls through to the standard 404 handler — no redirect, no placeholder.

```bash
test ! -f src/routes/build-private.tsx && echo 'build-private.tsx deleted' && grep -c 'buildPrivate' src/index.ts || echo '0 references'
```

```output
build-private.tsx deleted
0
0 references
```

## 5. No remaining /private references in source

A sweep confirms no references to `/private`, `PATHS.PRIVATE`, `buildPrivate`, `private-page-banner`, or `visit-private-action` remain in `src/` or `e2e-tests/` (except the intentional 404 test in `e2e-tests/etude/02`).

```bash
rg -c 'PATHS\.PRIVATE|buildPrivate|private-page-banner|visit-private-action|verifyOnProtectedPage|navigateToPrivatePage|BASE_URLS\.PRIVATE' src/ e2e-tests/ --no-filename || echo '0 matches in src/ and e2e-tests/'
```

```output
0 matches in src/ and e2e-tests/
```

## 6. E2e tests pass

All 6 etude tests pass: 2 for the protected route (signed-out denial, signed-in access with no-cache headers) and 4 for the destination repoint and /private removal.

```bash
npx playwright test e2e-tests/etude/ --reporter=line 2>&1 | tail -5
```

```output
Database sessions cleared successfully

Database cleared successfully

  6 passed (2.3s)
```

## 7. Build succeeds

The wrangler build completes without errors.

```bash
npx wrangler build 2>&1 | tail -3
```

```output
env.LILYPOND_TIMEOUT_MS ("")                      Environment Variable      

--dry-run: exiting now.
```
