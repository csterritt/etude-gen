import { expect, test } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'

test.describe('GET /etude/setup form', () => {
  test(
    'renders a form pre-populated with the saved aggregate defaults and accessible labels and native constraints',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      // /etude creates the default aggregate and redirects to /etude/setup.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // The real setup form is present (replaces the placeholder banner).
      await expect(page.getByTestId('etude-setup-form')).toBeVisible()

      // Measures input is a number input pre-populated with the default 8,
      // with min/max/step and required native constraints.
      const measures = page.getByTestId('measures-field')
      await expect(measures).toBeVisible()
      await expect(measures).toHaveValue('8')
      await expect(measures).toHaveAttribute('type', 'number')
      await expect(measures).toHaveAttribute('min', '4')
      await expect(measures).toHaveAttribute('max', '32')
      await expect(measures).toHaveAttribute('step', '1')
      await expect(measures).toHaveAttribute('required', '')

      // Meter control offers only the supported meters and defaults to 4/4.
      const meter = page.getByTestId('meter-field')
      await expect(meter).toBeVisible()
      await expect(meter).toHaveValue('4/4')
      const meterOptions = await meter.locator('option').allTextContents()
      expect(meterOptions).toEqual(expect.arrayContaining(['2/4', '3/4', '4/4']))
      expect(meterOptions.every((o) => ['2/4', '3/4', '4/4'].includes(o))).toBe(true)

      // Hands control offers only the supported hands and defaults to right.
      const hands = page.getByTestId('hands-field')
      await expect(hands).toBeVisible()
      await expect(hands).toHaveValue('right')
      const handOptions = await hands.locator('option').allTextContents()
      expect(handOptions).toEqual(expect.arrayContaining(['left', 'right', 'both']))
      expect(handOptions.every((o) => ['left', 'right', 'both'].includes(o))).toBe(true)

      // Every control has an accessible label.
      await expect(page.getByLabel('Measures')).toHaveCount(1)
      await expect(page.getByLabel('Time signature')).toHaveCount(1)
      await expect(page.getByLabel('Hand')).toHaveCount(1)

      // Hidden workflowVersion field is present with the current version.
      const version = page.getByTestId('workflow-version-field')
      await expect(version).toHaveAttribute('type', 'hidden')
      const versionValue = await version.inputValue()
      expect(versionValue).toMatch(/^\d+$/)
    }),
  )
})
