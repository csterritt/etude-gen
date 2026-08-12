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
const ETUDE_GENERATE_PATH = '/etude/generate'

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

/**
 * Subset the aggregate state to the persisted fields the side-effect-free
 * invariant must hold over. Returns a JSON-serializable object suitable for
 * deep-equality comparison.
 */
const snapshotPersistedState = (
  state: Record<string, unknown>,
): Record<string, unknown> => ({
  workflowVersion: state['workflowVersion'],
  aggregateEpoch: state['aggregateEpoch'],
  selectedPitches: state['selectedPitches'],
  selectedDurations: state['selectedDurations'],
  splitBoundary: state['splitBoundary'],
  setupConfirmed: state['setupConfirmed'],
  notesConfirmed: state['notesConfirmed'],
  splitConfirmed: state['splitConfirmed'],
})

test.describe('Issue 19: full review step with Generate form', () => {
  test(
    'two-hand: the review page lists every configured value including the split boundary and each hand pitch set',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'both' })
      await confirmNotes(page)
      await confirmSplit(page, 'D4|E4')

      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
      expect(page.url()).toContain(ETUDE_REVIEW_PATH)

      // Setup answers.
      await expect(page.getByTestId('summary-measures')).toContainText('16')
      await expect(page.getByTestId('summary-meter')).toContainText('4/4')
      await expect(page.getByTestId('summary-key')).toContainText('C major')
      await expect(page.getByTestId('summary-hands')).toContainText('both')

      // Notes answers.
      await expect(page.getByTestId('summary-pitches')).toBeVisible()
      await expect(page.getByTestId('summary-durations')).toBeVisible()

      // Split boundary and each hand pitch set.
      await expect(page.getByTestId('summary-split-boundary')).toContainText('D4|E4')
      await expect(page.getByTestId('summary-left-hand-pitches')).toContainText('C4')
      await expect(page.getByTestId('summary-left-hand-pitches')).toContainText('D4')
      await expect(page.getByTestId('summary-right-hand-pitches')).toContainText('E4')

      // No editable form controls for any prior answer inside the summary.
      const summary = page.getByTestId('etude-summary')
      const controls = summary.locator('input, select, textarea, button')
      await expect(controls).toHaveCount(0)
    }),
  )

  test(
    'one-hand: the review page lists every configured value with no split information',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'right' })
      await confirmNotes(page)

      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
      expect(page.url()).toContain(ETUDE_REVIEW_PATH)

      // Setup and notes answers.
      await expect(page.getByTestId('summary-measures')).toContainText('16')
      await expect(page.getByTestId('summary-meter')).toContainText('4/4')
      await expect(page.getByTestId('summary-key')).toContainText('C major')
      await expect(page.getByTestId('summary-hands')).toContainText('right')
      await expect(page.getByTestId('summary-pitches')).toBeVisible()
      await expect(page.getByTestId('summary-durations')).toBeVisible()

      // No split boundary or hand pitch sets (no boundary applies).
      await expect(page.getByTestId('summary-split-boundary')).toHaveCount(0)
      await expect(page.getByTestId('summary-left-hand-pitches')).toHaveCount(0)
      await expect(page.getByTestId('summary-right-hand-pitches')).toHaveCount(0)
    }),
  )

  test(
    'the Generate control is a POST form to /etude/generate carrying the current workflow version, neither inert nor hidden',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'both' })
      await confirmNotes(page)
      await confirmSplit(page, 'C4|D4')

      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)

      const generateForm = page.getByTestId('etude-generate-form')
      await expect(generateForm).toBeVisible()
      await expect(generateForm).toHaveAttribute('method', 'post')
      await expect(generateForm).toHaveAttribute('action', ETUDE_GENERATE_PATH)

      // Hidden workflowVersion field carries the current aggregate version.
      const versionField = generateForm.getByTestId('workflow-version-field')
      await expect(versionField).toHaveAttribute('type', 'hidden')
      const state = await getAggregateState(page)
      await expect(versionField).toHaveValue(String(state['workflowVersion']))

      // Submit button is visible and not inert.
      const generateButton = generateForm.getByTestId('generate-action')
      await expect(generateButton).toBeVisible()
      await expect(generateButton).toBeEnabled()
      await expect(generateButton).not.toHaveAttribute('disabled', '')
      await expect(generateButton).not.toHaveAttribute('aria-disabled', 'true')
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

      await backLink.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain(ETUDE_SPLIT_PATH)
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

      await backLink.click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain(ETUDE_NOTES_PATH)
    }),
  )

  test(
    'an upstream change makes review unreachable until the affected downstream steps are completed again',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'both' })
      await confirmNotes(page)
      await confirmSplit(page, 'C4|D4')

      // Review is reachable.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
      expect(page.url()).toContain(ETUDE_REVIEW_PATH)

      // Upstream change: change the key on the setup step. This invalidates
      // the notes selection under Issue 11 (key change clears pitches and
      // unconfirms notes).
      await page.goto(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`)
      await confirmSetup(page, { hands: 'both', key: 'G major' })

      // A direct GET to /etude/review now redirects to the earliest
      // incomplete step (notes, because notes were unconfirmed by the key
      // change).
      const response = await page.request.get(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      })
      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_NOTES_PATH)

      // Re-complete the affected downstream steps. After the key change to
      // G major, the available pitches change (G4..G5), so the split boundary
      // must be one that is eligible for the new pitch set.
      await confirmNotes(page)
      await confirmSplit(page, 'G4|A4')

      // Review is reachable again.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
      expect(page.url()).toContain(ETUDE_REVIEW_PATH)
    }),
  )

  test(
    'loading GET /etude/review twice in succession leaves workflowVersion, aggregateEpoch, and every stored value byte-for-byte unchanged',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'both' })
      await confirmNotes(page)
      await confirmSplit(page, 'C4|D4')

      const before = snapshotPersistedState(await getAggregateState(page))

      // Two successive GETs.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)

      const after = snapshotPersistedState(await getAggregateState(page))
      expect(after).toEqual(before)
    }),
  )

  test(
    'a HEAD request to /etude/review changes nothing (prefetch-style safety)',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      await confirmSetup(page, { hands: 'both' })
      await confirmNotes(page)
      await confirmSplit(page, 'C4|D4')

      const before = snapshotPersistedState(await getAggregateState(page))

      // A HEAD request (prefetch-style). Playwright's request.fetch supports
      // method: 'HEAD'.
      const headResponse = await page.request.fetch(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`, {
        method: 'HEAD',
        maxRedirects: 0,
        failOnStatusCode: false,
      })
      // The route is registered as GET; Hono answers HEAD to a GET route
      // with the same headers and an empty body. We do not assert a specific
      // status — only that the request was made and that no state changed.
      expect(headResponse.status()).toBeLessThan(500)

      // A repeated prefetch-style GET also changes nothing.
      await page.request.get(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`, {
        maxRedirects: 0,
        failOnStatusCode: false,
      })

      const after = snapshotPersistedState(await getAggregateState(page))
      expect(after).toEqual(before)
    }),
  )
})
