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
 * bypassing native HTML constraints. The `octaves` field is repeated to
 * exercise the multi-value parser path. Returns the APIResponse so the
 * caller can assert on status and redirect behavior.
 */
const postSetupWithOctavesViaBrowser = async (
  page: Page,
  body: Record<string, string>,
  octaves: string[],
): Promise<APIResponse> => {
  const multipart: Record<string, string> = { ...body }
  // Playwright's multipart option takes a flat record; repeated keys are
  // expressed by appending the same field name multiple times via the
  // `multipart` array form. We build the multipart object with the first
  // octave and rely on the browser fetch path for the multi-value cases
  // that need true repetition.
  if (octaves.length > 0) {
    multipart.octaves = octaves[0]!
  }
  return page.request.post(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`, {
    multipart,
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
}

/**
 * Submit a multipart POST with a truly repeated `octaves` field using the
 * browser's fetch with redirect:'manual'. Returns the response type
 * ('opaqueredirect' confirms a 303 was issued).
 */
const postRepeatedOctavesViaFetch = async (
  page: Page,
  baseBody: Record<string, string>,
  octaves: string[],
): Promise<string> => {
  return page.evaluate(
    async ([body, octs]: [Record<string, string>, string[]]) => {
      const fd = new FormData()
      for (const [k, v] of Object.entries(body)) {
        fd.append(k, v)
      }
      for (const o of octs) {
        fd.append('octaves', o)
      }
      const res = await fetch('/etude/setup', {
        method: 'POST',
        body: fd,
        redirect: 'manual',
      })
      return res.type
    },
    [baseBody, octaves] as [Record<string, string>, string[]],
  )
}

test.describe('POST /etude/setup octave submission', () => {
  test(
    'a valid octave submission (2, 4, 6) redirects 303 to /etude/setup and the form re-displays with those octaves checked',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      const redirectType = await postRepeatedOctavesViaFetch(
        page,
        { measures: '8', meter: '4/4', hands: 'right', key: 'C major', workflowVersion: '1' },
        ['2', '4', '6'],
      )
      expect(redirectType).toBe('opaqueredirect')

      // Follow the redirect and confirm the octaves are checked.
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('octaves-field').nth(0)).toBeChecked() // octave 2
      await expect(page.getByTestId('octaves-field').nth(1)).not.toBeChecked() // octave 3
      await expect(page.getByTestId('octaves-field').nth(2)).toBeChecked() // octave 4
      await expect(page.getByTestId('octaves-field').nth(3)).not.toBeChecked() // octave 5
      await expect(page.getByTestId('octaves-field').nth(4)).toBeChecked() // octave 6
    }),
  )

  test(
    'an out-of-range octave (7) submitted bypassing native constraints is rejected with a 303 redirect and no persistence',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const redirectType = await postRepeatedOctavesViaFetch(
        page,
        { measures: '8', meter: '4/4', hands: 'right', key: 'C major', workflowVersion: '1' },
        ['7'],
      )
      expect(redirectType).toBe('opaqueredirect')

      // The stored octaves are unchanged (still the default octave 4).
      // Clear the nonce cookie so the validation state is not redisplayed.
      await page.context().clearCookies({ name: 'VALIDATION_STATE_NONCE' })
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('octaves-field').nth(2)).toBeChecked() // octave 4
      await expect(page.getByTestId('octaves-field').nth(4)).not.toBeChecked() // octave 6
    }),
  )

  test(
    'an empty octave submission (no octaves field at all) is rejected with a 303 redirect and no persistence',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      const response = await postSetupWithOctavesViaBrowser(
        page,
        { measures: '8', meter: '4/4', hands: 'right', key: 'C major', workflowVersion: '1' },
        [],
      )
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SETUP_PATH)

      // The stored octaves are unchanged (still the default octave 4).
      // Clear the nonce cookie so the validation state is not redisplayed.
      await page.context().clearCookies({ name: 'VALIDATION_STATE_NONCE' })
      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('octaves-field').nth(2)).toBeChecked()
    }),
  )

  test(
    'arbitrary-order and duplicate octaves are normalized to the same stored selection',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)

      // Submit duplicates and out-of-order: 5, 2, 5, 3, 2. The validator
      // should normalize to [2, 3, 5].
      const redirectType = await postRepeatedOctavesViaFetch(
        page,
        { measures: '8', meter: '4/4', hands: 'right', key: 'C major', workflowVersion: '1' },
        ['5', '2', '5', '3', '2'],
      )
      expect(redirectType).toBe('opaqueredirect')

      await page.goto(ETUDE_SETUP_PATH)
      await expect(page.getByTestId('octaves-field').nth(0)).toBeChecked() // octave 2
      await expect(page.getByTestId('octaves-field').nth(1)).toBeChecked() // octave 3
      await expect(page.getByTestId('octaves-field').nth(2)).not.toBeChecked() // octave 4
      await expect(page.getByTestId('octaves-field').nth(3)).toBeChecked() // octave 5
      await expect(page.getByTestId('octaves-field').nth(4)).not.toBeChecked() // octave 6
    }),
  )

  test(
    'changing only the octaves (from 4 to 2,3,4,5,6) increments the workflow version',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      const initialVersion = await page.getByTestId('workflow-version-field').inputValue()

      const redirectType = await postRepeatedOctavesViaFetch(
        page,
        { measures: '8', meter: '4/4', hands: 'right', key: 'C major', workflowVersion: initialVersion },
        ['2', '3', '4', '5', '6'],
      )
      expect(redirectType).toBe('opaqueredirect')

      await page.goto(ETUDE_SETUP_PATH)
      const afterVersion = await page.getByTestId('workflow-version-field').inputValue()
      expect(Number(afterVersion)).toBe(Number(initialVersion) + 1)
    }),
  )

  test(
    'resubmitting the identical values (including the same octaves) does not increment the workflow version',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      const initialVersion = await page.getByTestId('workflow-version-field').inputValue()

      // Resubmit the exact stored default values (octave 4 only).
      const redirectType = await postRepeatedOctavesViaFetch(
        page,
        { measures: '8', meter: '4/4', hands: 'right', key: 'C major', workflowVersion: initialVersion },
        ['4'],
      )
      expect(redirectType).toBe('opaqueredirect')

      await page.goto(ETUDE_SETUP_PATH)
      const afterVersion = await page.getByTestId('workflow-version-field').inputValue()
      expect(Number(afterVersion)).toBe(Number(initialVersion))
    }),
  )
})
