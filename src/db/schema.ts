/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Database schema definition using Drizzle ORM
 * Updated to match better-auth requirements
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * User table schema definition (better-auth compatible)
 */
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

/**
 * Session table schema definition (better-auth compatible)
 */
export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

/**
 * Account table schema definition (for better-auth)
 * Stores authentication provider information and passwords
 */
export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', {
    mode: 'timestamp',
  }),
  scope: text('scope'),
  idToken: text('idToken'),
  password: text('password'), // For email/password auth
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
  // Dedicated rate-limit clocks, decoupled from updatedAt (which better-auth
  // also writes) and from each other.
  lastResetEmailAt: integer('lastResetEmailAt', { mode: 'timestamp' }),
  lastVerificationEmailAt: integer('lastVerificationEmailAt', { mode: 'timestamp' }),
})

/**
 * Verification table schema definition (for better-auth)
 * Used for email verification, password reset, etc.
 */
export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

export const singleUseCode = sqliteTable('singleUseCode', {
  code: text('code').primaryKey(),
  email: text('email'),
})

export const interestedEmail = sqliteTable('interestedEmail', {
  email: text('email').primaryKey().unique(),
})

/**
 * Etude parameter aggregate — one current workflow per owning student.
 *
 * The owner reference carries a database-level UNIQUE constraint so that
 * one aggregate per owner is enforced independently of any application-level
 * check. The FK cascades on user deletion so removing a user row removes
 * their etude parameter record. Physical columns are encapsulated behind
 * the EtudeParams repository interface; routes and tests must not depend on
 * them directly.
 *
 * `workflowVersion` is the compare-and-set token incremented by parameter-form
 * POSTs (setup/notes/split). `aggregateEpoch` is the monotonic token bumped by
 * Start Over and moved to a terminal value by account deletion; every
 * conditional write performed by an operation POST requires the epoch captured
 * at acquisition to still be current (cross-cutting contract section 4).
 *
 * Step completion is per-step confirmation: a step is confirmed by a successful
 * POST to it, not by having valid default values. A freshly created aggregate
 * has all three confirmation flags false, so the canonical route is
 * `/etude/setup` with defaults pre-populated but not pre-confirmed
 * (cross-cutting contract section 5).
 */
export const etudeParams = sqliteTable('etude_params', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  measureCount: integer('measureCount').notNull().default(8),
  timeSignature: text('timeSignature').notNull().default('4/4'),
  keySignature: text('keySignature').notNull().default('C major'),
  // Normalized ascending octave selection stored as a comma-separated string
  // (e.g. '2,3,4,5,6'). The default '4' matches the previous single-octave
  // default. The legacy `octaveRange` integer column is retained but unused.
  selectedOctaves: text('selectedOctaves').notNull().default('4'),
  octaveRange: integer('octaveRange').notNull().default(4),
  hand: text('hand').notNull().default('right'),
  workflowVersion: integer('workflowVersion').notNull().default(1),
  aggregateEpoch: integer('aggregateEpoch').notNull().default(1),
  setupConfirmed: integer('setupConfirmed', { mode: 'boolean' }).default(false).notNull(),
  notesConfirmed: integer('notesConfirmed', { mode: 'boolean' }).default(false).notNull(),
  splitConfirmed: integer('splitConfirmed', { mode: 'boolean' }).default(false).notNull(),
  // Downstream selection data written by the notes and split steps (Issues 13,
  // 14, 16). Nullable with no default because those steps arrive in later
  // slices — at this stage they are always null until a step (or a test) writes
  // them. Issue 11's dependent-downstream invalidation clears these to null in
  // the same committed transition as the upstream change.
  selectedPitches: text('selectedPitches'),
  selectedDurations: text('selectedDurations'),
  splitBoundary: text('splitBoundary'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

/**
 * Etude validation state — short-lived, single-use, owner-scoped records that
 * carry the safe redisplay values and field-level errors for an invalid form
 * submission between the POST (which rejects and stores) and the GET (which
 * consumes and redisplays).
 *
 * The `nonce` is an opaque, cryptographically random primary key set as an
 * HttpOnly cookie on the 303 redirect. The `payload` is a JSON blob holding
 * the field errors and safe redisplay values, already shaped by the
 * safe-redisplay module so no individual value can exceed its documented byte
 * bound. `expiresAt` is 5 minutes after `createdAt`; an expired record is
 * unusable and indistinguishable from an unknown one. The FK cascades on user
 * deletion so removing a user row removes their pending validation state.
 *
 * Physical columns are encapsulated behind the validation-state repository
 * interface; routes and tests must not depend on them directly.
 */
export const etudeValidationState = sqliteTable('etude_validation_state', {
  nonce: text('nonce').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  payload: text('payload').notNull(),
  expiresAt: integer('expiresAt').notNull(),
  createdAt: integer('createdAt').notNull(),
})

// Define schema object for export
export const schema = {
  user,
  session,
  account,
  verification,
  interestedEmail,
  singleUseCode,
  etudeParams,
  etudeValidationState,
}

export type User = typeof user.$inferSelect
export type Session = typeof session.$inferSelect
export type Account = typeof account.$inferSelect
export type Verification = typeof verification.$inferSelect
export type InterestedEmail = typeof interestedEmail.$inferSelect
export type SingleUseCode = typeof singleUseCode.$inferSelect

export type NewUser = typeof user.$inferInsert
export type NewSession = typeof session.$inferInsert
export type NewAccount = typeof account.$inferInsert
export type NewVerification = typeof verification.$inferInsert
export type NewInterestedEmail = typeof interestedEmail.$inferInsert
export type NewSingleUseCode = typeof singleUseCode.$inferInsert
export type EtudeParam = typeof etudeParams.$inferSelect
export type NewEtudeParam = typeof etudeParams.$inferInsert
export type EtudeValidationState = typeof etudeValidationState.$inferSelect
export type NewEtudeValidationState = typeof etudeValidationState.$inferInsert
