/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Provides a layout wrapper for TSX content.
 * @module routes/buildLayout
 */
import { Context } from 'hono'
import type { HtmlEscapedString } from 'hono/utils/html'

import { removeCookie, retrieveCookie } from '../lib/cookie-support'
import { PATHS, COOKIES } from '../constants'
import { version } from '../version'

/**
 * Wraps children in a standard layout.
 * @returns TSX element with layout
 * @param c - Hono context
 * @param children - TSX children
 * @param extraMessage - Optional extra message to display
 */
export const useLayout = (
  c: Context,
  children: HtmlEscapedString | Promise<HtmlEscapedString>,
  extraMessage?: string,
) => {
  // Get message and error cookies
  const message = retrieveCookie(c, COOKIES.MESSAGE_FOUND) || extraMessage
  if (message) {
    removeCookie(c, COOKIES.MESSAGE_FOUND)
  }
  const error = retrieveCookie(c, COOKIES.ERROR_FOUND)
  if (error) {
    removeCookie(c, COOKIES.ERROR_FOUND)
  }

  // Set content type header
  c.header('Content-Type', 'text/html; charset=utf-8')

  return (
    <div className='min-h-screen flex flex-col'>
      {/* Responsive navbar */}
      <div className='navbar bg-base-100 shadow-lg'>
        <div className='navbar-start'>
          <a href={PATHS.ROOT} className='btn btn-ghost text-xl'>
            Worker, D1, Drizzle Demo
          </a>
        </div>
        <div className='navbar-end flex items-center'>
          {!c.get('user') && (
            <a href={PATHS.AUTH.SIGN_IN} className='btn btn-primary' data-testid='sign-in-action'>
              Sign in
            </a>
          )}

          {c.get('user') && (
            <div className='flex items-center gap-4'>
              <span className='text-sm'>
                Welcome, {c.get('user')?.name || c.get('user')?.email || 'User'}!
              </span>
              <a
                href={PATHS.PROFILE}
                className='btn btn-outline btn-sm'
                data-testid='visit-profile-action'
              >
                Profile
              </a>
              <form method='post' action='/auth/sign-out'>
                <button
                  type='submit'
                  className='btn btn-outline btn-sm'
                  data-testid='sign-out-action'
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* Alert messages */}
      {message && (
        <div className='alert alert-success mx-auto mt-4' role='alert'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='h-6 w-6 shrink-0 stroke-current'
            fill='none'
            viewBox='0 0 24 24'
          >
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
            />
          </svg>
          <span className='align-middle'>{message}</span>
        </div>
      )}

      {error && (
        <div className='alert alert-error mx-auto mt-4' role='alert'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='h-6 w-6 shrink-0 stroke-current'
            fill='none'
            viewBox='0 0 24 24'
          >
            <path
              stroke-linecap='round'
              stroke-linejoin='round'
              stroke-width='2'
              d='M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z'
            />
          </svg>
          <span className='align-middle'>{error}</span>
        </div>
      )}

      {/* Main content */}
      <main className='flex-1 container mx-auto px-4 py-8'>{children}</main>

      {/* Footer */}
      <footer className='footer footer-center p-4 bg-base-300 text-base-content'>
        <div>
          <p>Copyright &copy; 2025 V-{version}</p>
        </div>
      </footer>
    </div>
  )
}
