'use client';

/**
 * OmniMath Pro — TitleBar
 *
 * VSCode-style top bar (h-10) with glass background.
 *  - Left: animated teal Sigma logo + "OmniMath Pro" wordmark (text-gradient-teal)
 *          + i18n appSubtitle.
 *  - Center: File / Edit / View / Help menu buttons (open command palette).
 *  - Right: theme toggle (Sun/Moon, animated), language switcher (zh/EN),
 *           view-mode switcher (Workbench / Pipeline / Focus).
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
  Sigma,
  Moon,
  Sun,
  Languages,
  LayoutDashboard,
  Workflow,
  Maximize2,
  ChevronDown,
  PencilRuler,
} from 'lucide-react';
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
import { t, useLocale, setLocale, type Locale } from '@/lib/i18n';
import pkg from '@/../package.json';

const MENU_KEYS = ['menuFile', 'menuEdit', 'menuView', 'menuHelp'] as const;

export function TitleBar() {
  const theme = useWorkbenchStore((s) => s.theme);
  const toggleTheme = useWorkbenchStore((s) => s.toggleTheme);
  const viewMode = useWorkbenchStore((s) => s.viewMode);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setCommandPaletteOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);
  const locale = useLocale();
  const setLocaleStore = useWorkbenchStore((s) => s.setLocale);

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
          <Sigma className="size-4 text-primary" strokeWidth={2.4} />
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
        {/* Prominent blueprint / pipeline entry — primary CTA so users
            don't miss it (it's the "wow" feature of OmniMath Pro). */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === 'pipeline' ? 'workbench' : 'pipeline')}
              className={cn(
                'hidden sm:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] font-medium transition-all',
                viewMode === 'pipeline'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15',
              )}
            >
              <Workflow className="size-3.5" strokeWidth={2.2} />
              <span>{t('tabPipeline')}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{t('tabPipeline')}</TooltipContent>
        </Tooltip>

        {/* View mode switcher — workbench / whiteboard / focus */}
        <div className="hidden sm:flex items-center gap-0.5 mr-1 p-0.5 rounded-md bg-muted/60 border border-border/60">
          {(
            [
              { v: 'workbench', icon: LayoutDashboard, key: 'menuToggleSidebar' },
              { v: 'whiteboard', icon: PencilRuler, key: 'abWhiteboard' },
              { v: 'focus', icon: Maximize2, key: 'menuResetZoom' },
            ] as const
          ).map(({ v, icon: Icon, key }) => (
            <Tooltip key={v}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setViewMode(v)}
                  className={cn(
                    'grid place-items-center size-6 rounded transition-all',
                    viewMode === v
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/60',
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t(key)}</TooltipContent>
            </Tooltip>
          ))}
        </div>

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
      </div>
    </header>
  );
}
