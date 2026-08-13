# Issue 20: Generate immutable Piece, persist, and redirect to stable score

*2026-08-13T00:00:00Z*
<!-- showboat-id: issue-020-generate-immutable-piece-persistence -->

Issue 20 replaces the Issue 19 generate stub with real Piece generation and a stable score route. The student submits the Generate form on the review page; the server generates an immutable, presentation-independent Piece, persists it, and redirects to `/etude/score` — a stable URL that re-renders the same Piece on every visit. No random seed is persisted; the generator accepts an injectable random source and validated settings only.

## 1. Two new D1 tables in src/db/schema.ts

```bash
sed -n '171,253p' /home/chris/etude-gen/src/db/schema.ts
```

```output
/**
 * Etude current-Piece record — one current immutable Piece per owning student.
 *
 * Holds the immutable Piece JSON and render metadata. The Piece JSON is the
 * single authority for the music: no seed or RNG state is stored (PRD "Piece
 * model and generation"). `pieceId` is the server-generated UUID carried
 * inside the Piece JSON, duplicated as a column so the `etude-<piece-short-id>`
 * filename and owner-scoped lookups do not require parsing the JSON.
 * `sourceParameterVersion` is the workflow version the Piece was generated
 * from, duplicated as a column so the staleness check
 * (`sourceParameterVersion === params.workflowVersion`) is efficient.
 *
 * The render-metadata columns (`svgArtifactKey`, `renderState`,
 * `renderErrorCategory`, `lilypondVersion`) are nullable and unused in Issue 20;
 * Issue 30 populates them. They live here rather than in a separate table so
 * the current-Piece record is the single row describing the current Piece's
 * lifecycle.
 *
 * The owner reference carries a database-level UNIQUE constraint so that one
 * current Piece per owner is enforced independently of any application-level
 * check. The FK cascades on user deletion. Physical columns are encapsulated
 * behind the Etude Repository interface; routes and tests must not depend on
 * them directly.
 */
export const etudePiece = sqliteTable('etude_piece', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  pieceId: text('pieceId').notNull(),
  pieceJson: text('pieceJson').notNull(),
  sourceParameterVersion: integer('sourceParameterVersion').notNull(),
  // Render metadata — nullable and unused in Issue 20; Issue 30 populates them.
  svgArtifactKey: text('svgArtifactKey'),
  renderState: text('renderState'),
  renderErrorCategory: text('renderErrorCategory'),
  lilypondVersion: text('lilypondVersion'),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})

/**
 * Etude operation record — one per owning student.
 *
 * Holds the generation/render lock, the PDF lock, the independent success
 * cooldown timestamps, and the temporary PDF grant. The generation/render lock
 * and the PDF lock are separate locks with separate owner identifiers,
 * acquisition times, and expiry (PRD "Data and concurrency"). The cooldown
 * timestamps enforce the post-success cooldowns. The PDF grant columns carry
 * the opaque grant identifier, expiry, and consumption timestamp.
 *
 * All columns are nullable and unused in Issue 20; Issues 33–37 populate them.
 * The table is created here to avoid a second migration. The owner reference
 * carries a database-level UNIQUE constraint so that one operation record per
 * owner is enforced. The FK cascades on user deletion. Physical columns are
 * encapsulated behind the Etude Repository interface; routes and tests must
 * not depend on them directly.
 */
export const etudeOperation = sqliteTable('etude_operation', {
  id: text('id').primaryKey(),
  userId: text('userId')
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Generation/render in-flight lock (Issue 33).
  generationLockOwner: text('generationLockOwner'),
  generationLockAcquiredAt: integer('generationLockAcquiredAt', { mode: 'timestamp' }),
  generationLockExpiresAt: integer('generationLockExpiresAt', { mode: 'timestamp' }),
  // PDF in-flight lock (Issue 35, separate from the generation/render lock).
  pdfLockOwner: text('pdfLockOwner'),
  pdfLockAcquiredAt: integer('pdfLockAcquiredAt', { mode: 'timestamp' }),
  pdfLockExpiresAt: integer('pdfLockExpiresAt', { mode: 'timestamp' }),
  // Independent success cooldown timestamps (Issues 34, 37).
  generationCooldownAt: integer('generationCooldownAt', { mode: 'timestamp' }),
  pdfCooldownAt: integer('pdfCooldownAt', { mode: 'timestamp' }),
  // Temporary PDF grant (Issues 35–36).
  pdfGrantId: text('pdfGrantId'),
  pdfGrantExpiresAt: integer('pdfGrantExpiresAt', { mode: 'timestamp' }),
  pdfGrantConsumedAt: integer('pdfGrantConsumedAt', { mode: 'timestamp' }),
  createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
})
```

The migration `drizzle/0004_busy_titanium_man.sql` creates both tables with their UNIQUE indexes on `userId`:

```bash
cat /home/chris/etude-gen/drizzle/0004_busy_titanium_man.sql
```

```output
CREATE TABLE `etude_operation` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`generationLockOwner` text,
	`generationLockAcquiredAt` integer,
	`generationLockExpiresAt` integer,
	`pdfLockOwner` text,
	`pdfLockAcquiredAt` integer,
	`pdfLockExpiresAt` integer,
	`generationCooldownAt` integer,
	`pdfCooldownAt` integer,
	`pdfGrantId` text,
	`pdfGrantExpiresAt` integer,
	`pdfGrantConsumedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `etude_operation_userId_unique` ON `etude_operation` (`userId`);--> statement-breakpoint
CREATE TABLE `etude_piece` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`pieceId` text NOT NULL,
	`pieceJson` text NOT NULL,
	`sourceParameterVersion` integer NOT NULL,
	`svgArtifactKey` text,
	`renderState` text,
	`renderErrorCategory` text,
	`lilypondVersion` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `etude_piece_userId_unique` ON `etude_piece` (`userId`);
```

## 2. The Piece Generator in src/lib/piece-generator.ts

```bash
sed -n '35,124p' /home/chris/etude-gen/src/lib/piece-generator.ts
```

```output
/**
 * A supported duration token (whole, half, dotted half, quarter, dotted
 * quarter, eighth). Fixed by Issue 12 and shared with the rhythm catalog.
 */
export type Duration = 'W' | 'H' | 'D' | 'Q' | 'R' | 'E'

/**
 * A pitched note event: a duration plus a pitch name. The `rest` discriminant
 * is `false` so a consumer can distinguish pitched events from rest events
 * (Issue 23) via a single field.
 */
export interface PitchedEvent {
  readonly duration: Duration
  readonly pitch: string
  readonly rest: false
}

/**
 * A rest event: a duration with no pitch. Issue 23 populates these; Issue 20
 * produces none, but the contract shape is fixed here.
 */
export interface RestEvent {
  readonly duration: Duration
  readonly rest: true
}

/**
 * A single note event in a hand's array: either pitched or a rest.
 */
export type NoteEvent = PitchedEvent | RestEvent

/**
 * A measure: right-hand and left-hand note arrays. The unused hand's array is
 * empty in every measure for a one-hand Piece.
 */
export interface Measure {
  readonly rightHand: readonly NoteEvent[]
  readonly leftHand: readonly NoteEvent[]
}

/**
 * The immutable, JSON-serializable, self-contained Piece contract. This is the
 * stable contract owned by Issue 20; later issues extend generation behavior
 * but do not change this shape.
 */
export interface Piece {
  /** Server-generated UUID identifying this Piece. */
  readonly pieceId: string
  /** The key signature string (e.g. "C major"). */
  readonly key: string
  /** The time signature string (e.g. "4/4"). */
  readonly timeSignature: string
  /** Which hands are used: "left", "right", or "both". */
  readonly hand: 'left' | 'right' | 'both'
  /** The workflow version this Piece was generated from. */
  readonly sourceParameterVersion: number
  /** The ordered array of measures. */
  readonly measures: readonly Measure[]
}

/**
 * Validated, immutable generation settings. The generator accepts these only —
 * never raw form input. The pitch sets are already split into right and left
 * hand by the caller (the Workflow Service), using the split boundary for
 * two-hand mode. For a one-hand mode the unused hand's pitch set is empty.
 */
export interface GenerationSettings {
  readonly measureCount: number
  readonly timeSignature: string
  readonly key: string
  readonly hand: 'left' | 'right' | 'both'
  /** Pitches assigned to the right hand. Empty when the right hand is unused. */
  readonly rightHandPitches: readonly string[]
  /** Pitches assigned to the left hand. Empty when the left hand is unused. */
  readonly leftHandPitches: readonly string[]
  /** Selected duration tokens; rhythms are eligible when every token is selected. */
  readonly selectedDurations: readonly string[]
  /** The workflow version to record as `sourceParameterVersion`. */
  readonly sourceParameterVersion: number
}

/**
 * An injectable random-number source. The generator uses `nextInt(n)` to pick
 * a uniform index in `[0, n)`. Tests inject a deterministic source; production
 * injects a non-seeded source. No seed is persisted or returned.
 */
export interface RandomSource {
  readonly nextInt: (maxExclusive: number) => number
}

/**
 * Typed invariant failure returned by `generatePiece`. The caller (the Workflow
 * Service) maps these to safe user-facing messages; the generator never
 * throws.
 */
export type GeneratorFailure =
  | { kind: 'no-eligible-rhythms' }
  | { kind: 'empty-pitch-set' }
```

The generator function itself:

```bash
sed -n '198,249p' /home/chris/etude-gen/src/lib/piece-generator.ts
```

```output
export const generatePiece = (
  settings: GenerationSettings,
  random: RandomSource,
): Result<Piece, GeneratorFailure> => {
  const catalogResult = parseCatalog()
  if (catalogResult.isErr) {
    return Result.err({ kind: 'no-eligible-rhythms' })
  }
  const catalog = catalogResult.value

  const selectedSet = new Set(settings.selectedDurations)
  const eligibleRhythms = computeEligibleRhythms(
    catalog,
    settings.timeSignature,
    selectedSet,
  )
  if (eligibleRhythms.length === 0) {
    return Result.err({ kind: 'no-eligible-rhythms' })
  }

  const useRight = settings.hand === 'right' || settings.hand === 'both'
  const useLeft = settings.hand === 'left' || settings.hand === 'both'

  if (useRight && settings.rightHandPitches.length === 0) {
    return Result.err({ kind: 'empty-pitch-set' })
  }
  if (useLeft && settings.leftHandPitches.length === 0) {
    return Result.err({ kind: 'empty-pitch-set' })
  }

  const measures: Measure[] = []
  for (let i = 0; i < settings.measureCount; i += 1) {
    const rightHand = useRight
      ? generateHand(settings.rightHandPitches, eligibleRhythms, random)
      : []
    const leftHand = useLeft
      ? generateHand(settings.leftHandPitches, eligibleRhythms, random)
      : []
    measures.push({ rightHand, leftHand })
  }

  const piece: Piece = {
    pieceId: crypto.randomUUID(),
    key: settings.key,
    timeSignature: settings.timeSignature,
    hand: settings.hand,
    sourceParameterVersion: settings.sourceParameterVersion,
    measures,
  }

  return Result.ok(piece)
}
```

Key design points:
- The Piece contract is immutable and JSON-serializable — `readonly` fields throughout.
- No seed is persisted or returned. The `RandomSource` interface is injectable; tests use a deterministic source, production uses `Math.random`.
- The generator performs no database, HTTP, SVG, or UI work. It accepts validated `GenerationSettings` only.
- Typed invariant failures (`no-eligible-rhythms`, `empty-pitch-set`) are returned, never thrown.
- The `rest` discriminant on `NoteEvent` accommodates Issue 23's rests without re-litigating the contract.

## 3. The Etude Piece Repository in src/lib/etude-piece-repository.ts

```bash
sed -n '170,232p' /home/chris/etude-gen/src/lib/etude-piece-repository.ts
```

```output
export const persistEtudePiece = (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  piece: Piece,
): Promise<Result<PieceRecord, PiecePersistError>> =>
  persistEtudePieceActual(db, userId, expectedEpoch, piece)

const persistEtudePieceActual = async (
  db: DrizzleClient,
  userId: string,
  expectedEpoch: number,
  piece: Piece,
): Promise<Result<PieceRecord, PiecePersistError>> => {
  try {
    // Verify the aggregate epoch on etude_params before writing the Piece.
    // A request whose captured epoch no longer matches (e.g. Start Over
    // bumped it) is rejected with epoch-mismatch and no Piece is written.
    const paramsRows = await db
      .select({ epoch: etudeParams.aggregateEpoch })
      .from(etudeParams)
      .where(eq(etudeParams.userId, userId))
      .limit(1)
    if (paramsRows.length === 0) {
      // No aggregate exists for this owner; treat as a safe epoch-mismatch.
      return Result.err({ kind: 'epoch-mismatch' })
    }
    if (paramsRows[0]!.epoch !== expectedEpoch) {
      return Result.err({ kind: 'epoch-mismatch' })
    }

    // Upsert the Piece record, replacing any prior current Piece for this
    // owner via the UNIQUE userId constraint.
    const now = new Date()
    const upserted = await db
      .insert(etudePiece)
      .values({
        id: crypto.randomUUID(),
        userId,
        pieceId: piece.pieceId,
        pieceJson: JSON.stringify(piece),
        sourceParameterVersion: piece.sourceParameterVersion,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: etudePiece.userId,
        set: {
          pieceId: piece.pieceId,
          pieceJson: JSON.stringify(piece),
          sourceParameterVersion: piece.sourceParameterVersion,
          updatedAt: now,
        },
      })
      .returning()
    if (upserted.length === 0) {
      return Result.err({ kind: 'db-error', error: new Error('persistEtudePiece: upsert returned no rows') })
    }
    return Result.ok(mapPieceToDomain(upserted[0]!))
  } catch (e) {
    return Result.err({ kind: 'db-error', error: e instanceof Error ? e : new Error(String(e)) })
  }
}
```

Key design points:
- The epoch check is on `etude_params` (a different table from the write to `etude_piece`), so the check-then-write is not a single atomic CAS. Issue 33's in-flight lock will prevent concurrent generation requests from racing; the epoch check here is the safety net (cross-cutting contract section 4).
- Replacement semantics: the UNIQUE `userId` constraint on `etude_piece` means one current Piece per owner. The `onConflictDoUpdate` replaces the prior row.
- `epoch-mismatch` is deterministic and is not retried. `db-error` is transient.
- `ensureEtudeOperation` (not shown here for brevity) atomically creates the one-per-user operation record, handling the UNIQUE-constraint violation as a load of the winner's record under concurrency.

## 4. The generate operation in src/lib/workflow-service.ts

```bash
sed -n '320,326p' /home/chris/etude-gen/src/lib/workflow-service.ts
```

```output
export type GenerateOutcome =
  | { kind: 'success'; redirectTarget: string; piece: Piece }
  | { kind: 'stale-version'; redirectTarget: string }
  | { kind: 'prerequisites-not-met'; redirectTarget: string }
  | { kind: 'stored-values-invalid'; redirectTarget: string }
  | { kind: 'generator-failure'; redirectTarget: string }
  | { kind: 'db-error'; redirectTarget: string }
```

```bash
sed -n '433,498p' /home/chris/etude-gen/src/lib/workflow-service.ts
```

```output
export const generateEtude = async (
  db: DrizzleClient,
  userId: string,
  submittedWorkflowVersion: string,
  capturedEpoch: number,
  random: RandomSource,
  _correlationId: string,
): Promise<GenerateOutcome> => {
  // 1. Load the current aggregate.
  const loaded = await loadEtudeParams(db, userId)
  if (loaded.isErr) {
    return { kind: 'db-error', redirectTarget: PATHS.ETUDE_REVIEW }
  }
  const current = loaded.value
  if (current === null) {
    return { kind: 'stale-version', redirectTarget: computeCanonicalRoute(null) }
  }

  // 2. Verify the operation precondition (version + epoch).
  const precondition = checkOperationPrecondition(
    current,
    submittedWorkflowVersion,
    capturedEpoch,
  )
  if (precondition.isErr) {
    return { kind: 'stale-version', redirectTarget: computeCanonicalRoute(current) }
  }

  // 3. Check the review predicate.
  if (!isReviewReachable(current)) {
    return { kind: 'prerequisites-not-met', redirectTarget: computeCanonicalRoute(current) }
  }

  // 4. Check stored-value validation.
  const canonical = computeCanonicalRoute(current)
  if (canonical !== PATHS.ETUDE_REVIEW) {
    return { kind: 'stored-values-invalid', redirectTarget: canonical }
  }

  // 5. Build generation settings.
  const settings = buildGenerationSettings(current)
  if (settings === null) {
    // Defensive: the boundary is stale. Step 4 should have caught this.
    return { kind: 'stored-values-invalid', redirectTarget: PATHS.ETUDE_SPLIT }
  }

  // 6. Generate the Piece.
  const generated = generatePiece(settings, random)
  if (generated.isErr) {
    return { kind: 'generator-failure', redirectTarget: generatorFailureRedirect(generated.error) }
  }
  const piece = generated.value

  // 7. Persist the Piece with the captured epoch.
  const persisted = await persistEtudePiece(db, userId, current.aggregateEpoch, piece)
  if (persisted.isErr) {
    const failure: PiecePersistError = persisted.error
    if (failure.kind === 'epoch-mismatch') {
      return { kind: 'stale-version', redirectTarget: computeCanonicalRoute(current) }
    }
    return { kind: 'db-error', redirectTarget: PATHS.ETUDE_REVIEW }
  }

  // 8. Success.
  return { kind: 'success', redirectTarget: PATHS.ETUDE_SCORE, piece }
}
```

The eight-step pipeline is the heart of Issue 20. Each step either succeeds and falls through, or returns a typed `GenerateOutcome` variant with a redirect target. The function is async (it touches the DB) but never throws — every failure is a typed variant. The route maps each variant to a 303 redirect.

The `buildGenerationSettings` helper splits the stored pitches into right- and left-hand sets using the stored split boundary for two-hand mode:

```bash
sed -n '334,379p' /home/chris/etude-gen/src/lib/workflow-service.ts
```

```output
const resolveHandPitches = (
  params: EtudeParams,
): { right: string[]; left: string[] } | null => {
  const storedPitches = parseStoredPitches(params.selectedPitches)
  if (params.hand === 'right') {
    return { right: storedPitches, left: [] }
  }
  if (params.hand === 'left') {
    return { left: storedPitches, right: [] }
  }
  // Both hands: split the stored pitches at the stored boundary.
  if (params.splitBoundary === null || params.splitBoundary.trim() === '') {
    return null
  }
  const eligible = deriveEligibleBoundaries(storedPitches)
  const match = eligible.find((b) => b.id === params.splitBoundary)
  if (!match) {
    return null
  }
  return { right: match.right, left: match.left }
}

const buildGenerationSettings = (
  params: EtudeParams,
): GenerationSettings | null => {
  const handPitches = resolveHandPitches(params)
  if (handPitches === null) {
    return null
  }
  const selectedDurations = parseStoredDurations(params.selectedDurations)
  return {
    measureCount: params.measureCount,
    timeSignature: params.timeSignature,
    key: params.keySignature,
    hand: params.hand as 'left' | 'right' | 'both',
    rightHandPitches: handPitches.right,
    leftHandPitches: handPitches.left,
    selectedDurations,
    sourceParameterVersion: params.workflowVersion,
  }
}
```

## 5. The canonical-route extension in src/lib/canonical-route.ts

```bash
sed -n '60,103p' /home/chris/etude-gen/src/lib/canonical-route.ts
```

```output
export const resolveCanonicalRoute = (
  params: EtudeParams | null,
  hasCurrentPiece: boolean = false,
): string => {
  if (params === null) {
    return PATHS.ETUDE_SETUP
  }

  if (!params.setupConfirmed) {
    return PATHS.ETUDE_SETUP
  }

  // Setup is confirmed. The notes step is the earliest incomplete step when
  // pitches or durations are unconfirmed (cross-cutting contract section 5:
  // the notes step is one coherent prerequisite — both halves must be
  // confirmed for it to count as complete).
  if (!params.notesConfirmed) {
    return PATHS.ETUDE_NOTES
  }

  // Notes are confirmed. When both hands are selected but fewer than two
  // pitches are stored (corrupt state from an out-of-band change or an
  // interrupted invalidation), the notes step is the earliest incomplete
  // step because the two-hand minimum is no longer met. The split step never
  // renders an empty or single-option boundary list.
  if (params.hand === 'both' && countSelectedPitches(params.selectedPitches) < 2) {
    return PATHS.ETUDE_NOTES
  }

  // Both hands, notes confirmed, enough pitches: the split step is the
  // earliest incomplete step when it is unconfirmed.
  if (params.hand === 'both' && !params.splitConfirmed) {
    return PATHS.ETUDE_SPLIT
  }

  // One hand with notes confirmed (split skipped), or both hands with split
  // confirmed: the review predicate is satisfied. When a current Piece
  // exists, the canonical route is /etude/score (Issue 20); otherwise it is
  // /etude/review.
  if (hasCurrentPiece) {
    return PATHS.ETUDE_SCORE
  }
  return PATHS.ETUDE_REVIEW
}
```

The `hasCurrentPiece` parameter defaults to `false` for backward compatibility with callers that do not yet load the Piece record. `computeCanonicalRoute` in the workflow service is extended with the same parameter.

## 6. The capability-flag gate in src/lib/config-validator.ts

```bash
sed -n '125,137p' /home/chris/etude-gen/src/lib/config-validator.ts
```

```output
  // The generation-released flag is a deployability gate, not a required
  // config value: its absence is a valid "not released" state and never
  // produces a defect. It is released exactly when the literal string "true"
  // is supplied; every other value resolves to not-released.
  const generationReleased = input.ETUDE_GENERATION_RELEASED === 'true'

  return {
    healthy: defects.length === 0,
    lilypondTimeoutMs: timeoutMs,
    generationReleased,
    defects,
  }
}
```

The flag is a deployability gate, not a required-config value. Its absence never produces a defect. It is released exactly when the literal string `"true"` is supplied; every other value (absent, empty, `"false"`, garbage) resolves to not-released. The flag is removed once Issue 40 lands; it is never client-controllable.

## 7. The POST /etude/generate route in src/routes/build-etude-generate.tsx

```bash
sed -n '95,167p' /home/chris/etude-gen/src/routes/build-etude-generate.tsx
```

```output
/**
 * A non-seeded random source for production use. The generator uses
 * `nextInt(n)` to pick a uniform index in `[0, n)`. No seed is persisted.
 */
const productionRandom = {
  nextInt: (maxExclusive: number): number => {
    if (maxExclusive <= 0) {
      return 0
    }
    return Math.floor(Math.random() * maxExclusive)
  },
}

/**
 * Attach the etude generate route to the app.
 * @param app - Hono app instance
 */
export const buildEtudeGenerate = (app: Hono<{ Bindings: any }>): void => {
  app.post(
    PATHS.ETUDE_GENERATE,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithError(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      // Parse the submitted form, tolerating hostile shapes without a 500.
      const parsed = await c.req.parseBody({ all: true })
      const rawWorkflowVersion = parsed['workflowVersion']
      const submittedWorkflowVersion =
        typeof rawWorkflowVersion === 'string' ? rawWorkflowVersion : ''
      const rawAggregateEpoch = parsed['aggregateEpoch']
      const capturedEpoch =
        typeof rawAggregateEpoch === 'string' && /^\d+$/.test(rawAggregateEpoch)
          ? Number(rawAggregateEpoch)
          : -1

      // Call the workflow service's generate operation. The function is
      // async (it touches the DB) but never throws: every failure is
      // returned as a typed variant.
      let outcome
      try {
        outcome = await generateEtude(
          db,
          user.id,
          submittedWorkflowVersion,
          capturedEpoch,
          productionRandom,
          'generate-route',
        )
      } catch (e) {
        logError('etude generate unexpected error', { error: sanitizeError(e) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, e)
      }

      // Map the typed outcome to a redirect.
      switch (outcome.kind) {
        case 'success':
          return redirectWithMessage(c, outcome.redirectTarget, '')

        case 'stale-version':
          return redirectWithError(c, outcome.redirectTarget, STALE_OPERATION_MESSAGE)

        case 'prerequisites-not-met':
          return redirectWithError(c, outcome.redirectTarget, PREREQUISITES_NOT_MET_MESSAGE)

        case 'stored-values-invalid':
          return redirectWithError(c, outcome.redirectTarget, STORED_VALUES_INVALID_MESSAGE)

        case 'generator-failure':
          return redirectWithError(c, outcome.redirectTarget, GENERATOR_FAILURE_MESSAGE)

        case 'db-error':
          logError('etude generate db error', { error: sanitizeError(new Error('db-error')) })
          return redirectWithError(c, outcome.redirectTarget, DB_ERROR_MESSAGE)

        default:
          // Exhaustive check: if a new variant is added without a case
          // here, TypeScript will flag this unreachable branch.
          logError('etude generate unknown outcome', { error: sanitizeError(new Error('unknown')) })
          return redirectWithError(c, PATHS.ETUDE_REVIEW, DB_ERROR_MESSAGE)
      }
    },
  )
}
```

The route parses `workflowVersion` and `aggregateEpoch` from the form, calls `generateEtude` with a non-seeded production random source, and maps the typed `GenerateOutcome` to a 303 redirect. The `switch` is exhaustive — TypeScript flags the `default` branch as unreachable when all variants are covered. Every safe message exposes no internal identifiers (cross-cutting contract section 1 rule 6).

## 8. The GET /etude/score route in src/routes/build-etude-score.tsx

```bash
sed -n '100,142p' /home/chris/etude-gen/src/routes/build-etude-score.tsx
```

```output
export const buildEtudeScore = (app: Hono<{ Bindings: any }>): void => {
  app.get(
    PATHS.ETUDE_SCORE,
    secureHeaders(STANDARD_SECURE_HEADERS),
    signedInAccess,
    async (c: Context) => {
      const user = c.get('user') as AuthUser | null | undefined
      const db = c.get('db') as DrizzleClient | undefined

      if (!user || !user.id || !db) {
        return redirectWithMessage(c, PATHS.AUTH.SIGN_IN, 'You must sign in to visit that page.')
      }

      // Load the owner's aggregate.
      const paramsResult = await loadEtudeParams(db, user.id)
      if (paramsResult.isErr) {
        logError('etude score load params failed', { error: sanitizeError(paramsResult.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, paramsResult.error)
      }
      if (paramsResult.value === null) {
        return redirectWithMessage(c, PATHS.ETUDE, '')
      }
      const params = paramsResult.value

      // Load the owner's current Piece record.
      const pieceResult = await loadEtudePiece(db, user.id)
      if (pieceResult.isErr) {
        logError('etude score load piece failed', { error: sanitizeError(pieceResult.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, pieceResult.error)
      }
      const hasCurrentPiece = pieceResult.value !== null

      // Compute the canonical route with the current-Piece flag.
      const canonical = computeCanonicalRoute(params, hasCurrentPiece)

      // If the canonical route is not /etude/score, redirect to it with a
      // safe prerequisite-redirect message.
      if (canonical !== PATHS.ETUDE_SCORE) {
        return redirectWithPrerequisiteMessage(c, canonical, PREREQUISITE_REDIRECT_MESSAGE)
      }

      // Parse the Piece JSON from the stored record.
      const pieceRecord = pieceResult.value!
      let piece: Piece
      try {
        piece = JSON.parse(pieceRecord.pieceJson) as Piece
      } catch (e) {
        logError('etude score parse piece json failed', { error: sanitizeError(e as Error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, e as Error)
      }

      return c.render(useLayout(c, renderEtudeScore(piece)))
    },
  )
}
```

The score route is a safe, side-effect-free GET. It loads the aggregate and current Piece, computes the canonical route with the `hasCurrentPiece` flag, and redirects to the canonical route when it is not `/etude/score`. When the canonical route is `/etude/score`, it parses the Piece JSON and renders its metadata. The full SVG render arrives in Issue 30.

## 9. Capability-flag gating in src/index.ts

```bash
sed -n '194,201p' /home/chris/etude-gen/src/index.ts
```

```output
buildEtudeReview(app)
buildEtudeGenerate(app)
// Capability-flag gating: the score route is registered only when
// ETUDE_GENERATION_RELEASED is the literal "true". When not released, the
// route behaves as unknown (404). Removed once Issue 40 lands.
if ((env.ETUDE_GENERATION_RELEASED as string) === 'true') {
  buildEtudeScore(app)
}
```

The score route is registered only when `ETUDE_GENERATION_RELEASED` is the literal `"true"`. When not released, the route behaves as unknown (404). The `as string` cast is needed because the binding type defaults to `""` (the empty string) in the generated `worker-configuration.d.ts`.

## 10. The aggregateEpoch field on the review form in src/routes/build-etude-review.tsx

```bash
sed -n '96,118p' /home/chris/etude-gen/src/routes/build-etude-review.tsx
```

```output
              <input
                type='hidden'
                name='workflowVersion'
                value={String(params.workflowVersion)}
                data-testid='workflow-version-field'
              />
              <input
                type='hidden'
                name='aggregateEpoch'
                value={String(params.aggregateEpoch)}
                data-testid='aggregate-epoch-field'
              />
              <button
                type='submit'
                className='btn btn-primary'
                data-testid='generate-action'
              >
                Generate
              </button>
```

The Generate form now carries both the hidden `workflowVersion` field (the operation-POST precondition from cross-cutting contract section 3) and the hidden `aggregateEpoch` field (the section 4 epoch check). The epoch is captured at form-acquisition time — when the review page is rendered — so a request whose epoch changed between rendering and submission (e.g. Start Over bumped it) is rejected.

## 11. The GET /etude entry route loads the current Piece

```bash
sed -n '367,381p' /home/chris/etude-gen/src/routes/build-etude.tsx
```

```output
      const result = await loadOrCreateEtudeParams(db, user.id)

      if (result.isErr) {
        logError('etude entry load-or-create failed', { error: sanitizeError(result.error) })
        return handleUnexpectedError(c as unknown as Context<AppEnv>, result.error)
      }

      // Load the current Piece record to determine whether the canonical
      // route should be /etude/score (Issue 20).
      const pieceResult = await loadEtudePiece(db, user.id)
      const hasCurrentPiece = pieceResult.isOk && pieceResult.value !== null

      const canonicalRoute = computeCanonicalRoute(result.value, hasCurrentPiece)
      return redirectWithMessage(c, canonicalRoute, '')
```

The entry route now loads the current Piece record to determine whether the canonical route should be `/etude/score`. A returning student with a current Piece is redirected to `/etude/score` — a stable URL that re-renders the same Piece on every visit.

## 12. The PATHS.ETUDE_SCORE constant in src/constants.ts

```bash
grep -n 'ETUDE_SCORE' /home/chris/etude-gen/src/constants.ts
```

```output
31:  ETUDE_SCORE: '/etude/score' as const,
```

## 13. Verification: unit tests pass

```bash
cd /home/chris/etude-gen && bun test tests/piece-generator.spec.ts tests/etude-piece-repository.spec.ts tests/etude-piece-contract.spec.ts tests/etude-generate-operation.spec.ts tests/canonical-route-piece.spec.ts tests/config-validator.spec.ts tests/workflow-service.spec.ts 2>&1 | tail -5
```

```output

 127 pass
  0 fail
  352 expect() calls
Ran 127 tests across 7 files. [145.00ms]
```

```bash
cd /home/chris/etude-gen && bun test tests/*.spec.ts 2>&1 | grep -E "pass$|fail$"
```

```output
 689 pass
  0 fail
```

All 689 unit tests pass across 46 files. The 127 Issue 20-specific tests cover the Piece Generator contract (17 tests), the Piece and operation repository (13 tests), the schema-level contract (3 tests), the generate operation (10 tests), the canonical-route extension (16 tests), the config-validator flag (9 tests added to the existing 16), and the workflow service (existing tests extended).
