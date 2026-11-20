/**
 * Aurora 图表调色板桥接 — 把 globals.css 中的 `--viz-*` token 读成 Canvas /
 * store 需要的具体颜色字符串。
 *
 * CSS 变量本身是 hex 字符串（`--viz-1: #3B6FE0`），所以
 * `getComputedStyle(document.documentElement).getPropertyValue('--viz-1')`
 * 直接返回可用颜色。读取开销不小，因此按主题（html.dark）缓存：一帧里
 * 无论绘制多少次曲线，只会在主题切换后首次调用时读一次 computed style。
 * SSR / 无 document 时返回内置兜底色，保证服务端渲染不报错。
 */

/** 浅色主题下的蓝 → 青 → 紫序列（与 globals.css 保持一致）。 */
export const VIZ_PALETTE_FALLBACK: readonly string[] = [
  '#3B6FE0',
  '#22A7C4',
  '#7C5CE0',
  '#4CC3D9',
  '#8B7CF6',
  '#2E8BFF',
];

const VIZ_PALETTE_VARS = ['--viz-1', '--viz-2', '--viz-3', '--viz-4', '--viz-5', '--viz-6'];

export interface VizTokens {
  /** 6 色曲线序列。 */
  palette: string[];
  /** 网格线（低对比）。 */
  grid: string;
  /** 坐标轴 + 刻度文字。 */
  axis: string;
  /** 强调轴 / 读数。 */
  axisStrong: string;
  /** 图表内部柔光（仅用于可视化，不扩散到页面 chrome）。 */
  glow: string;
  /** 图表卡底色。 */
  surface: string;
  /** 悬浮读数浮层底色。 */
  tooltip: string;
}

const LIGHT_TOKENS: VizTokens = {
  palette: [...VIZ_PALETTE_FALLBACK],
  grid: 'rgba(25, 31, 45, 0.07)',
  axis: 'rgba(70, 80, 100, 0.55)',
  axisStrong: 'rgba(45, 52, 66, 0.75)',
  glow: 'rgba(59, 111, 224, 0.22)',
  surface: '#FFFFFF',
  tooltip: '#FFFFFF',
};

const DARK_TOKENS: VizTokens = {
  palette: ['#5B8CFF', '#4FD1E8', '#9A7BFF', '#6FE3F0', '#B49CFF', '#7FB2FF'],
  grid: 'rgba(216, 226, 245, 0.08)',
  axis: 'rgba(196, 208, 228, 0.45)',
  axisStrong: 'rgba(230, 237, 250, 0.7)',
  glow: 'rgba(91, 140, 255, 0.3)',
  surface: '#182033',
  tooltip: '#1D2740',
};

function currentThemeKey(): 'light' | 'dark' | 'ssr' {
  if (typeof document === 'undefined') return 'ssr';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function readVar(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = styles.getPropertyValue(name).trim();
  return value || fallback;
}

let paletteKey: 'light' | 'dark' | 'ssr' | null = null;
let paletteCache: string[] = [...VIZ_PALETTE_FALLBACK];

let tokensKey: 'light' | 'dark' | 'ssr' | null = null;
let tokensCache: VizTokens = LIGHT_TOKENS;

/**
 * 当前主题下的 6 色曲线序列。主题不变时直接返回缓存数组（调用方不要修改
 * 返回值）。
 */
export function getVizPalette(): string[] {
  const key = currentThemeKey();
  if (key === paletteKey) return paletteCache;
  if (key === 'ssr') {
    paletteKey = key;
    paletteCache = [...VIZ_PALETTE_FALLBACK];
    return paletteCache;
  }
  const styles = getComputedStyle(document.documentElement);
  const fallback = key === 'dark' ? DARK_TOKENS.palette : VIZ_PALETTE_FALLBACK;
  paletteCache = VIZ_PALETTE_VARS.map((name, i) =>
    readVar(styles, name, fallback[i] ?? VIZ_PALETTE_FALLBACK[i]),
  );
  paletteKey = key;
  return paletteCache;
}

/** 取第 `index` 个曲线颜色（自动取模，负数安全）。 */
export function getVizColor(index: number): string {
  const palette = getVizPalette();
  const len = palette.length;
  return palette[((index % len) + len) % len];
}

/**
 * 当前主题下的一整套图表 token（调色板 + 网格 / 轴 / 浮层底色）。
 * 同样按主题缓存，可在每次 draw 开始时调用一次并复用。
 */
export function getVizTokens(): VizTokens {
  const key = currentThemeKey();
  if (key === tokensKey) return tokensCache;
  const base = key === 'dark' ? DARK_TOKENS : LIGHT_TOKENS;
  if (key === 'ssr') {
    tokensKey = key;
    tokensCache = base;
    return tokensCache;
  }
  const styles = getComputedStyle(document.documentElement);
  tokensCache = {
    palette: [...getVizPalette()],
    grid: readVar(styles, '--viz-grid', base.grid),
    axis: readVar(styles, '--viz-axis', base.axis),
    axisStrong: readVar(styles, '--viz-axis-strong', base.axisStrong),
    glow: readVar(styles, '--viz-glow', base.glow),
    surface: readVar(styles, '--viz-surface', base.surface),
    tooltip: readVar(styles, '--viz-tooltip', base.tooltip),
  };
  tokensKey = key;
  return tokensCache;
}
