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
 * bypassing native HTML constraints. Returns the APIResponse so the caller
 * can assert on status and redirect behavior.
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
 * POST to the test-only seed-downstream-state route to simulate the notes and
 * split steps having been completed (those steps arrive in later slices).
 */
const seedDownstreamState = async (
  page: Page,
  body: Record<string, string> = {},
): Promise<APIResponse> => {
  return page.request.post(`${SERVER_BASE_URL}/test/etude/seed-downstream-state`, {
    multipart: {
      selectedPitches: 'C4,D4',
      selectedDurations: 'quarter,eighth',
      splitBoundary: 'D4',
      ...body,
    },
    maxRedirects: 0,
    failOnStatusCode: false,
    headers: { Origin: SERVER_BASE_URL },
  })
}

/**
 * GET the test-only aggregate-state inspection route. Returns the JSON
 * representation of the owner's aggregate including confirmation flags,
 * downstream data, workflowVersion, and the derived isReviewReachable flag.
 */
const getAggregateState = async (page: Page): Promise<Record<string, unknown>> => {
  const response = await page.request.get(`${SERVER_BASE_URL}/test/etude/aggregate-state`, {
    failOnStatusCode: false,
  })
  expect(response.status()).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

test.describe('Issue 11: upstream changes clear dependent downstream choices', () => {
  test(
    'changing the key clears pitches and split, retains durations, and makes review unreachable',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      // Create the default aggregate and land on the setup form.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Submit a valid setup with a non-default measure count so a write is
      // forced (the identical-resubmit short-circuit would skip the write if
      // all five fields matched the stored defaults, leaving setupConfirmed
      // false). Using measures=16 changes one field without invalidating any
      // downstream state (measure-count is not in the dependency map).
      const versionBefore = await page.getByTestId('workflow-version-field').inputValue()
      const response = await postSetupViaBrowser(page, {
        measures: '16',
        meter: '4/4',
        hands: 'right',
        key: 'C major',
        octaves: '4',
        workflowVersion: versionBefore,
      })
      expect(response.status()).toBe(303)

      // Seed downstream state (simulates the notes and split steps being completed).
      const seedResponse = await seedDownstreamState(page)
      expect(seedResponse.status()).toBe(303)

      // Verify the seeded state.
      const stateBefore = await getAggregateState(page)
      expect(stateBefore['notesConfirmed']).toBe(true)
      expect(stateBefore['splitConfirmed']).toBe(true)
      expect(stateBefore['selectedPitches']).toBe('C4,D4')
      expect(stateBefore['selectedDurations']).toBe('quarter,eighth')
      expect(stateBefore['splitBoundary']).toBe('D4')
      expect(stateBefore['isReviewReachable']).toBe(true)

      // Navigate to the setup form and capture the current version.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`)
      const currentVersion = await page.getByTestId('workflow-version-field').inputValue()

      // Change the key to G major, keeping everything else at the stored values.
      const changeResponse = await postSetupViaBrowser(page, {
        measures: '16',
        meter: '4/4',
        hands: 'right',
        key: 'G major',
        octaves: '4',
        workflowVersion: currentVersion,
      })
      expect(changeResponse.status()).toBe(303)

      // Inspect the aggregate after the key change.
      const stateAfter = await getAggregateState(page)
      expect(stateAfter['selectedPitches']).toBeNull()
      expect(stateAfter['splitBoundary']).toBeNull()
      expect(stateAfter['selectedDurations']).toBe('quarter,eighth')
      expect(stateAfter['notesConfirmed']).toBe(false)
      expect(stateAfter['splitConfirmed']).toBe(false)
      expect(stateAfter['isReviewReachable']).toBe(false)
      expect(Number(stateAfter['workflowVersion'])).toBe(Number(currentVersion) + 1)
    }),
  )

  test(
    'an identical setup resubmit retains all downstream state',
    testWithDatabase(async ({ page }) => {
      await navigateToHome(page)
      await signInUser(page, TEST_USERS.KNOWN_USER.email, TEST_USERS.KNOWN_USER.password)

      // Create the default aggregate and land on the setup form.
      await page.goto(ETUDE_PATH)
      expect(page.url()).toContain(ETUDE_SETUP_PATH)

      // Submit a valid setup with a non-default measure count to force a write
      // (so setupConfirmed becomes true). measures=16 changes one field without
      // invalidating any downstream state.
      const versionBefore = await page.getByTestId('workflow-version-field').inputValue()
      await postSetupViaBrowser(page, {
        measures: '16',
        meter: '4/4',
        hands: 'right',
        key: 'C major',
        octaves: '4',
        workflowVersion: versionBefore,
      })

      // Seed downstream state.
      await seedDownstreamState(page)

      // Navigate to setup and capture the current version.
      await page.goto(`${SERVER_BASE_URL}${ETUDE_SETUP_PATH}`)
      const currentVersion = await page.getByTestId('workflow-version-field').inputValue()

      // Resubmit the exact same stored values (measures=16, meter=4/4, etc.).
      const resubmitResponse = await postSetupViaBrowser(page, {
        measures: '16',
        meter: '4/4',
        hands: 'right',
        key: 'C major',
        octaves: '4',
        workflowVersion: currentVersion,
      })
      expect(resubmitResponse.status()).toBe(303)

      // Inspect the aggregate — all downstream state is retained.
      const stateAfter = await getAggregateState(page)
      expect(stateAfter['selectedPitches']).toBe('C4,D4')
      expect(stateAfter['selectedDurations']).toBe('quarter,eighth')
      expect(stateAfter['splitBoundary']).toBe('D4')
      expect(stateAfter['notesConfirmed']).toBe(true)
      expect(stateAfter['splitConfirmed']).toBe(true)
      expect(stateAfter['isReviewReachable']).toBe(true)
      expect(Number(stateAfter['workflowVersion'])).toBe(Number(currentVersion))
    }),
  )
})
