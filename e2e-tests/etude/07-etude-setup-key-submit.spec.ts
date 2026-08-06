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
 * APIResponse so the caller can assert on status and redirect behavior.
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

test.describe('POST /etude/setup key submission', () => {
  test(
    'a valid key submission (E-flat major) redirects 303 to /etude/setup, the form re-displays with the new key selected, and the derived pitches update to the new key spelling',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '8',
        meter: '4/4',
        hands: 'right',
        key: 'E-flat major',
        octaves: '4',
        workflowVersion: '1',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      // Follow the redirect and confirm the new key is selected and the
      // derived pitches reflect E-flat major's spelling.
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('key-field')).toHaveValue('E-flat major')
      const pitches = page.getByTestId('key-pitches')
      await expect(pitches).toContainText('E-flat')
      await expect(pitches).toContainText('B-flat')
    }),
  )

  test(
    'an unsupported key (B major — five sharps) submitted bypassing native constraints is rejected with a 303 redirect, no persistence, and no 500',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '8',
        meter: '4/4',
        hands: 'right',
        key: 'B major',
        octaves: '4',
        workflowVersion: '1',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      // The stored key is unchanged (still the default C major). Clear the
      // nonce cookie first so the validation state is not redisplayed.
      await page.context().clearCookies({ name: 'VALIDATION_STATE_NONCE' })
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('key-field')).toHaveValue('C major')
    }),
  )

  test(
    'an empty key value is rejected with a 303 redirect, no persistence, no 500, and no silent fallback to the stored or default key',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '8',
        meter: '4/4',
        hands: 'right',
        key: '',
        octaves: '4',
        workflowVersion: '1',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      // The stored key is unchanged — the empty value was not coerced.
      // Clear the nonce cookie so the validation state is not redisplayed.
      await page.context().clearCookies({ name: 'VALIDATION_STATE_NONCE' })
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('key-field')).toHaveValue('C major')
    }),
  )

  test(
    'a repeated key field is rejected with a deterministic 303 redirect and no 500',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      // Use the browser's fetch with redirect:'manual' to send a repeated
      // key field as multipart/form-data. The opaque-redirect response
      // has type 'opaqueredirect' which confirms the 303 was issued.
      const redirectType = await page.evaluate(async () => {
        const fd = new FormData()
        fd.append('measures', '8')
        fd.append('meter', '4/4')
        fd.append('hands', 'right')
        fd.append('key', 'C major')
        fd.append('key', 'E-flat major')
        fd.append('octaves', '4')
        fd.append('workflowVersion', '1')
        const res = await fetch('/etude/setup', {
          method: 'POST',
          body: fd,
          redirect: 'manual',
        })
        return res.type
      })

      expect(redirectType).toBe('opaqueredirect')

      // The stored key is unchanged — the repeated value was not coerced.
      // Clear the nonce cookie so the validation state is not redisplayed.
      await page.context().clearCookies({ name: 'VALIDATION_STATE_NONCE' })
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('key-field')).toHaveValue('C major')
    }),
  )

  test(
    'an extra unexpected field alongside a valid key does not affect the outcome for the expected fields',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '16',
        meter: '3/4',
        hands: 'both',
        key: 'A minor',
        octaves: '4',
        workflowVersion: '1',
        foo: 'bar',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      // The valid expected fields including the key were persisted.
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('measures-field')).toHaveValue('16')
      await expect(page.getByTestId('meter-field')).toHaveValue('3/4')
      await expect(page.getByTestId('hands-field')).toHaveValue('both')
      await expect(page.getByTestId('key-field')).toHaveValue('A minor')
    }),
  )

  test(
    'resubmitting the identical values (same measures, meter, hands, key as stored) does not increment the workflow version',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Capture the initial workflow version (default aggregate).
      const initialVersion = await page.getByTestId('workflow-version-field').inputValue()

      // Resubmit the exact stored default values.
      const response = await postSetupViaBrowser(page, {
        measures: '8',
        meter: '4/4',
        hands: 'right',
        key: 'C major',
        octaves: '4',
        workflowVersion: initialVersion,
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      // The workflow version is unchanged — no increment on identical resubmit.
      await page.goto(ETUDE_SETUP_PATH)
      const afterVersion = await page.getByTestId('workflow-version-field').inputValue()
      expect(Number(afterVersion)).toBe(Number(initialVersion))
    }),
  )

  test(
    'changing only the key (from C major to A minor) increments the workflow version and the form re-displays with the new key and its derived pitches',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      const initialVersion = await page.getByTestId('workflow-version-field').inputValue()

      const response = await postSetupViaBrowser(page, {
        measures: '8',
        meter: '4/4',
        hands: 'right',
        key: 'A minor',
        octaves: '4',
        workflowVersion: initialVersion,
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      await page.goto(ETUDE_SETUP_PATH)
      // The new key is selected and the version incremented.
      await expect(page.getByTestId('key-field')).toHaveValue('A minor')
      const afterVersion = await page.getByTestId('workflow-version-field').inputValue()
      expect(Number(afterVersion)).toBe(Number(initialVersion) + 1)
      // The derived pitches reflect A minor.
      const pitches = page.getByTestId('key-pitches')
      await expect(pitches).toContainText('A')
      await expect(pitches).toContainText('B')
      await expect(pitches).toContainText('C')
    }),
  )
})
