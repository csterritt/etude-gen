import { expect, test } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'

test.describe('Etude resume on return', () => {
  test(
    'a signed-in student with no aggregate visiting /etude is redirected to /etude/setup',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      await page.goto(ETUDE_PATH)

      expect(page.url()).toContain(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('etude-setup-banner')).toBeVisible()
    }),
  )

  test(
    'a returning student visiting /etude again resumes the same workflow with no error',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      // First visit creates the default aggregate and redirects to setup.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('etude-setup-banner')).toBeVisible()

      // Second visit resumes the saved state — no second aggregate, no error.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('etude-setup-banner')).toBeVisible()
      await expect(page.getByRole('alert')).toHaveCount(0)
    }),
  )
})
