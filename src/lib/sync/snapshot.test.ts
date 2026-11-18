import { beforeEach, describe, expect, it } from 'vitest';
import {
  applySnapshot,
  collectSnapshot,
  isWorkspaceSnapshot,
  parseSnapshot,
  snapshotFilename,
  snapshotSize,
  type WorkspaceSnapshot,
} from './snapshot';

const snapshot = (keys: Record<string, string>): WorkspaceSnapshot => ({
  app: 'omnimath',
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  keys,
});

describe('workspace snapshot', () => {
  beforeEach(() => localStorage.clear());

  it('collects app keys but never AI secrets', () => {
    localStorage.setItem('omnimath-pro-v2', '{"a":1}');
    localStorage.setItem('omnimath-whiteboard-v1', '{"strokes":[]}');
    localStorage.setItem('omnimath:ai:apiKey', 'secret');
    localStorage.setItem('other-app', 'x');

    const snap = collectSnapshot();
    expect(Object.keys(snap.keys).sort()).toEqual(['omnimath-pro-v2', 'omnimath-whiteboard-v1']);
    expect(JSON.stringify(snap)).not.toContain('secret');
  });

  it('replace mode removes old records and writes the snapshot', () => {
    localStorage.setItem('omnimath-old', 'old');
    const result = applySnapshot(snapshot({ 'omnimath-new': 'new' }), 'replace');
    expect(result.written).toBe(1);
    expect(result.removed).toBe(1);
    expect(localStorage.getItem('omnimath-old')).toBeNull();
    expect(localStorage.getItem('omnimath-new')).toBe('new');
  });

  it('merge mode keeps existing values', () => {
    localStorage.setItem('omnimath-a', 'local');
    const result = applySnapshot(snapshot({ 'omnimath-a': 'remote', 'omnimath-b': 'remote' }), 'merge');
    expect(result.skipped).toBe(1);
    expect(result.written).toBe(1);
    expect(localStorage.getItem('omnimath-a')).toBe('local');
    expect(localStorage.getItem('omnimath-b')).toBe('remote');
  });

  it('keeps AI secrets during replace', () => {
    localStorage.setItem('omnimath:ai:apiKey', 'secret');
    applySnapshot(snapshot({ 'omnimath-a': '1' }), 'replace');
    expect(localStorage.getItem('omnimath:ai:apiKey')).toBe('secret');
  });

  it('validates and parses snapshots', () => {
    const snap = snapshot({ 'omnimath-a': '1' });
    expect(isWorkspaceSnapshot(snap)).toBe(true);
    expect(isWorkspaceSnapshot({ ...snap, version: 99 })).toBe(false);
    expect(() => parseSnapshot('not json')).toThrow('JSON');
    expect(() => parseSnapshot('{}')).toThrow('备份文件');
    expect(parseSnapshot(JSON.stringify(snap)).keys['omnimath-a']).toBe('1');
  });

  it('reports size and filename', () => {
    const snap = snapshot({ 'omnimath-a': '1234' });
    expect(snapshotSize(snap).keys).toBe(1);
    expect(snapshotSize(snap).bytes).toBeGreaterThan(4);
    expect(snapshotFilename(new Date('2026-11-18T09:05:00'))).toBe('omnimath-backup-20261118-0905');
  });
});
