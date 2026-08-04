/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Test-only forced-error endpoint.
 *
 * Throws an error carrying sensitive-looking detail (SQL, a stack-like
 * string, and a service snippet) so the e2e test can assert the global error
 * handler renders the safe message with a visible correlation identifier and
 * leaks nothing technical. Gated by the existing test-route flag and wrapped
 * in PRODUCTION:REMOVE markers; never available in production.
 *
 * @module routes/test/forced-error
 */
import { Hono } from 'hono' // PRODUCTION:REMOVE

import { Bindings } from '../../local-types' // PRODUCTION:REMOVE

export const testForcedErrorRouter = new Hono<{ Bindings: Bindings }>() // PRODUCTION:REMOVE

// PRODUCTION:REMOVE-NEXT-LINE
testForcedErrorRouter.get('/forced-error', () => {
  throw new Error(
    'at /sql/select * from users where id=1 | LilyPond responded: ENGRAVE_ERROR raw-source | ada@example.com',
  )
})
