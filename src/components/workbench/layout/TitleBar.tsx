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

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Moon,
  Sun,
  Languages,
  ChevronDown,
  Minus,
  Square,
  X,
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

export function TitleBar() {
  const theme = useWorkbenchStore((s) => s.theme);
  const toggleTheme = useWorkbenchStore((s) => s.toggleTheme);
  const setCommandPaletteOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);
  const locale = useLocale();
  const setLocaleStore = useWorkbenchStore((s) => s.setLocale);

  // 仅在 Tauri 桌面壳内渲染窗口控制按钮。
  // 初始渲染一律为 false（SSR / 浏览器），挂载后再判定，
  // 避免 hydration 不一致。
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    setIsDesktop(inTauri());
  }, []);

  const handleLocaleChange = (next: Locale) => {
    setLocale(next);
    setLocaleStore(next);
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
        <motion.div
          initial={{ rotate: -90, scale: 0.6, opacity: 0 }}
          animate={{ rotate: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.05 }}
          className="relative grid place-items-center size-7 rounded-lg bg-primary/10 border border-primary/30"
          style={{
            boxShadow: '0 0 16px oklch(0.7 0.15 165 / 30%)',
          }}
        >
          <img
            src="/logo.svg"
            alt="OmniMath Pro"
            className="size-4 pointer-events-none select-none"
          />
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-lg"
            style={{ boxShadow: '0 0 0 1px oklch(0.7 0.15 165 / 60%)' }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>

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
