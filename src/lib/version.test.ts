import { describe, expect, it } from 'vitest';
import { isVersionNewer } from './version';

describe('isVersionNewer', () => {
  it('detects a newer patch version', () => {
    expect(isVersionNewer('0.1.6', '0.1.4')).toBe(true);
    expect(isVersionNewer('0.2.0', '0.1.9')).toBe(true);
    expect(isVersionNewer('1.0.0', '0.9.9')).toBe(true);
  });

  it('never treats an older release as an update', () => {
    expect(isVersionNewer('0.1.4', '0.1.6')).toBe(false);
    expect(isVersionNewer('0.15.0', '0.1.6')).toBe(true);
  });

  it('treats equal versions as up to date', () => {
    expect(isVersionNewer('0.1.6', '0.1.6')).toBe(false);
    expect(isVersionNewer('v0.1.6', '0.1.6')).toBe(false);
  });

  it('handles prerelease suffixes numerically', () => {
    expect(isVersionNewer('0.1.6-beta.2', '0.1.6')).toBe(false);
    expect(isVersionNewer('0.1.7', '0.1.6-beta.2')).toBe(true);
  });
});
