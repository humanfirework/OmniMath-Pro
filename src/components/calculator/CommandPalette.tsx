'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { EXAMPLE_TEMPLATES } from '@/lib/calculator/engine';
import { t } from '@/lib/calculator/i18n';
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
  Calculator,
  Plus,
  Trash2,
  Sun,
  Moon,
  PanelLeft,
  Eye,
  EyeOff,
  Sigma,
  History,
  BookOpen,
  BookMarked,
  Variable,
  LayoutTemplate,
  Play,
  FileCode2,
  Ruler,
  Hash,
  Equal,
} from 'lucide-react';

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setEditorContent,
    editorContent,
    clearHistory,
    toggleTheme,
    toggleSidePanel,
    togglePreview,
    setActiveSidePanel,
    theme,
  } = useCalculatorStore();

  const [search, setSearch] = useState('');

  // Global keyboard shortcut: Ctrl+Shift+P or Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !e.shiftKey) {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const commands = [
    {
      group: t('cpGroupActions'),
      items: [
        { id: 'run', label: t('cpRunAll'), icon: <Play className="h-4 w-4" />, shortcut: 'Enter', action: () => {
          const textarea = document.querySelector('textarea');
          if (textarea) {
            textarea.focus();
            setTimeout(() => {
              const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
              textarea.dispatchEvent(event);
            }, 50);
          }
          setCommandPaletteOpen(false);
        }},
        { id: 'clear-editor', label: t('cpClearEditor'), icon: <Trash2 className="h-4 w-4" />, action: () => { setEditorContent(''); setCommandPaletteOpen(false); } },
        { id: 'clear-history', label: t('cpClearAllHistVars'), icon: <Trash2 className="h-4 w-4" />, action: () => { clearHistory(); setCommandPaletteOpen(false); } },
      ],
    },
    {
      group: t('cpGroupView'),
      items: [
        { id: 'toggle-theme', label: theme === 'dark' ? t('cpSwitchLight') : t('cpSwitchDark'), icon: theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />, action: () => { toggleTheme(); setCommandPaletteOpen(false); } },
        { id: 'toggle-sidebar', label: t('cpToggleSidebar'), icon: <PanelLeft className="h-4 w-4" />, shortcut: 'Ctrl+B', action: () => { toggleSidePanel(); setCommandPaletteOpen(false); } },
        { id: 'toggle-preview', label: t('cpTogglePreview'), icon: theme === 'dark' ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />, action: () => { togglePreview(); setCommandPaletteOpen(false); } },
      ],
    },
    {
      group: t('cpGroupPanels'),
      items: [
        { id: 'panel-symbols', label: t('cpOpenSymbols'), icon: <Sigma className="h-4 w-4" />, action: () => { setActiveSidePanel('symbols'); setCommandPaletteOpen(false); } },
        { id: 'panel-formulas', label: t('cpOpenFormulas'), icon: <BookMarked className="h-4 w-4" />, action: () => { setActiveSidePanel('formulas'); setCommandPaletteOpen(false); } },
        { id: 'panel-templates', label: t('cpOpenTemplates'), icon: <LayoutTemplate className="h-4 w-4" />, action: () => { setActiveSidePanel('templates'); setCommandPaletteOpen(false); } },
        { id: 'panel-solver', label: t('cpOpenSolver'), icon: <Equal className="h-4 w-4" />, action: () => { setActiveSidePanel('solver'); setCommandPaletteOpen(false); } },
        { id: 'panel-units', label: t('cpOpenUnits'), icon: <Ruler className="h-4 w-4" />, action: () => { setActiveSidePanel('units'); setCommandPaletteOpen(false); } },
        { id: 'panel-bases', label: t('cpOpenBases'), icon: <Hash className="h-4 w-4" />, action: () => { setActiveSidePanel('bases'); setCommandPaletteOpen(false); } },
        { id: 'panel-history', label: t('cpOpenHistory'), icon: <History className="h-4 w-4" />, action: () => { setActiveSidePanel('history'); setCommandPaletteOpen(false); } },
        { id: 'panel-variables', label: t('cpOpenVariables'), icon: <Variable className="h-4 w-4" />, action: () => { setActiveSidePanel('variables'); setCommandPaletteOpen(false); } },
        { id: 'panel-guide', label: t('cpOpenGuide'), icon: <BookOpen className="h-4 w-4" />, action: () => { setActiveSidePanel('guide'); setCommandPaletteOpen(false); } },
      ],
    },
    {
      group: t('cpGroupTemplates'),
      items: EXAMPLE_TEMPLATES.map((tpl, i) => ({
        id: `tpl-${i}`,
        label: `${t('tplInsert')}: ${tpl.title}`,
        icon: <FileCode2 className="h-4 w-4" />,
        action: () => { setEditorContent(tpl.code); setCommandPaletteOpen(false); },
      })),
    },
  ];

  return (
    <CommandDialog open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen}>
      <CommandInput placeholder={t('cpPlaceholder')} value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>{t('cpNoResults')}</CommandEmpty>

        {commands.map((group, gi) => (
          <React.Fragment key={gi}>
            <CommandGroup heading={group.group}>
              {group.items.map((item: { id: string; label: string; icon: React.ReactNode; shortcut?: string; action: () => void }) => (
                <CommandItem
                  key={item.id}
                  onSelect={item.action}
                  className="cursor-pointer"
                >
                  {item.icon}
                  <span className="ml-2">{item.label}</span>
                  {item.shortcut && (
                    <CommandShortcut>{item.shortcut}</CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {gi < commands.length - 1 && <CommandSeparator />}
          </React.Fragment>
        ))}

        {/* Quick math eval */}
        {search && /^[\d\s+\-*/().^a-z]+$/i.test(search) && !search.startsWith('>') && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t('cpQuickEval')}>
              <CommandItem
                onSelect={() => {
                  setEditorContent(search);
                  setCommandPaletteOpen(false);
                  setTimeout(() => {
                    const textarea = document.querySelector('textarea');
                    if (textarea) {
                      textarea.focus();
                      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
                      textarea.dispatchEvent(event);
                    }
                  }, 100);
                }}
                className="cursor-pointer"
              >
                <Calculator className="h-4 w-4" />
                <span className="ml-2">= {search}</span>
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
