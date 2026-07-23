/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

interface TestRouteConfig {
  nodeEnv?: string
  enableTestRoutes?: string
  playwright?: string
}

const PRODUCTION_ENV = 'production'
const ENABLED_FLAG = 'true'
const PLAYWRIGHT_FLAG = '1'

/**
 * Determine whether test/debug routes should be enabled.
 */
export const isTestRouteEnabled = ({
  nodeEnv = 'development',
  enableTestRoutes = 'false',
  playwright = '0',
}: TestRouteConfig): boolean => {
  const isProduction = nodeEnv === PRODUCTION_ENV
  if (isProduction) {
    return false
  }

  return enableTestRoutes === ENABLED_FLAG || playwright === PLAYWRIGHT_FLAG
}
