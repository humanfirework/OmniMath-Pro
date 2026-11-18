import { beforeEach, describe, expect, it } from 'vitest';
import {
  applySnapshot,
  collectSnapshot,
  isWorkspaceSnapshot,
  mergeJsonRecords,
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

  it('collects app keys but never AI or sync secrets', () => {
    localStorage.setItem('omnimath-pro-v2', '{"a":1}');
    localStorage.setItem('omnimath-whiteboard-v1', '{"strokes":[]}');
    localStorage.setItem('omnimath:ai:apiKey', 'secret');
    localStorage.setItem('omnimath:sync:gistToken', 'ghp_secret');
    localStorage.setItem('other-app', 'x');

    const snap = collectSnapshot();
    expect(Object.keys(snap.keys).sort()).toEqual(['omnimath-pro-v2', 'omnimath-whiteboard-v1']);
    expect(JSON.stringify(snap)).not.toContain('secret');
    expect(JSON.stringify(snap)).not.toContain('ghp_');
  });

  it('replace mode removes old records and writes the snapshot', () => {
    localStorage.setItem('omnimath-old', 'old');
    const result = applySnapshot(snapshot({ 'omnimath-new': 'new' }), 'replace');
    expect(result.written).toBe(1);
    expect(result.removed).toBe(1);
    expect(localStorage.getItem('omnimath-old')).toBeNull();
    expect(localStorage.getItem('omnimath-new')).toBe('new');
  });

  it('merge mode keeps existing unknown values', () => {
    localStorage.setItem('omnimath-a', 'local');
    const result = applySnapshot(snapshot({ 'omnimath-a': 'remote', 'omnimath-b': 'remote' }), 'merge');
    expect(result.skipped).toBe(1);
    expect(result.merged).toBe(0);
    expect(result.written).toBe(1);
    expect(localStorage.getItem('omnimath-a')).toBe('local');
    expect(localStorage.getItem('omnimath-b')).toBe('remote');
  });

  it('merges workbench records by id instead of skipping the whole blob', () => {
    const local = JSON.stringify({
      results: [{ id: 'a', output: '1' }],
      plots: [{ id: 'p1', expression: 'sin(x)' }],
      variables: { x: { name: 'x', value: 1 } },
      editorContent: 'local script',
    });
    const remote = JSON.stringify({
      results: [
        { id: 'a', output: 'remote-should-lose' },
        { id: 'b', output: '2' },
      ],
      plots: [{ id: 'p2', expression: 'cos(x)' }],
      variables: { y: { name: 'y', value: 2 } },
      editorContent: 'remote script',
      theme: 'light',
    });
    localStorage.setItem('omnimath-pro-v2', local);
    const result = applySnapshot(
      snapshot({ 'omnimath-pro-v2': remote }),
      'merge',
    );
    expect(result.merged).toBe(1);
    expect(result.skipped).toBe(0);

    const merged = JSON.parse(localStorage.getItem('omnimath-pro-v2') ?? '{}');
    expect(merged.results.map((r: { id: string }) => r.id)).toEqual(['a', 'b']);
    expect(merged.results[0].output).toBe('1'); // local wins on conflict
    expect(merged.plots.map((p: { id: string }) => p.id)).toEqual(['p1', 'p2']);
    expect(Object.keys(merged.variables).sort()).toEqual(['x', 'y']);
    expect(merged.editorContent).toBe('local script');
    expect(merged.theme).toBe('light');
  });

  it('mergeJsonRecords returns null when nothing new can be added', () => {
    const local = JSON.stringify({ results: [{ id: 'a' }] });
    expect(mergeJsonRecords(local, local, { arrays: ['results'] })).toBeNull();
    expect(mergeJsonRecords('not json', local, { arrays: ['results'] })).toBeNull();
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

  it('accepts the optional files map but rejects malformed values', () => {
    const snap = snapshot({ 'omnimath-a': '1' });
    expect(isWorkspaceSnapshot({ ...snap, files: {} })).toBe(true);
    expect(isWorkspaceSnapshot({ ...snap, files: [] })).toBe(false);
    expect(isWorkspaceSnapshot({ ...snap, files: 'nope' })).toBe(false);
    // 旧快照（没有 files 字段）仍然合法。
    expect(isWorkspaceSnapshot(snap)).toBe(true);
  });

  it('reports size and filename', () => {
    const snap = snapshot({ 'omnimath-a': '1234' });
    expect(snapshotSize(snap).keys).toBe(1);
    expect(snapshotSize(snap).bytes).toBeGreaterThan(4);
    expect(snapshotFilename(new Date('2026-11-18T09:05:00'))).toBe('omnimath-backup-20261118-0905');
  });
});
