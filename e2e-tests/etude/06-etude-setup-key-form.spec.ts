import { expect, test } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'

// The exact eighteen supported keys the key control must offer, per the
// PRD's "Supported musical domain" section. No key with more than four
// accidentals appears.
const SUPPORTED_KEYS = [
  'C major',
  'G major',
  'D major',
  'A major',
  'E major',
  'F major',
  'B-flat major',
  'E-flat major',
  'A-flat major',
  'A minor',
  'E minor',
  'B minor',
  'F-sharp minor',
  'C-sharp minor',
  'D minor',
  'G minor',
  'C minor',
  'F minor',
] as const

test.describe('GET /etude/setup key field and derived pitches', () => {
  test(
    'renders a key select offering exactly the eighteen supported keys with the stored key pre-selected and the derived pitches displayed',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      // /etude creates the default aggregate and redirects to /etude/setup.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // The key control is a <select> with the expected test id.
      const keyField = page.getByTestId('key-field')
      await expect(keyField).toBeVisible()
      await expect(keyField).toHaveAttribute('name', 'key')
      await expect(keyField).toHaveAttribute('required', '')

      // The control offers exactly the eighteen supported keys, no more
      // and no less, and no key with more than four accidentals.
      const optionValues = await keyField.locator('option').evaluateAll((opts) =>
        opts.map((o) => (o as HTMLOptionElement).value),
      )
      expect(optionValues.sort()).toEqual([...SUPPORTED_KEYS].sort())

      // The default selected key is C major.
      await expect(keyField).toHaveValue('C major')

      // An accessible label is present.
      await expect(page.getByLabel('Key')).toHaveCount(1)

      // The seven derived pitch names are displayed for the currently
      // selected key (C major: C D E F G A B).
      const pitches = page.getByTestId('key-pitches')
      await expect(pitches).toBeVisible()
      await expect(pitches).toContainText('C')
      await expect(pitches).toContainText('D')
      await expect(pitches).toContainText('E')
      await expect(pitches).toContainText('F')
      await expect(pitches).toContainText('G')
      await expect(pitches).toContainText('A')
      await expect(pitches).toContainText('B')
    }),
  )

  test(
    'after submitting E-flat major the derived pitches show E-flat and B-flat (not A-sharp and D-sharp)',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Select E-flat major and submit the form to persist it.
      await page.getByTestId('key-field').selectOption('E-flat major')
      await page.getByTestId('setup-save-action').click()

      // The redirect lands back on /etude/setup (PRG 303).
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // After reload the derived pitches reflect the stored E-flat major.
      const pitches = page.getByTestId('key-pitches')
      await expect(pitches).toContainText('E-flat')
      await expect(pitches).toContainText('B-flat')
      await expect(pitches).not.toContainText('A-sharp')
      await expect(pitches).not.toContainText('D-sharp')
    }),
  )

  test(
    'after submitting F-sharp minor the derived pitches contain F-sharp and C-sharp',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Select F-sharp minor and submit the form to persist it.
      await page.getByTestId('key-field').selectOption('F-sharp minor')
      await page.getByTestId('setup-save-action').click()

      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      const pitches = page.getByTestId('key-pitches')
      await expect(pitches).toContainText('F-sharp')
      await expect(pitches).toContainText('C-sharp')
    }),
  )
})
