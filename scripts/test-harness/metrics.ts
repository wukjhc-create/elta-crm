/**
 * Test Harness — metrics (rene funktioner). Runtime, percentiler, fejlrate,
 * DB-growth. Bruges af scenario-runner/rapport.
 */

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(rank)
  const hi = Math.ceil(rank)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo)
}

export interface LatencyStats {
  count: number
  min: number
  max: number
  mean: number
  p50: number
  p95: number
  p99: number
}

export function latencyStats(samplesMs: number[]): LatencyStats {
  if (samplesMs.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 }
  }
  const sum = samplesMs.reduce((a, b) => a + b, 0)
  return {
    count: samplesMs.length,
    min: Math.min(...samplesMs),
    max: Math.max(...samplesMs),
    mean: sum / samplesMs.length,
    p50: percentile(samplesMs, 50),
    p95: percentile(samplesMs, 95),
    p99: percentile(samplesMs, 99),
  }
}

export function errorRate(total: number, errors: number): number {
  return total === 0 ? 0 : errors / total
}

/** Simpel stopur-helper til timing af async-operationer. */
export async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = Date.now()
  const result = await fn()
  return { result, ms: Date.now() - t0 }
}
