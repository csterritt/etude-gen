import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS, SERVER_BASE_URL } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'
const ETUDE_NOTES_PATH = '/etude/notes'

/**
 * Submit a multipart POST to the test-only operation-precondition route
 * using the authenticated browser context (page.request shares the browser's
 * session cookies and origin). Returns the APIResponse so the caller can
 * assert on status and redirect behavior.
 */
const postOperationPrecondition = async (
  page: Page,
  body: Record<string, string>,
): Promise<APIResponse> => {
  return page.request.post(`${SERVER_BASE_URL}/test/etude/operation-precondition`, {
    multipart: { ...body },
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
}

test.describe('POST /test/etude/operation-precondition stale-version refusal (two-tab scenario)', () => {
  test(
    'a stale operation POST from a second tab is refused with a 303 to the canonical route and no state change',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      // Tab A: create the default aggregate and land on the setup form.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Capture the initial workflow version (should be 1).
      const tabAVersion = await page.getByTestId('workflow-version-field').inputValue()
      expect(Number(tabAVersion)).toBe(1)

      // Tab B: open a second page in the same browser context (shares cookies).
      const tabB = await page.context().newPage()
      await tabB.goto(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`)
      expect(tabB.url()).toContain(ETUDE_SETUP_PATH)

      // Tab B also sees version 1.
      const tabBVersion = await tabB.getByTestId('workflow-version-field').inputValue()
      expect(Number(tabBVersion)).toBe(1)

      // Tab A: submit a valid setup change (measures 16, meter 3/4, hands both).
      await page.getByTestId('measures-field').fill('16')
      await page.getByTestId('meter-field').selectOption('3/4')
      await page.getByTestId('hands-field').selectOption('both')
      await page.getByTestId('setup-save-action').click()

      // Tab A: the redirect lands back on /etude/setup with the new values.
      expect(page.url()).toContain(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('measures-field')).toHaveValue('16')
      // Version is now 2.
      const tabAVersionAfter = await page.getByTestId('workflow-version-field').inputValue()
      expect(Number(tabAVersionAfter)).toBe(2)

      // Tab B: POST to the test-only operation-precondition route carrying
      // the stale version 1 and the captured epoch 1. This must be refused
      // with a 303 to the canonical route — now /etude/notes since setup is
      // confirmed and notes are not — no state change.
      const response = await postOperationPrecondition(tabB, {
        workflowVersion: '1',
        aggregateEpoch: '1',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_NOTES_PATH)

      // Tab B: navigate to /etude/setup and confirm the aggregate is
      // unchanged — still Tab A's values, version still 2.
      await tabB.goto(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`)
      await expect(tabB.getByTestId('measures-field')).toHaveValue('16')
      await expect(tabB.getByTestId('meter-field')).toHaveValue('3/4')
      await expect(tabB.getByTestId('hands-field')).toHaveValue('both')
      const tabBVersionAfter = await tabB.getByTestId('workflow-version-field').inputValue()
      expect(Number(tabBVersionAfter)).toBe(2)

      // An explanatory error message is visible on the page.
      const errorAlert = tabB.locator('.alert-error')
      await expect(errorAlert).toBeVisible()

      await tabB.close()
    }),
  )
})
