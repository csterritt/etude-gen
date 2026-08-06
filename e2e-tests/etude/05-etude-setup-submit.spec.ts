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

test.describe('POST /etude/setup valid submission', () => {
  test(
    'a valid submission redirects 303 to /etude/setup and persists the new values after reload',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      // Create the default aggregate and land on the setup form.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Capture the initial workflow version.
      const initialVersion = await page.getByTestId('workflow-version-field').inputValue()

      // Change measures to 16, meter to 3/4, hands to both, and submit.
      await page.getByTestId('measures-field').fill('16')
      await page.getByTestId('meter-field').selectOption('3/4')
      await page.getByTestId('hands-field').selectOption('both')
      await page.getByTestId('setup-save-action').click()

      // The redirect lands back on /etude/setup (PRG 303).
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // The form re-displays with the new persisted values.
      await expect(page.getByTestId('measures-field')).toHaveValue('16')
      await expect(page.getByTestId('meter-field')).toHaveValue('3/4')
      await expect(page.getByTestId('hands-field')).toHaveValue('both')

      // The workflow version has increased.
      const newVersion = await page.getByTestId('workflow-version-field').inputValue()
      expect(Number(newVersion)).toBe(Number(initialVersion) + 1)

      // A full reload still shows the persisted values (not in-memory only).
      await page.reload()
      await expect(page.getByTestId('measures-field')).toHaveValue('16')
      await expect(page.getByTestId('meter-field')).toHaveValue('3/4')
      await expect(page.getByTestId('hands-field')).toHaveValue('both')
    }),
  )
})

test.describe('POST /etude/setup rejections bypass native constraints', () => {
  test(
    'an out-of-range measure count (33) is rejected with a 303, no persistence, and no 500',
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
        workflowVersion: '1',
      })

      // Handled POST answers with 303, never 500.
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      // Reload the form and confirm the stored value is unchanged.
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('measures-field')).toHaveValue('8')
    }),
  )

  test(
    'an unsupported meter (6/8) is rejected with a 303, no persistence, and no 500',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '8',
        meter: '6/8',
        hands: 'right',
        workflowVersion: '1',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('meter-field')).toHaveValue('4/4')
    }),
  )

  test(
    'an unknown hand value is rejected with a 303, no persistence, and no 500',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '8',
        meter: '4/4',
        hands: 'both-hands',
        workflowVersion: '1',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('hands-field')).toHaveValue('right')
    }),
  )
})

test.describe('POST /etude/setup hostile shapes', () => {
  test(
    'an empty measures value is rejected with a 303 and no 500, and is not coerced to a default',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '',
        meter: '4/4',
        hands: 'right',
        workflowVersion: '1',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      await page.goto(ETUDE_SETUP_PATH)
      // The stored default (8) is unchanged — the empty value was not coerced.
      await expect(page.getByTestId('measures-field')).toHaveValue('8')
    }),
  )

  test(
    'an absent meter field is rejected with a 303 and no 500',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '8',
        hands: 'right',
        workflowVersion: '1',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('meter-field')).toHaveValue('4/4')
    }),
  )

  test(
    'a repeated hands field is rejected with a 303 and no 500, never coerced',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      // Use the browser's fetch with redirect:'manual' to send a repeated
      // hands field as multipart/form-data. The opaque-redirect response
      // has type 'opaqueredirect' which confirms the 303 was issued.
      const redirectType = await page.evaluate(async () => {
        const fd = new FormData()
        fd.append('measures', '8')
        fd.append('meter', '4/4')
        fd.append('hands', 'left')
        fd.append('hands', 'right')
        fd.append('workflowVersion', '1')
        const res = await fetch('/etude/setup', {
          method: 'POST',
          body: fd,
          redirect: 'manual',
        })
        return res.type
      })

      // An opaqueredirect response confirms the server issued a redirect (303).
      expect(redirectType).toBe('opaqueredirect')

      await page.goto(ETUDE_SETUP_PATH)
      // The stored default (right) is unchanged — the repeated value was not coerced.
      await expect(page.getByTestId('hands-field')).toHaveValue('right')
    }),
  )

  test(
    'an unexpected extra field is ignored and the expected fields are validated identically',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupViaBrowser(page, {
        measures: '16',
        meter: '3/4',
        hands: 'both',
        key: 'C major',
        workflowVersion: '1',
        foo: 'bar',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      // The valid expected fields were persisted despite the extra field.
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('measures-field')).toHaveValue('16')
      await expect(page.getByTestId('meter-field')).toHaveValue('3/4')
      await expect(page.getByTestId('hands-field')).toHaveValue('both')
    }),
  )

  test(
    'fields in an arbitrary order are validated identically and accepted',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      // Build the form with fields in an arbitrary order.
      const response = await page.request.post(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`, {
        multipart: {
          hands: 'left',
          meter: '2/4',
          measures: '12',
          key: 'C major',
          workflowVersion: '1',
        },
        maxRedirects: 0,
        failOnStatusCode: false,
        headers: { Origin: SERVER_BASE_URL },
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('measures-field')).toHaveValue('12')
      await expect(page.getByTestId('meter-field')).toHaveValue('2/4')
      await expect(page.getByTestId('hands-field')).toHaveValue('left')
    }),
  )
})
