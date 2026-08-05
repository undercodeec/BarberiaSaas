import { performance } from 'node:perf_hooks';

const baseUrl = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:4000';
const concurrency = Number(process.env.PERF_CONCURRENCY ?? 10);
const requests = Number(process.env.PERF_REQUESTS ?? 100);
const maximumP95Ms = Number(process.env.PERF_MAX_P95_MS ?? 500);

if (
  !Number.isInteger(concurrency) ||
  !Number.isInteger(requests) ||
  concurrency < 1 ||
  requests < 1 ||
  concurrency > 100 ||
  requests > 10_000
)
  throw new Error(
    'Configura concurrencia entre 1-100 y solicitudes entre 1-10000.',
  );

const durations = [];
let failures = 0;
let nextRequest = 0;

async function worker() {
  while (nextRequest < requests) {
    nextRequest += 1;
    const startedAt = performance.now();
    try {
      const response = await fetch(`${baseUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      durations.push(performance.now() - startedAt);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
durations.sort((left, right) => left - right);
const percentile = (value) =>
  durations[
    Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)
  ] ?? 0;
const p50 = percentile(0.5);
const p95 = percentile(0.95);

console.log(
  JSON.stringify(
    {
      baseUrl,
      concurrency,
      failures,
      p50Ms: Number(p50.toFixed(2)),
      p95Ms: Number(p95.toFixed(2)),
      requests,
    },
    null,
    2,
  ),
);

if (failures > 0 || p95 > maximumP95Ms) process.exitCode = 1;
