import { create } from 'zustand';
import { CalculatorState, SidePanelTab, CalculationResult, VariableEntry, PlotConfig, ThemeMode, InputMode, Locale } from './types';
import { setLocale as setI18nLocale } from './i18n';

const STORAGE_KEY = 'omnmath-state-v1';

interface PersistedState {
  results: CalculationResult[];
  variables: Record<string, VariableEntry>;
  plots: PlotConfig[];
  theme: ThemeMode;
  inputMode: InputMode;
  locale: Locale;
  memory: number;
}

function loadFromStorage(): Partial<PersistedState> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function saveToStorage(state: Partial<PersistedState>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors (quota, etc.)
  }
}

export const useCalculatorStore = create<CalculatorState>((set, get) => ({
  // Layout
  activeSidePanel: 'symbols',
  sidePanelCollapsed: false,
  previewVisible: true,

  // Editor
  editorContent: '',
  cursorPosition: 0,
  inputMode: 'simple',

  // Locale
  locale: 'zh-CN',

  // Calculation
  results: [],
  currentResult: null,
  variables: {},

  // Plot
  plots: [],

  // Memory
  memory: 0,

  // Theme
  theme: 'dark',

  // Command palette
  commandPaletteOpen: false,

  // Actions
  setActiveSidePanel: (panel: SidePanelTab | null) => set({
    activeSidePanel: panel,
    sidePanelCollapsed: panel === null ? true : false,
  }),

  toggleSidePanel: () => set(state => ({
    sidePanelCollapsed: !state.sidePanelCollapsed,
    activeSidePanel: state.sidePanelCollapsed ? 'symbols' : null,
  })),

  togglePreview: () => set(state => ({ previewVisible: !state.previewVisible })),

  setEditorContent: (content: string) => set({ editorContent: content }),

  setCursorPosition: (pos: number) => set({ cursorPosition: pos }),

  setInputMode: (mode: InputMode) => set({ inputMode: mode }),

  setLocale: (locale: Locale) => {
    setI18nLocale(locale);
    set({ locale });
  },

  addResult: (result: CalculationResult) => set(state => {
    const results = [result, ...state.results].slice(0, 100);
    return { results, currentResult: result };
  }),

  setCurrentResult: (result: CalculationResult | null) => set({ currentResult: result }),

  setVariable: (name: string, entry: VariableEntry) => set(state => {
    const variables = { ...state.variables, [name]: entry };
    return { variables };
  }),

  addPlot: (config: PlotConfig) => set(state => ({
    plots: [...state.plots, config],
  })),

  removePlot: (index: number) => set(state => ({
    plots: state.plots.filter((_, i) => i !== index),
  })),

  clearPlots: () => set({ plots: [] }),

  clearHistory: () => {
    set({ results: [], variables: {}, currentResult: null, plots: [] });
    saveToStorage({ results: [], variables: {}, plots: [], theme: get().theme });
  },

  toggleTheme: () => set(state => {
    const theme = (state.theme === 'dark' ? 'light' : 'dark') as ThemeMode;
    saveToStorage({ theme });
    return { theme };
  }),

  insertAtCursor: (text: string) => set(state => {
    const content = state.editorContent;
    const pos = state.cursorPosition;
    const newContent = content.slice(0, pos) + text + content.slice(pos);
    return {
      editorContent: newContent,
      cursorPosition: pos + text.length,
    };
  }),

  setCommandPaletteOpen: (open: boolean) => set({ commandPaletteOpen: open }),

  // Memory actions
  memoryAdd: (value: number) => set(state => ({ memory: state.memory + value })),
  memorySubtract: (value: number) => set(state => ({ memory: state.memory - value })),
  memoryRecall: () => get().memory,
  memoryClear: () => set({ memory: 0 }),
  memoryStore: (value: number) => set({ memory: value }),

  loadFromStorage: () => {
    const persisted = loadFromStorage();
    if (!persisted) return;
    const inputMode = persisted.inputMode ?? 'simple';
    const locale = persisted.locale ?? 'zh-CN';
    setI18nLocale(locale);
    set({
      results: persisted.results ?? [],
      variables: persisted.variables ?? {},
      plots: persisted.plots ?? [],
      theme: persisted.theme ?? 'dark',
      inputMode,
      locale,
      memory: persisted.memory ?? 0,
    });
  },

  saveToStorage: () => {
    const state = get();
    saveToStorage({
      results: state.results,
      variables: state.variables,
      plots: state.plots,
      theme: state.theme,
      inputMode: state.inputMode,
      locale: state.locale,
      memory: state.memory,
    });
  },
}));

// Auto-save on changes (debounced)
let saveTimer: ReturnType<typeof setTimeout> | null = null;
if (typeof window !== 'undefined') {
  useCalculatorStore.subscribe((state) => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveToStorage({
        results: state.results,
        variables: state.variables,
        plots: state.plots,
        theme: state.theme,
        inputMode: state.inputMode,
        locale: state.locale,
        memory: state.memory,
      });
    }, 500);
  });
}
