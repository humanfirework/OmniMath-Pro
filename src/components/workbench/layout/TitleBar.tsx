'use client';

/**
 * OmniMath Pro — TitleBar
 *
 * VSCode-style top bar (h-10) with glass background.
 *  - Left: animated teal Sigma logo + "OmniMath Pro" wordmark (text-gradient-teal)
 *          + i18n appSubtitle.
 *  - Center: File / Edit / View / Help menu buttons (open command palette).
 *  - Right: theme toggle (Sun/Moon, animated), language switcher (zh/EN),
 *           window controls (minimize / maximize / close, Tauri desktop only).
 *  View-mode switching lives in the ActivityBar (left icon rail) — not here.
 */

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion';
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
} from 'lucide-react';
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
import { inTauri } from '@/lib/tauri';
import { t, useLocale, setLocale, type Locale } from '@/lib/i18n';
import pkg from '@/../package.json';

const MENU_KEYS = ['menuFile', 'menuEdit', 'menuView', 'menuHelp'] as const;

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
  // 代码 / Demos 输入界面开关（上移到顶栏，避免挤占编辑器工具栏）。
  const inputView = useWorkbenchStore((s) => s.inputView);
  const setInputView = useWorkbenchStore((s) => s.setInputView);
  const viewMode = useWorkbenchStore((s) => s.viewMode);
  const editorVisible = useWorkbenchStore((s) => s.editorVisible);
  const showInputViewSwitch = viewMode === 'workbench' && editorVisible;

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
  // 双击抖动/翻面动画反馈控制器（可重复触发，不会在首次挂载时播放）。
  const logoAnim = useAnimationControls();
  const handleLogoDoubleClick = () => {
    const pick = EASTER_EGGS[Math.floor(Math.random() * EASTER_EGGS.length)];
    setEgg(pick);
    if (eggTimer.current) window.clearTimeout(eggTimer.current);
    eggTimer.current = window.setTimeout(() => setEgg(null), 4000);
    // 播放整块翻面反馈：整个图标沿 Y 轴翻转一整圈（360°），
    // 幅度大、明显，鼠标悬停也遮挡不住；最后回到正面不变形。
    void logoAnim.start({
      rotateY: [0, 180, 360],
      rotate: [0, -10, 10, -6, 6, 0],
      scale: [1, 0.88, 1.18, 1, 1],
      transition: { duration: 0.9, ease: 'easeInOut' },
    });
  };

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'relative h-10 shrink-0 flex items-center justify-between px-3 gap-4',
        'glass border-b border-border',
        'select-none',
      )}
    >
      {/* subtle teal gradient overlay */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          background:
            'linear-gradient(90deg, oklch(0.7 0.15 165 / 8%) 0%, transparent 35%, transparent 65%, oklch(0.7 0.15 165 / 5%) 100%)',
        }}
      />

      {/* ── Left: brand ───────────────────────────────────────────── */}
      <div className="relative flex items-center gap-2.5 min-w-0">
        {/* 整块翻面：包裹整个图标（含底色/边框），双击时整体翻转一圈 */}
        <motion.div
          animate={logoAnim}
          style={{ transformStyle: 'preserve-3d' }}
          className="relative"
        >
          <motion.div
            initial={{ rotate: -90, scale: 0.6, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.05 }}
            onDoubleClick={handleLogoDoubleClick}
            title="双击看看？"
            className="relative flex items-center justify-center h-7 px-1.5 rounded-lg bg-primary/10 border border-primary/40 cursor-default"
            style={{
              boxShadow: '0 0 14px oklch(0.7 0.15 165 / 35%)',
            }}
          >
            <img
              src="/logo.png"
              alt="OmniMath Pro"
              className="h-5 w-auto object-contain pointer-events-none select-none"
              style={{ filter: 'brightness(1.25) contrast(1.4) saturate(1.2)' }}
            />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-lg"
            style={{ boxShadow: '0 0 0 1px oklch(0.7 0.15 165 / 60%)' }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          </motion.div>
        </motion.div>

        {/* 双击 logo 彩蛋：随机数学趣语气泡 */}
        <AnimatePresence>
          {egg && (
            <motion.div
              key="egg"
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              onClick={() => setEgg(null)}
              className="absolute top-full left-0 mt-2 z-50 max-w-[260px] rounded-xl border border-primary/30 bg-popover px-3 py-2 text-[12px] leading-relaxed text-popover-foreground shadow-xl cursor-pointer"
            >
              {egg}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col leading-none min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-semibold tracking-tight text-gradient-teal">
              OmniMath Pro
            </span>
            <span className="text-[10px] text-muted-foreground/80 hidden sm:inline">
              v{pkg.version}
            </span>
          </div>
        </div>
      </div>

      {/* ── Center: menus ─────────────────────────────────────────── */}
      <nav className="hidden md:flex items-center gap-0.5 relative">
        {/* 代码 / Demos 输入界面切换（上移到顶栏；仅在工作台 + 编辑器可见时显示） */}
        {showInputViewSwitch && (
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/60 border border-border/60 mr-1">
            <button
              type="button"
              onClick={() => setInputView('code')}
              title="代码编辑器"
              className={cn(
                'flex items-center gap-1 h-6 px-2 text-[11px] rounded transition-all font-medium',
                inputView === 'code'
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <FileCode2 className="size-3.5" />
              代码
            </button>
            <button
              type="button"
              onClick={() => setInputView('demos')}
              title="Demos 直接输入绘图"
              className={cn(
                'flex items-center gap-1 h-6 px-2 text-[11px] rounded transition-all font-medium',
                inputView === 'demos'
                  ? 'bg-primary/15 text-primary shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <SquareFunction className="size-3.5" />
              Demos
            </button>
          </div>
        )}
        {MENU_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="px-2.5 h-7 text-[12.5px] rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/70 transition-colors"
          >
            {t(key)}
          </button>
        ))}
      </nav>

      {/* ── Right: actions ────────────────────────────────────────── */}
      <div className="relative flex items-center gap-1.5">
        {/* Language switcher */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 gap-1 text-[12px]">
              <Languages className="size-3.5 text-primary" />
              <span className="hidden sm:inline">{locale === 'zh-CN' ? '中' : 'EN'}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              onClick={() => handleLocaleChange('zh-CN')}
              className={cn(locale === 'zh-CN' && 'bg-accent')}
            >
              <span className="mr-2">🇨🇳</span> 中文
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => handleLocaleChange('en')}
              className={cn(locale === 'en' && 'bg-accent')}
            >
              <span className="mr-2">🇺🇸</span> English
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
              className="grid place-items-center size-7 rounded-md border border-border/60 bg-muted/40 hover:bg-accent transition-colors relative overflow-hidden"
            >
              <AnimatePresence mode="wait" initial={false}>
                {theme === 'dark' ? (
                  <motion.span
                    key="moon"
                    initial={{ y: 14, opacity: 0, rotate: -90 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    exit={{ y: -14, opacity: 0, rotate: 90 }}
                    transition={{ duration: 0.22 }}
                    className="grid place-items-center"
                  >
                    <Moon className="size-3.5 text-primary" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="sun"
                    initial={{ y: 14, opacity: 0, rotate: 90 }}
                    animate={{ y: 0, opacity: 1, rotate: 0 }}
                    exit={{ y: -14, opacity: 0, rotate: -90 }}
                    transition={{ duration: 0.22 }}
                    className="grid place-items-center"
                  >
                    <Sun className="size-3.5 text-amber-500" />
                  </motion.span>
                )}
              </AnimatePresence>
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
          <div className="flex items-center gap-0.5 ml-1 pl-1.5 border-l border-border/60">
            <button
              type="button"
              onClick={() => void getCurrentWindow().minimize()}
              aria-label="Minimize window"
              className="grid place-items-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Minus className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void getCurrentWindow().toggleMaximize()}
              aria-label="Maximize or restore window"
              className="grid place-items-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Square className="size-3" />
            </button>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={handleToggleFullscreen}
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  className="grid place-items-center size-7 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  {isFullscreen ? (
                    <Minimize2 className="size-3.5" />
                  ) : (
                    <Maximize className="size-3.5" />
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
              className="grid place-items-center size-7 rounded-md text-muted-foreground hover:bg-red-500/90 hover:text-white transition-colors"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
