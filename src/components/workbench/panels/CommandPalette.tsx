'use client';

/**
 * OmniMath Pro — Command Palette
 *
 * Cmdk-based (shadcn CommandDialog) triggered by Ctrl+Shift+P / Ctrl+K.
 * Commands: switch mode, clear all, reset scope, toggle theme, switch
 * language, insert example, switch view mode, switch preview tab, open
 * side panels, etc.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Play,
  Trash2,
  Eraser,
  Sun,
  Moon,
  Languages,
  History,
  Variable,
  BookOpen,
  Grid3x3,
  FunctionSquare,
  Workflow,
  FileText,
  BarChart3,
  Box,
  Clock,
  Sparkles,
  PanelLeft,
  PanelRight,
  Code2,
  LayoutTemplate,
  Pin,
  PinOff,
  PanelLeftClose,
  PanelRightClose,
  PanelRightOpen,
  PencilRuler,
  CircleGauge,
  GraduationCap,
  House,
  Settings,
  Maximize,
  Check,
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useSettingsStore } from '@/lib/store/settingsStore';
import {
  t,
  setLocale as setI18nLocale,
  getLocale,
  useLocale,
  type Locale,
  type TranslationDict,
} from '@/lib/i18n';
import type { InputMode } from '@/lib/engine/types';
import type { SidePanelTab, PreviewTab, ViewMode } from '@/lib/store/workbench';

/** 工具视图入口：命令面板里按当前语言显示，中文/英文都能搜到。 */
const VIEW_COMMANDS: Array<{
  mode: ViewMode;
  icon: typeof Code2;
  labelKey: keyof TranslationDict;
}> = [
  { mode: 'home', icon: House, labelKey: 'abHome' },
  { mode: 'workbench', icon: Code2, labelKey: 'viewWorkbench' },
  { mode: 'whiteboard', icon: PencilRuler, labelKey: 'abWhiteboard' },
  { mode: 'pipeline', icon: Workflow, labelKey: 'abPipeline' },
  { mode: 'linalg', icon: Grid3x3, labelKey: 'abLinalg' },
  { mode: 'solver', icon: FunctionSquare, labelKey: 'abSolver' },
  { mode: 'stats', icon: BarChart3, labelKey: 'abStats' },
  { mode: 'control', icon: CircleGauge, labelKey: 'abControl' },
  { mode: 'education', icon: GraduationCap, labelKey: 'abEducation' },
];

const EXAMPLE_SCRIPTS: Array<{ label: string; content: string }> = [
  { label: '基础算式', content: '2 + 3 * 4\nsin(pi/4)\nlog(100)' },
  { label: '矩阵运算', content: 'A = [1, 2; 3, 4]\ndet(A)\nA * A' },
  { label: '函数绘图', content: 'plot(sin(x))\nplot(cos(x) * exp(-x/5))' },
  { label: '微积分', content: "derivative('x^3', 'x')\nintegrate('x^2', 'x')" },
  { label: '方程求解', content: 'solve(x^2 - 5*x + 6, x)' },
];

/* ─── 最近使用（持久化到 localStorage） ─────────────────────────── */
const RECENTS_KEY = 'omnimath:command-recents-v1';
const MAX_RECENTS = 5;

/** 可记录「最近使用」的稳定命令 id（与展示文案解耦）。 */
type CommandId =
  | 'run-all'
  | 'run-independent'
  | 'clear-editor'
  | 'clear-all'
  | 'open-settings'
  | 'toggle-theme'
  | 'toggle-sidebar'
  | 'toggle-editor'
  | 'toggle-preview'
  | 'view-workbench'
  | 'view-whiteboard'
  | 'view-pipeline'
  | 'open-history'
  | 'open-variables'
  | 'open-formulas'
  | 'preview-formula'
  | 'preview-plot2d'
  | 'preview-plot3d';

/** 视图模式 → 可记录的命令 id（其余视图不进入最近使用）。 */
const VIEW_COMMAND_IDS: Partial<Record<ViewMode, CommandId>> = {
  workbench: 'view-workbench',
  whiteboard: 'view-whiteboard',
  pipeline: 'view-pipeline',
};

const COMMAND_ID_SET: Record<CommandId, true> = {
  'run-all': true,
  'run-independent': true,
  'clear-editor': true,
  'clear-all': true,
  'open-settings': true,
  'toggle-theme': true,
  'toggle-sidebar': true,
  'toggle-editor': true,
  'toggle-preview': true,
  'view-workbench': true,
  'view-whiteboard': true,
  'view-pipeline': true,
  'open-history': true,
  'open-variables': true,
  'open-formulas': true,
  'preview-formula': true,
  'preview-plot2d': true,
  'preview-plot3d': true,
};

const isCommandId = (value: unknown): value is CommandId =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(COMMAND_ID_SET, value);

export function CommandPalette() {
  useLocale(); // 语言切换时重渲染 t()
  const open = useWorkbenchStore((s) => s.commandPaletteOpen);
  const setOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);
  const toggleTheme = useWorkbenchStore((s) => s.toggleTheme);
  const setTheme = useWorkbenchStore((s) => s.setTheme);
  const theme = useWorkbenchStore((s) => s.theme);
  const setInputMode = useWorkbenchStore((s) => s.setInputMode);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const setActiveSidePanel = useWorkbenchStore((s) => s.setActiveSidePanel);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setLocaleStore = useWorkbenchStore((s) => s.setLocale);
  const editorContent = useWorkbenchStore((s) => s.editorContent);
  const setSettingsOpen = useSettingsStore((s) => s.setOpen);

  const editorVisible = useWorkbenchStore((s) => s.editorVisible);
  const previewVisible = useWorkbenchStore((s) => s.previewVisible);
  const activityBarPosition = useWorkbenchStore((s) => s.activityBarPosition);
  const activityBarLocked = useWorkbenchStore((s) => s.activityBarLocked);
  const activityBarAutoHide = useWorkbenchStore((s) => s.activityBarAutoHide);
  const activityBarHidden = useWorkbenchStore((s) => s.activityBarHidden);
  const setActivityBarPosition = useWorkbenchStore((s) => s.setActivityBarPosition);
  const toggleActivityBarLock = useWorkbenchStore((s) => s.toggleActivityBarLock);
  const setActivityBarAutoHide = useWorkbenchStore((s) => s.setActivityBarAutoHide);
  const toggleActivityBarHidden = useWorkbenchStore((s) => s.toggleActivityBarHidden);

  // Global hotkeys — Ctrl+K (secondary). Ctrl+Shift+P is handled by the
  // global shortcutsStore (openPalette action) registered in Workbench.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  /* ─── 最近使用：最多 5 条，localStorage 持久化 ─────────────────── */
  const [recents, setRecents] = useState<CommandId[]>([]);
  const recentsRef = useRef<CommandId[]>([]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(RECENTS_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const valid = parsed.filter(isCommandId).slice(0, MAX_RECENTS);
      recentsRef.current = valid;
      setRecents(valid);
    } catch {
      /* 损坏的存储内容直接忽略，回到空列表 */
    }
  }, []);

  const recordRecent = useCallback((id: CommandId) => {
    const next = [id, ...recentsRef.current.filter((x) => x !== id)].slice(0, MAX_RECENTS);
    recentsRef.current = next;
    setRecents(next);
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    } catch {
      /* 存储不可用时静默降级，不影响命令执行 */
    }
  }, []);

  // 单一执行入口：主列表与「最近使用」共用，记录 id 后关闭面板。
  const runCommand = useCallback(
    (id: CommandId) => {
      const store = useWorkbenchStore.getState();
      switch (id) {
        case 'run-all':
          window.dispatchEvent(new CustomEvent('omnimath:run-all'));
          break;
        case 'run-independent':
          window.dispatchEvent(new CustomEvent('omnimath:run-independent'));
          break;
        case 'clear-editor':
          store.setEditorContent('');
          break;
        case 'clear-all':
          store.clearHistory();
          store.clearVariables();
          store.clearPlots();
          break;
        case 'open-settings':
          useSettingsStore.getState().setOpen(true);
          break;
        case 'toggle-theme':
          store.toggleTheme();
          break;
        case 'toggle-sidebar':
          store.toggleSidePanel();
          break;
        case 'toggle-editor':
          store.setEditorVisible(!store.editorVisible);
          break;
        case 'toggle-preview':
          store.setPreviewVisible(!store.previewVisible);
          break;
        case 'view-workbench':
          store.setViewMode('workbench');
          break;
        case 'view-whiteboard':
          store.setViewMode('whiteboard');
          break;
        case 'view-pipeline':
          store.setViewMode('pipeline');
          break;
        case 'open-history':
          store.setActiveSidePanel('history');
          store.setViewMode('workbench');
          break;
        case 'open-variables':
          store.setActiveSidePanel('variables');
          store.setViewMode('workbench');
          break;
        case 'open-formulas':
          store.setActiveSidePanel('formulas');
          store.setViewMode('workbench');
          break;
        case 'preview-formula':
          store.setActivePreviewTab('formula');
          break;
        case 'preview-plot2d':
          store.setActivePreviewTab('plot2d');
          break;
        case 'preview-plot3d':
          store.setActivePreviewTab('plot3d');
          break;
      }
      recordRecent(id);
      close();
    },
    [recordRecent, close],
  );

  // 最近使用列表的展示信息（与主列表保持同样的图标 / 文案 / 快捷键）。
  type RecentDef = { label: string; icon: typeof Play; shortcut?: string };
  const recentDefs: Record<CommandId, RecentDef> = {
    'run-all': { label: t('cpRunAll'), icon: Play, shortcut: 'Ctrl+Enter' },
    'run-independent': { label: t('cpRunIndependent'), icon: Maximize },
    'clear-editor': { label: t('cpClearEditor'), icon: Eraser },
    'clear-all': { label: t('cpClearAllHistVars'), icon: Trash2 },
    'open-settings': { label: t('settingsTitle'), icon: Settings },
    'toggle-theme': {
      label: theme === 'dark' ? t('cpSwitchLight') : t('cpSwitchDark'),
      icon: theme === 'dark' ? Sun : Moon,
    },
    'toggle-sidebar': { label: t('cpToggleSidebar'), icon: PanelLeft },
    'toggle-editor': { label: t('cpToggleEditor'), icon: LayoutTemplate },
    'toggle-preview': { label: t('cpTogglePreview'), icon: PanelRight },
    'view-workbench': { label: t('viewWorkbench'), icon: Code2 },
    'view-whiteboard': { label: t('abWhiteboard'), icon: PencilRuler },
    'view-pipeline': { label: t('abPipeline'), icon: Workflow },
    'open-history': { label: t('cpOpenHistory'), icon: History },
    'open-variables': { label: t('cpOpenVariables'), icon: Variable },
    'open-formulas': { label: t('cpOpenFormulas'), icon: BookOpen },
    'preview-formula': { label: t('previewFormula'), icon: FileText },
    'preview-plot2d': { label: t('previewPlot'), icon: BarChart3 },
    'preview-plot3d': { label: t('preview3D'), icon: Box },
  };

  const switchLocale = (next: Locale) => {
    setI18nLocale(next);
    setLocaleStore(next);
    close();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t('cpTitle')}
      description={t('cpPlaceholder')}
      className="top-[14px] translate-y-0 sm:max-w-[600px]"
      showCloseButton={false}
    >
      <div className="relative">
        <CommandInput placeholder={t('cpPlaceholder')} className="pr-14" />
        <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-border bg-muted/60 px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
          Esc
        </kbd>
      </div>
      <CommandList>
        <CommandEmpty>
          <div className="flex flex-col items-center gap-1.5 px-4 py-2 text-center">
            <p className="text-[12px] font-medium text-foreground/80">{t('cpNoResults')}</p>
            <p className="text-[11px] text-muted-foreground">试试下面这些下一步</p>
            <div className="mt-1.5 flex w-full max-w-[320px] flex-col gap-1">
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(true);
                  close();
                }}
                className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-left text-[11.5px] text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Settings className="size-3.5 stroke-[1.75]" />
                打开设置
              </button>
              <button
                type="button"
                onClick={() => {
                  setActivePreviewTab('log');
                  close();
                }}
                className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-left text-[11.5px] text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
              >
                <Clock className="size-3.5 stroke-[1.75]" />
                查看运行日志
              </button>
              <button
                type="button"
                onClick={() => {
                  toggleTheme();
                  close();
                }}
                className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-left text-[11.5px] text-foreground/80 transition-colors hover:border-primary/40 hover:text-primary"
              >
                {theme === 'dark' ? (
                  <Sun className="size-3.5 stroke-[1.75]" />
                ) : (
                  <Moon className="size-3.5 stroke-[1.75]" />
                )}
                切换主题
              </button>
            </div>
          </div>
        </CommandEmpty>

        {/* 最近使用（最多 5 条，持久化在 localStorage） */}
        {recents.length > 0 && (
          <>
            <CommandGroup heading="最近使用">
              {recents.map((id) => {
                const def = recentDefs[id];
                if (!def) return null;
                const Icon = def.icon;
                return (
                  <CommandItem key={`recent-${id}`} onSelect={() => runCommand(id)}>
                    <Icon className="size-4" />
                    <span>{def.label}</span>
                    {def.shortcut && <CommandShortcut>{def.shortcut}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* ACTIONS */}
        <CommandGroup heading={t('cpGroupActions')}>
          <CommandItem onSelect={() => runCommand('run-all')}>
            <Play className="size-4" />
            <span>{t('cpRunAll')}</span>
            <CommandShortcut>Ctrl+Enter</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand('run-independent')}>
            <Maximize className="size-4" />
            <span>{t('cpRunIndependent')}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand('clear-editor')}>
            <Eraser className="size-4" />
            <span>{t('cpClearEditor')}</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand('clear-all')}>
            <Trash2 className="size-4" />
            <span>{t('cpClearAllHistVars')}</span>
          </CommandItem>
          {/* 手机端标题栏没有菜单栏：命令面板 / 语言菜单是进入设置的主要入口 */}
          <CommandItem onSelect={() => runCommand('open-settings')}>
            <Settings className="size-4" />
            <span>{t('settingsTitle')}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* View */}
        <CommandGroup heading={t('cpGroupView')}>
          <CommandItem onSelect={() => runCommand('toggle-theme')}>
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span>{theme === 'dark' ? t('cpSwitchLight') : t('cpSwitchDark')}</span>
          </CommandItem>
          <CommandItem onSelect={() => switchLocale('zh-CN')}>
            <Languages className="size-4" />
            <span>中文</span>
            {getLocale() === 'zh-CN' && (
              <CommandShortcut>
                <Check className="size-3.5 text-primary" strokeWidth={1.75} />
              </CommandShortcut>
            )}
          </CommandItem>
          <CommandItem onSelect={() => switchLocale('en')}>
            <Languages className="size-4" />
            <span>English</span>
            {getLocale() === 'en' && (
              <CommandShortcut>
                <Check className="size-3.5 text-primary" strokeWidth={1.75} />
              </CommandShortcut>
            )}
          </CommandItem>
          <CommandItem onSelect={() => runCommand('toggle-sidebar')}>
            <PanelLeft className="size-4" />
            <span>{t('cpToggleSidebar')}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Workspace views — 与活动栏 / 首页卡片使用同一套本地化名称 */}
        <CommandGroup heading={t('cpGroupViews')}>
          {VIEW_COMMANDS.map(({ mode, icon: Icon, labelKey }) => (
            <CommandItem
              key={mode}
              onSelect={() => {
                const commandId = VIEW_COMMAND_IDS[mode];
                if (commandId) {
                  runCommand(commandId);
                } else {
                  setViewMode(mode);
                  close();
                }
              }}
            >
              <Icon className="size-4" />
              <span>{t(labelKey)}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Layout */}
        <CommandGroup heading={t('cpGroupLayout')}>
          <CommandItem onSelect={() => runCommand('toggle-editor')}>
            <LayoutTemplate className="size-4" />
            <span>{t('cpToggleEditor')}</span>
            {editorVisible && (
              <CommandShortcut>
                <Check className="size-3.5 text-primary" strokeWidth={1.75} />
              </CommandShortcut>
            )}
          </CommandItem>
          <CommandItem onSelect={() => runCommand('toggle-preview')}>
            <PanelRight className="size-4" />
            <span>{t('cpTogglePreview')}</span>
            {previewVisible && (
              <CommandShortcut>
                <Check className="size-3.5 text-primary" strokeWidth={1.75} />
              </CommandShortcut>
            )}
          </CommandItem>
          <CommandItem
            onSelect={() => {
              toggleActivityBarHidden();
              close();
            }}
          >
            {activityBarHidden ? <PanelRightOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            <span>{activityBarHidden ? t('cpShowActivityBar') : t('cpHideActivityBar')}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setActivityBarPosition(activityBarPosition === 'left' ? 'right' : 'left');
              close();
            }}
          >
            {activityBarPosition === 'left' ? <PanelRight className="size-4" /> : <PanelLeft className="size-4" />}
            <span>
              {activityBarPosition === 'left' ? t('cpMoveActivityBarRight') : t('cpMoveActivityBarLeft')}
            </span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              toggleActivityBarLock();
              close();
            }}
          >
            {activityBarLocked ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            <span>{activityBarLocked ? t('cpUnlockActivityBar') : t('cpLockActivityBar')}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setActivityBarAutoHide(!activityBarAutoHide);
              close();
            }}
          >
            {activityBarAutoHide ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
            <span>
              {activityBarAutoHide ? t('cpDisableAutoHideActivityBar') : t('cpAutoHideActivityBar')}
            </span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Mode switch */}
        <CommandGroup heading="输入模式">
          {(['simple', 'python', 'matlab'] as InputMode[]).map((m) => (
            <CommandItem
              key={m}
              onSelect={() => {
                setInputMode(m);
                close();
              }}
            >
              <Code2 className="size-4" />
              <span>
                {m === 'simple'
                  ? t('editorModeSimple')
                  : m === 'python'
                    ? t('editorModePython')
                    : t('editorModeMatlab')}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Side panels */}
        <CommandGroup heading={t('cpGroupPanels')}>
          {(
            [
              { tab: 'history' as SidePanelTab, label: t('cpOpenHistory'), icon: History, commandId: 'open-history' as CommandId },
              { tab: 'variables' as SidePanelTab, label: t('cpOpenVariables'), icon: Variable, commandId: 'open-variables' as CommandId },
              { tab: 'formulas' as SidePanelTab, label: t('cpOpenFormulas'), icon: BookOpen, commandId: 'open-formulas' as CommandId },
              { tab: 'linalg' as SidePanelTab, label: t('cpOpenLinalg'), icon: Grid3x3 },
              { tab: 'solver' as SidePanelTab, label: t('abSolver'), icon: FunctionSquare },
            ] as Array<{ tab: SidePanelTab; label: string; icon: typeof Clock; commandId?: CommandId }>
          ).map(({ tab, label, icon: Icon, commandId }) => (
            <CommandItem
              key={tab}
              onSelect={() => {
                if (commandId) {
                  runCommand(commandId);
                } else {
                  setActiveSidePanel(tab);
                  setViewMode('workbench');
                  close();
                }
              }}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Preview tabs */}
        <CommandGroup heading="预览面板">
          {(
            [
              { tab: 'formula' as PreviewTab, label: t('previewFormula'), icon: FileText, commandId: 'preview-formula' as CommandId },
              { tab: 'plot2d' as PreviewTab, label: t('previewPlot'), icon: BarChart3, commandId: 'preview-plot2d' as CommandId },
              { tab: 'plot3d' as PreviewTab, label: t('preview3D'), icon: Box, commandId: 'preview-plot3d' as CommandId },
              { tab: 'log' as PreviewTab, label: t('previewLog'), icon: Clock },
              { tab: 'ai' as PreviewTab, label: t('tabAI'), icon: Sparkles },
            ] as Array<{ tab: PreviewTab; label: string; icon: typeof Clock; commandId?: CommandId }>
          ).map(({ tab, label, icon: Icon, commandId }) => (
            <CommandItem
              key={tab}
              onSelect={() => {
                if (commandId) {
                  runCommand(commandId);
                } else {
                  setActivePreviewTab(tab);
                  close();
                }
              }}
            >
              <Icon className="size-4" />
              <span>{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        {/* Examples */}
        <CommandGroup heading={t('cpGroupTemplates')}>
          {EXAMPLE_SCRIPTS.map((ex) => (
            <CommandItem
              key={ex.label}
              onSelect={() => {
                setEditorContent(editorContent ? `${editorContent}\n${ex.content}` : ex.content);
                close();
              }}
            >
              <FileText className="size-4" />
              <span>{ex.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
