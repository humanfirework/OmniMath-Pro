import { describe, expect, it } from 'vitest';
import { isRemoteNewer } from './autoCheck';

describe('isRemoteNewer', () => {
  it('offers when there was no previous check', () => {
    expect(isRemoteNewer('2026-11-19T00:00:00Z', '')).toBe(true);
    expect(isRemoteNewer('2026-11-19T00:00:00Z', null)).toBe(true);
  });

  it('compares remote against the last check', () => {
    expect(isRemoteNewer('2026-11-19T00:00:10Z', '2026-11-19T00:00:00Z')).toBe(true);
    expect(isRemoteNewer('2026-11-19T00:00:00Z', '2026-11-19T00:00:00Z')).toBe(false);
    expect(isRemoteNewer('2026-11-18T23:59:00Z', '2026-11-19T00:00:00Z')).toBe(false);
  });

  it('never offers without a valid remote timestamp', () => {
    expect(isRemoteNewer(undefined, '')).toBe(false);
    expect(isRemoteNewer('', '')).toBe(false);
    expect(isRemoteNewer('not-a-date', '')).toBe(false);
  });

  it('does not spam when the local timestamp is corrupt', () => {
    expect(isRemoteNewer('2026-11-19T00:00:00Z', 'garbage')).toBe(false);
  });
});
