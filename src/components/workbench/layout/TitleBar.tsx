'use client';

/**
 * OmniMath Pro — TitleBar
 *
 * VSCode-style top bar (h-10) with glass background.
 *  - Left: animated teal Sigma logo + "OmniMath Pro" wordmark (text-gradient-teal)
 *          + i18n appSubtitle.
 *  - Center: File / Edit / View / Help menus with real dropdown actions.
 *  - Right: theme toggle (Sun/Moon, animated), language switcher (zh/EN),
 *           window controls (minimize / maximize / close, Tauri desktop only).
 *  View-mode switching lives in the ActivityBar (left icon rail) — not here.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Moon,
  Sun,
  Languages,
  ChevronDown,
  Minus,
  Square,
  X,
  Maximize,
  Minimize2,
  FileCode2,
  SquareFunction,
  FolderOpen,
  Settings,
  Github,
  Play,
  Eraser,
  Sigma,
  LayoutTemplate,
  PanelRight,
  PanelLeft,
  Command as CommandIcon,
  Keyboard,
  Check,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useSettingsStore } from '@/lib/store/settingsStore';
import { inTauri } from '@/lib/tauri';
import { t, useLocale, setLocale, type Locale } from '@/lib/i18n';
import pkg from '@/../package.json';

const GITHUB_URL = 'https://github.com/humanfirework/OmniMath-Pro';

/** 双击 logo 的彩蛋：随机数学趣语 / 冷知识。 */
const EASTER_EGGS = [
  '数学是上帝书写宇宙的语言。 —— 伽利略',
  'π 的小数点后永不循环，却藏着你我的生日。',
  '0.999… = 1，不是近似，而是精确相等。',
  '欧拉公式 e^(iπ) + 1 = 0 被誉为「最美数学公式」。',
  '斐波那契数列隐藏在海螺、松果与向日葵之中。',
  '莫比乌斯环只有一个面、一条边。',
  '哥德巴赫猜想：任一大于 2 的偶数都能写成两个质数之和，至今未证。',
  '无穷大也分大小：实数比整数「多」，前者不可数。',
  '1 ÷ 7 = 0.142857…，无限循环的数位悄然重排。',
  '4 是唯一一个英文单词字母数与自身相同的数字。',
  '圆周率前 3 位 3.14 恰好是「数学日」3 月 14 日。',
  '质数是无限多的，这一结论早在公元前 300 年就被欧几里得证明。',
  '一个圆有无数条对称轴，而一个正三角形只有 3 条。',
  '7×11×13 = 1001，回文一样工整。',
  '时钟上 12 与 1 之间是 30°，整圈刚好 360°。',
  '一亿 = 10^8，而太阳到地球的距离约 1.5×10^8 公里。',
  '「随机」硬币抛 1000 次，连续 10 次同面至少发生一次的概率接近 100%。',
  '数字 0 是由印度人发明、经阿拉伯世界传入欧洲的。',
  '黄金比例 φ ≈ 1.618，在艺术与建筑中反复出现。',
  '1、1、2、3、5、8… 斐波那契数列第 10 项是 55。',
  '一个正方体有 6 个面、12 条棱、8 个顶点。',
  '三角形内角和恒为 180°，这是欧氏几何的基石。',
  'e ≈ 2.71828，是自然对数的底，出现在复利与增长中。',
  'log2(1000) ≈ 9.97，2^10 = 1024 恰是 1K。',
  '地球自转一周约 23 小时 56 分 4 秒，比一天短 4 分钟。',
  '质数 2 是唯一的偶质数，也是最小的质数。',
  '「集合论」之父康托尔证明了实数的无穷大大于整数的无穷大。',
  '数学中最大的已知质数有上千万位，至今仍在被不断刷新。',
  '九宫格、数独、幻方——都是数学排列之美的体现。',
  '笛卡尔坐标系让「代数」与「几何」从此握手言和。',
  '牛顿与莱布尼茨几乎同时独立发明了微积分。',
  '「随机」看似无序，概率论却能精确预言它的规律。',
  '二进制只用 0 和 1，却支撑起整个计算机世界。',
  '1 是最小的自然数，也是「万物之源」的象征。',
  '正弦、余弦源于对圆与三角形的观测，如今无处不在。',
  '「费马大定理」困扰数学家 350 年，1995 年终被证明。',
  '矩阵的乘法不满足交换律：A·B 未必等于 B·A。',
  '「无穷小」在极限的定义下终于变得严谨而不神秘。',
  '对称是数学的美，也是自然界的通用语言。',
  '一个正二十面体有 20 个面、30 条棱，是柏拉图立体之一。',
  '「统计」告诉我们的不是确定，而是可能性与置信。',
  '1 + 2 + 3 + … 到无穷在黎曼ζ函数下的「和」竟是 -1/12。',
  '「鸽笼原理」：5 只鸽子进 4 个笼子，必有笼子装 2 只。',
  '几何原本是史上流传最广的教科书之一。',
  '「零」一度被视为危险，因为它让运算有了「空」的概念。',
  '圆的周长与直径之比恒为 π，与圆的大小无关。',
  '对数让天文计算的繁琐乘法化为了简单加法。',
  '「有限」与「无限」之间，藏着数学最迷人的深渊。',
  '2026 年，王虹证明「三维挂谷猜想」，成为首位获菲尔兹奖的中国数学家。',
  '2026 年，邓煜攻克「狭义希尔伯特第六问题」核心分支，与王虹同届获奖。',
  '2026 年，王虹、邓煜同届斩获菲尔兹奖——中国数学家的历史性突破。',
  '2026 年，王虹成为史上第三位获菲尔兹奖的女性数学家。',
  '2022 年，玛丽娜·维亚佐夫斯卡因球堆积问题获菲尔兹奖，成为首位来自乌克兰的得主。',
  '2022 年，韩裔数学家胡著（June Huh）因组合几何获菲尔兹奖。',
  '2014 年，玛丽安·米尔扎哈尼成为史上首位摘得菲尔兹奖的女性。',
  '菲尔兹奖每 4 年一届，仅授予未满 40 岁的青年数学家，被誉为「数学界的诺贝尔奖」。',
];

export function TitleBar() {
  const theme = useWorkbenchStore((s) => s.theme);
  const toggleTheme = useWorkbenchStore((s) => s.toggleTheme);
  const setCommandPaletteOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);
  const locale = useLocale();
  const setLocaleStore = useWorkbenchStore((s) => s.setLocale);
  // 代码 / 函数输入器开关（上移到顶栏，避免挤占编辑器工具栏）。
  const inputView = useWorkbenchStore((s) => s.inputView);
  const setInputView = useWorkbenchStore((s) => s.setInputView);
  const viewMode = useWorkbenchStore((s) => s.viewMode);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const editorVisible = useWorkbenchStore((s) => s.editorVisible);
  const setEditorVisible = useWorkbenchStore((s) => s.setEditorVisible);
  const previewVisible = useWorkbenchStore((s) => s.previewVisible);
  const setPreviewVisible = useWorkbenchStore((s) => s.setPreviewVisible);
  const sidePanelCollapsed = useWorkbenchStore((s) => s.sidePanelCollapsed);
  const activeSidePanel = useWorkbenchStore((s) => s.activeSidePanel);
  const toggleSidePanel = useWorkbenchStore((s) => s.toggleSidePanel);
  const setActiveSidePanel = useWorkbenchStore((s) => s.setActiveSidePanel);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const setSettingsOpen = useSettingsStore((s) => s.setOpen);
  const symbolPaletteOpen = useSettingsStore((s) => s.symbolPaletteOpen);
  const setSymbolPaletteOpen = useSettingsStore((s) => s.setSymbolPaletteOpen);
  const showInputViewSwitch = viewMode === 'workbench' && editorVisible;

  const menuTriggerClass =
    'px-2 h-6 text-[11px] rounded text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors';

  /** 打开文件浏览器：回到工作台并展开文件侧栏。 */
  const openFileExplorer = () => {
    setViewMode('workbench');
    setActiveSidePanel('files');
  };

  /** 运行当前脚本：由 EditorPanel 监听执行，避免这里耦合求值逻辑。 */
  const runScript = () => {
    window.dispatchEvent(new CustomEvent('omnimath:run-all'));
  };

  /**
   * 视图菜单里的侧栏切换：首页没有侧栏，先回到工作台再展开；
   * 其它视图直接切换收起/展开。
   */
  const handleToggleSidebar = () => {
    if (viewMode === 'home') {
      setViewMode('workbench');
      setActiveSidePanel(activeSidePanel);
      return;
    }
    toggleSidePanel();
  };

  // 仅在 Tauri 桌面壳内渲染窗口控制按钮。
  // 初始渲染一律为 false（SSR / 浏览器），挂载后再判定，
  // 避免 hydration 不一致。
  const [isDesktop, setIsDesktop] = useState(false);
  // 全屏状态：初始化读取当前窗口全屏态，并随窗口尺寸变化重新查询同步。
  // 本版本 @tauri-apps/api 未提供 onFullscreenChange 便捷监听，但全屏切换
  // 会改变窗口尺寸从而触发 onResized，故在 onResized 中重新查询 isFullscreen
  // 即可正确同步图标（涵盖按钮触发 / 外部触发 / OS 手势等所有路径）。
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    if (!inTauri()) return;
    setIsDesktop(true);
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;
    const syncFullscreen = () => {
      win.isFullscreen()
        .then(setIsFullscreen)
        .catch(() => {
          // 读取失败时保持当前状态，不阻塞渲染
        });
    };
    // 读取初始全屏态
    syncFullscreen();
    // 全屏切换会触发 resize，借 onResized 重新查询以同步图标
    win
      .onResized(() => {
        syncFullscreen();
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleToggleFullscreen = () => {
    if (!inTauri()) return;
    // 乐观更新：立即翻转图标，onResized 回调会用真实状态再校准一次
    const next = !isFullscreen;
    setIsFullscreen(next);
    void getCurrentWindow().setFullscreen(next);
  };

  const handleLocaleChange = (next: Locale) => {
    setLocale(next);
    setLocaleStore(next);
  };

  // 双击 logo 彩蛋状态：当前展示的数学趣语（null 表示未显示）。
  const [egg, setEgg] = useState<string | null>(null);
  const eggTimer = useRef<number | null>(null);
  // 双击 logo 的彩蛋保留，但不再播放翻面/发光动画。
  const handleLogoDoubleClick = () => {
    const pick = EASTER_EGGS[Math.floor(Math.random() * EASTER_EGGS.length)];
    setEgg(pick);
    if (eggTimer.current) window.clearTimeout(eggTimer.current);
    eggTimer.current = window.setTimeout(() => setEgg(null), 4000);
  };

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'relative h-9 shrink-0 flex items-center justify-between px-3 gap-4',
        'bg-background border-b border-border',
        'select-none',
      )}
    >
      {/* ── Left: brand ───────────────────────────────────────────── */}
      <div className="relative flex items-center gap-2.5 min-w-0">
        <button
          type="button"
          onDoubleClick={handleLogoDoubleClick}
          title="OmniMath Pro"
          className="grid size-6 shrink-0 place-items-center rounded border border-border bg-transparent text-muted-foreground transition-colors hover:text-foreground"
        >
          <Sigma className="size-3.5" strokeWidth={1.75} />
        </button>

        {/* 双击 logo 彩蛋：随机数学趣语气泡 */}
        <AnimatePresence>
          {egg && (
            <motion.div
              key="egg"
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12, ease: 'easeOut' }}
              onClick={() => setEgg(null)}
              className="absolute top-full left-0 mt-2 z-50 max-w-[260px] rounded-md border border-border bg-popover px-3 py-2 text-[11.5px] leading-relaxed text-popover-foreground shadow-lg cursor-pointer"
            >
              {egg}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[12px] font-medium tracking-tight text-foreground">
            OmniMath
          </span>
          <span className="text-[9.5px] text-muted-foreground/80 hidden sm:inline">
            v{pkg.version}
          </span>
          <span
            className="hidden sm:inline-flex items-center rounded-[3px] border border-border bg-muted/40 px-1 py-[1px] text-[8.5px] font-medium tracking-wide text-muted-foreground"
            title="Beta 版本：功能仍在迭代，欢迎反馈问题"
          >
            BETA
          </span>
        </div>
      </div>

      {/* ── Center: menus ─────────────────────────────────────────── */}
      <nav className="hidden md:flex items-center gap-0.5 relative">
        {/* 代码 / 函数输入器切换（上移到顶栏；仅在工作台 + 编辑器可见时显示） */}
        {showInputViewSwitch && (
          <div className="flex items-center gap-0.5 p-0.5 rounded border border-border mr-1">
            <button
              type="button"
              onClick={() => setInputView('code')}
              title="代码编辑器"
              aria-label="切换到代码编辑器"
              className={cn(
                'flex items-center gap-1 h-5 px-2 text-[10.5px] rounded-[3px] transition-colors',
                inputView === 'code'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <FileCode2 className="size-3" strokeWidth={1.75} />
              代码
            </button>
            <button
              type="button"
              onClick={() => setInputView('demos')}
              title="函数输入器：输入即绘图"
              aria-label="切换到函数输入器"
              className={cn(
                'flex items-center gap-1 h-5 px-2 text-[10.5px] rounded-[3px] transition-colors',
                inputView === 'demos'
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <SquareFunction className="size-3" strokeWidth={1.75} />
              函数
            </button>
          </div>
        )}
        {/* ── 文件 ─────────────────────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={menuTriggerClass}>{t('menuFile')}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem className="gap-2 text-[12px]" onClick={openFileExplorer}>
              <FolderOpen className="size-3.5 text-muted-foreground" />
              {t('menuOpenFiles')}
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => setSettingsOpen(true)}>
              <Settings className="size-3.5 text-muted-foreground" />
              {t('settingsTitle')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-[12px]"
              onClick={() => window.open(GITHUB_URL, '_blank', 'noopener,noreferrer')}
            >
              <Github className="size-3.5 text-muted-foreground" />
              {t('menuGithub')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── 编辑 ─────────────────────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={menuTriggerClass}>{t('menuEdit')}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem className="gap-2 text-[12px]" onClick={runScript}>
              <Play className="size-3.5 text-muted-foreground" />
              {t('cpRunAll')}
              <span className="ml-auto text-[10px] text-muted-foreground/70">Ctrl+Enter</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[12px]"
              onClick={() => window.dispatchEvent(new CustomEvent('omnimath:run-independent'))}
            >
              <Maximize className="size-3.5 text-muted-foreground" />
              {t('cpRunIndependent')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[12px]"
              onClick={() => setEditorContent('')}
            >
              <Eraser className="size-3.5 text-muted-foreground" />
              {t('cpClearEditor')}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[12px]"
              onClick={() => setSymbolPaletteOpen(!symbolPaletteOpen)}
            >
              <Sigma className="size-3.5 text-muted-foreground" />
              {t('symbolPaletteToggle')}
              {symbolPaletteOpen && <Check className="ml-auto size-3.5 text-primary" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── 视图 ─────────────────────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={menuTriggerClass}>{t('menuView')}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem className="gap-2 text-[12px]" onClick={handleToggleSidebar}>
              <PanelLeft className="size-3.5 text-muted-foreground" />
              {sidePanelCollapsed ? t('abShowSidebar') : t('abHideSidebar')}
              {!sidePanelCollapsed && viewMode !== 'home' && (
                <Check className="ml-auto size-3.5 text-primary" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[12px]"
              disabled={viewMode === 'home'}
              onClick={() => setEditorVisible(!editorVisible)}
            >
              <LayoutTemplate className="size-3.5 text-muted-foreground" />
              {t('abToggleEditor')}
              {editorVisible && viewMode !== 'home' && (
                <Check className="ml-auto size-3.5 text-primary" />
              )}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[12px]"
              disabled={viewMode === 'home'}
              onClick={() => setPreviewVisible(!previewVisible)}
            >
              <PanelRight className="size-3.5 text-muted-foreground" />
              {t('abTogglePreview')}
              {previewVisible && viewMode !== 'home' && (
                <Check className="ml-auto size-3.5 text-primary" />
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-[12px]" onClick={toggleTheme}>
              {theme === 'dark' ? (
                <Sun className="size-3.5 text-muted-foreground" />
              ) : (
                <Moon className="size-3.5 text-muted-foreground" />
              )}
              {theme === 'dark' ? t('cpSwitchLight') : t('cpSwitchDark')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* ── 帮助 ─────────────────────────────────────────────── */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={menuTriggerClass}>{t('menuHelp')}</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem
              className="gap-2 text-[12px]"
              onClick={() => setCommandPaletteOpen(true)}
            >
              <CommandIcon className="size-3.5 text-muted-foreground" />
              {t('menuCommandPalette')}
              <span className="ml-auto text-[10px] text-muted-foreground/70">Ctrl+K</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-[12px]" onClick={() => setSettingsOpen(true)}>
              <Keyboard className="size-3.5 text-muted-foreground" />
              {t('menuShortcuts')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 text-[12px]"
              onClick={() => toast(`OmniMath Pro v${pkg.version}`)}
            >
              <Info className="size-3.5 text-muted-foreground" />
              {t('menuAbout')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>

      {/* ── Right: actions ────────────────────────────────────────── */}
      <div className="relative flex items-center gap-1.5">
        {/* Language switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 gap-1 text-[11px] text-muted-foreground hover:text-foreground">
              <Languages className="size-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">{locale === 'zh-CN' ? '中' : 'EN'}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => handleLocaleChange('zh-CN')}
              className={cn(locale === 'zh-CN' && 'bg-accent')}
            >
              <span className="mr-2 font-mono text-[10px] text-muted-foreground">中</span> 中文
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleLocaleChange('en')}
              className={cn(locale === 'en' && 'bg-accent')}
            >
              <span className="mr-2 font-mono text-[10px] text-muted-foreground">EN</span> English
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onClick={() => setSettingsOpen(true)}>
              <Settings className="size-3.5" />
              {t('settingsTitle')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setCommandPaletteOpen(true)}>
              {t('menuCommandPalette')}…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle theme"
              className="grid place-items-center size-6 rounded border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              {theme === 'dark' ? (
                <Moon className="size-3.5" strokeWidth={1.75} />
              ) : (
                <Sun className="size-3.5" strokeWidth={1.75} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {theme === 'dark' ? t('menuLight') : t('menuDark')}
          </TooltipContent>
        </Tooltip>

        {/* ── Window controls (Tauri desktop only) ───────────────────
            decorations:false，无原生标题栏，需自行实现窗口按钮。
            关于拖拽：不要给这里加 data-tauri-drag-region={false} ——
            该属性只有「存在/不存在」两种状态，赋值为 "false" 依然会被
            视为拖拽区域。Tauri 2 的拖拽脚本只对命中带
            data-tauri-drag-region 元素自身的 mousedown 启动拖拽，
            <button> 上的点击会正常触发 onClick，不会被拖拽吞掉。 */}
        {isDesktop && (
          <div className="flex items-center gap-0.5 ml-1 pl-1.5 border-l border-border">
            <button
              type="button"
              onClick={() => void getCurrentWindow().minimize()}
              aria-label="Minimize window"
              className="grid place-items-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Minus className="size-3.5" strokeWidth={1.75} />
            </button>
            <button
              type="button"
              onClick={() => void getCurrentWindow().toggleMaximize()}
              aria-label="Maximize or restore window"
              className="grid place-items-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Square className="size-3" strokeWidth={1.75} />
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  className="grid place-items-center size-6 rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {isFullscreen ? (
                    <Minimize2 className="size-3.5" strokeWidth={1.75} />
                  ) : (
                    <Maximize className="size-3.5" strokeWidth={1.75} />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              </TooltipContent>
            </Tooltip>
            <button
              type="button"
              onClick={() => void getCurrentWindow().close()}
              aria-label="Close window"
              className="grid place-items-center size-6 rounded text-muted-foreground hover:bg-destructive hover:text-destructive-foreground transition-colors"
            >
              <X className="size-3.5" strokeWidth={1.75} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
