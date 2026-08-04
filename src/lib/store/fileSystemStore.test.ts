/**
 * Unit tests for the multi-tab editing logic in fileSystemStore.
 *
 * Covered:
 *   - openFile: append / reactivate / ignore non-files
 *   - closeTab: neighbor activation, empty state, no-op for unknown ids
 *   - createFile / setActiveFile / deleteNode keeping tabs in sync
 *   - closeTabPure / sanitizeRestoredTabs (restore filtering of invalid
 *     ids, legacy migration) as pure functions
 *
 * IndexedDB is unavailable under jsdom, so persistence calls are safe
 * no-ops (idbSet/idbGet swallow the error by design).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useFileSystemStore,
  closeTabPure,
  sanitizeRestoredTabs,
  type FileNode,
} from './fileSystemStore';

/* ─── Helpers ──────────────────────────────────────────────────── */

function makeFile(id: string, parentId: string | null = null): FileNode {
  return {
    id,
    name: `${id}.omni`,
    type: 'file',
    parentId,
    content: '',
    language: 'simple',
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeFolder(id: string, parentId: string | null = null): FileNode {
  return {
    id,
    name: id,
    type: 'folder',
    parentId,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Reset the store and seed it with the given nodes. */
function seed(...nodes: FileNode[]) {
  const map: Record<string, FileNode> = {};
  for (const n of nodes) map[n.id] = n;
  useFileSystemStore.setState({
    nodes: map,
    openTabs: [],
    activeTabId: null,
    activeFileId: null,
    loaded: true,
  });
}

const store = () => useFileSystemStore.getState();

/* ─── openFile ─────────────────────────────────────────────────── */

describe('openFile', () => {
  beforeEach(() => seed());

  it('appends a new tab and activates it', () => {
    seed(makeFile('a'), makeFile('b'));
    store().openFile('a');
    expect(store().openTabs).toEqual(['a']);
    expect(store().activeTabId).toBe('a');
    expect(store().activeFileId).toBe('a');

    store().openFile('b');
    expect(store().openTabs).toEqual(['a', 'b']);
    expect(store().activeTabId).toBe('b');
    expect(store().activeFileId).toBe('b');
  });

  it('reactivates an already-open tab without duplicating it', () => {
    seed(makeFile('a'), makeFile('b'));
    store().openFile('a');
    store().openFile('b');
    store().openFile('a');
    expect(store().openTabs).toEqual(['a', 'b']);
    expect(store().activeTabId).toBe('a');
  });

  it('ignores folders and unknown ids', () => {
    seed(makeFile('a'), makeFolder('dir'));
    store().openFile('dir');
    store().openFile('ghost');
    expect(store().openTabs).toEqual([]);
    expect(store().activeTabId).toBeNull();
    expect(store().activeFileId).toBeNull();
  });
});

/* ─── closeTab ─────────────────────────────────────────────────── */

describe('closeTab', () => {
  beforeEach(() => seed());

  it('activates the right neighbor when the active tab closes', () => {
    seed(makeFile('a'), makeFile('b'), makeFile('c'));
    store().openFile('a');
    store().openFile('b');
    store().openFile('c');
    store().openFile('b'); // activate middle tab
    store().closeTab('b');
    expect(store().openTabs).toEqual(['a', 'c']);
    expect(store().activeTabId).toBe('c');
    expect(store().activeFileId).toBe('c');
  });

  it('activates the left neighbor when the rightmost active tab closes', () => {
    seed(makeFile('a'), makeFile('b'), makeFile('c'));
    store().openFile('a');
    store().openFile('b');
    store().openFile('c'); // 'c' active
    store().closeTab('c');
    expect(store().openTabs).toEqual(['a', 'b']);
    expect(store().activeTabId).toBe('b');
  });

  it('keeps the active tab when closing a non-active tab', () => {
    seed(makeFile('a'), makeFile('b'), makeFile('c'));
    store().openFile('a');
    store().openFile('b');
    store().openFile('c'); // 'c' active
    store().closeTab('a');
    expect(store().openTabs).toEqual(['b', 'c']);
    expect(store().activeTabId).toBe('c');
  });

  it('yields the empty state when the last tab closes', () => {
    seed(makeFile('a'));
    store().openFile('a');
    store().closeTab('a');
    expect(store().openTabs).toEqual([]);
    expect(store().activeTabId).toBeNull();
    expect(store().activeFileId).toBeNull();
  });

  it('is a no-op for an id that is not open', () => {
    seed(makeFile('a'), makeFile('b'));
    store().openFile('a');
    store().closeTab('b');
    expect(store().openTabs).toEqual(['a']);
    expect(store().activeTabId).toBe('a');
  });
});

/* ─── Other actions keeping tabs in sync ───────────────────────── */

describe('tab synchronization in other actions', () => {
  beforeEach(() => seed());

  it('createFile opens a tab for the new file', () => {
    const id = store().createFile('new.omni', null);
    expect(store().openTabs).toEqual([id]);
    expect(store().activeTabId).toBe(id);
    expect(store().activeFileId).toBe(id);
  });

  it('setActiveFile routes through openFile (tab membership guaranteed)', () => {
    seed(makeFile('a'));
    store().setActiveFile('a');
    expect(store().openTabs).toEqual(['a']);
    expect(store().activeTabId).toBe('a');
  });

  it('setActiveFile(null) keeps remaining tabs and activates the last one', () => {
    seed(makeFile('a'), makeFile('b'));
    store().openFile('a');
    store().openFile('b');
    store().setActiveFile(null);
    expect(store().openTabs).toEqual(['a', 'b']);
    expect(store().activeTabId).toBe('b');
    expect(store().activeFileId).toBe('b');
  });

  it('deleteNode removes the file from tabs and activates a neighbor', () => {
    seed(makeFile('a'), makeFile('b'), makeFile('c'));
    store().openFile('a');
    store().openFile('b');
    store().openFile('c');
    store().openFile('b');
    store().deleteNode('b');
    expect(store().nodes['b']).toBeUndefined();
    expect(store().openTabs).toEqual(['a', 'c']);
    expect(store().activeTabId).toBe('c');
    expect(store().activeFileId).toBe('c');
  });

  it('deleteNode on a folder removes descendant tabs', () => {
    const dir = makeFolder('dir');
    seed(dir, makeFile('a', 'dir'), makeFile('b', 'dir'), makeFile('c'));
    store().openFile('a');
    store().openFile('b');
    store().openFile('c');
    store().openFile('a'); // active tab lives inside the folder
    store().deleteNode('dir');
    expect(store().openTabs).toEqual(['c']);
    expect(store().activeTabId).toBe('c');
    expect(store().activeFileId).toBe('c');
  });

  it('deleteNode of the last open file yields the empty state', () => {
    seed(makeFile('a'));
    store().openFile('a');
    store().deleteNode('a');
    expect(store().openTabs).toEqual([]);
    expect(store().activeTabId).toBeNull();
    expect(store().activeFileId).toBeNull();
  });
});

/* ─── closeTabPure ─────────────────────────────────────────────── */

describe('closeTabPure', () => {
  it('returns the same references for an unknown id', () => {
    const tabs = ['a', 'b'];
    const r = closeTabPure(tabs, 'ghost', 'a');
    expect(r.openTabs).toBe(tabs);
    expect(r.activeTabId).toBe('a');
  });

  it('does not change activation when closing a non-active tab', () => {
    const r = closeTabPure(['a', 'b', 'c'], 'a', 'b');
    expect(r.openTabs).toEqual(['b', 'c']);
    expect(r.activeTabId).toBe('b');
  });
});

/* ─── sanitizeRestoredTabs (persistence restore) ───────────────── */

describe('sanitizeRestoredTabs', () => {
  const nodes = {
    a: makeFile('a'),
    b: makeFile('b'),
    dir: makeFolder('dir'),
  };

  it('filters ids that are missing or not files, and dedupes', () => {
    const r = sanitizeRestoredTabs(nodes, {
      openTabs: ['a', 'dir', 'ghost', 'a', 42],
      activeTabId: 'a',
    });
    expect(r.openTabs).toEqual(['a']);
    expect(r.activeTabId).toBe('a');
  });

  it('migrates a legacy activeFileId (no tab state) into a tab', () => {
    const r = sanitizeRestoredTabs(nodes, { activeFileId: 'b' });
    expect(r.openTabs).toEqual(['b']);
    expect(r.activeTabId).toBe('b');
  });

  it('appends a valid active tab missing from the persisted tab list', () => {
    const r = sanitizeRestoredTabs(nodes, {
      openTabs: ['a'],
      activeTabId: 'b',
    });
    expect(r.openTabs).toEqual(['a', 'b']);
    expect(r.activeTabId).toBe('b');
  });

  it('falls back to the last tab when the persisted active tab is invalid', () => {
    const r = sanitizeRestoredTabs(nodes, {
      openTabs: ['a', 'b'],
      activeTabId: 'ghost',
    });
    expect(r.openTabs).toEqual(['a', 'b']);
    expect(r.activeTabId).toBe('b');
  });

  it('returns the empty state when nothing valid persists', () => {
    const r = sanitizeRestoredTabs(nodes, {
      openTabs: ['ghost', 'dir'],
      activeTabId: 'ghost',
      activeFileId: 'ghost',
    });
    expect(r.openTabs).toEqual([]);
    expect(r.activeTabId).toBeNull();
  });
});
