import { expect, test, type APIResponse, type Page } from '@playwright/test'

import { signInUser } from '../support/auth-helpers'
import { testWithDatabase } from '../support/test-helpers'
import { navigateToHome } from '../support/navigation-helpers'
import { TEST_USERS, SERVER_BASE_URL } from '../support/test-data'

const ETUDE_PATH = '/etude'
const ETUDE_SETUP_PATH = '/etude/setup'
const ETUDE_NOTES_PATH = '/etude/notes'
const ETUDE_SPLIT_PATH = '/etude/split'
const ETUDE_REVIEW_PATH = '/etude/review'

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
 * Submit a multipart POST to /etude/split using the authenticated browser
 * context.
 */
const postSplitViaBrowser = async (
  page: Page,
  body: Record<string, string>,
): Promise<APIResponse> => {
  return page.request.post(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`, {
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
 * request context.
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
 * Confirm the notes step by navigating to the notes page and clicking Save.
 */
const confirmNotes = async (page: Page): Promise<void> => {
  await page.goto(`${SERVER_BASE_URL}${ETUDE_NOTES_PATH}`)
  await page.getByTestId('notes-save-action').click()
  await page.waitForLoadState('networkidle')
}

/**
 * Confirm the split step by submitting a valid boundary via the browser
 * request context.
 */
const confirmSplit = async (page: Page, boundaryId: string): Promise<void> => {
  await page.goto(`${SERVER_BASE_URL}${ETUDE_SPLIT_PATH}`)
  const version = await page.getByTestId('workflow-version-field').inputValue()
  const response = await postSplitViaBrowser(page, {
    workflowVersion: version,
    boundary: boundaryId,
  })
  expect(response.status()).toBe(303)
}

test.describe('Issue 17: stub review step read-only summary and Back link', () => {
  test(
    'two-hand: the review step renders a read-only summary with the boundary and each hand pitch set',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'both' })
      await confirmNotes(page)
      await confirmSplit(page, 'D4|E4')

      // Navigate to the review step.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
      expect(page.url()).toContain(ETUDE_REVIEW_PATH)

      // The summary is present.
      const summary = page.getByTestId('etude-summary')
      await expect(summary).toBeVisible()

      // Setup answers.
      await expect(page.getByTestId('summary-measures')).toContainText('16')
      await expect(page.getByTestId('summary-meter')).toContainText('4/4')
      await expect(page.getByTestId('summary-key')).toContainText('C major')
      await expect(page.getByTestId('summary-hands')).toContainText('both')

      // Notes answers.
      await expect(page.getByTestId('summary-pitches')).toBeVisible()
      await expect(page.getByTestId('summary-durations')).toBeVisible()

      // Split boundary and hand pitch sets.
      await expect(page.getByTestId('summary-split-boundary')).toContainText('D4|E4')
      await expect(page.getByTestId('summary-left-hand-pitches')).toContainText('C4')
      await expect(page.getByTestId('summary-left-hand-pitches')).toContainText('D4')
      await expect(page.getByTestId('summary-right-hand-pitches')).toContainText('E4')

      // No editable form controls for any prior answer.
      const controls = summary.locator('input, select, textarea, button')
      await expect(controls).toHaveCount(0)
    }),
  )

  test(
    'two-hand: the Back link is an anchor issuing a GET to /etude/split',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'both' })
      await confirmNotes(page)
      await confirmSplit(page, 'C4|D4')

      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)

      const backLink = page.getByTestId('review-back-action')
      await expect(backLink).toBeVisible()
      await expect(backLink).toHaveAttribute('href', ETUDE_SPLIT_PATH)
      const tagName = await backLink.evaluate((el) => el.tagName.toLowerCase())
      expect(tagName).toBe('a')

      // Following it lands on the split step.
      await backLink.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain(ETUDE_SPLIT_PATH)
    }),
  )

  test(
    'one-hand: the review step renders a summary without the boundary and hand pitch sets',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'right' })
      await confirmNotes(page)

      // Navigate to the review step (one-hand skips split).
      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
      expect(page.url()).toContain(ETUDE_REVIEW_PATH)

      // The summary is present.
      const summary = page.getByTestId('etude-summary')
      await expect(summary).toBeVisible()

      // Setup and notes answers.
      await expect(page.getByTestId('summary-measures')).toContainText('16')
      await expect(page.getByTestId('summary-pitches')).toBeVisible()
      await expect(page.getByTestId('summary-durations')).toBeVisible()

      // No split boundary or hand pitch sets (no boundary applies).
      await expect(page.getByTestId('summary-split-boundary')).toHaveCount(0)
      await expect(page.getByTestId('summary-left-hand-pitches')).toHaveCount(0)
      await expect(page.getByTestId('summary-right-hand-pitches')).toHaveCount(0)
    }),
  )

  test(
    'one-hand: the Back link is an anchor issuing a GET to /etude/notes',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'right' })
      await confirmNotes(page)

      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)

      const backLink = page.getByTestId('review-back-action')
      await expect(backLink).toBeVisible()
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
    'a direct GET to /etude/review when prerequisites are unmet redirects to the canonical route',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Confirm setup but not notes.
      await confirmSetup(page, { hands: 'both' })

      // A direct GET to /etude/review redirects to the canonical route
      // (notes, because notes are unconfirmed).
      const response = await page.request.get(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      })
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_NOTES_PATH)
    }),
  )

  test(
    'the summary values match the saved state',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'both' })
      await confirmNotes(page)
      await confirmSplit(page, 'C4|D4')

      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)

      const state = await getAggregateState(page)
      // The stored boundary is reflected in the summary.
      expect(state['splitBoundary']).toBe('C4|D4')
      await expect(page.getByTestId('summary-split-boundary')).toContainText('C4|D4')
    }),
  )
})
