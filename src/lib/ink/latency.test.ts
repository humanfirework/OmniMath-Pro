import { describe, expect, it } from 'vitest';
import { formatLatency, summarizeLatency } from './latency';

describe('summarizeLatency', () => {
  it('handles an empty sample set', () => {
    expect(summarizeLatency([])).toEqual({ count: 0, avg: 0, p95: 0, max: 0, min: 0 });
    expect(formatLatency(summarizeLatency([]))).toBe('—');
  });

  it('computes average, p95, min and max', () => {
    const stats = summarizeLatency([4, 8, 12, 16, 20]);
    expect(stats.count).toBe(5);
    expect(stats.avg).toBe(12);
    expect(stats.min).toBe(4);
    expect(stats.max).toBe(20);
    expect(stats.p95).toBe(20);
    expect(formatLatency(stats)).toContain('12.0');
  });
});
