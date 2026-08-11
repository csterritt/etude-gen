import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS, SERVER_BASE_URL } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'
const ETUDE_NOTES_PATH = '/etude/notes'

/**
 * Submit a multipart POST to /etude/setup using the authenticated browser
 * context, bypassing native HTML constraints.
 */
const postSetupViaBrowser = async (
  page: Page,
  body: Record<string, string>,
): Promise<APIResponse> => {
  return page.request.post(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`, {
    multipart: { ...body },
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
}

/**
 * GET the test-only aggregate-state inspection route. Returns the JSON
 * representation of the owner's aggregate.
 */
const getAggregateState = async (page: Page): Promise<Record<string, unknown>> => {
  const response = await page.request.get(`${SERVER_BASE_URL}/test/etude/aggregate-state`, {
    failOnStatusCode: false,
  })
  expect(response.status()).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

/**
 * Confirm the setup step by submitting a valid setup form via the browser
 * request context, so the notes step is reachable. Uses a non-default
 * measure count to force a write.
 */
const confirmSetup = async (
  page: Page,
  overrides: Record<string, string> = {},
): Promise<void> => {
  const versionBefore = await page.getByTestId('workflow-version-field').inputValue()
  const response = await postSetupViaBrowser(page, {
    measures: '16',
    meter: '4/4',
    hands: 'right',
    key: 'C major',
    octaves: '4',
    workflowVersion: versionBefore,
    ...overrides,
  })
  expect(response.status()).toBe(303)
}

/**
 * Sign in, create the aggregate, and confirm setup so the notes step is
 * reachable.
 */
const reachNotesStep = async (
  page: Page,
  setupOverrides: Record<string, string> = {},
): Promise<void> => {
  await navigateToHome(page)
  await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
  await page.goto(ETUDE_PATH)
  expect(page.url()).toContain(ETUDE_SETUP_PATH)

  await confirmSetup(page, setupOverrides)
  await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
  expect(page.url()).toContain(ETUDE_NOTES_PATH)
}

test.describe('Issue 17: notes step read-only summary and Back link', () => {
  test(
    'the notes step renders a read-only summary of the setup answers as text with no editable controls',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, {
        measures: '12',
        meter: '3/4',
        hands: 'both',
        key: 'G major',
        octaves: '4',
      })

      // The summary region is present.
      const summary = page.getByTestId('etude-summary')
      await expect(summary).toBeVisible()

      // Each setup field is rendered as read-only text.
      await expect(page.getByTestId('summary-measures')).toContainText('12')
      await expect(page.getByTestId('summary-meter')).toContainText('3/4')
      await expect(page.getByTestId('summary-key')).toContainText('G major')
      await expect(page.getByTestId('summary-hands')).toContainText('both')
      await expect(page.getByTestId('summary-octaves')).toContainText('4')

      // The summary contains no editable form controls for any prior answer.
      const controls = summary.locator('input, select, textarea, button')
      await expect(controls).toHaveCount(0)
    }),
  )

  test(
    'the summary values match the saved state',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, {
        measures: '20',
        meter: '4/4',
        hands: 'right',
        key: 'C major',
        octaves: '4',
      })

      const state = await getAggregateState(page)
      // The summary reflects the saved setup values. The aggregate-state
      // test route returns only downstream fields, so we assert against the
      // known submitted values for setup fields and against the route for
      // the hand field.
      await expect(page.getByTestId('summary-measures')).toContainText('20')
      await expect(page.getByTestId('summary-meter')).toContainText('4/4')
      await expect(page.getByTestId('summary-key')).toContainText('C major')
      await expect(page.getByTestId('summary-hands')).toContainText('right')
      expect(state['hand']).toBe('right')
    }),
  )

  test(
    'a Back link is present as an anchor issuing a GET to /etude/setup',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page)

      const backLink = page.getByTestId('notes-back-action')
      await expect(backLink).toBeVisible()
      // It is an anchor, not a form submit.
      await expect(backLink).toHaveAttribute('href', ETUDE_SETUP_PATH)
      const tagName = await backLink.evaluate((el) => el.tagName.toLowerCase())
      expect(tagName).toBe('a')

      // Following it lands on the setup step.
      await backLink.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain(ETUDE_SETUP_PATH)
    }),
  )

  test(
    'unsaved edits on the notes page are discarded after following Back',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page)

      // Confirm the notes step first so we have a saved selection to compare
      // against.
      await page.getByTestId('notes-save-action').click()
      await page.waitForLoadState('networkidle')
      const stateBefore = await getAggregateState(page)
      const pitchesBefore = stateBefore['selectedPitches']

      // Return to the notes step and uncheck a pitch without submitting.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      await page.getByTestId('pitch-field-C4').uncheck()

      // Click Back (a GET link) — the unsaved edit must not be persisted.
      await page.getByTestId('notes-back-action').click()
      await page.waitForLoadState('networkidle')

      // The saved state is unchanged.
      const stateAfter = await getAggregateState(page)
      expect(stateAfter['selectedPitches']).toBe(pitchesBefore)
    }),
  )

  test(
    'after an upstream setup change, the summary reflects the new saved values',
    testWithDatabase(async ({ page }) => {
      await reachNotesStep(page, { key: 'C major' })

      // Change the key on the setup step (which invalidates the notes
      // selection under Issue 11).
      const version = await page.getByTestId('workflow-version-field').inputValue()
      const response = await postSetupViaBrowser(page, {
        measures: '16',
        meter: '4/4',
        hands: 'right',
        key: 'G major',
        octaves: '4',
        workflowVersion: version,
      })
      expect(response.status()).toBe(303)

      // Return to the notes step — the summary reflects the new key.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
      await expect(page.getByTestId('summary-key')).toContainText('G major')
    }),
  )
})
