/**
 * Pen input latency statistics.
 *
 * The engine reports one sample per pointermove: event timestamp → the next
 * animation frame. This is the portion we can measure reliably in the WebView;
 * panel/compositor latency is added by the OS. Values are advisory, but they
 * make real-device regressions visible instead of subjective.
 */

export interface LatencyStats {
  count: number;
  avg: number;
  p95: number;
  max: number;
  min: number;
}

export function summarizeLatency(samples: number[]): LatencyStats {
  if (samples.length === 0) {
    return { count: 0, avg: 0, p95: 0, max: 0, min: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
  return {
    count: sorted.length,
    avg,
    p95,
    max: sorted[sorted.length - 1],
    min: sorted[0],
  };
}

export function formatLatency(stats: LatencyStats): string {
  if (stats.count === 0) return '—';
  return `平均 ${stats.avg.toFixed(1)}ms · P95 ${stats.p95.toFixed(1)}ms`;
}
