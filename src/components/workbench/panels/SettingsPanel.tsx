'use client';

/**
 * OmniMath Pro — 设置面板
 *
 * VS Code 风格的分类设置对话框：
 *   - 左侧分类导航（外观 / 编辑器 / 布局 / 导出 / 语言）
 *   - 右侧设置项（Switch / Select / RadioGroup）
 *
 * 数据来源：
 *   - useWorkbenchStore: theme, locale, activityBar* 设置
 *   - useLayoutStore: previewPosition, previewSize
 *   - useSettingsStore: 面板开关 + 导出默认设置
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  RadioGroup,
  RadioGroupItem,
} from '@/components/ui/radio-group';
import {
  Palette,
  Code2,
  Layout,
  Download,
  Languages,
  Sun,
  Moon,
  PanelLeft,
  PanelRight,
  RotateCcw,
  Keyboard,
} from 'lucide-react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useLayoutStore, LAYOUT_KEY } from '@/lib/store/layoutStore';
import { useSettingsStore, SETTINGS_KEY } from '@/lib/store/settingsStore';
import {
  useShortcutsStore,
  SHORTCUTS_KEY,
  DEFAULT_SHORTCUTS,
  formatShortcut,
  type ShortcutAction,
  type ShortcutDef,
} from '@/lib/store/shortcutsStore';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Category = 'appearance' | 'editor' | 'layout' | 'export' | 'language' | 'shortcuts';

export function SettingsPanel() {
  const open = useSettingsStore((s) => s.open);
  const setOpen = useSettingsStore((s) => s.setOpen);
  const loadSettings = useSettingsStore((s) => s.loadFromStorage);
  const defaultExportDpi = useSettingsStore((s) => s.defaultExportDpi);
  const setDefaultExportDpi = useSettingsStore((s) => s.setDefaultExportDpi);
  const defaultFormulaFontSize = useSettingsStore((s) => s.defaultFormulaFontSize);
  const setDefaultFormulaFontSize = useSettingsStore((s) => s.setDefaultFormulaFontSize);
  const useMathFont = useSettingsStore((s) => s.useMathFont);
  const setUseMathFont = useSettingsStore((s) => s.setUseMathFont);
  const resetSettings = useSettingsStore((s) => s.resetToDefaults);

  // Workbench store
  const theme = useWorkbenchStore((s) => s.theme);
  const setTheme = useWorkbenchStore((s) => s.setTheme);
  const locale = useWorkbenchStore((s) => s.locale);
  const setLocale = useWorkbenchStore((s) => s.setLocale);
  const inputMode = useWorkbenchStore((s) => s.inputMode);
  const setInputMode = useWorkbenchStore((s) => s.setInputMode);
  const activityBarPosition = useWorkbenchStore((s) => s.activityBarPosition);
  const setActivityBarPosition = useWorkbenchStore((s) => s.setActivityBarPosition);
  const activityBarLocked = useWorkbenchStore((s) => s.activityBarLocked);
  const toggleActivityBarLock = useWorkbenchStore((s) => s.toggleActivityBarLock);
  const activityBarAutoHide = useWorkbenchStore((s) => s.activityBarAutoHide);
  const setActivityBarAutoHide = useWorkbenchStore((s) => s.setActivityBarAutoHide);

  // Layout store
  const previewPosition = useLayoutStore((s) => s.previewPosition);
  const setPreviewPosition = useLayoutStore((s) => s.setPreviewPosition);
  const previewSize = useLayoutStore((s) => s.previewSize);
  const setPreviewSize = useLayoutStore((s) => s.setPreviewSize);
  const resetLayout = useLayoutStore((s) => s.resetToDefaults);

  // Shortcuts store
  const shortcuts = useShortcutsStore((s) => s.shortcuts);
  const setShortcut = useShortcutsStore((s) => s.setShortcut);
  const resetShortcuts = useShortcutsStore((s) => s.resetToDefaults);

  const [category, setCategory] = useState<Category>('appearance');
  // Reset confirmation dialog — replaces window.confirm (unavailable in Tauri 2).
  const [resetConfirm, setResetConfirm] = useState(false);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleReset = () => {
    setResetConfirm(true);
  };

  const confirmReset = () => {
    setResetConfirm(false);
    try {
      // 清理 localStorage 中的设置数据，确保下次启动使用默认值
      try {
        localStorage.removeItem(LAYOUT_KEY);
        localStorage.removeItem(SETTINGS_KEY);
        localStorage.removeItem(SHORTCUTS_KEY);
        localStorage.removeItem('omnimath-editor-fontpx');
        // 也清理 pipeline 持久化数据，避免损坏状态导致问题
        localStorage.removeItem('omnimath-pipeline-v1');
        // 清理 workbench 主持久化数据，确保完全重置
        localStorage.removeItem('omnimath-pro-v2');
      } catch {
        // localStorage 不可用时忽略
      }
      // 通过各 store 的 resetToDefaults action 重置（会自动 saveToStorage）。
      // 每步独立 try/catch，避免某个 store 重置失败阻塞其他 store。
      try { resetSettings(); } catch (e) { console.warn('[reset] settings:', e); }
      try { resetLayout(); } catch (e) { console.warn('[reset] layout:', e); }
      try { resetShortcuts(); } catch (e) { console.warn('[reset] shortcuts:', e); }
      // workbench store 字段（无 resetToDefaults，逐项重置）
      try {
        setTheme('dark');
        setLocale('zh-CN');
        setInputMode('simple');
        setActivityBarPosition('left');
        setActivityBarAutoHide(false);
      } catch (e) {
        console.warn('[reset] workbench:', e);
      }
      toast.success(t('commonReset'));
      // 延迟一帧后 reload，确保所有 store 写入默认值后从干净状态重启，
      // 避免内存中残留的不一致状态导致渲染崩溃。
      setTimeout(() => {
        try { window.location.reload(); } catch { /* ignore */ }
      }, 100);
    } catch (err) {
      console.error('[SettingsPanel] reset error:', err);
      toast.error('重置失败', { description: (err as Error).message });
    }
  };

  const categories: { id: Category; labelKey: typeof t extends (k: infer K) => string ? K : never; icon: typeof Palette }[] = [
    { id: 'appearance', labelKey: 'settingsAppearance', icon: Palette },
    { id: 'editor', labelKey: 'settingsEditor', icon: Code2 },
    { id: 'layout', labelKey: 'settingsLayout', icon: Layout },
    { id: 'export', labelKey: 'settingsExport', icon: Download },
    { id: 'language', labelKey: 'settingsLanguage', icon: Languages },
    { id: 'shortcuts', labelKey: 'settingsShortcuts' as never, icon: Keyboard },
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-2xl min-h-[460px] max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0 px-5 py-3 border-b border-border/60">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Palette className="size-4 text-primary" />
            {t('settingsTitle')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* 左侧分类导航 */}
          <div className="w-44 shrink-0 border-r border-border/60 bg-muted/20 p-2 space-y-0.5">
            {categories.map((cat) => {
              const Icon = cat.icon;
              const isActive = category === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[12px] font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                  )}
                >
                  <Icon className="size-3.5" />
                  {t(cat.labelKey)}
                </button>
              );
            })}
            <div className="pt-2 mt-2 border-t border-border/40">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="w-full justify-start gap-2 text-[11px] text-muted-foreground hover:text-destructive"
              >
                <RotateCcw className="size-3" />
                {t('settingsResetAll')}
              </Button>
            </div>
          </div>

          {/* 右侧设置内容 */}
          <div className="flex-1 min-h-0 overflow-y-auto p-5">
            {category === 'appearance' && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <SettingRow label={t('settingsTheme')}>
                  <RadioGroup
                    value={theme}
                    onValueChange={(v) => setTheme(v as 'dark' | 'light')}
                    className="flex items-center gap-3"
                  >
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <RadioGroupItem value="dark" id="theme-dark" />
                      <Moon className="size-3.5 text-muted-foreground" />
                      <span className="text-xs">{t('menuDark')}</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <RadioGroupItem value="light" id="theme-light" />
                      <Sun className="size-3.5 text-muted-foreground" />
                      <span className="text-xs">{t('menuLight')}</span>
                    </label>
                  </RadioGroup>
                </SettingRow>

                <SettingRow label={t('settingsActivityBarPosition')}>
                  <RadioGroup
                    value={activityBarPosition}
                    onValueChange={(v) => setActivityBarPosition(v as 'left' | 'right')}
                    className="flex items-center gap-3"
                  >
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <RadioGroupItem value="left" id="ab-pos-left" />
                      <PanelLeft className="size-3.5 text-muted-foreground" />
                      <span className="text-xs">{t('abMoveLeft')}</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <RadioGroupItem value="right" id="ab-pos-right" />
                      <PanelRight className="size-3.5 text-muted-foreground" />
                      <span className="text-xs">{t('abMoveRight')}</span>
                    </label>
                  </RadioGroup>
                </SettingRow>

                <SettingRow label={t('settingsActivityBarLocked')}>
                  <Switch
                    checked={activityBarLocked}
                    onCheckedChange={toggleActivityBarLock}
                  />
                </SettingRow>

                <SettingRow label={t('settingsActivityBarAutoHide')}>
                  <Switch
                    checked={activityBarAutoHide}
                    onCheckedChange={(v) => setActivityBarAutoHide(v)}
                    disabled={activityBarLocked}
                  />
                </SettingRow>
              </motion.div>
            )}

            {category === 'editor' && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <SettingRow label={t('editorTitle') + ' ' + t('menuRun')}>
                  <Select value={inputMode} onValueChange={(v) => setInputMode(v as typeof inputMode)}>
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple" className="text-xs">{t('editorModeSimple')}</SelectItem>
                      <SelectItem value="python" className="text-xs">{t('editorModePython')}</SelectItem>
                      <SelectItem value="matlab" className="text-xs">{t('editorModeMatlab')}</SelectItem>
                      <SelectItem value="advanced" className="text-xs">{t('editorModeAdvanced')}</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>

                <SettingRow label={t('settingsUseMathFont')}>
                  <Switch
                    checked={useMathFont}
                    onCheckedChange={setUseMathFont}
                  />
                </SettingRow>
              </motion.div>
            )}

            {category === 'layout' && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <SettingRow label={t('layoutSwitch')}>
                  <RadioGroup
                    value={previewPosition}
                    onValueChange={(v) => setPreviewPosition(v as 'right' | 'bottom')}
                    className="flex items-center gap-3"
                  >
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <RadioGroupItem value="right" id="pv-pos-right" />
                      <PanelRight className="size-3.5 text-muted-foreground" />
                      <span className="text-xs">{t('layoutRight')}</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <RadioGroupItem value="bottom" id="pv-pos-bottom" />
                      <Layout className="size-3.5 text-muted-foreground" />
                      <span className="text-xs">{t('layoutBottom')}</span>
                    </label>
                  </RadioGroup>
                </SettingRow>

                <SettingRow label={t('layoutSize')}>
                  <RadioGroup
                    value={previewSize}
                    onValueChange={(v) => setPreviewSize(v as 'compact' | 'large')}
                    className="flex items-center gap-3"
                  >
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <RadioGroupItem value="compact" id="pv-size-compact" />
                      <span className="text-xs">{t('layoutCompact')}</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <RadioGroupItem value="large" id="pv-size-large" />
                      <span className="text-xs">{t('layoutLarge')}</span>
                    </label>
                  </RadioGroup>
                </SettingRow>
              </motion.div>
            )}

            {category === 'export' && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <SettingRow label={t('settingsDefaultExportDpi')}>
                  <Select
                    value={String(defaultExportDpi)}
                    onValueChange={(v) => setDefaultExportDpi(Number(v) as 1 | 2 | 4)}
                  >
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1" className="text-xs">1× 标准</SelectItem>
                      <SelectItem value="2" className="text-xs">2× 高清</SelectItem>
                      <SelectItem value="4" className="text-xs">4× 超清</SelectItem>
                    </SelectContent>
                  </Select>
                </SettingRow>

                <SettingRow label={t('settingsFormulaFontSize')}>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={16}
                      max={56}
                      step={2}
                      value={defaultFormulaFontSize}
                      onChange={(e) => setDefaultFormulaFontSize(Number(e.target.value))}
                      className="w-32 accent-primary"
                    />
                    <span className="text-xs font-mono text-muted-foreground w-12">
                      {defaultFormulaFontSize}px
                    </span>
                  </div>
                </SettingRow>
              </motion.div>
            )}

            {category === 'language' && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <SettingRow label={t('languageLabel')}>
                  <RadioGroup
                    value={locale}
                    onValueChange={(v) => setLocale(v as 'zh-CN' | 'en')}
                    className="flex items-center gap-3"
                  >
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <RadioGroupItem value="zh-CN" id="locale-zh" />
                      <span className="text-xs">{t('languageZh')}</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <RadioGroupItem value="en" id="locale-en" />
                      <span className="text-xs">{t('languageEn')}</span>
                    </label>
                  </RadioGroup>
                </SettingRow>
              </motion.div>
            )}

            {category === 'shortcuts' && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-3"
              >
                <div className="rounded-md border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
                  点击"重新绑定"后按下新的快捷键组合即可修改。Esc 取消绑定。
                </div>
                <ShortcutsList
                  shortcuts={shortcuts}
                  onSet={setShortcut}
                  onResetOne={(action) => setShortcut(action, DEFAULT_SHORTCUTS[action])}
                  onResetAll={resetShortcuts}
                />
              </motion.div>
            )}
          </div>
        </div>
      </DialogContent>

      {/* Reset confirmation dialog — replaces window.confirm (unavailable in Tauri 2) */}
      <Dialog open={resetConfirm} onOpenChange={setResetConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-[13px]">{t('settingsResetAll')}</DialogTitle>
          </DialogHeader>
          <p className="text-[11.5px] text-muted-foreground">
            {t('settingsResetConfirm')}
          </p>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResetConfirm(false)}>
              {t('commonCancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmReset}>
              {t('commonReset')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

/** 设置行：左侧标签 + 右侧控件 */
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Label className="text-xs text-foreground/85 font-normal">{label}</Label>
      {children}
    </div>
  );
}

/** 快捷键动作的中文标签映射 */
const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  run: '执行计算',
  toggleSidebar: '切换侧边栏',
  focusMode: '专注模式',
  openSettings: '打开设置',
  openPalette: '命令面板',
  clearEditor: '清空编辑器',
  togglePreview: '切换预览',
  zoomIn: '放大',
  zoomOut: '缩小',
  resetView: '重置视图',
};

/** 快捷键列表 + 自定义 UI */
function ShortcutsList({
  shortcuts,
  onSet,
  onResetOne,
  onResetAll,
}: {
  shortcuts: Record<ShortcutAction, ShortcutDef>;
  onSet: (action: ShortcutAction, def: ShortcutDef) => void;
  onResetOne: (action: ShortcutAction) => void;
  onResetAll: () => void;
}) {
  const [listeningAction, setListeningAction] = useState<ShortcutAction | null>(null);

  useEffect(() => {
    if (!listeningAction) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setListeningAction(null);
        return;
      }
      // 忽略纯修饰键按下
      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
      const mods: string[] = [];
      if (e.ctrlKey || e.metaKey) mods.push('ctrl');
      if (e.shiftKey) mods.push('shift');
      if (e.altKey) mods.push('alt');
      onSet(listeningAction, { mod: mods.join('+'), key: e.key });
      setListeningAction(null);
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [listeningAction, onSet]);

  const actions = Object.keys(DEFAULT_SHORTCUTS) as ShortcutAction[];

  return (
    <div className="space-y-1">
      {actions.map((action) => {
        const def = shortcuts[action];
        const isListening = listeningAction === action;
        const isModified = def.mod !== DEFAULT_SHORTCUTS[action].mod ||
          def.key !== DEFAULT_SHORTCUTS[action].key;
        return (
          <div
            key={action}
            className="flex items-center justify-between gap-3 rounded-md border border-border/40 bg-background/40 px-2.5 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-foreground/85">{SHORTCUT_LABELS[action]}</span>
              {isModified && (
                <span className="text-[9px] text-amber-500/80" title="已自定义">●</span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <kbd
                className={cn(
                  'inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 font-mono text-[10px]',
                  isListening
                    ? 'border-primary bg-primary/10 text-primary animate-pulse'
                    : 'border-border/60 bg-muted/40 text-foreground/70',
                )}
              >
                {isListening ? '按下快捷键…' : formatShortcut(def)}
              </kbd>
              <button
                type="button"
                onClick={() => setListeningAction(isListening ? null : action)}
                className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
              >
                {isListening ? '取消' : '重新绑定'}
              </button>
              {isModified && (
                <button
                  type="button"
                  onClick={() => onResetOne(action)}
                  className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                  title="恢复默认"
                >
                  恢复
                </button>
              )}
            </div>
          </div>
        );
      })}
      <div className="pt-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onResetAll}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="mr-1 size-3" />
          恢复全部默认快捷键
        </Button>
      </div>
    </div>
  );
}
