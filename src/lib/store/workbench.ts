import { create } from 'zustand';
import type { InputMode } from '@/lib/engine/types';
import type { Locale } from '@/lib/i18n';

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

export interface VariableEntry {
  name: string;
  value: unknown;
  type: 'number' | 'matrix' | 'string' | 'function' | 'complex' | 'boolean' | 'unit';
  latex?: string;
}

export type SidePanelTab = 'history' | 'variables' | 'formulas' | 'pipeline' | 'linalg' | 'solver' | 'files';
export type PreviewTab = 'formula' | 'plot2d' | 'plot3d' | 'log' | 'pipeline' | 'ai';
export type Theme = 'dark' | 'light';
export type ViewMode = 'workbench' | 'pipeline' | 'focus';

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

  // UI
  theme: Theme;
  locale: Locale;
  activeSidePanel: SidePanelTab;
  sidePanelCollapsed: boolean;
  sidePanelWidth: number;
  previewVisible: boolean;
  previewWidth: number;
  activePreviewTab: PreviewTab;
  editorWidth: number;
  viewMode: ViewMode;
  commandPaletteOpen: boolean;
  globalCalcOpen: boolean;
  rightPanelMode: 'preview' | 'pipeline' | 'ai';

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

  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  setActiveSidePanel: (tab: SidePanelTab) => void;
  toggleSidePanel: () => void;
  setSidePanelWidth: (w: number) => void;
  setPreviewVisible: (v: boolean) => void;
  setPreviewWidth: (w: number) => void;
  setEditorWidth: (w: number) => void;
  setActivePreviewTab: (tab: PreviewTab) => void;
  setViewMode: (mode: ViewMode) => void;
  setCommandPaletteOpen: (v: boolean) => void;
  setGlobalCalcOpen: (v: boolean) => void;
  setRightPanelMode: (m: 'preview' | 'pipeline' | 'ai') => void;

  // Persistence
  saveToStorage: () => void;
  loadFromStorage: () => void;
}

export const STORAGE_KEY = 'omnimath-pro-v2';

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

function loadInitial(): Partial<WorkbenchState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw);
    return {
      editorContent: data.editorContent ?? '',
      inputMode: data.inputMode ?? 'simple',
      results: data.results ?? [],
      variables: data.variables ?? {},
      plots: Array.isArray(data.plots)
        ? data.plots.map(sanitizePlot).filter((p: PlotConfig | null): p is PlotConfig => p !== null)
        : [],
      theme: data.theme ?? 'dark',
      locale: data.locale ?? 'zh-CN',
      activeSidePanel: data.activeSidePanel ?? 'history',
      sidePanelCollapsed: data.sidePanelCollapsed ?? false,
    };
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const useWorkbenchStore = create<WorkbenchState>((set, get) => ({
  editorContent: '',
  inputMode: 'simple',
  cursorPosition: 0,

  results: [],
  currentResult: null,

  variables: {},
  plots: [],

  theme: 'dark',
  locale: 'zh-CN',
  activeSidePanel: 'history',
  sidePanelCollapsed: false,
  sidePanelWidth: 280,
  previewVisible: true,
  previewWidth: 45,
  editorWidth: 55,
  activePreviewTab: 'formula',
  viewMode: 'workbench',
  commandPaletteOpen: false,
  globalCalcOpen: false,
  rightPanelMode: 'preview',

  setEditorContent: (content) => { set({ editorContent: content }); get().saveToStorage(); },
  setInputMode: (mode) => { set({ inputMode: mode }); get().saveToStorage(); },
  setCursorPosition: (pos) => set({ cursorPosition: pos }),

  addResult: (result) => {
    set((s) => ({ results: [result, ...s.results].slice(0, 200), currentResult: result }));
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
    get().saveToStorage();
  },
  clearVariables: () => { set({ variables: {} }); get().saveToStorage(); },

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
  setActiveSidePanel: (tab) => set({ activeSidePanel: tab, sidePanelCollapsed: false }),
  toggleSidePanel: () => set((s) => ({ sidePanelCollapsed: !s.sidePanelCollapsed })),
  setSidePanelWidth: (w) => set({ sidePanelWidth: Math.max(200, Math.min(500, w)) }),
  setPreviewVisible: (v) => set({ previewVisible: v }),
  setPreviewWidth: (w) => set({ previewWidth: Math.max(25, Math.min(75, w)) }),
  setEditorWidth: (w) => set({ editorWidth: Math.max(25, Math.min(75, w)) }),
  setActivePreviewTab: (tab) => set({ activePreviewTab: tab }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setCommandPaletteOpen: (v) => set({ commandPaletteOpen: v }),
  setGlobalCalcOpen: (v) => set({ globalCalcOpen: v }),
  setRightPanelMode: (m) => set({ rightPanelMode: m }),

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
            theme: s.theme,
            locale: s.locale,
            activeSidePanel: s.activeSidePanel,
            sidePanelCollapsed: s.sidePanelCollapsed,
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
      if (initial.theme === 'dark' && typeof document !== 'undefined') {
        document.documentElement.classList.add('dark');
      }
    }
  },
}));
