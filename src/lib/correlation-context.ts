/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Correlation context and propagation stubs.
 *
 * Defines the typed correlation context that threads a request's correlation
 * identifier into every Workflow Service operation, renderer call, repository
 * call, and artifact-store call it triggers, and into deferred work that
 * outlives the response. Deferred work with no remaining request context
 * generates its own operation correlation identifier and labels it as such,
 * so an operation-originated line is distinguishable from a request-originated
 * one.
 *
 * The service interfaces here are contracts that later issues will fill with
 * real behavior; this slice provides only the typed surface and trivial stub
 * implementations sufficient for the correlation-propagation tests.
 *
 * @module lib/correlation-context
 */
import { generateCorrelationId } from './correlation-id'

/** Whether a correlation identifier originated from a request or an operation. */
export type CorrelationKind = 'request' | 'operation'

/**
 * A correlation context carrying an identifier and a kind discriminator so a
 * request-originated identifier is distinguishable from an operation-originated
 * one.
 */
export interface CorrelationContext {
  /** The correlation identifier. */
  readonly correlationId: string
  /** Whether this identifier originated from a request or an operation. */
  readonly kind: CorrelationKind
}

/**
 * Build a request-originated correlation context around an existing
 * identifier (typically the one set by the correlation-id middleware).
 */
export const createRequestCorrelation = (correlationId: string): CorrelationContext => ({
  correlationId,
  kind: 'request',
})

/**
 * Build an operation-originated correlation context. When no identifier is
 * supplied, a fresh UUID v4 is generated, modelling deferred work that runs
 * with no remaining request context.
 */
export const createOperationCorrelation = (correlationId?: string): CorrelationContext => ({
  correlationId: correlationId ?? generateCorrelationId(),
  kind: 'operation',
})

/**
 * Contract for the Workflow Service. Real behavior is owned by later issues;
 * this slice provides only the typed surface.
 */
export interface WorkflowService {
  runOperation: (ctx: CorrelationContext) => Promise<void>
}

/**
 * Contract for the renderer. Real behavior is owned by later issues.
 */
export interface Renderer {
  render: (ctx: CorrelationContext) => Promise<void>
}

/**
 * Contract for the repository. Real behavior is owned by later issues.
 */
export interface Repository {
  save: (ctx: CorrelationContext) => Promise<void>
}

/**
 * Contract for the artifact store. Real behavior is owned by later issues.
 */
export interface ArtifactStore {
  store: (ctx: CorrelationContext) => Promise<void>
}

/**
 * A stub Workflow Service that records the correlation identifiers it receives.
 */
export interface WorkflowServiceStub extends WorkflowService {
  readonly recordedIds: readonly string[]
}

/**
 * A stub renderer that records the correlation identifiers it receives.
 */
export interface RendererStub extends Renderer {
  readonly recordedIds: readonly string[]
}

/**
 * A stub repository that records the correlation identifiers it receives.
 */
export interface RepositoryStub extends Repository {
  readonly recordedIds: readonly string[]
}

/**
 * A stub artifact store that records the correlation identifiers it receives.
 */
export interface ArtifactStoreStub extends ArtifactStore {
  readonly recordedIds: readonly string[]
}

const makeRecordingStub = (
  method: (ctx: CorrelationContext) => Promise<void>,
): { fn: (ctx: CorrelationContext) => Promise<void>; ids: string[] } => {
  const ids: string[] = []
  return {
    ids,
    fn: async (ctx: CorrelationContext) => {
      ids.push(ctx.correlationId)
      await method(ctx)
    },
  }
}

/**
 * Build a trivial Workflow Service stub that records received correlation ids.
 */
export const makeWorkflowServiceStub = (): WorkflowServiceStub => {
  const { ids, fn } = makeRecordingStub(async () => {})
  return { runOperation: fn, recordedIds: ids }
}

/**
 * Build a trivial renderer stub that records received correlation ids.
 */
export const makeRendererStub = (): RendererStub => {
  const { ids, fn } = makeRecordingStub(async () => {})
  return { render: fn, recordedIds: ids }
}

/**
 * Build a trivial repository stub that records received correlation ids.
 */
export const makeRepositoryStub = (): RepositoryStub => {
  const { ids, fn } = makeRecordingStub(async () => {})
  return { save: fn, recordedIds: ids }
}

/**
 * Build a trivial artifact-store stub that records received correlation ids.
 */
export const makeArtifactStoreStub = (): ArtifactStoreStub => {
  const { ids, fn } = makeRecordingStub(async () => {})
  return { store: fn, recordedIds: ids }
}

/**
 * Run deferred cleanup with the appropriate correlation context. When the
 * originating request context is supplied, its identifier is carried forward.
 * When no request context remains, a fresh operation identifier is generated
 * and labelled as an operation identifier rather than a request one.
 *
 * @param originatingCtx - The request correlation context, or undefined when
 *   no request context remains.
 * @param fn - The cleanup work, receiving the correlation context to use.
 */
export const runDeferredCleanup = async (
  originatingCtx: CorrelationContext | undefined,
  fn: (ctx: CorrelationContext) => Promise<void>,
): Promise<void> => {
  const ctx = originatingCtx ?? createOperationCorrelation()
  await fn(ctx)
}
