// ====================================
// Tests for correlation-context.ts propagation stubs
// To run this, cd to this directory and type 'bun test'
// ====================================

import { describe, it, expect } from 'bun:test'

import {
  createRequestCorrelation,
  createOperationCorrelation,
  runDeferredCleanup,
  makeWorkflowServiceStub,
  makeRendererStub,
  makeRepositoryStub,
  makeArtifactStoreStub,
  type CorrelationContext,
} from '../src/lib/correlation-context'

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

describe('request correlation propagation to service stubs', () => {
  it('should pass the request correlation id to the Workflow Service stub', async () => {
    const ctx = createRequestCorrelation('11111111-2222-4333-8444-555555555555')
    const stub = makeWorkflowServiceStub()
    await stub.runOperation(ctx)
    expect(stub.recordedIds).toHaveLength(1)
    expect(stub.recordedIds[0]).toBe('11111111-2222-4333-8444-555555555555')
  })

  it('should pass the request correlation id to the renderer stub', async () => {
    const ctx = createRequestCorrelation('11111111-2222-4333-8444-555555555555')
    const stub = makeRendererStub()
    await stub.render(ctx)
    expect(stub.recordedIds[0]).toBe('11111111-2222-4333-8444-555555555555')
  })

  it('should pass the request correlation id to the repository stub', async () => {
    const ctx = createRequestCorrelation('11111111-2222-4333-8444-555555555555')
    const stub = makeRepositoryStub()
    await stub.save(ctx)
    expect(stub.recordedIds[0]).toBe('11111111-2222-4333-8444-555555555555')
  })

  it('should pass the request correlation id to the artifact-store stub', async () => {
    const ctx = createRequestCorrelation('11111111-2222-4333-8444-555555555555')
    const stub = makeArtifactStoreStub()
    await stub.store(ctx)
    expect(stub.recordedIds[0]).toBe('11111111-2222-4333-8444-555555555555')
  })

  it('should pass the same request id to all four stubs in one operation', async () => {
    const ctx = createRequestCorrelation('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
    const wf = makeWorkflowServiceStub()
    const renderer = makeRendererStub()
    const repo = makeRepositoryStub()
    const store = makeArtifactStoreStub()
    await Promise.all([
      wf.runOperation(ctx),
      renderer.render(ctx),
      repo.save(ctx),
      store.store(ctx),
    ])
    expect(wf.recordedIds[0]).toBe(ctx.correlationId)
    expect(renderer.recordedIds[0]).toBe(ctx.correlationId)
    expect(repo.recordedIds[0]).toBe(ctx.correlationId)
    expect(store.recordedIds[0]).toBe(ctx.correlationId)
  })
})

describe('deferred cleanup correlation', () => {
  it('should carry the originating request id when cleanup is started by a request', async () => {
    const ctx = createRequestCorrelation('11111111-2222-4333-8444-555555555555')
    const recorded: CorrelationContext[] = []
    await runDeferredCleanup(ctx, async (c: CorrelationContext) => {
      recorded.push(c)
    })
    expect(recorded).toHaveLength(1)
    expect(recorded[0].correlationId).toBe('11111111-2222-4333-8444-555555555555')
    expect(recorded[0].kind).toBe('request')
  })

  it('should generate its own operation id when no request context remains', async () => {
    const recorded: CorrelationContext[] = []
    await runDeferredCleanup(undefined, async (c: CorrelationContext) => {
      recorded.push(c)
    })
    expect(recorded).toHaveLength(1)
    expect(recorded[0].correlationId).toMatch(UUID_V4_PATTERN)
    expect(recorded[0].kind).toBe('operation')
  })

  it('should distinguish an operation id from a request id by kind', async () => {
    const requestCtx = createRequestCorrelation('11111111-2222-4333-8444-555555555555')
    const opCtx = createOperationCorrelation()
    expect(requestCtx.kind).toBe('request')
    expect(opCtx.kind).toBe('operation')
    expect(opCtx.correlationId).toMatch(UUID_V4_PATTERN)
    expect(opCtx.correlationId).not.toBe(requestCtx.correlationId)
  })

  it('should label deferred cleanup without context as an operation identifier', async () => {
    const recorded: CorrelationContext[] = []
    await runDeferredCleanup(undefined, async (c: CorrelationContext) => {
      recorded.push(c)
    })
    expect(recorded[0].kind).toBe('operation')
    expect(recorded[0].correlationId).toMatch(UUID_V4_PATTERN)
  })
})
