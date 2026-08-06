import { expect, test } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'

test.describe('GET /etude/setup octave field and derived range', () => {
  test(
    'renders five checkboxes for octaves 2 through 6 with the stored octave pre-checked',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // The octave control is a group of five checkboxes with the expected
      // test id, one per octave from 2 through 6.
      const octaveCheckboxes = page.getByTestId('octaves-field')
      await expect(octaveCheckboxes).toHaveCount(5)

      // Each checkbox has a value matching its octave number.
      for (let octave = 2; octave <= 6; octave += 1) {
        const cb = page.getByTestId('octaves-field').nth(octave - 2)
        await expect(cb).toHaveAttribute('name', 'octaves')
        await expect(cb).toHaveValue(String(octave))
      }

      // An accessible label is present for each checkbox.
      await expect(page.getByLabel('Octave 2')).toHaveCount(1)
      await expect(page.getByLabel('Octave 4')).toHaveCount(1)

      // The default stored octave (4) is pre-checked; the others are
      // unchecked.
      await expect(page.getByTestId('octaves-field').nth(0)).not.toBeChecked()
      await expect(page.getByTestId('octaves-field').nth(1)).not.toBeChecked()
      await expect(page.getByTestId('octaves-field').nth(2)).toBeChecked()
      await expect(page.getByTestId('octaves-field').nth(3)).not.toBeChecked()
      await expect(page.getByTestId('octaves-field').nth(4)).not.toBeChecked()
    }),
  )

  test(
    'displays the lowest and highest available pitch for the default key and octave (C major, octave 4)',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      const range = page.getByTestId('available-range')
      await expect(range).toBeVisible()
      await expect(range).toContainText('C4')
      await expect(range).toContainText('C5')
    }),
  )

  test(
    'after checking octaves 2 and 5 (and unchecking 4) the range covers the continuous expansion from octave 2 through 5',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Uncheck octave 4, check octaves 2 and 5.
      await page.getByTestId('octaves-field').nth(2).uncheck()
      await page.getByTestId('octaves-field').nth(0).check()
      await page.getByTestId('octaves-field').nth(3).check()

      // Submit to persist the selection so the page reloads with the
      // updated range display.
      await page.getByTestId('setup-save-action').click()
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // The available range covers the continuous expansion from octave 2
      // through octave 5. The lowest pitch is C2 (the lower tonic of the
      // octave-2 range) and the highest is C6 (the upper tonic of the
      // octave-5 range, which spans C5 to C6 tonic-to-tonic).
      const range = page.getByTestId('available-range')
      await expect(range).toContainText('C2')
      await expect(range).toContainText('C6')
    }),
  )

  test(
    'after checking octave 6 in C major the highest available pitch becomes C7',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Check octaves 2 through 6 (all five checkboxes).
      for (let i = 0; i < 5; i += 1) {
        await page.getByTestId('octaves-field').nth(i).check()
      }
      await page.getByTestId('setup-save-action').click()
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // C major contains C natural, and C7 is exactly at the top of the
      // expanded range (octaves 2 through 6), so C7 is available.
      const range = page.getByTestId('available-range')
      await expect(range).toContainText('C7')
    }),
  )
})
