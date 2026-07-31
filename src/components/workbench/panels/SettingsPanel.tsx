'use client';

/**
 * OmniMath Pro — 设置面板
 *
 * VS Code 风格的分类设置对话框：
 *   - 左侧分类导航（外观 / 编辑器 / 布局 / 导出 / 语言 / 快捷键 / 高级 / 关于）
 *   - 右侧设置项（Switch / Select / RadioGroup / Slider / Input）
 *   - "高级"区为结构化表单（原 JSON 编辑的替代），修改即时生效并带校验
 *
 * 数据来源：
 *   - useWorkbenchStore: theme, locale, activityBar* 设置
 *   - useLayoutStore: previewPosition, previewSize
 *   - useSettingsStore: 面板开关 + 导出默认设置
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
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
  Info,
  RefreshCw,
  Minimize2,
  SlidersHorizontal,
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
import type { TranslationDict } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { inTauri } from '@/lib/tauri';
import { toast } from 'sonner';

type Category = 'appearance' | 'editor' | 'layout' | 'export' | 'language' | 'shortcuts' | 'advanced' | 'about';

// 版本号优先取构建期注入的 NEXT_PUBLIC_APP_VERSION（与 package.json 对齐），
// 缺失时回退到 package.json 中的版本（0.0.6）。
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.6';

// 关于页相关链接（仓库地址取自 package.json: humanfirework/OmniMath-Pro）。
const ABOUT_LINKS: { emoji: string; label: string; url: string }[] = [
  { emoji: '📖', label: '官方文档', url: 'https://github.com/humanfirework/OmniMath-Pro#readme' },
  { emoji: '🐛', label: '反馈问题', url: 'https://github.com/humanfirework/OmniMath-Pro/issues' },
  { emoji: '⭐', label: 'GitHub', url: 'https://github.com/humanfirework/OmniMath-Pro' },
  { emoji: '💬', label: '讨论社区', url: 'https://github.com/humanfirework/OmniMath-Pro/discussions' },
];

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
  const fontPreset = useSettingsStore((s) => s.fontPreset);
  const setFontPreset = useSettingsStore((s) => s.setFontPreset);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const setEditorFontSize = useSettingsStore((s) => s.setEditorFontSize);
  const plotAxisFontSize = useSettingsStore((s) => s.plotAxisFontSize);
  const setPlotAxisFontSize = useSettingsStore((s) => s.setPlotAxisFontSize);
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
  // Update check state
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ available: boolean; latest?: string; notes?: string } | null>(null);
  // Minimize to tray setting (persisted in localStorage)
  const [minimizeToTray, setMinimizeToTray] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('omnimath-minimize-tray') === 'true';
  });

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Apply font preset to <html> — changes data-font-preset attribute which
  // triggers CSS variable overrides in globals.css for the selected preset.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-font-preset', fontPreset ?? 'modern');
  }, [fontPreset]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('omnimath-minimize-tray', String(minimizeToTray));
    }
  }, [minimizeToTray]);

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

  // 检查更新：仅在 Tauri 桌面环境下联网查询 GitHub Releases 最新版本；
  // Web 环境无法可靠检查更新（CORS / 无打包元数据），提示用户使用桌面应用。
  // GitHub 仓库地址取自 package.json 的 repository 字段（humanfirework/OmniMath-Pro）。
  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    setUpdateInfo(null);
    try {
      if (!inTauri()) {
        setUpdateInfo({
          available: false,
          notes: '请在桌面应用中检查更新',
        });
        return;
      }
      const response = await fetch(
        'https://api.github.com/repos/humanfirework/OmniMath-Pro/releases/latest',
      );
      if (!response.ok) throw new Error('Failed to fetch release info');
      const data = await response.json();
      const latestVersion = (data?.tag_name ?? '').replace(/^v/, '');
      const currentVersion = APP_VERSION;
      if (latestVersion && latestVersion !== currentVersion) {
        setUpdateInfo({
          available: true,
          latest: latestVersion,
          notes: `发现新版本：v${latestVersion}（当前 v${currentVersion}）`,
        });
        toast.success(`发现新版本 v${latestVersion}`);
      } else {
        setUpdateInfo({
          available: false,
          latest: currentVersion,
          notes: '已是最新版本',
        });
        toast.success('已是最新版本');
      }
    } catch {
      setUpdateInfo({
        available: false,
        notes: '检查更新失败，请稍后重试',
      });
      toast.error('检查更新失败');
    } finally {
      setCheckingUpdate(false);
    }
  };

  // labelKey 走 i18n；高级区暂无对应词条，直接用 label 字面量（与"检查更新"等既有写法一致）
  const categories: { id: Category; labelKey?: keyof TranslationDict; label?: string; icon: typeof Palette }[] = [
    { id: 'appearance', labelKey: 'settingsAppearance', icon: Palette },
    { id: 'editor', labelKey: 'settingsEditor', icon: Code2 },
    { id: 'layout', labelKey: 'settingsLayout', icon: Layout },
    { id: 'export', labelKey: 'settingsExport', icon: Download },
    { id: 'language', labelKey: 'settingsLanguage', icon: Languages },
    { id: 'shortcuts', labelKey: 'settingsShortcuts', icon: Keyboard },
    { id: 'advanced', label: '高级', icon: SlidersHorizontal },
    { id: 'about', labelKey: 'settingsAbout', icon: Info },
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
                  {cat.labelKey ? t(cat.labelKey) : cat.label}
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

                <SettingRow label={t('settingsFontPreset')}>
                  <Select value={fontPreset ?? 'modern'} onValueChange={(v) => setFontPreset(v as 'modern' | 'scholarly' | 'system')}>
                    <SelectTrigger className="w-40 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="modern" className="text-xs">{t('fontPresetModern')} (Inter)</SelectItem>
                      <SelectItem value="scholarly" className="text-xs">{t('fontPresetScholarly')} (Space Grotesk + Newsreader)</SelectItem>
                      <SelectItem value="system" className="text-xs">{t('fontPresetSystem')}</SelectItem>
                    </SelectContent>
                  </Select>
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

                <div className="h-px bg-border/40 my-1" />

                <SettingRow label="关闭窗口时最小化到托盘" experimental>
                  <Switch
                    checked={minimizeToTray}
                    onCheckedChange={setMinimizeToTray}
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

                <SettingRow label={t('settingsUseMathFont')} experimental>
                  <Switch
                    checked={useMathFont}
                    onCheckedChange={setUseMathFont}
                  />
                </SettingRow>

                <SettingRow label="编辑器字号">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={8}
                      max={32}
                      step={1}
                      value={editorFontSize}
                      onChange={(e) => setEditorFontSize(Number(e.target.value))}
                      className="w-32 accent-primary"
                    />
                    <span className="text-xs font-mono text-muted-foreground w-12">
                      {editorFontSize}px
                    </span>
                  </div>
                </SettingRow>

                <SettingRow label="坐标轴字号">
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={8}
                      max={24}
                      step={1}
                      value={plotAxisFontSize}
                      onChange={(e) => setPlotAxisFontSize(Number(e.target.value))}
                      className="w-32 accent-primary"
                    />
                    <span className="text-xs font-mono text-muted-foreground w-12">
                      {plotAxisFontSize}px
                    </span>
                  </div>
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

            {category === 'advanced' && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                <AdvancedSettings />
              </motion.div>
            )}

            {category === 'about' && (
              <motion.div
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="space-y-5"
              >
                {/* Version info */}
                <div className="rounded-lg border border-border/60 bg-muted/20 p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <div className="size-10 rounded-xl bg-primary/10 grid place-items-center">
                      <span className="text-lg font-bold text-primary">Σ</span>
                    </div>
                  </div>
                  <h3 className="text-base font-semibold">OmniMath Pro</h3>
                  <p className="text-xs text-muted-foreground mt-1">Version {APP_VERSION}</p>
                  <p className="text-[11px] text-muted-foreground mt-2">专业的数学计算与可视化工具</p>
                </div>

                {/* Update check */}
                <SettingRow label="检查更新">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={checkForUpdates}
                    disabled={checkingUpdate}
                    className="gap-2 h-8 text-xs"
                  >
                    <RefreshCw className={cn('size-3.5', checkingUpdate && 'animate-spin')} />
                    {checkingUpdate ? '检查中...' : '检查更新'}
                  </Button>
                </SettingRow>

                {/* Update result */}
                <AnimatePresence>
                  {updateInfo && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={cn(
                        'rounded-lg border p-3 text-xs',
                        updateInfo.available
                          ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                      )}
                    >
                      <div className="font-medium">
                        {updateInfo.available
                          ? `发现新版本: v${updateInfo.latest}`
                          : `当前版本 v${APP_VERSION} 已是最新`}
                      </div>
                      {updateInfo.notes && (
                        <div className="mt-1 text-[11px] opacity-80">{updateInfo.notes}</div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Links */}
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">相关链接</div>
                  <div className="grid grid-cols-2 gap-2">
                    {ABOUT_LINKS.map((link) => (
                      <button
                        key={link.label}
                        type="button"
                        onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                        className="rounded-md border border-border/60 px-3 py-2 text-xs text-left hover:bg-accent/40 transition-colors"
                      >
                        {link.emoji} {link.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="text-[10px] text-muted-foreground text-center pt-2">
                  © 2025 OmniMath. Built with Tauri + React.
                </div>
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

/** "实验性"徽章：标记尚未接入实际逻辑、仅做占位/未来扩展的设置项。 */
function ExperimentalBadge() {
  return (
    <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400">
      实验性
    </span>
  );
}

/** 设置行：左侧标签 + 右侧控件 */
function SettingRow({
  label,
  experimental,
  children,
}: {
  label: string;
  experimental?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-foreground/85 font-normal">{label}</Label>
        {experimental && <ExperimentalBadge />}
      </div>
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

/** 高级设置行：上排 标签+控件，下排 说明文字，非法输入时红字提示 */
function AdvRow({
  label,
  desc,
  error,
  experimental,
  children,
}: {
  label: string;
  desc: string;
  error?: string;
  experimental?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-foreground/85 font-normal">{label}</Label>
          {experimental && <ExperimentalBadge />}
        </div>
        {children}
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

/** 校验数值输入：返回错误文案，合法时返回 null */
function validateNumberInput(raw: string, min: number, max: number): string | null {
  if (raw.trim() === '') return '请输入数值';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '请输入有效数字';
  if (!Number.isInteger(n)) return '请输入整数';
  if (n < min || n > max) return `取值范围为 ${min} – ${max}`;
  return null;
}

/**
 * 高级设置（结构化表单，替代原 JSON 文本编辑）：
 *   - 修改即时写入 settingsStore 并自动持久化，无需保存按钮
 *   - 数值/字符串输入非法时就地红字提示且不写入 store，失焦后回退为 store 中的合法值
 *   - 顶部"恢复默认"仅重置高级区，不影响其他分类
 */
function AdvancedSettings() {
  const plotSamples = useSettingsStore((s) => s.advancedPlotSamples);
  const setPlotSamples = useSettingsStore((s) => s.setAdvancedPlotSamples);
  const plot3dResolution = useSettingsStore((s) => s.advancedPlot3dResolution);
  const setPlot3dResolution = useSettingsStore((s) => s.setAdvancedPlot3dResolution);
  const resultPrecision = useSettingsStore((s) => s.advancedResultPrecision);
  const setResultPrecision = useSettingsStore((s) => s.setAdvancedResultPrecision);
  const historyLimit = useSettingsStore((s) => s.advancedHistoryLimit);
  const setHistoryLimit = useSettingsStore((s) => s.setAdvancedHistoryLimit);
  const angleUnit = useSettingsStore((s) => s.advancedAngleUnit);
  const setAngleUnit = useSettingsStore((s) => s.setAdvancedAngleUnit);
  const showSteps = useSettingsStore((s) => s.advancedShowSteps);
  const setShowSteps = useSettingsStore((s) => s.setAdvancedShowSteps);
  const animations = useSettingsStore((s) => s.advancedAnimations);
  const setAnimations = useSettingsStore((s) => s.setAdvancedAnimations);
  const exportPrefix = useSettingsStore((s) => s.advancedExportPrefix);
  const setExportPrefix = useSettingsStore((s) => s.setAdvancedExportPrefix);
  const resetAdvanced = useSettingsStore((s) => s.resetAdvanced);

  // 文本类控件的草稿值与校验错误（滑块/开关/下拉不会产生非法值，无需草稿）
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** 数值输入：更新草稿 → 校验 → 合法则立即写入 store，非法则仅提示 */
  const handleNumber = (
    key: string,
    raw: string,
    min: number,
    max: number,
    apply: (n: number) => void,
  ) => {
    setDrafts((d) => ({ ...d, [key]: raw }));
    const err = validateNumberInput(raw, min, max);
    setErrors((e) => ({ ...e, [key]: err ?? '' }));
    if (!err) apply(Number(raw));
  };

  /** 文件名前缀输入：非空、≤40 字符、仅限字母/数字/连字符/下划线 */
  const handlePrefix = (raw: string) => {
    setDrafts((d) => ({ ...d, exportPrefix: raw }));
    let err = '';
    if (raw.trim() === '') err = '前缀不能为空';
    else if (raw.length > 40) err = '最长 40 个字符';
    else if (!/^[\w-]+$/.test(raw)) err = '仅限字母、数字、连字符与下划线';
    setErrors((e) => ({ ...e, exportPrefix: err }));
    if (!err) setExportPrefix(raw);
  };

  /** 失焦丢弃未生效的草稿与错误提示，回显 store 中的合法值 */
  const handleBlur = (key: string) => {
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    setErrors((e) => {
      const next = { ...e };
      delete next[key];
      return next;
    });
  };

  /** 仅重置高级区，并清空本地草稿/错误状态 */
  const handleResetAdvanced = () => {
    resetAdvanced();
    setDrafts({});
    setErrors({});
    toast.success('高级设置已恢复默认');
  };

  return (
    <>
      {/* 分区说明 + 仅重置高级区的按钮 */}
      <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-2.5 py-2">
        <p className="text-[11px] text-muted-foreground">
          修改即时生效并自动保存，无需手写 JSON。
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleResetAdvanced}
          className="shrink-0 gap-1.5 text-[11px] text-muted-foreground hover:text-destructive"
        >
          <RotateCcw className="size-3" />
          恢复默认
        </Button>
      </div>

      {/* 数值·有明确范围 → 滑块（滑块本身不会产生非法值） */}
      <AdvRow
        label="2D 曲线采样点数"
        desc="采样越密曲线越平滑，但计算量越大；拖动参数滑块时会临时降采样以保证流畅。"
      >
        <div className="flex items-center gap-2">
          <Slider
            value={[plotSamples]}
            min={100}
            max={2000}
            step={50}
            onValueChange={(v) => setPlotSamples(v[0])}
            className="w-32"
          />
          <span className="text-xs font-mono text-muted-foreground w-12 text-right">
            {plotSamples}
          </span>
        </div>
      </AdvRow>

      <AdvRow
        label="3D 曲面网格分辨率"
        desc="每根坐标轴的网格数量，顶点数为分辨率的平方；过高会影响 3D 视图流畅度。"
      >
        <div className="flex items-center gap-2">
          <Slider
            value={[plot3dResolution]}
            min={10}
            max={200}
            step={5}
            onValueChange={(v) => setPlot3dResolution(v[0])}
            className="w-32"
          />
          <span className="text-xs font-mono text-muted-foreground w-12 text-right">
            {plot3dResolution}
          </span>
        </div>
      </AdvRow>

      {/* 数值·需键入 → Input(type=number)，带范围校验 */}
      <AdvRow
        label="结果有效数字位数"
        desc="数值结果保留的有效数字位数，位数越多越精确。"
        error={errors.resultPrecision}
      >
        <Input
          type="number"
          min={2}
          max={15}
          step={1}
          value={drafts.resultPrecision ?? String(resultPrecision)}
          onChange={(e) => handleNumber('resultPrecision', e.target.value, 2, 15, setResultPrecision)}
          onBlur={() => handleBlur('resultPrecision')}
          className={cn('w-24 h-8 text-xs', errors.resultPrecision && 'border-destructive')}
        />
      </AdvRow>

      <AdvRow
        label="历史记录条数上限"
        desc="计算历史最多保留的条数，超出后最早的记录会被移除。"
        error={errors.historyLimit}
      >
        <Input
          type="number"
          min={10}
          max={500}
          step={10}
          value={drafts.historyLimit ?? String(historyLimit)}
          onChange={(e) => handleNumber('historyLimit', e.target.value, 10, 500, setHistoryLimit)}
          onBlur={() => handleBlur('historyLimit')}
          className={cn('w-24 h-8 text-xs', errors.historyLimit && 'border-destructive')}
        />
      </AdvRow>

      {/* 枚举 → 下拉选择 */}
      <AdvRow
        label="三角函数角度单位"
        desc="sin/cos/tan 等三角函数求值时使用的角度单位。"
        experimental
      >
        <Select value={angleUnit} onValueChange={(v) => setAngleUnit(v as 'rad' | 'deg')}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rad" className="text-xs">弧度 rad</SelectItem>
            <SelectItem value="deg" className="text-xs">角度 deg</SelectItem>
          </SelectContent>
        </Select>
      </AdvRow>

      {/* 布尔 → 开关 */}
      <AdvRow
        label="默认展开分步求解"
        desc="方程、求导、积分等求解结果默认展示完整分步过程。"
      >
        <Switch checked={showSteps} onCheckedChange={setShowSteps} />
      </AdvRow>

      <AdvRow
        label="启用界面过渡动画"
        desc="面板与视图切换时的过渡动效；关闭可减少动态效果、提升低端设备流畅度。"
        experimental
      >
        <Switch checked={animations} onCheckedChange={setAnimations} />
      </AdvRow>

      {/* 字符串 → 文本输入，带格式校验 */}
      <AdvRow
        label="导出文件名前缀"
        desc="导出图片/文件时的默认文件名前缀，如 omnimath-1717000000000.png。"
        error={errors.exportPrefix}
        experimental
      >
        <Input
          type="text"
          value={drafts.exportPrefix ?? exportPrefix}
          onChange={(e) => handlePrefix(e.target.value)}
          onBlur={() => handleBlur('exportPrefix')}
          maxLength={40}
          className={cn('w-40 h-8 text-xs', errors.exportPrefix && 'border-destructive')}
        />
      </AdvRow>
    </>
  );
}
