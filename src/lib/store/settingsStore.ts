// 设置面板状态管理
// - 管理 SettingsPanel 的打开/关闭
// - 管理全局默认设置（导出 DPI、公式字号等不归 workbench/layoutStore 管的项）
// 持久化到 localStorage，键名 omnimath-settings-v1

import { create } from 'zustand';

interface SettingsState {
  /** 设置面板是否打开 */
  open: boolean;

  /** 符号面板是否展开（编辑器下方可点击符号条） */
  symbolPaletteOpen: boolean;

  /* 全局默认设置 */
  /** 默认导出 DPI 倍数（1/2/4），默认 2 */
  defaultExportDpi: 1 | 2 | 4;
  /** 默认公式导出字号（px），默认 28 */
  defaultFormulaFontSize: number;
  /** 是否启用 KaTeX 数学字体（默认 true，关闭则使用系统字体） */
  useMathFont: boolean;
  /** UI 字体预设：modern（Inter）/ scholarly（Space Grotesk + Newsreader）/ system */
  fontPreset: 'modern' | 'scholarly' | 'system';
  /** 活动栏图标顺序（自由拖拽排序后持久化），默认与内置布局顺序一致 */
  activityBarOrder: string[];
  /** 编辑器字号（px，8–32），默认 14 */
  editorFontSize: number;
  /** 坐标轴字号（px，8–24），默认 12 */
  plotAxisFontSize: number;

  /* 高级设置（结构化表单，原 JSON 编辑的替代） */
  /** 2D 曲线采样点数（100–2000），默认 800（对应 plot2dAnalysis 的 steps 默认值） */
  advancedPlotSamples: number;
  /** 3D 曲面网格分辨率（10–200），默认 60（对应 plot3d 的 resolution 默认值） */
  advancedPlot3dResolution: number;
  /** 数值结果有效数字位数（2–15），默认 10（对应 latex.ts 的 toPrecision(10)） */
  advancedResultPrecision: number;
  /** 历史记录条数上限（10–500），默认 200（对应 workbench store 的 slice(0, 200)） */
  advancedHistoryLimit: number;
  /** 三角函数角度单位，默认 'rad' */
  advancedAngleUnit: 'rad' | 'deg';
  /** 求解结果默认展开分步过程，默认 true */
  advancedShowSteps: boolean;
  /** 启用界面过渡动画，默认 true */
  advancedAnimations: boolean;
  /** 导出文件名前缀（字母/数字/连字符/下划线，≤40 字符），默认 'omnimath' */
  advancedExportPrefix: string;

  /** 2D 参数滑块面板是否折叠（持久化，跨会话保留用户的展开偏好） */
  slidersCollapsed: boolean;

  setOpen: (v: boolean) => void;
  toggleOpen: () => void;
  setSymbolPaletteOpen: (v: boolean) => void;
  setDefaultExportDpi: (dpi: 1 | 2 | 4) => void;
  setDefaultFormulaFontSize: (size: number) => void;
  setUseMathFont: (v: boolean) => void;
  setFontPreset: (v: 'modern' | 'scholarly' | 'system') => void;
  setActivityBarOrder: (order: string[]) => void;
  setEditorFontSize: (size: number) => void;
  setPlotAxisFontSize: (size: number) => void;

  setAdvancedPlotSamples: (n: number) => void;
  setAdvancedPlot3dResolution: (n: number) => void;
  setAdvancedResultPrecision: (n: number) => void;
  setAdvancedHistoryLimit: (n: number) => void;
  setAdvancedAngleUnit: (v: 'rad' | 'deg') => void;
  setAdvancedShowSteps: (v: boolean) => void;
  setAdvancedAnimations: (v: boolean) => void;
  setAdvancedExportPrefix: (v: string) => void;
  /** 切换 2D 参数滑块面板的折叠状态（持久化） */
  setSlidersCollapsed: (v: boolean) => void;
  /** 仅重置高级区设置项（不影响其他分类） */
  resetAdvanced: () => void;

  saveToStorage: () => void;
  loadFromStorage: () => void;
  resetToDefaults: () => void;
}

export const SETTINGS_KEY = 'omnimath-settings-v1';

/** 活动栏图标的默认顺序（同时作为合法 id 白名单用于持久化数据校验；
 *  id 必须与 ActivityBar 中的条目注册表一致）。 */
export const DEFAULT_ACTIVITY_BAR_ORDER: string[] = [
  'history', 'variables', 'files', 'formulas', 'stats',
  'solver', 'pipeline', 'whiteboard', 'linalg',
  'toggleEditor', 'togglePreview', 'toggleSidebar', 'layoutMenu', 'settings',
];

interface PersistedSettings {
  defaultExportDpi: 1 | 2 | 4;
  defaultFormulaFontSize: number;
  useMathFont: boolean;
  fontPreset?: 'modern' | 'scholarly' | 'system';
  activityBarOrder?: string[];
  editorFontSize?: number;
  plotAxisFontSize?: number;
  /* 高级设置项均为可选，兼容旧版本持久化数据 */
  advancedPlotSamples?: number;
  advancedPlot3dResolution?: number;
  advancedResultPrecision?: number;
  advancedHistoryLimit?: number;
  advancedAngleUnit?: 'rad' | 'deg';
  advancedShowSteps?: boolean;
  advancedAnimations?: boolean;
  advancedExportPrefix?: string;
  slidersCollapsed?: boolean;
  symbolPaletteOpen?: boolean;
}

/** 高级区各项默认值（resetAdvanced / resetToDefaults 共用） */
const ADVANCED_DEFAULTS = {
  advancedPlotSamples: 800,
  advancedPlot3dResolution: 60,
  advancedResultPrecision: 10,
  advancedHistoryLimit: 200,
  advancedAngleUnit: 'rad' as const,
  advancedShowSteps: true,
  advancedAnimations: true,
  advancedExportPrefix: 'omnimath',
};

/** 数值钳制到 [min, max] 并取整（store 侧的兜底防御，面板层已做校验） */
const clampInt = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, Math.round(n)));

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useSettingsStore = create<SettingsState>((set, get) => ({
  open: false,
  symbolPaletteOpen: false,
  defaultExportDpi: 2,
  defaultFormulaFontSize: 28,
  useMathFont: true,
  fontPreset: 'modern',
  activityBarOrder: [...DEFAULT_ACTIVITY_BAR_ORDER],
  editorFontSize: 14,
  plotAxisFontSize: 12,
  ...ADVANCED_DEFAULTS,
  slidersCollapsed: false,

  setOpen: (v) => set({ open: v }),
  toggleOpen: () => set((s) => ({ open: !s.open })),
  setSymbolPaletteOpen: (v) => {
    set({ symbolPaletteOpen: v });
    get().saveToStorage();
  },
  setDefaultExportDpi: (dpi) => {
    set({ defaultExportDpi: dpi });
    get().saveToStorage();
  },
  setDefaultFormulaFontSize: (size) => {
    set({ defaultFormulaFontSize: Math.max(12, Math.min(72, Math.round(size))) });
    get().saveToStorage();
  },
  setUseMathFont: (v) => {
    set({ useMathFont: v });
    get().saveToStorage();
  },
  setFontPreset: (v) => {
    set({ fontPreset: v });
    get().saveToStorage();
  },
  setActivityBarOrder: (order) => {
    set({ activityBarOrder: order });
    get().saveToStorage();
  },
  setEditorFontSize: (size) => {
    set({ editorFontSize: clampInt(size, 8, 32) });
    get().saveToStorage();
  },
  setPlotAxisFontSize: (size) => {
    set({ plotAxisFontSize: clampInt(size, 8, 24) });
    get().saveToStorage();
  },

  /* 高级设置 setter：写入即持久化（saveToStorage 内部已做 300ms 防抖） */
  setAdvancedPlotSamples: (n) => {
    set({ advancedPlotSamples: clampInt(n, 100, 2000) });
    get().saveToStorage();
  },
  setAdvancedPlot3dResolution: (n) => {
    set({ advancedPlot3dResolution: clampInt(n, 10, 200) });
    get().saveToStorage();
  },
  setAdvancedResultPrecision: (n) => {
    set({ advancedResultPrecision: clampInt(n, 2, 15) });
    get().saveToStorage();
  },
  setAdvancedHistoryLimit: (n) => {
    set({ advancedHistoryLimit: clampInt(n, 10, 500) });
    get().saveToStorage();
  },
  setAdvancedAngleUnit: (v) => {
    set({ advancedAngleUnit: v });
    get().saveToStorage();
  },
  setAdvancedShowSteps: (v) => {
    set({ advancedShowSteps: v });
    get().saveToStorage();
  },
  setAdvancedAnimations: (v) => {
    set({ advancedAnimations: v });
    get().saveToStorage();
  },
  setAdvancedExportPrefix: (v) => {
    set({ advancedExportPrefix: v });
    get().saveToStorage();
  },
  setSlidersCollapsed: (v) => {
    set({ slidersCollapsed: v });
    get().saveToStorage();
  },
  resetAdvanced: () => {
    set({ ...ADVANCED_DEFAULTS });
    get().saveToStorage();
  },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const s = get();
        const payload: PersistedSettings = {
          defaultExportDpi: s.defaultExportDpi,
          defaultFormulaFontSize: s.defaultFormulaFontSize,
          useMathFont: s.useMathFont,
          fontPreset: s.fontPreset,
          activityBarOrder: s.activityBarOrder,
          editorFontSize: s.editorFontSize,
          plotAxisFontSize: s.plotAxisFontSize,
          advancedPlotSamples: s.advancedPlotSamples,
          advancedPlot3dResolution: s.advancedPlot3dResolution,
          advancedResultPrecision: s.advancedResultPrecision,
          advancedHistoryLimit: s.advancedHistoryLimit,
          advancedAngleUnit: s.advancedAngleUnit,
          advancedShowSteps: s.advancedShowSteps,
          advancedAnimations: s.advancedAnimations,
          advancedExportPrefix: s.advancedExportPrefix,
          slidersCollapsed: s.slidersCollapsed,
          symbolPaletteOpen: s.symbolPaletteOpen,
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(payload));
      } catch {
        // ignore quota errors
      }
    }, 300);
  },
  loadFromStorage: () => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<PersistedSettings>;
      if (data.defaultExportDpi === 1 || data.defaultExportDpi === 2 || data.defaultExportDpi === 4) {
        set({ defaultExportDpi: data.defaultExportDpi });
      }
      if (typeof data.defaultFormulaFontSize === 'number' && data.defaultFormulaFontSize > 0) {
        set({ defaultFormulaFontSize: data.defaultFormulaFontSize });
      }
      if (typeof data.useMathFont === 'boolean') {
        set({ useMathFont: data.useMathFont });
      }
      if (data.fontPreset === 'modern' || data.fontPreset === 'scholarly' || data.fontPreset === 'system') {
        set({ fontPreset: data.fontPreset });
      }
      /* 活动栏顺序：过滤失效 id + 补全缺失项，与 workbench 的迁移逻辑一致 */
      if (Array.isArray(data.activityBarOrder)) {
        const valid = data.activityBarOrder.filter(
          (id): id is string =>
            typeof id === 'string' && DEFAULT_ACTIVITY_BAR_ORDER.includes(id),
        );
        for (const id of DEFAULT_ACTIVITY_BAR_ORDER) {
          if (!valid.includes(id)) valid.push(id);
        }
        set({ activityBarOrder: valid });
      }
      if (typeof data.editorFontSize === 'number' && data.editorFontSize >= 8 && data.editorFontSize <= 32) {
        set({ editorFontSize: Math.round(data.editorFontSize) });
      }
      if (typeof data.plotAxisFontSize === 'number' && data.plotAxisFontSize >= 8 && data.plotAxisFontSize <= 24) {
        set({ plotAxisFontSize: Math.round(data.plotAxisFontSize) });
      }
      /* 高级设置：逐项校验合法性后再写入，避免损坏的持久化数据污染状态 */
      if (typeof data.advancedPlotSamples === 'number' && data.advancedPlotSamples >= 100 && data.advancedPlotSamples <= 2000) {
        set({ advancedPlotSamples: Math.round(data.advancedPlotSamples) });
      }
      if (typeof data.advancedPlot3dResolution === 'number' && data.advancedPlot3dResolution >= 10 && data.advancedPlot3dResolution <= 200) {
        set({ advancedPlot3dResolution: Math.round(data.advancedPlot3dResolution) });
      }
      if (typeof data.advancedResultPrecision === 'number' && data.advancedResultPrecision >= 2 && data.advancedResultPrecision <= 15) {
        set({ advancedResultPrecision: Math.round(data.advancedResultPrecision) });
      }
      if (typeof data.advancedHistoryLimit === 'number' && data.advancedHistoryLimit >= 10 && data.advancedHistoryLimit <= 500) {
        set({ advancedHistoryLimit: Math.round(data.advancedHistoryLimit) });
      }
      if (data.advancedAngleUnit === 'rad' || data.advancedAngleUnit === 'deg') {
        set({ advancedAngleUnit: data.advancedAngleUnit });
      }
      if (typeof data.advancedShowSteps === 'boolean') {
        set({ advancedShowSteps: data.advancedShowSteps });
      }
      if (typeof data.advancedAnimations === 'boolean') {
        set({ advancedAnimations: data.advancedAnimations });
      }
      if (typeof data.advancedExportPrefix === 'string' && data.advancedExportPrefix.length > 0 && data.advancedExportPrefix.length <= 40) {
        set({ advancedExportPrefix: data.advancedExportPrefix });
      }
      if (typeof data.slidersCollapsed === 'boolean') {
        set({ slidersCollapsed: data.slidersCollapsed });
      }
      if (typeof data.symbolPaletteOpen === 'boolean') {
        set({ symbolPaletteOpen: data.symbolPaletteOpen });
      }
    } catch {
      // ignore parse errors
    }
  },
  resetToDefaults: () => {
    set({
      defaultExportDpi: 2,
      defaultFormulaFontSize: 28,
      useMathFont: true,
      fontPreset: 'modern',
      activityBarOrder: [...DEFAULT_ACTIVITY_BAR_ORDER],
      editorFontSize: 14,
      plotAxisFontSize: 12,
      ...ADVANCED_DEFAULTS,
      slidersCollapsed: false,
      symbolPaletteOpen: false,
    });
    get().saveToStorage();
  },
}));
