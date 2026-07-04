'use client';

/**
 * OmniMath Pro — Command Palette
 *
 * Cmdk-based (shadcn CommandDialog) triggered by Ctrl+Shift+P / Ctrl+K.
 * Commands: switch mode, clear all, reset scope, toggle theme, switch
 * language, insert example, switch view mode, switch preview tab, open
 * side panels, etc.
 */

import { useCallback, useEffect } from 'react';
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
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import {
  t,
  setLocale as setI18nLocale,
  getLocale,
  type Locale,
} from '@/lib/i18n';
import type { InputMode } from '@/lib/engine/types';
import type { SidePanelTab, PreviewTab } from '@/lib/store/workbench';

const EXAMPLE_SCRIPTS: Array<{ label: string; content: string }> = [
  { label: '基础算式', content: '2 + 3 * 4\nsin(pi/4)\nlog(100)' },
  { label: '矩阵运算', content: 'A = [1, 2; 3, 4]\ndet(A)\nA * A' },
  { label: '函数绘图', content: 'plot(sin(x))\nplot(cos(x) * exp(-x/5))' },
  { label: '微积分', content: "derivative('x^3', 'x')\nintegrate('x^2', 'x')" },
  { label: '方程求解', content: 'solve(x^2 - 5*x + 6, x)' },
];

export function CommandPalette() {
  const open = useWorkbenchStore((s) => s.commandPaletteOpen);
  const setOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);
  const toggleTheme = useWorkbenchStore((s) => s.toggleTheme);
  const setTheme = useWorkbenchStore((s) => s.setTheme);
  const theme = useWorkbenchStore((s) => s.theme);
  const setInputMode = useWorkbenchStore((s) => s.setInputMode);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const clearHistory = useWorkbenchStore((s) => s.clearHistory);
  const clearVariables = useWorkbenchStore((s) => s.clearVariables);
  const clearPlots = useWorkbenchStore((s) => s.clearPlots);
  const setActiveSidePanel = useWorkbenchStore((s) => s.setActiveSidePanel);
  const toggleSidePanel = useWorkbenchStore((s) => s.toggleSidePanel);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setLocaleStore = useWorkbenchStore((s) => s.setLocale);
  const editorContent = useWorkbenchStore((s) => s.editorContent);

  // Global hotkeys — Ctrl+Shift+P / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'p' || e.key === 'P') &&
        e.shiftKey
      ) {
        e.preventDefault();
        setOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setOpen]);

  const close = useCallback(() => setOpen(false), [setOpen]);

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
    >
      <CommandInput placeholder={t('cpPlaceholder')} />
      <CommandList>
        <CommandEmpty>{t('cpNoResults')}</CommandEmpty>

        {/* Actions */}
        <CommandGroup heading={t('cpGroupActions')}>
          <CommandItem
            onSelect={() => {
              // Trigger run by dispatching a click on the Run button (simpler:
              // set the editor content to itself and trigger run via store
              // event). For now we leave Run to the EditorPanel's own hotkey
              // (Enter), so we just close.
              close();
            }}
          >
            <Play className="size-4" />
            <span>{t('cpRunAll')}</span>
            <CommandShortcut>Enter</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setEditorContent('');
              close();
            }}
          >
            <Eraser className="size-4" />
            <span>{t('cpClearEditor')}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              clearHistory();
              clearVariables();
              clearPlots();
              close();
            }}
          >
            <Trash2 className="size-4" />
            <span>{t('cpClearAllHistVars')}</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* View */}
        <CommandGroup heading={t('cpGroupView')}>
          <CommandItem
            onSelect={() => {
              toggleTheme();
              close();
            }}
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span>{theme === 'dark' ? t('cpSwitchLight') : t('cpSwitchDark')}</span>
          </CommandItem>
          <CommandItem onSelect={() => switchLocale('zh-CN')}>
            <Languages className="size-4" />
            <span>中文</span>
            {getLocale() === 'zh-CN' && <CommandShortcut>✓</CommandShortcut>}
          </CommandItem>
          <CommandItem onSelect={() => switchLocale('en')}>
            <Languages className="size-4" />
            <span>English</span>
            {getLocale() === 'en' && <CommandShortcut>✓</CommandShortcut>}
          </CommandItem>
          <CommandItem
            onSelect={() => {
              toggleSidePanel();
              close();
            }}
          >
            <PanelLeft className="size-4" />
            <span>{t('cpToggleSidebar')}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setViewMode('workbench');
              close();
            }}
          >
            <Code2 className="size-4" />
            <span>Workbench</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              setViewMode('pipeline');
              close();
            }}
          >
            <Workflow className="size-4" />
            <span>Pipeline</span>
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
              { tab: 'history' as SidePanelTab, label: t('cpOpenHistory'), icon: History },
              { tab: 'variables' as SidePanelTab, label: t('cpOpenVariables'), icon: Variable },
              { tab: 'formulas' as SidePanelTab, label: t('cpOpenFormulas'), icon: BookOpen },
              { tab: 'linalg' as SidePanelTab, label: t('cpOpenLinalg'), icon: Grid3x3 },
              { tab: 'solver' as SidePanelTab, label: t('abSolver'), icon: FunctionSquare },
            ]
          ).map(({ tab, label, icon: Icon }) => (
            <CommandItem
              key={tab}
              onSelect={() => {
                setActiveSidePanel(tab);
                setViewMode('workbench');
                close();
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
              { tab: 'formula' as PreviewTab, label: t('previewFormula'), icon: FileText },
              { tab: 'plot2d' as PreviewTab, label: t('previewPlot'), icon: BarChart3 },
              { tab: 'plot3d' as PreviewTab, label: t('preview3D'), icon: Box },
              { tab: 'log' as PreviewTab, label: t('previewLog'), icon: Clock },
              { tab: 'ai' as PreviewTab, label: t('tabAI'), icon: Sparkles },
            ]
          ).map(({ tab, label, icon: Icon }) => (
            <CommandItem
              key={tab}
              onSelect={() => {
                setActivePreviewTab(tab);
                close();
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
