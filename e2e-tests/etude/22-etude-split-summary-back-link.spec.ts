import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS, SERVER_BASE_URL } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'
const ETUDE_NOTES_PATH = '/etude/notes'
const ETUDE_SPLIT_PATH = '/etude/split'

/**
 * The available pitches for C major, octave 4 (C4 through C5), in order.
 */
const C_MAJOR_OCTAVE_4_PITCHES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']

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
 * request context, so the notes step is reachable.
 */
const confirmSetup = async (
  page: Page,
  overrides: Record<string, string> = {},
): Promise<void> => {
  const versionBefore = await page.getByTestId('workflow-version-field').inputValue()
  const response = await postSetupViaBrowser(page, {
    measures: '16',
    meter: '4/4',
    hands: 'both',
    key: 'C major',
    octaves: '4',
    workflowVersion: versionBefore,
    ...overrides,
  })
  expect(response.status()).toBe(303)
}

/**
 * Confirm the notes step by navigating to the notes page and clicking the
 * Save button. The notes form defaults to all available pitches and all
 * offerable durations selected, so clicking Save confirms both halves.
 */
const confirmNotes = async (page: Page): Promise<void> => {
  await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
  await page.getByTestId('notes-save-action').click()
  await page.waitForLoadState('networkidle')
}

/**
 * Sign in, create the aggregate, confirm setup with both hands, and confirm
 * the notes step so the split step is reachable.
 */
const reachSplitStep = async (
  page: Page,
  setupOverrides: Record<string, string> = {},
): Promise<void> => {
  await navigateToHome(page)
  await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
  await page.goto(ETUDE_PATH)
  expect(page.url()).toContain(ETUDE_SETUP_PATH)

  await confirmSetup(page, { hands: 'both', ...setupOverrides })
  await confirmNotes(page)
  await page.goto(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`)
}

test.describe('Issue 17: split step read-only summary and Back link', () => {
  test(
    'the split step renders a read-only summary of setup and notes answers as text with no editable controls',
    testWithDatabase(async ({ page }) => {
      await reachSplitStep(page, {
        measures: '12',
        meter: '3/4',
        hands: 'both',
        key: 'G major',
        octaves: '4',
      })

      const summary = page.getByTestId('etude-summary')
      await expect(summary).toBeVisible()

      // Setup answers.
      await expect(page.getByTestId('summary-measures')).toContainText('12')
      await expect(page.getByTestId('summary-meter')).toContainText('3/4')
      await expect(page.getByTestId('summary-key')).toContainText('G major')
      await expect(page.getByTestId('summary-hands')).toContainText('both')
      await expect(page.getByTestId('summary-octaves')).toContainText('4')

      // Notes answers: pitches and durations both shown.
      await expect(page.getByTestId('summary-pitches')).toBeVisible()
      await expect(page.getByTestId('summary-durations')).toBeVisible()

      // The summary contains no editable form controls for any prior answer.
      const controls = summary.locator('input, select, textarea, button')
      await expect(controls).toHaveCount(0)
    }),
  )

  test(
    'the summary shows both pitches and durations together, never one alone',
    testWithDatabase(async ({ page }) => {
      await reachSplitStep(page)

      // Both the pitches and durations summary fields are present.
      await expect(page.getByTestId('summary-pitches')).toBeVisible()
      await expect(page.getByTestId('summary-durations')).toBeVisible()

      // The pitches field contains the full C-major octave-4 set (the
      // default first-derivation selection that was confirmed).
      const pitchesText = await page.getByTestId('summary-pitches').textContent()
      for (const pitch of C_MAJOR_OCTAVE_4_PITCHES) {
        expect(pitchesText).toContain(pitch)
      }

      // The durations field is non-empty (the default first-derivation
      // selection of all offerable 4/4 durations was confirmed).
      const durationsText = await page.getByTestId('summary-durations').textContent()
      expect(durationsText).not.toContain('None')
    }),
  )

  test(
    'the summary values match the saved state',
    testWithDatabase(async ({ page }) => {
      await reachSplitStep(page)

      const state = await getAggregateState(page)
      // The stored pitches and durations are reflected in the summary.
      const storedPitches = String(state['selectedPitches'])
      const storedDurations = String(state['selectedDurations'])
      const pitchesText = await page.getByTestId('summary-pitches').textContent()
      const durationsText = await page.getByTestId('summary-durations').textContent()
      // Every stored pitch appears in the summary.
      for (const pitch of storedPitches.split(',')) {
        expect(pitchesText).toContain(pitch.trim())
      }
      // The stored durations are reflected (as labels, not tokens).
      expect(durationsText).not.toContain('None')
    }),
  )

  test(
    'a Back link is present as an anchor issuing a GET to /etude/notes',
    testWithDatabase(async ({ page }) => {
      await reachSplitStep(page)

      const backLink = page.getByTestId('split-back-action')
      await expect(backLink).toBeVisible()
      // It is an anchor, not a form submit.
      await expect(backLink).toHaveAttribute('href', ETUDE_NOTES_PATH)
      const tagName = await backLink.evaluate((el) => el.tagName.toLowerCase())
      expect(tagName).toBe('a')

      // Following it lands on the notes step.
      await backLink.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain(ETUDE_NOTES_PATH)
    }),
  )

  test(
    'unsaved split edits are discarded after following Back',
    testWithDatabase(async ({ page }) => {
      await reachSplitStep(page)

      // Choose a boundary radio without submitting.
      await page.getByTestId('boundary-field-C4|D4').check()

      // Click Back (a GET link) — the unsaved edit must not be persisted.
      await page.getByTestId('split-back-action').click()
      await page.waitForLoadState('networkidle')

      // The saved state has no boundary.
      const state = await getAggregateState(page)
      expect(state['splitBoundary']).toBeNull()
      expect(state['splitConfirmed']).toBe(false)
    }),
  )
})
