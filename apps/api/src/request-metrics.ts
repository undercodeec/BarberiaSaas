import { AsyncLocalStorage } from 'node:async_hooks';

import type { FastifyInstance, FastifyRequest } from 'fastify';

export interface RequestMetrics {
  readonly databaseMs: number;
  readonly queryCount: number;
  readonly requestId: string;
  readonly startedAt: number;
}

interface MutableRequestMetrics {
  databaseMs: number;
  queryCount: number;
  requestId: string;
  responseBytes: number;
  startedAt: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    requestMetrics?: MutableRequestMetrics;
  }
}

const requestMetricsStorage = new AsyncLocalStorage<MutableRequestMetrics>();

function createRequestMetrics(requestId: string): MutableRequestMetrics {
  return {
    databaseMs: 0,
    queryCount: 0,
    requestId,
    responseBytes: 0,
    startedAt: performance.now(),
  };
}

export function runWithRequestMetrics<T>(
  requestId: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  return Promise.resolve(
    requestMetricsStorage.run(createRequestMetrics(requestId), fn),
  );
}

export function currentRequestMetrics(): RequestMetrics | undefined {
  const metrics = requestMetricsStorage.getStore();
  return metrics
    ? {
        databaseMs: metrics.databaseMs,
        queryCount: metrics.queryCount,
        requestId: metrics.requestId,
        startedAt: metrics.startedAt,
      }
    : undefined;
}

export function observeDatabaseQuery(durationMs: number): void {
  const metrics = requestMetricsStorage.getStore();
  if (!metrics) return;
  metrics.queryCount += 1;
  metrics.databaseMs += durationMs;
}

function responseBytes(payload: unknown): number {
  if (typeof payload === 'string') return Buffer.byteLength(payload);
  if (payload instanceof Uint8Array) return payload.byteLength;
  return 0;
}

function requestMetricState(request: FastifyRequest): MutableRequestMetrics {
  return request.requestMetrics ?? createRequestMetrics(request.id);
}

export function installRequestMetricsHooks(
  app: FastifyInstance,
  appEnvironment: string,
): void {
  app.addHook('onRequest', (request, _reply, done) => {
    const metrics = createRequestMetrics(request.id);
    request.requestMetrics = metrics;
    // Fastify starts the remaining lifecycle from this callback.  `run` keeps
    // the Prisma query observer scoped to this request instead of leaving the
    // latest request as the ambient context for concurrent handlers.
    requestMetricsStorage.run(metrics, done);
  });
  app.addHook('onSend', (request, reply, payload, done) => {
    const metrics = requestMetricState(request);
    metrics.responseBytes = responseBytes(payload);
    if (appEnvironment === 'local') {
      reply.header('x-nava-query-count', String(metrics.queryCount));
      reply.header('x-nava-response-bytes', String(metrics.responseBytes));
    }
    done(null, payload);
  });
  app.addHook('onResponse', (request, reply, done) => {
    const metrics = requestMetricState(request);
    app.log.info(
      {
        databaseMs: metrics.databaseMs,
        durationMs: Math.round(performance.now() - metrics.startedAt),
        queryCount: metrics.queryCount,
        responseBytes: metrics.responseBytes,
        route: request.routeOptions.url,
        statusCode: reply.statusCode,
      },
      'Request completed',
    );
    done();
  });
}
