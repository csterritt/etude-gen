/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Shared gated sign-up form component
 * @module components/gated-sign-up-form
 */
import { PATHS, UI_TEXT } from '../constants'

interface GatedSignUpFormProps {
  emailEntered?: string
  autoFocus?: boolean
}

/**
 * Reusable gated sign-up form with code, name, email, and password fields
 */
export const GatedSignUpForm = ({ emailEntered = '', autoFocus = true }: GatedSignUpFormProps) => {
  return (
    <form
      method='post'
      action={PATHS.AUTH.SIGN_UP}
      className='flex flex-col gap-4'
      aria-label='Gated sign up form'
      noValidate
    >
      <div className='form-control w-full'>
        <label className='label' htmlFor='gated-signup-code'>
          <span className='label-text'>Sign-up Code *</span>
        </label>
        <input
          id='gated-signup-code'
          name='code'
          type='text'
          placeholder='Enter your sign-up code'
          required
          autoFocus={autoFocus}
          className='input input-bordered w-full'
          data-testid='gated-signup-code-input'
          aria-label='Sign-up Code'
        />
      </div>

      <div className='form-control w-full'>
        <label className='label' htmlFor='gated-signup-name'>
          <span className='label-text'>Name *</span>
        </label>
        <input
          id='gated-signup-name'
          name='name'
          type='text'
          placeholder='Enter your name'
          required
          className='input input-bordered w-full'
          data-testid='gated-signup-name-input'
          aria-label='Name'
        />
      </div>

      <div className='form-control w-full'>
        <label className='label' htmlFor='gated-signup-email'>
          <span className='label-text'>Email *</span>
        </label>
        <input
          id='gated-signup-email'
          name='email'
          type='email'
          placeholder={UI_TEXT.ENTER_YOUR_EMAIL}
          required
          value={emailEntered}
          className='input input-bordered w-full'
          data-testid='gated-signup-email-input'
          aria-label='Email'
        />
      </div>

      <div className='form-control w-full'>
        <label className='label' htmlFor='gated-signup-password'>
          <span className='label-text'>Password *</span>
        </label>
        <input
          id='gated-signup-password'
          name='password'
          type='password'
          placeholder='Enter your password (min 8 characters)'
          required
          minLength={8}
          className='input input-bordered w-full'
          data-testid='gated-signup-password-input'
          aria-label='Password'
        />
      </div>

      <div className='card-actions justify-end mt-4'>
        <button type='submit' className='btn btn-primary w-full' data-testid='gated-signup-action'>
          Create Account
        </button>
      </div>
    </form>
  )
}
