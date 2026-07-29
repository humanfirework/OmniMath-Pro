'use client';

/**
 * OmniMath Pro — Files Panel (VSCode-style file explorer)
 *
 * Renders a virtual file tree backed by `useFileSystemStore`. Supports:
 *   - Create / rename / delete files and folders
 *   - Click a file to load it into the editor
 *   - Right-click context menu (rename / delete / move to root)
 *   - Active file highlighting
 *   - Empty state with quick-create buttons
 *
 * The tree is rendered recursively. Folders can be expanded/collapsed.
 * Sorting: folders first, then files, alphabetical within each group.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  FileCode2,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  Trash2,
  Pencil,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  CornerDownRight,
} from 'lucide-react';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from '@/components/ui/context-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFileSystemStore, type FileNode } from '@/lib/store/fileSystemStore';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { InputMode } from '@/lib/engine/types';

/* ------------------------------------------------------------------ */
/*  Name dialog state — replaces window.prompt (unavailable in Tauri) */
/* ------------------------------------------------------------------ */

interface NameDialogState {
  type: 'file' | 'folder';
  name: string;
  parentId: string | null;
}

/**
 * Flush the debounced editor auto-save for the currently-open file.
 * The EditorPanel saves edits with a 500ms debounce; switching or
 * replacing the active file within that window would otherwise drop the
 * last keystrokes. `exceptId` skips the flush when the target file is
 * the one already open.
 */
function flushActiveFileEdits(exceptId?: string) {
  const fs = useFileSystemStore.getState();
  const prevId = fs.activeFileId;
  if (prevId && prevId !== exceptId && fs.nodes[prevId]?.type === 'file') {
    fs.updateFileContent(prevId, useWorkbenchStore.getState().editorContent);
  }
}

export function FilesPanel() {
  const nodes = useFileSystemStore((s) => s.nodes);
  const loaded = useFileSystemStore((s) => s.loaded);
  const loadFromStorage = useFileSystemStore((s) => s.loadFromStorage);
  const createFile = useFileSystemStore((s) => s.createFile);
  const createFolder = useFileSystemStore((s) => s.createFolder);
  const moveNode = useFileSystemStore((s) => s.moveNode);

  // 拖拽到根目录
  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const handleRootDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId) return;
    try {
      moveNode(draggedId, null);
      toast.success('已移动到根目录');
    } catch (err) {
      toast.error('移动失败', { description: (err as Error).message });
    }
  }, [moveNode]);
  const refresh = useCallback(() => {
    void loadFromStorage();
  }, [loadFromStorage]);

  // Name dialog state — replaces window.prompt (unavailable in Tauri 2).
  const [nameDialog, setNameDialog] = useState<NameDialogState | null>(null);

  // Load on mount.
  useEffect(() => {
    if (!loaded) void loadFromStorage();
  }, [loaded, loadFromStorage]);

  const rootChildren = Object.values(nodes)
    .filter((n) => n.parentId === null)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-CN');
    });

  const handleNewFile = useCallback(() => {
    setNameDialog({ type: 'file', name: '新文件.omni', parentId: null });
  }, []);

  const handleNewFolder = useCallback(() => {
    setNameDialog({ type: 'folder', name: '新文件夹', parentId: null });
  }, []);

  const handleConfirmName = useCallback(() => {
    if (!nameDialog) return;
    const trimmed = nameDialog.name.trim();
    if (!trimmed) return;
    try {
      if (nameDialog.type === 'file') {
        // The new file becomes active — persist pending edits of the
        // previously-open file first (see flushActiveFileEdits).
        flushActiveFileEdits();
        createFile(trimmed, nameDialog.parentId, '', 'simple');
        toast.success(`已创建 ${trimmed}`);
      } else {
        createFolder(trimmed, nameDialog.parentId);
        toast.success(`已创建文件夹 ${trimmed}`);
      }
    } catch (err) {
      toast.error('创建失败', { description: (err as Error).message });
    }
    setNameDialog(null);
  }, [nameDialog, createFile, createFolder]);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
        加载中...
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-border/60 px-1.5 py-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleNewFile}
              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="新建文件"
            >
              <FilePlus className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">新建文件</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleNewFolder}
              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="新建文件夹"
            >
              <FolderPlus className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">新建文件夹</TooltipContent>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={refresh}
              className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="刷新"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">刷新</TooltipContent>
        </Tooltip>
      </div>

      {/* File tree */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="py-1" onDragOver={handleRootDragOver} onDrop={handleRootDrop}>
          {rootChildren.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-8 text-center">
              <Folder className="size-8 text-muted-foreground/40" />
              <p className="text-[11px] text-muted-foreground">暂无文件</p>
              <button
                type="button"
                onClick={handleNewFile}
                className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-[10.5px] text-foreground/80 hover:bg-primary/10 hover:text-primary transition-colors"
              >
                + 新建文件
              </button>
            </div>
          ) : (
            rootChildren.map((node) => (
              <FileTreeNode key={node.id} node={node} depth={0} />
            ))
          )}
        </div>
      </ScrollArea>

      {/* Name dialog — replaces window.prompt */}
      <Dialog open={nameDialog !== null} onOpenChange={(open) => { if (!open) setNameDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px]">
              {nameDialog?.type === 'file' ? '新建文件' : '新建文件夹'}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={nameDialog?.name ?? ''}
            onChange={(e) => setNameDialog((prev) => prev ? { ...prev, name: e.target.value } : null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmName();
              if (e.key === 'Escape') setNameDialog(null);
            }}
            placeholder={nameDialog?.type === 'file' ? '文件名.omni' : '文件夹名'}
            className="text-[12px]"
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setNameDialog(null)}>
              取消
            </Button>
            <Button size="sm" onClick={handleConfirmName}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Recursive tree node                                               */
/* ------------------------------------------------------------------ */

function FileTreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const nodes = useFileSystemStore((s) => s.nodes);
  const activeFileId = useFileSystemStore((s) => s.activeFileId);
  const setActiveFile = useFileSystemStore((s) => s.setActiveFile);
  const toggleFolderExpanded = useFileSystemStore((s) => s.toggleFolderExpanded);
  const renameNode = useFileSystemStore((s) => s.renameNode);
  const deleteNode = useFileSystemStore((s) => s.deleteNode);
  const moveNode = useFileSystemStore((s) => s.moveNode);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  // Delete confirmation dialog — replaces window.confirm (unavailable in Tauri 2).
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  // 拖拽悬停高亮
  const [dragOver, setDragOver] = useState(false);

  const isFolder = node.type === 'folder';
  const expanded = isFolder ? node.expanded !== false : false;
  const isActive = !isFolder && activeFileId === node.id;

  // HTML5 拖拽：拖动节点到文件夹中
  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', node.id);
    e.dataTransfer.effectAllowed = 'move';
  }, [node.id]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!isFolder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  }, [isFolder]);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || draggedId === node.id) return;
    // 不允许将文件夹拖入自己的子文件夹
    if (draggedId === node.id) return;
    try {
      moveNode(draggedId, node.id);
      toast.success('已移动');
    } catch (err) {
      toast.error('移动失败', { description: (err as Error).message });
    }
  }, [node.id, moveNode]);

  // Children (sorted: folders first, then files, alphabetical).
  const children = isFolder
    ? Object.values(nodes)
        .filter((n) => n.parentId === node.id)
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
          return a.name.localeCompare(b.name, 'zh-CN');
        })
    : [];

  const handleClick = useCallback(() => {
    if (isFolder) {
      toggleFolderExpanded(node.id);
      return;
    }
    // Clicking the already-open file must not reload its stored content —
    // the editor may hold edits not yet flushed by the debounced auto-save.
    if (activeFileId === node.id) return;
    // Persist pending edits of the previously-open file before switching.
    flushActiveFileEdits(node.id);
    setActiveFile(node.id);
    // Load content into editor.
    if (node.content !== undefined) {
      setEditorContent(node.content);
    }
  }, [isFolder, node.id, node.content, activeFileId, toggleFolderExpanded, setActiveFile, setEditorContent]);

  const handleRename = useCallback(() => {
    setRenameValue(node.name);
    setRenaming(true);
  }, [node.name]);

  const commitRename = useCallback(() => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== node.name) {
      try {
        renameNode(node.id, trimmed);
        toast.success('已重命名');
      } catch (err) {
        toast.error('重命名失败', { description: (err as Error).message });
      }
    }
    setRenaming(false);
  }, [renameValue, node.id, node.name, renameNode]);

  const handleDelete = useCallback(() => {
    setDeleteConfirm(true);
  }, []);

  const confirmDelete = useCallback(() => {
    try {
      deleteNode(node.id);
      toast.success('已删除');
    } catch (err) {
      toast.error('删除失败', { description: (err as Error).message });
    }
    setDeleteConfirm(false);
  }, [node.id, deleteNode]);

  const handleMoveToRoot = useCallback(() => {
    try {
      moveNode(node.id, null);
      toast.success('已移动到根目录');
    } catch (err) {
      toast.error('移动失败', { description: (err as Error).message });
    }
  }, [node.id, moveNode]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div>
          {renaming ? (
            <div
              className="flex items-center gap-1 py-0.5 pr-2"
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              {isFolder ? (
                <Folder className="size-3.5 shrink-0 text-amber-500/80" />
              ) : (
                <FileCode2 className="size-3.5 shrink-0 text-primary/80" />
              )}
              <input
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                autoFocus
                className="h-5 flex-1 rounded border border-primary/50 bg-background px-1 font-mono text-[11px] text-foreground outline-none"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={handleClick}
              onDoubleClick={handleRename}
              draggable
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                'flex w-full items-center gap-1 py-0.5 pr-2 text-left transition-colors',
                isActive
                  ? 'bg-primary/12 text-primary'
                  : 'text-foreground/80 hover:bg-accent/50 hover:text-foreground',
                dragOver && 'ring-2 ring-primary/50 bg-primary/10',
              )}
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              {isFolder ? (
                <>
                  {expanded ? (
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  {expanded ? (
                    <FolderOpen className="size-3.5 shrink-0 text-amber-500/80" />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-amber-500/80" />
                  )}
                </>
              ) : (
                <>
                  <span className="w-3 shrink-0" />
                  <FileCode2 className="size-3.5 shrink-0 text-primary/70" />
                </>
              )}
              <span className="truncate font-mono text-[11px]">{node.name}</span>
              {isActive && (
                <span className="ml-auto w-[2px] h-3.5 rounded-full bg-primary shrink-0" />
              )}
            </button>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="text-[11px]">
        <ContextMenuItem onClick={handleRename}>
          <Pencil className="mr-2 size-3" />
          重命名
        </ContextMenuItem>
        {node.parentId !== null && (
          <ContextMenuItem onClick={handleMoveToRoot}>
            <CornerDownRight className="mr-2 size-3" />
            移动到根目录
          </ContextMenuItem>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 size-3" />
          删除
        </ContextMenuItem>
      </ContextMenuContent>
      {isFolder && expanded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FileTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog — replaces window.confirm */}
      <Dialog open={deleteConfirm} onOpenChange={setDeleteConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px]">确认删除</DialogTitle>
          </DialogHeader>
          <p className="text-[11.5px] text-muted-foreground">
            {isFolder
              ? `确定删除文件夹 "${node.name}" 及其所有内容？`
              : `确定删除文件 "${node.name}"？`}
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirm(false)}>
              取消
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContextMenu>
  );
}
