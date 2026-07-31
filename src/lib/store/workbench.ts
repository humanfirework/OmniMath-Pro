import { create } from 'zustand';
import type { InputMode } from '@/lib/engine/types';
import type { Locale } from '@/lib/i18n';
import { deleteScopeVar, resetScope, syncScope, math } from '@/lib/engine/mathInstance';
import { useSettingsStore } from './settingsStore';

export interface CalculationResult {
  id: string;
  input: string;
  output: string;
  latex: string;
  timestamp: number;
  type: string;
  error?: string;
  variables?: Record<string, unknown>;
  isMatrix?: boolean;
  matrix?: number[][];
  plotExpression?: string;
  plotType?: 'cartesian' | 'polar' | 'parametric' | 'surface3d';
  plotRange?: [number, number];
  steps?: string[];
}

export interface PlotConfig {
  id: string;
  expression: string;
  xRange: [number, number];
  yRange: [number, number];
  color: string;
  plotType: 'cartesian' | 'polar' | 'parametric' | 'surface3d';
  visible: boolean;
  width?: number;
}

/** 2D 自由参数滑块配置（Desmos 式参数滑块的持久化状态）。 */
export interface PlotParamConfig {
  /** 当前值。 */
  value: number;
  /** 滑块范围下限。 */
  min: number;
  /** 滑块范围上限。 */
  max: number;
  /** 滑块步长。 */
  step: number;
}

export interface VariableEntry {
  name: string;
  value: unknown;
  type: 'number' | 'matrix' | 'string' | 'function' | 'complex' | 'boolean' | 'unit';
  latex?: string;
}

export type SidePanelTab = 'history' | 'variables' | 'formulas' | 'linalg' | 'solver' | 'files' | 'stats';
export type PreviewTab = 'formula' | 'plot2d' | 'plot3d' | 'log' | 'pipeline' | 'ai';
export type Theme = 'dark' | 'light';
export type ViewMode = 'workbench' | 'pipeline' | 'whiteboard' | 'focus' | 'linalg' | 'solver';
export type ActivityBarPosition = 'left' | 'right';

interface WorkbenchState {
  // Editor
  editorContent: string;
  inputMode: InputMode;
  cursorPosition: number;

  // Results & history
  results: CalculationResult[];
  currentResult: CalculationResult | null;

  // Variables & plots
  variables: Record<string, VariableEntry>;
  plots: PlotConfig[];
  /** 2D 绘图自由参数的滑块状态（按参数名持久化；参数从表达式中消失后
   *  仍保留其值，重新出现时直接恢复）。 */
  plotParams: Record<string, PlotParamConfig>;

  // UI
  theme: Theme;
  locale: Locale;
  activeSidePanel: SidePanelTab;
  sidePanelCollapsed: boolean;
  previewVisible: boolean;
  activePreviewTab: PreviewTab;
  viewMode: ViewMode;
  commandPaletteOpen: boolean;
  globalCalcOpen: boolean;
  activityBarPosition: ActivityBarPosition;
  activityBarLocked: boolean;
  activityBarAutoHide: boolean;
  activityBarHidden: boolean;
  editorVisible: boolean;

  // Actions
  setEditorContent: (content: string) => void;
  setInputMode: (mode: InputMode) => void;
  setCursorPosition: (pos: number) => void;

  addResult: (result: CalculationResult) => void;
  setCurrentResult: (result: CalculationResult | null) => void;
  clearHistory: () => void;

  setVariable: (name: string, entry: VariableEntry) => void;
  setVariables: (vars: Record<string, VariableEntry>) => void;
  removeVariable: (name: string) => void;
  clearVariables: () => void;

  addPlot: (plot: Omit<PlotConfig, 'id'>) => void;
  removePlot: (id: string) => void;
  togglePlotVisibility: (id: string) => void;
  clearPlots: () => void;
  updatePlot: (id: string, patch: Partial<PlotConfig>) => void;
  /** 合并写入某个 2D 自由参数的滑块配置（value/min/max/step 可部分更新）。 */
  setPlotParam: (name: string, patch: Partial<PlotParamConfig>) => void;

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  setActiveSidePanel: (tab: SidePanelTab) => void;
  toggleSidePanel: () => void;
  setPreviewVisible: (v: boolean) => void;
  setActivePreviewTab: (tab: PreviewTab) => void;
  setViewMode: (mode: ViewMode) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setGlobalCalcOpen: (v: boolean) => void;
  setActivityBarPosition: (p: ActivityBarPosition) => void;
  toggleActivityBarLock: () => void;
  setActivityBarAutoHide: (v: boolean) => void;
  toggleActivityBarHidden: () => void;
  setEditorVisible: (v: boolean) => void;

  // Persistence
  saveToStorage: () => void;
  loadFromStorage: () => void;
}

export const STORAGE_KEY = 'omnimath-pro-v2';

/** 合法的 side-panel tab 值（用于旧 localStorage 数据校验）。
 *  注意：activityBarOrder 已迁移到 settingsStore，此处仅保留 activeSidePanel 的校验。 */
const VALID_SIDE_PANELS: SidePanelTab[] = [
  'history', 'variables', 'formulas', 'files', 'stats', 'linalg', 'solver',
];

/** Validate a plot config from localStorage — rejects malformed entries
 *  that would crash downstream sampling (xRange/yRange must be finite
 *  2-tuples, expression must be a non-empty string). */
function sanitizePlot(p: unknown): PlotConfig | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const expr = o.expression;
  const xRange = o.xRange;
  const yRange = o.yRange;
  if (typeof expr !== 'string' || !expr.trim()) return null;
  if (
    !Array.isArray(xRange) || xRange.length !== 2 ||
    !Number.isFinite(xRange[0]) || !Number.isFinite(xRange[1]) ||
    !Array.isArray(yRange) || yRange.length !== 2 ||
    !Number.isFinite(yRange[0]) || !Number.isFinite(yRange[1])
  ) {
    return null;
  }
  return {
    id: typeof o.id === 'string' ? o.id : `plot-${Math.random().toString(36).slice(2, 7)}`,
    expression: expr,
    xRange: [xRange[0], xRange[1]] as [number, number],
    yRange: [yRange[0], yRange[1]] as [number, number],
    color: typeof o.color === 'string' ? o.color : '#2dd4bf',
    plotType: (o.plotType === 'cartesian' || o.plotType === 'polar' ||
      o.plotType === 'parametric' || o.plotType === 'surface3d')
      ? o.plotType : 'cartesian',
    visible: typeof o.visible === 'boolean' ? o.visible : true,
    width: typeof o.width === 'number' ? o.width : 2,
  };
}

/** 校验并恢复 localStorage 中的 plotParams：四项数值必须有限、
 *  min < max、step > 0，否则丢弃该条目（损坏数据不应让滑块崩溃）。 */
function sanitizePlotParams(raw: unknown): Record<string, PlotParamConfig> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, PlotParamConfig> = {};
  for (const [name, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!name || !v || typeof v !== 'object') continue;
    const o = v as Record<string, unknown>;
    const value = o.value;
    const min = o.min;
    const max = o.max;
    const step = o.step;
    if (
      typeof value === 'number' && Number.isFinite(value) &&
      typeof min === 'number' && Number.isFinite(min) &&
      typeof max === 'number' && Number.isFinite(max) &&
      typeof step === 'number' && Number.isFinite(step) &&
      min < max && step > 0
    ) {
      out[name] = { value, min, max, step };
    }
  }
  return out;
}

function loadInitial(): Partial<WorkbenchState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);

    // 枚举值白名单校验 — 防止损坏/旧版本 localStorage 值导致功能异常
    const VALID_INPUT_MODES = ['simple', 'python', 'matlab'] as const;
    const VALID_THEMES = ['dark', 'light'] as const;
    const VALID_LOCALES = ['zh-CN', 'en'] as const;
    const VALID_VIEW_MODES = ['workbench', 'pipeline', 'whiteboard', 'focus', 'linalg', 'solver'] as const;
    const VALID_AB_POSITIONS = ['left', 'right'] as const;
    const VALID_PREVIEW_TABS = ['formula', 'plot', 'plot3d', 'log'] as const;

    return {
      editorContent: typeof data.editorContent === 'string' ? data.editorContent : '',
      inputMode: VALID_INPUT_MODES.includes(data.inputMode) ? data.inputMode : 'simple',
      results: Array.isArray(data.results) ? data.results : [],
      variables: data.variables && typeof data.variables === 'object' ? data.variables : {},
      plots: Array.isArray(data.plots)
        ? data.plots.map(sanitizePlot).filter((p: PlotConfig | null): p is PlotConfig => p !== null)
        : [],
      plotParams: sanitizePlotParams(data.plotParams),
      theme: VALID_THEMES.includes(data.theme) ? data.theme : 'dark',
      locale: VALID_LOCALES.includes(data.locale) ? data.locale : 'zh-CN',
      activeSidePanel: VALID_SIDE_PANELS.includes(data.activeSidePanel) ? data.activeSidePanel : 'history',
      sidePanelCollapsed: typeof data.sidePanelCollapsed === 'boolean' ? data.sidePanelCollapsed : false,
      previewVisible: typeof data.previewVisible === 'boolean' ? data.previewVisible : true,
      editorVisible: typeof data.editorVisible === 'boolean' ? data.editorVisible : true,
      activePreviewTab: VALID_PREVIEW_TABS.includes(data.activePreviewTab) ? data.activePreviewTab : 'formula',
      viewMode: VALID_VIEW_MODES.includes(data.viewMode) ? data.viewMode : 'workbench',
      activityBarPosition: VALID_AB_POSITIONS.includes(data.activityBarPosition) ? data.activityBarPosition : 'left',
      activityBarLocked: typeof data.activityBarLocked === 'boolean' ? data.activityBarLocked : false,
      activityBarAutoHide: typeof data.activityBarAutoHide === 'boolean' ? data.activityBarAutoHide : false,
      activityBarHidden: typeof data.activityBarHidden === 'boolean' ? data.activityBarHidden : false,
    };
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Revive a JSON-deserialized variable value back into something mathjs
 * understands. mathjs classes (Matrix / Complex / Unit / ...) carry a
 * `mathjs` class tag produced by their `toJSON()` and are restored via
 * `math.reviver`. User-defined functions cannot survive JSON (the
 * evaluator stores them as the placeholder string `'<function>'`) and
 * are skipped — the user re-defines them by re-running the script.
 */
function reviveStoredValue(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value === '<function>') return undefined;
  if (typeof value === 'object' && 'mathjs' in (value as Record<string, unknown>)) {
    try {
      return (math.reviver as (key: string, v: unknown) => unknown)('', value);
    } catch {
      return undefined;
    }
  }
  return value;
}

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  editorContent: '',
  inputMode: 'simple',
  cursorPosition: 0,

  results: [],
  currentResult: null,

  variables: {},
  plots: [],
  plotParams: {},

  theme: 'dark',
  locale: 'zh-CN',
  activeSidePanel: 'history',
  sidePanelCollapsed: false,
  previewVisible: true,
  activePreviewTab: 'formula',
  viewMode: 'workbench',
  commandPaletteOpen: false,
  globalCalcOpen: false,
  activityBarPosition: 'left',
  activityBarLocked: false,
  activityBarAutoHide: false,
  activityBarHidden: false,
  editorVisible: true,

  setEditorContent: (content) => { set({ editorContent: content }); get().saveToStorage(); },
  setInputMode: (mode) => { set({ inputMode: mode }); get().saveToStorage(); },
  setCursorPosition: (pos) => set({ cursorPosition: pos }),

  addResult: (result) => {
    // 历史记录上限取自 settingsStore 的 advancedHistoryLimit（默认 200）。
    // 用 getState() 在 action 调用时即时读取，无需订阅；若读取失败则兜底 200。
    let limit = 200;
    try {
      const v = useSettingsStore.getState().advancedHistoryLimit;
      if (typeof v === 'number' && Number.isFinite(v)) limit = v;
    } catch {
      // settingsStore 尚未初始化时忽略，沿用兜底值
    }
    set((s) => ({ results: [result, ...s.results].slice(0, limit), currentResult: result }));
    get().saveToStorage();
  },
  setCurrentResult: (result) => set({ currentResult: result }),
  clearHistory: () => { set({ results: [], currentResult: null }); get().saveToStorage(); },

  setVariable: (name, entry) => {
    set((s) => ({ variables: { ...s.variables, [name]: entry } }));
    get().saveToStorage();
  },
  setVariables: (vars) => { set({ variables: vars }); get().saveToStorage(); },
  removeVariable: (name) => {
    set((s) => {
      const next = { ...s.variables };
      delete next[name];
      return { variables: next };
    });
    // Keep the engine scope in sync — otherwise deleted variables keep
    // evaluating in plots / console until the next page reload.
    deleteScopeVar(name);
    get().saveToStorage();
  },
  clearVariables: () => {
    set({ variables: {} });
    resetScope();
    get().saveToStorage();
  },

  addPlot: (plot) => {
    const id = `plot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    set((s) => ({ plots: [...s.plots, { ...plot, id }] }));
    get().saveToStorage();
  },
  removePlot: (id) => {
    set((s) => ({ plots: s.plots.filter((p) => p.id !== id) }));
    get().saveToStorage();
  },
  togglePlotVisibility: (id) => {
    set((s) => ({
      plots: s.plots.map((p) => (p.id === id ? { ...p, visible: !p.visible } : p)),
    }));
    get().saveToStorage();
  },
  clearPlots: () => { set({ plots: [] }); get().saveToStorage(); },
  updatePlot: (id, patch) => {
    set((s) => ({
      plots: s.plots.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
    get().saveToStorage();
  },
  setPlotParam: (name, patch) => {
    set((s) => {
      // 未出现过的参数先给一份默认配置，再套用 patch。
      const prev: PlotParamConfig = s.plotParams[name] ?? {
        value: 1,
        min: -9,
        max: 11,
        step: 0.1,
      };
      return {
        plotParams: {
          ...s.plotParams,
          [name]: { ...prev, ...patch },
        },
      };
    });
    get().saveToStorage();
  },

  setTheme: (theme) => {
    set({ theme });
    if (typeof document !== 'undefined') {
      if (theme === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    }
    get().saveToStorage();
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  setLocale: (locale) => { set({ locale }); get().saveToStorage(); },
  setActiveSidePanel: (tab) => { set({ activeSidePanel: tab, sidePanelCollapsed: false }); get().saveToStorage(); },
  toggleSidePanel: () => { set((s) => ({ sidePanelCollapsed: !s.sidePanelCollapsed })); get().saveToStorage(); },
  setPreviewVisible: (v) => { set({ previewVisible: v }); get().saveToStorage(); },
  setActivePreviewTab: (tab) => { set({ activePreviewTab: tab }); get().saveToStorage(); },
  setViewMode: (mode) => { set({ viewMode: mode }); get().saveToStorage(); },
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setGlobalCalcOpen: (v) => set({ globalCalcOpen: v }),
  setActivityBarPosition: (p) => { set({ activityBarPosition: p }); get().saveToStorage(); },
  toggleActivityBarLock: () => { set((s) => ({ activityBarLocked: !s.activityBarLocked })); get().saveToStorage(); },
  setActivityBarAutoHide: (v) => { set({ activityBarAutoHide: v }); get().saveToStorage(); },
  toggleActivityBarHidden: () => { set((s) => ({ activityBarHidden: !s.activityBarHidden })); get().saveToStorage(); },
  setEditorVisible: (v) => { set({ editorVisible: v }); get().saveToStorage(); },

  saveToStorage: () => {
    if (typeof window === 'undefined') return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const s = get();
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            editorContent: s.editorContent,
            inputMode: s.inputMode,
            results: s.results,
            variables: s.variables,
            plots: s.plots,
            plotParams: s.plotParams,
            theme: s.theme,
            locale: s.locale,
            activeSidePanel: s.activeSidePanel,
            sidePanelCollapsed: s.sidePanelCollapsed,
            previewVisible: s.previewVisible,
            editorVisible: s.editorVisible,
            activePreviewTab: s.activePreviewTab,
            viewMode: s.viewMode,
            activityBarPosition: s.activityBarPosition,
            activityBarLocked: s.activityBarLocked,
            activityBarAutoHide: s.activityBarAutoHide,
            activityBarHidden: s.activityBarHidden,
          }),
        );
      } catch {
        // ignore quota errors
      }
    }, 400);
  },
  loadFromStorage: () => {
    const initial = loadInitial();
    if (Object.keys(initial).length > 0) {
      set(initial);
      // 主动同步主题类 — light 时移除 dark 类，避免 layout.tsx 硬编码的 dark
      // 类残留造成 light 用户首次加载看到 dark 闪烁。
      if (typeof document !== 'undefined') {
        if (initial.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
      // Back-fill the engine scope with the restored variables so plots,
      // the console and blueprint nodes can use them immediately after a
      // page reload (previously the panel showed them but mathjs could
      // not evaluate them until re-assigned).
      if (initial.variables || initial.plotParams) {
        const revived: Record<string, unknown> = {};
        // 先放 2D 自由参数的滑块值（低优先级）……
        if (initial.plotParams) {
          for (const [name, p] of Object.entries(initial.plotParams)) {
            revived[name] = p.value;
          }
        }
        // ……再放用户变量（高优先级，同名时覆盖参数 —— 已定义变量
        // 本就不会出现在自由参数列表中）。
        if (initial.variables) {
          for (const [name, entry] of Object.entries(initial.variables)) {
            const v = reviveStoredValue((entry as VariableEntry).value);
            if (v !== undefined) revived[name] = v;
          }
        }
        syncScope(revived);
      }
    }
  },
}));
