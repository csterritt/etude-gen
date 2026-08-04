import { expect, test } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { verifyOn404Page, verifyOnProfilePage } from '../support/page-verifiers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome, navigateToProfile } from '../support/navigation-helpers'
import { TEST_USERS } from '../support/test-data'

const PRIVATE_PATH = '/private'
const ETUDE_PATH = '/etude'

test.describe('Etude entry route replaces /private', () => {
  test(
    'successful sign-in lands on /etude',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      expect(page.url()).toContain(ETUDE_PATH)
      await expect(page.getByTestId('etude-page-banner')).toBeVisible()
    }),
  )

  test(
    'profile page protected-area navigation targets /etude',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await navigateToProfile(page)

      const goBackLink = page.getByTestId('go-back-action')
      const href = await goBackLink.getAttribute('href')
      expect(href).toBe(ETUDE_PATH)
    }),
  )

  test('root page protected-content link targets /etude', async ({ page }) => {
    await navigateToHome(page)

    const protectedLink = page.getByTestId('visit-etude-action')
    const href = await protectedLink.getAttribute('href')
    expect(href).toBe(ETUDE_PATH)
  })

  test(
    'request to /private returns the standard not-found response with no redirect',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      await page.goto(PRIVATE_PATH)

      expect(page.url()).toContain(PRIVATE_PATH)
      await verifyOn404Page(page)
    }),
  )
})
