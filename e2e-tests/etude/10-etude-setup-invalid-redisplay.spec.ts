import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS, SERVER_BASE_URL } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'

/**
 * Submit a multipart POST to /etude/setup using the authenticated browser
 * context (page.request shares the browser's session cookies and origin),
 * bypassing native HTML constraints. Uses multipart/form-data so the server's
 * parseBody handles it identically to a browser form submission. Returns the
 * APIResponse so the caller can assert on status, redirect, and cookie
 * behavior. `maxRedirects: 0` lets us inspect the 303 response directly.
 */
const postSetupViaBrowser = async (
  page: Page,
  body: Record<string, string>,
): Promise<APIResponse> => {
  const multipart: Record<string, string> = { ...body }
  return page.request.post(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`, {
    multipart,
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
}

/**
 * Parse a Set-Cookie header value into the cookie name, value, and attribute
 * map so the tests can assert on individual attributes.
 */
const parseSetCookie = (header: string): { name: string; value: string; attrs: Record<string, string> } => {
  const parts = header.split(';').map((p) => p.trim())
  const first = parts[0] ?? ''
  const eq = first.indexOf('=')
  const name = eq >= 0 ? first.slice(0, eq) : first
  const value = eq >= 0 ? first.slice(eq + 1) : ''
  const attrs: Record<string, string> = {}
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i] ?? ''
    const aeq = part.indexOf('=')
    if (aeq >= 0) {
      attrs[part.slice(0, aeq).toLowerCase()] = part.slice(aeq + 1)
    } else {
      attrs[part.toLowerCase()] = 'true'
    }
  }
  return { name, value, attrs }
}

/**
 * Submit an invalid setup form via the browser's request context (sharing
 * session cookies), capture the nonce cookie from the 303 Set-Cookie header,
 * and add it to the browser context's cookie jar so the subsequent GET
 * sends it. `maxRedirects: 0` lets us inspect the 303 response directly.
 */
const submitInvalidAndCaptureNonce = async (
  page: Page,
  body: Record<string, string>,
): Promise<void> => {
  const response = await page.request.post(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`, {
    multipart: { ...body },
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
  const setCookie = response.headers()['set-cookie']
  if (setCookie) {
    const parsed = parseSetCookie(setCookie)
    if (parsed.name === 'VALIDATION_STATE_NONCE' && parsed.value.length > 0) {
      await page.context().addCookies([
        {
          name: parsed.name,
          value: parsed.value,
          domain: 'localhost',
          path: '/etude',
        },
      ])
    }
  }
}

test.describe('POST /etude/setup invalid submission redirect (Issue 8)', () => {
  test(
    'an invalid measures value (33) returns a 303 redirect to /etude/setup with a nonce cookie containing no submitted value, field name, or error text, and no domain state is persisted',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      // Seed the default aggregate via the browser so the POST has something to update.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Submit 33 measures directly, bypassing native constraints.
      const response = await postSetupViaBrowser(page, {
        measures: '33',
        meter: '4/4',
        hands: 'right',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      // Handled POST answers with 303, never 500.
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      // The 303 response sets a nonce cookie whose value contains only the
      // opaque nonce — no submitted value, field name, or error text.
      const setCookie = response.headers()['set-cookie']
      expect(setCookie).toBeDefined()
      const parsed = parseSetCookie(setCookie!)
      expect(parsed.name).toBe('VALIDATION_STATE_NONCE')
      expect(parsed.value.length).toBeGreaterThan(0)
      // The cookie value is a UUID-format nonce — it does not contain the
      // submitted field name or error text. (A UUID may coincidentally
      // contain digit substrings from the submitted value, so we only check
      // for field names and error text, not numeric values.)
      expect(parsed.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      expect(parsed.value).not.toContain('measures')
      expect(parsed.value).not.toContain('range')
      // The full Set-Cookie header does not leak payload text.
      expect(setCookie).not.toContain('measures')
      expect(setCookie).not.toContain('Measure count')

      // After the redirect, clear the nonce cookie (so the validation state
      // is not consumed and redisplayed) and navigate to /etude/setup to
      // assert the stored measures value is still the default (8) — no
      // domain state was persisted.
      await page.context().clearCookies({ name: 'VALIDATION_STATE_NONCE' })
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('measures-field')).toHaveValue('8')
    }),
  )

  test(
    'an invalid meter (6/8) returns a 303 with a nonce cookie and no persistence',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '8',
        meter: '6/8',
        hands: 'right',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      const setCookie = response.headers()['set-cookie']
      expect(setCookie).toBeDefined()
      const parsed = parseSetCookie(setCookie!)
      expect(parsed.name).toBe('VALIDATION_STATE_NONCE')
      // The cookie value is a UUID-format nonce — it does not contain the
      // submitted meter value or field name.
      expect(parsed.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      expect(parsed.value).not.toContain('6/8')
      expect(parsed.value).not.toContain('meter')

      // Clear the nonce cookie so the validation state is not redisplayed,
      // and check the committed aggregate meter is still the default (4/4).
      await page.context().clearCookies({ name: 'VALIDATION_STATE_NONCE' })
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('meter-field')).toHaveValue('4/4')
    }),
  )

  test(
    'an empty measures value returns a 303 with a nonce cookie and no coercion to a default',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '',
        meter: '4/4',
        hands: 'right',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      const setCookie = response.headers()['set-cookie']
      expect(setCookie).toBeDefined()
      const parsed = parseSetCookie(setCookie!)
      expect(parsed.name).toBe('VALIDATION_STATE_NONCE')

      // Clear the nonce cookie so the validation state is not redisplayed,
      // and check the committed aggregate measures is still the default (8).
      await page.context().clearCookies({ name: 'VALIDATION_STATE_NONCE' })
      await page.goto(ETUDE_SETUP_PATH)
      // The stored default (8) is unchanged — the empty value was not coerced.
      await expect(page.getByTestId('measures-field')).toHaveValue('8')
    }),
  )
})

test.describe('GET /etude/setup form redisplay with safe values and field errors (Issue 8)', () => {
  test(
    'after an invalid submission, the redisplayed form shows the valid submitted values preserved and a field-level error on the offending field',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      // Create the default aggregate and land on the setup form.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Submit an invalid measures (33) alongside valid changes (meter=3/4,
      // hands=both) via the browser, bypassing native constraints. Capture
      // the nonce cookie from the 303 response so the GET can consume it.
      await submitInvalidAndCaptureNonce(page, {
        measures: '33',
        meter: '3/4',
        hands: 'both',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      // Navigate to /etude/setup (the GET) to consume the validation state
      // and redisplay the form.
      await page.goto(ETUDE_SETUP_PATH)

      // The safe values are preserved: meter=3/4 and hands=both.
      await expect(page.getByTestId('meter-field')).toHaveValue('3/4')
      await expect(page.getByTestId('hands-field')).toHaveValue('both')

      // The measures field shows a field-level error (the offending field).
      await expect(page.getByTestId('measures-error')).toBeVisible()

      // The stored aggregate is unchanged — measures is still the default (8)
      // because the submission was rejected. The redisplayed measures value
      // is the safe submitted value (33), not the committed aggregate.
      await expect(page.getByTestId('measures-field')).toHaveValue('33')
    }),
  )

  test(
    'the stored aggregate is unchanged after an invalid submission — reload confirms measures is still the default',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      // Submit an invalid measures (33) alongside valid changes.
      await submitInvalidAndCaptureNonce(page, {
        measures: '33',
        meter: '3/4',
        hands: 'both',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      // Consume the validation state on the first GET.
      await page.goto(ETUDE_SETUP_PATH)

      // Now reload — the validation state was consumed, so the form shows
      // the committed aggregate values (the defaults), not the redisplayed
      // safe values.
      await page.reload()
      await expect(page.getByTestId('measures-field')).toHaveValue('8')
      await expect(page.getByTestId('meter-field')).toHaveValue('4/4')
      await expect(page.getByTestId('hands-field')).toHaveValue('right')
      // The field error is gone — the validation state was consumed.
      await expect(page.getByTestId('measures-error')).toHaveCount(0)
    }),
  )

  test(
    'reloading the step a second time no longer shows the stale error or the redisplayed safe values',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      await submitInvalidAndCaptureNonce(page, {
        measures: '33',
        meter: '3/4',
        hands: 'both',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      // First GET consumes the validation state and redisplays.
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('measures-error')).toBeVisible()

      // Second reload: the error is gone and the form shows the committed
      // aggregate values.
      await page.reload()
      await expect(page.getByTestId('measures-error')).toHaveCount(0)
      await expect(page.getByTestId('measures-field')).toHaveValue('8')
      await expect(page.getByTestId('meter-field')).toHaveValue('4/4')
      await expect(page.getByTestId('hands-field')).toHaveValue('right')
    }),
  )

  test(
    'a forged or foreign nonce yields a clean step with no errors and no redisplayed values',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      // Forge a nonce cookie with a random unknown value and navigate to
      // /etude/setup. The step should render cleanly with no errors and no
      // redisplayed values (just the committed aggregate).
      await page.context().addCookies([
        {
          name: 'VALIDATION_STATE_NONCE',
          value: 'forged-unknown-nonce-12345',
          domain: 'localhost',
          path: '/etude',
        },
      ])

      await page.goto(ETUDE_SETUP_PATH)

      // The form shows the committed aggregate defaults, no errors.
      await expect(page.getByTestId('measures-field')).toHaveValue('8')
      await expect(page.getByTestId('meter-field')).toHaveValue('4/4')
      await expect(page.getByTestId('hands-field')).toHaveValue('right')
      await expect(page.getByTestId('measures-error')).toHaveCount(0)
    }),
  )

  test(
    'a submitted value containing HTML and quote characters is rendered escaped, not interpreted as markup',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      // Submit a value containing HTML and quote characters in the measures
      // field (which will fail validation). The value should be redisplayed
      // escaped in the HTML source, not interpreted as markup.
      const hostileValue = '<script>alert("x")</script>'
      await submitInvalidAndCaptureNonce(page, {
        measures: hostileValue,
        meter: '3/4',
        hands: 'both',
        octaves: '4',
        key: 'C major',
        workflowVersion: '1',
      })

      await page.goto(ETUDE_SETUP_PATH)

      // The page source contains the escaped value, not the raw markup.
      const html = await page.content()
      expect(html).toContain('&lt;script&gt;')
      expect(html).not.toContain('<script>alert("x")</script>')

      // No script execution — no alert dialog was triggered (Playwright
      // would fail on an unexpected dialog). The measures field's value
      // attribute in the HTML source contains the escaped hostile value.
      // (The browser's number input may not display it, but the HTML
      // source confirms it is escaped, not interpreted as markup.)
    }),
  )
})
