import { expect, test } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { verifyAlert } from '../support/finders'
import { verifyOnSignInPage } from '../support/page-verifiers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS, ERROR_MESSAGES } from '../support/test-data'

const ETUDE_PATH = '/etude'

test.describe('Etude entry route protection', () => {
  test('signed-out visitor requesting /etude is redirected to sign-in with an explanation', async ({
    page,
  }) => {
    await page.goto(ETUDE_PATH)

    await verifyOnSignInPage(page)
    await verifyAlert(page, ERROR_MESSAGES.MUST_SIGN_IN)

    await expect(page.getByTestId('etude-setup-banner')).toHaveCount(0)
  })

  test(
    'signed-in student requesting /etude sees the etude entry page with no-cache headers',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      const response = await page.goto(ETUDE_PATH)

      await expect(page.getByTestId('etude-setup-banner')).toBeVisible()
      expect(response?.headers()['cache-control']).toContain('no-store')
      expect(response?.headers()['cache-control']).toContain('no-cache')
      expect(response?.headers()['pragma']).toBe('no-cache')
      expect(response?.headers()['expires']).toBe('0')
    }),
  )
})
