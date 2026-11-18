import { describe, expect, it } from 'vitest';
import type { FileNode } from '@/lib/store/fileSystemStore';
import { mergeFileNodes } from './fileMerge';

function file(id: string, updatedAt: number, content = id): FileNode {
  return {
    id,
    name: `${id}.omni`,
    type: 'file',
    parentId: null,
    content,
    language: 'simple',
    createdAt: 1,
    updatedAt,
  };
}

function folder(id: string, updatedAt: number, expanded = true): FileNode {
  return { id, name: id, type: 'folder', parentId: null, createdAt: 1, updatedAt, expanded };
}

describe('mergeFileNodes', () => {
  it('adds remote-only nodes', () => {
    const result = mergeFileNodes({ a: file('a', 10) }, { b: file('b', 20) });
    expect(Object.keys(result.nodes).sort()).toEqual(['a', 'b']);
    expect(result.added).toBe(1);
    expect(result.kept).toBe(0);
  });

  it('keeps a newer local node', () => {
    const result = mergeFileNodes({ a: file('a', 30, 'local') }, { a: file('a', 20, 'remote') });
    expect((result.nodes.a as FileNode).content).toBe('local');
    expect(result.kept).toBe(1);
    expect(result.updated).toBe(0);
  });

  it('takes a newer remote node', () => {
    const result = mergeFileNodes({ a: file('a', 10, 'local') }, { a: file('a', 20, 'remote') });
    expect((result.nodes.a as FileNode).content).toBe('remote');
    expect(result.updated).toBe(1);
  });

  it('keeps the local expanded state for folders', () => {
    const local = folder('f', 10, false);
    const remote = folder('f', 20, true);
    const result = mergeFileNodes({ f: local }, { f: remote });
    expect(result.nodes.f).toMatchObject({ expanded: false, updatedAt: 20 });
  });

  it('ignores malformed remote entries', () => {
    const result = mergeFileNodes(
      {},
      { bad: { nope: true } as unknown as FileNode, good: file('good', 5) },
    );
    expect(Object.keys(result.nodes)).toEqual(['good']);
    expect(result.added).toBe(1);
  });

  it('reparents orphans to the root', () => {
    const child: FileNode = { ...file('child', 5), parentId: 'missing-parent' };
    const result = mergeFileNodes({}, { child });
    expect(result.nodes.child.parentId).toBeNull();
  });
});
