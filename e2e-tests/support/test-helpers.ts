import { clearDatabase, clearRateLimitCache, clearSessions, seedDatabase } from './db-helpers'

/**
 * Wrapper type for Playwright test function
 */
type PlaywrightTestFunction = ({ page, request }: { page: any; request: any }) => Promise<void>
/**
 * Enhanced test wrapper that provides database isolation
 * Clears and seeds database before each test, cleans up after
 */
export const testWithDatabase = (testFn: PlaywrightTestFunction): PlaywrightTestFunction => {
  return async ({ page, request }) => {
    try {
      // Setup: Clear and seed database
      await clearDatabase(request)
      await seedDatabase(request)
      await clearSessions(request)
      await clearRateLimitCache(request)

      // Run the test
      await testFn({ page, request })
    } finally {
      // Cleanup: Clear database after test
      // Do not use the request fixture here — it may already be disposed.
      await clearDatabase()
    }
  }
}
