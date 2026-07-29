/**
 * OmniMath Pro — Virtual File System Store (IndexedDB-backed)
 *
 * A VSCode-like file/folder management system for organizing user code.
 * Files and folders are stored as a flat map of `FileNode` objects with
 * `parentId` references forming a tree. The entire tree is serialized to
 * IndexedDB (key `file-tree-v1`) for persistence across sessions.
 *
 * Why IndexedDB instead of localStorage?
 *   - localStorage has a ~5-10MB limit; code files can be large.
 *   - IndexedDB supports much larger storage (hundreds of MB).
 *   - Async I/O doesn't block the main thread.
 *
 * Integration:
 *   - `activeFileId` tracks the currently-open file in the editor.
 *   - EditorPanel listens to `activeFileId` and loads/saves content.
 *   - FilesPanel renders the tree and calls CRUD actions.
 */

import { create } from 'zustand';
import type { InputMode } from '@/lib/engine/types';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface FileNode {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null; // null = root
  content?: string; // only for files
  language?: InputMode; // only for files
  createdAt: number;
  updatedAt: number;
  expanded?: boolean; // only for folders
}

interface FileSystemState {
  nodes: Record<string, FileNode>;
  activeFileId: string | null;
  loaded: boolean;

  // CRUD
  createFile: (name: string, parentId: string | null, content?: string, language?: InputMode) => string;
  createFolder: (name: string, parentId: string | null) => string;
  renameNode: (id: string, name: string) => void;
  deleteNode: (id: string) => void;
  moveNode: (id: string, newParentId: string | null) => void;
  updateFileContent: (id: string, content: string) => void;
  toggleFolderExpanded: (id: string) => void;

  // Queries
  getChildren: (parentId: string | null) => FileNode[];
  getPath: (id: string) => string;

  // Active file
  setActiveFile: (id: string | null) => void;

  // Persistence
  loadFromStorage: () => Promise<void>;
  saveToStorage: () => void;
}

/* ------------------------------------------------------------------ */
/*  IndexedDB wrapper (minimal, no external deps)                    */
/* ------------------------------------------------------------------ */

const DB_NAME = 'omnimath-fs';
const DB_VERSION = 1;
const STORE_NAME = 'kv';
const FS_KEY = 'file-tree-v1';
const ACTIVE_KEY = 'active-file-v1';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB unavailable'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbGet(key: string): Promise<unknown> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function idbSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore quota / availability errors
  }
}

/* ------------------------------------------------------------------ */
/*  Persistence helpers                                               */
/* ------------------------------------------------------------------ */

interface PersistedFS {
  nodes: Record<string, FileNode>;
  activeFileId: string | null;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function genId(): string {
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Guard against duplicate names among siblings (same parent directory).
 * Files and folders share one namespace per directory — like a real FS.
 * Throws so callers (Panels) can surface a toast instead of silently
 * creating ambiguous tree entries.
 */
function assertNoDuplicateName(
  nodes: Record<string, FileNode>,
  parentId: string | null,
  name: string,
  excludeId?: string,
): void {
  const dup = Object.values(nodes).some(
    (n) => n.parentId === parentId && n.name === name && n.id !== excludeId,
  );
  if (dup) throw new Error(`同目录下已存在名为 "${name}" 的文件或文件夹`);
}

/* ------------------------------------------------------------------ */
/*  Default content for first launch                                  */
/* ------------------------------------------------------------------ */

const DEFAULT_SCRIPT = `# OmniMath Pro — 示例脚本
# 按 Enter 运行，Shift+Enter 换行

# 矩阵运算
A = [1, 2; 3, 4]
det(A)

# 方程求解
solve(x^2 - 5*x + 6, x)

# 符号积分
integrate(x^2, x)

# 绘图
plot(sin(x))`;

function createDefaultNodes(): Record<string, FileNode> {
  const now = Date.now();
  const folderId = genId();
  const fileId = genId();
  const nodes: Record<string, FileNode> = {};

  nodes[folderId] = {
    id: folderId,
    name: '示例',
    type: 'folder',
    parentId: null,
    createdAt: now,
    updatedAt: now,
    expanded: true,
  };
  nodes[fileId] = {
    id: fileId,
    name: '入门.omni',
    type: 'file',
    parentId: folderId,
    content: DEFAULT_SCRIPT,
    language: 'simple',
    createdAt: now,
    updatedAt: now,
  };
  return nodes;
}

/* ------------------------------------------------------------------ */
/*  Store                                                             */
/* ------------------------------------------------------------------ */

export const useFileSystemStore = create<FileSystemState>((set, get) => ({
  nodes: {},
  activeFileId: null,
  loaded: false,

  createFile: (name, parentId, content = '', language = 'simple') => {
    assertNoDuplicateName(get().nodes, parentId, name);
    const id = genId();
    const now = Date.now();
    const node: FileNode = {
      id,
      name,
      type: 'file',
      parentId,
      content,
      language,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({
      nodes: { ...s.nodes, [id]: node },
      activeFileId: id,
    }));
    // Auto-expand parent folder so the new file is visible.
    if (parentId) {
      const parent = get().nodes[parentId];
      if (parent && parent.type === 'folder' && !parent.expanded) {
        set((s) => ({
          nodes: { ...s.nodes, [parentId]: { ...s.nodes[parentId], expanded: true } },
        }));
      }
    }
    get().saveToStorage();
    return id;
  },

  createFolder: (name, parentId) => {
    assertNoDuplicateName(get().nodes, parentId, name);
    const id = genId();
    const now = Date.now();
    const node: FileNode = {
      id,
      name,
      type: 'folder',
      parentId,
      createdAt: now,
      updatedAt: now,
      expanded: true,
    };
    set((s) => ({
      nodes: { ...s.nodes, [id]: node },
    }));
    if (parentId) {
      const parent = get().nodes[parentId];
      if (parent && parent.type === 'folder' && !parent.expanded) {
        set((s) => ({
          nodes: { ...s.nodes, [parentId]: { ...s.nodes[parentId], expanded: true } },
        }));
      }
    }
    get().saveToStorage();
    return id;
  },

  renameNode: (id, name) => {
    const node = get().nodes[id];
    if (!node) return;
    // Reject renames that would collide with a sibling in the same
    // directory (excluding the node itself).
    assertNoDuplicateName(get().nodes, node.parentId, name, id);
    set((s) => ({
      nodes: {
        ...s.nodes,
        [id]: { ...s.nodes[id], name, updatedAt: Date.now() },
      },
    }));
    get().saveToStorage();
  },

  deleteNode: (id) => {
    set((s) => {
      const next = { ...s.nodes };
      // Recursively collect all descendants.
      const toDelete: string[] = [id];
      let changed = true;
      while (changed) {
        changed = false;
        for (const node of Object.values(next)) {
          if (toDelete.includes(node.parentId ?? '') && !toDelete.includes(node.id)) {
            toDelete.push(node.id);
            changed = true;
          }
        }
      }
      for (const did of toDelete) delete next[did];
      const activeFileId = toDelete.includes(s.activeFileId ?? '') ? null : s.activeFileId;
      return { nodes: next, activeFileId };
    });
    get().saveToStorage();
  },

  moveNode: (id, newParentId) => {
    set((s) => {
      const node = s.nodes[id];
      if (!node) return s;
      // Prevent moving a folder into its own descendant.
      if (node.type === 'folder' && newParentId) {
        let cur: string | null = newParentId;
        while (cur) {
          if (cur === id) return s; // would create a cycle
          cur = s.nodes[cur]?.parentId ?? null;
        }
      }
      return {
        nodes: {
          ...s.nodes,
          [id]: { ...node, parentId: newParentId, updatedAt: Date.now() },
        },
      };
    });
    get().saveToStorage();
  },

  updateFileContent: (id, content) => {
    set((s) => {
      const node = s.nodes[id];
      if (!node || node.type !== 'file') return s;
      return {
        nodes: {
          ...s.nodes,
          [id]: { ...node, content, updatedAt: Date.now() },
        },
      };
    });
    get().saveToStorage();
  },

  toggleFolderExpanded: (id) => {
    set((s) => {
      const node = s.nodes[id];
      if (!node || node.type !== 'folder') return s;
      // The UI treats `expanded === undefined` as expanded
      // (`node.expanded !== false`), so negating the raw value is wrong:
      // toggling an undefined-expanded folder used to set it to `true`,
      // producing no visible change on the first click. Negate the
      // *displayed* state instead.
      return {
        nodes: {
          ...s.nodes,
          [id]: { ...node, expanded: node.expanded === false },
        },
      };
    });
    get().saveToStorage();
  },

  getChildren: (parentId) => {
    const { nodes } = get();
    return Object.values(nodes)
      .filter((n) => n.parentId === parentId)
      .sort((a, b) => {
        // Folders first, then files; alphabetical within each group.
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name, 'zh-CN');
      });
  },

  getPath: (id) => {
    const { nodes } = get();
    const parts: string[] = [];
    let cur: string | null = id;
    while (cur && nodes[cur]) {
      parts.unshift(nodes[cur].name);
      cur = nodes[cur].parentId;
    }
    return '/' + parts.join('/');
  },

  setActiveFile: (id) => {
    set({ activeFileId: id });
    get().saveToStorage();
  },

  loadFromStorage: async () => {
    try {
      const data = (await idbGet(FS_KEY)) as PersistedFS | null;
      if (data && data.nodes && typeof data.nodes === 'object') {
        // Sanitize the persisted active file: it may reference a node that
        // no longer exists (e.g. corrupted/older data), which would leave
        // the editor bound to a phantom file.
        const persistedActive = data.activeFileId ?? null;
        const activeFileId =
          persistedActive && data.nodes[persistedActive]?.type === 'file'
            ? persistedActive
            : null;
        set({
          nodes: data.nodes,
          activeFileId,
          loaded: true,
        });
      } else {
        // First launch — seed with default example.
        const nodes = createDefaultNodes();
        set({ nodes, activeFileId: null, loaded: true });
        // Persist the seed.
        await idbSet(FS_KEY, { nodes, activeFileId: null } satisfies PersistedFS);
      }
    } catch {
      // Fallback: create defaults in memory (no persistence).
      const nodes = createDefaultNodes();
      set({ nodes, activeFileId: null, loaded: true });
    }
  },

  saveToStorage: () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const { nodes, activeFileId } = get();
      void idbSet(FS_KEY, { nodes, activeFileId } satisfies PersistedFS);
    }, 400);
  },
}));
