export type SidePanelTab = 'symbols' | 'history' | 'guide' | 'variables' | 'templates' | 'units' | 'bases' | 'solver' | 'formulas';

export type InputMode = 'simple' | 'advanced';

export type Locale = 'zh-CN' | 'en';

export interface CalculationResult {
  id: string;
  input: string;
  output: string;
  latex: string;
  timestamp: number;
  type: 'expression' | 'equation' | 'matrix' | 'plot' | 'calculus' | 'unknown';
  variables?: Record<string, number>;
  error?: string;
}

export interface SymbolItem {
  label: string;
  latex: string;
  input: string;
  category: string;
  description?: string;
}

export interface VariableEntry {
  name: string;
  value: string | number;
  type: 'number' | 'matrix' | 'function';
}

export interface PlotConfig {
  expression: string;
  xRange: [number, number];
  yRange: [number, number];
  color: string;
  plotType?: 'cartesian' | 'polar';
}

export type ThemeMode = 'dark' | 'light';

export interface CalculatorState {
  // Layout
  activeSidePanel: SidePanelTab | null;
  sidePanelCollapsed: boolean;
  previewVisible: boolean;

  // Editor
  editorContent: string;
  cursorPosition: number;
  inputMode: InputMode;

  // Locale
  locale: Locale;

  // Calculation
  results: CalculationResult[];
  currentResult: CalculationResult | null;
  variables: Record<string, VariableEntry>;

  // Plot
  plots: PlotConfig[];

  // Memory (calculator-style M+, M-, MR, MC, MS)
  memory: number;

  // Theme
  theme: ThemeMode;

  // Command palette
  commandPaletteOpen: boolean;

  // Actions
  setActiveSidePanel: (panel: SidePanelTab | null) => void;
  toggleSidePanel: () => void;
  togglePreview: () => void;
  setEditorContent: (content: string) => void;
  setCursorPosition: (pos: number) => void;
  setInputMode: (mode: InputMode) => void;
  setLocale: (locale: Locale) => void;
  addResult: (result: CalculationResult) => void;
  setCurrentResult: (result: CalculationResult | null) => void;
  setVariable: (name: string, entry: VariableEntry) => void;
  addPlot: (config: PlotConfig) => void;
  removePlot: (index: number) => void;
  clearPlots: () => void;
  clearHistory: () => void;
  toggleTheme: () => void;
  insertAtCursor: (text: string) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  // Memory actions
  memoryAdd: (value: number) => void;
  memorySubtract: (value: number) => void;
  memoryRecall: () => number;
  memoryClear: () => void;
  memoryStore: (value: number) => void;
  // Persistence
  loadFromStorage: () => void;
  saveToStorage: () => void;
}
