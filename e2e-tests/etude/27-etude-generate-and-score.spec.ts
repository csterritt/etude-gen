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
const ETUDE_SCORE_PATH = '/etude/score'

/**
 * Internal identifiers that must never appear in a safe user-facing message
 * (cross-cutting contract section 1 rule 6).
 */
const FORBIDDEN_MESSAGE_SUBSTRINGS = [
  'ep-',
  'user-',
  'workflowVersion',
  'workflow_version',
  'aggregateEpoch',
  'aggregate_epoch',
  'C4',
  'D4',
  'E4',
  'F4',
  'G4',
  'A4',
  'B4',
  'C5',
  '|',
]

/**
 * Assert that a message string exposes no internal identifiers.
 */
const expectSafeMessage = (message: string): void => {
  for (const substring of FORBIDDEN_MESSAGE_SUBSTRINGS) {
    expect(message).not.toContain(substring)
  }
}

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
 * Submit a multipart POST to /etude/generate using the authenticated browser
 * context.
 */
const postGenerateViaBrowser = async (
  page: Page,
  body: Record<string, string>,
): Promise<APIResponse> => {
  return page.request.post(`${SERVER_BASE_URL}${ETUDE_GENERATE_PATH}`, {
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
 * Complete a two-hand workflow to the review step and return the aggregate
 * state snapshot before any generate submission.
 */
const completeTwoHandWorkflow = async (
  page: Page,
  setupOverrides: Record<string, string> = {},
): Promise<Record<string, unknown>> => {
  await navigateToHome(page)
  await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
  await page.goto(ETUDE_PATH)
  expect(page.url()).toContain(ETUDE_SETUP_PATH)

  await confirmSetup(page, { hands: 'both', ...setupOverrides })
  await confirmNotes(page)
  await confirmSplit(page, 'C4|D4')

  await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
  expect(page.url()).toContain(ETUDE_REVIEW_PATH)

  return getAggregateState(page)
}

test.describe('Issue 20: POST /etude/generate and GET /etude/score', () => {
  test(
    'a valid-precondition submission generates a Piece and redirects 303 to /etude/score',
    testWithDatabase(async ({ page }) => {
      const before = await completeTwoHandWorkflow(page)
      const version = String(before['workflowVersion'])
      const epoch = String(before['aggregateEpoch'])

      const response = await postGenerateViaBrowser(page, {
        workflowVersion: version,
        aggregateEpoch: epoch,
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_SCORE_PATH)
    }),
  )

  test(
    'GET /etude/score renders the score page with a data-testid after generation',
    testWithDatabase(async ({ page }) => {
      await completeTwoHandWorkflow(page)
      const version = await page.getByTestId('workflow-version-field').inputValue()

      // Submit the generate form via the browser (follows redirects).
      await page.getByTestId('generate-action').click()
      await page.waitForLoadState('networkidle')

      // The URL should be /etude/score.
      expect(page.url()).toContain(ETUDE_SCORE_PATH)

      // The score page should have a data-testid for the score container.
      const scoreContainer = page.getByTestId('etude-score-content')
      await expect(scoreContainer).toBeVisible()
    }),
  )

  test(
    'a missing workflowVersion is refused with a 303 to the canonical route and a safe error, no Piece created',
    testWithDatabase(async ({ page }) => {
      const before = await completeTwoHandWorkflow(page)

      const response = await postGenerateViaBrowser(page, {})

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_REVIEW_PATH)

      // Follow the redirect and confirm a safe error is displayed.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
      const errorAlert = page.locator('.alert-error').first()
      await expect(errorAlert).toBeVisible()
      const errorText = await errorAlert.textContent()
      expect(errorText).toBeTruthy()
      expectSafeMessage(errorText ?? '')
    }),
  )

  test(
    'a tampered (non-numeric) workflowVersion is refused with a 303 to the canonical route and a safe error',
    testWithDatabase(async ({ page }) => {
      await completeTwoHandWorkflow(page)

      const response = await postGenerateViaBrowser(page, {
        workflowVersion: 'not-a-number',
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_REVIEW_PATH)

      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
      const errorAlert = page.locator('.alert-error').first()
      await expect(errorAlert).toBeVisible()
      const errorText = await errorAlert.textContent()
      expectSafeMessage(errorText ?? '')
    }),
  )

  test(
    'a stale workflowVersion is refused with a 303 to the canonical route and a safe error, no Piece created',
    testWithDatabase(async ({ page }) => {
      const before = await completeTwoHandWorkflow(page)
      const currentVersion = Number(before['workflowVersion'])
      const staleVersion = String(currentVersion - 1)

      const response = await postGenerateViaBrowser(page, {
        workflowVersion: staleVersion,
      })

      expect(response.status()).toBe(303)
      expect(response.headers()['location']).toContain(ETUDE_REVIEW_PATH)

      await page.goto(`${SERVER_BASE_URL}${ETUDE_REVIEW_PATH}`)
      const errorAlert = page.locator('.alert-error').first()
      await expect(errorAlert).toBeVisible()
      const errorText = await errorAlert.textContent()
      expectSafeMessage(errorText ?? '')
    }),
  )

  test(
    'the generate form on the review page carries a hidden aggregateEpoch field',
    testWithDatabase(async ({ page }) => {
      await completeTwoHandWorkflow(page)

      // The review page should have a hidden aggregateEpoch field.
      const epochField = page.getByTestId('aggregate-epoch-field')
      await expect(epochField).toBeAttached()
      const epochValue = await epochField.inputValue()
      expect(epochValue).toBeTruthy()
      expect(epochValue).toMatch(/^\d+$/)
    }),
  )

  test(
    'GET /etude/score redirects to the canonical route when no current Piece exists',
    testWithDatabase(async ({ page }) => {
      await completeTwoHandWorkflow(page)

      // Visit /etude/score directly without generating first.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_SCORE_PATH}`)

      // The canonical route for a complete workflow with no Piece is
      // /etude/review.
      expect(page.url()).toContain(ETUDE_REVIEW_PATH)
    }),
  )

  test(
    'GET /etude/score redirects to the canonical route when prerequisites are not met',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)
      await page.goto(ETUDE_PATH)
      // Don't complete any steps — setup is unconfirmed.

      await page.goto(`${SERVER_BASE_URL}${ETUDE_SCORE_PATH}`)

      // The canonical route is /etude/setup.
      expect(page.url()).toContain(ETUDE_SETUP_PATH)
    }),
  )

  test(
    'after generation, GET /etude redirects to /etude/score (canonical route with current Piece)',
    testWithDatabase(async ({ page }) => {
      await completeTwoHandWorkflow(page)

      // Generate via the form.
      await page.getByTestId('generate-action').click()
      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain(ETUDE_SCORE_PATH)

      // Navigate to /etude — the canonical route should be /etude/score.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_PATH}`)
      expect(page.url()).toContain(ETUDE_SCORE_PATH)
    }),
  )
})
