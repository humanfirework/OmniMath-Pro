// i18n system for OmniMath
// Currently supports: zh-CN (Chinese Simplified), en (English)

export type Locale = 'zh-CN' | 'en';

// All translatable strings in the application
export interface Translations {
  // App
  appName: string;
  appSubtitle: string;

  // Menu
  menuFile: string;
  menuEdit: string;
  menuView: string;
  menuHelp: string;

  // Activity Bar
  abSymbols: string;
  abTemplates: string;
  abSolver: string;
  abUnits: string;
  abBases: string;
  abHistory: string;
  abVariables: string;
  abGuide: string;
  abFormulas: string;
  abShowSidebar: string;
  abHideSidebar: string;

  // Side Panel
  spSymbols: string;
  spTemplates: string;
  spSolver: string;
  spUnits: string;
  spBases: string;
  spHistory: string;
  spGuide: string;
  spVariables: string;
  spFormulas: string;

  // Editor
  editorTitle: string;
  editorReset: string;
  editorClear: string;
  editorRun: string;
  editorModeSimple: string;
  editorModeAdvanced: string;
  editorVars: string;
  editorEnterToEval: string;
  editorShiftEnterNewLine: string;
  editorCtrlSlashComment: string;
  editorPlaceholder: string;

  // Preview
  previewTitle: string;
  previewCopy: string;
  previewFormula: string;
  previewPlot: string;
  previewLog: string;
  previewInput: string;
  previewResult: string;
  previewError: string;
  previewEmpty: string;
  previewEmptyHint: string;
  previewNoHistory: string;
  previewClearAll: string;

  // Plot
  plotZoomIn: string;
  plotZoomOut: string;
  plotReset: string;
  plotToggleGrid: string;
  plotCopyImage: string;
  plotDownloadPNG: string;
  plotEmpty: string;
  plotEmptyHint: string;
  plotZoom: string;

  // Status Bar
  sbCommand: string;
  sbCalc: string;
  sbLight: string;
  sbDark: string;
  sbReady: string;
  sbError: string;
  sbOk: string;
  sbErr: string;
  sbVars: string;

  // Quick Calc
  qcPlaceholder: string;

  // Command Palette
  cpTitle: string;
  cpPlaceholder: string;
  cpRunAll: string;
  cpClearEditor: string;
  cpClearHistory: string;
  cpToggleTheme: string;
  cpToggleSidebar: string;
  cpTogglePreview: string;
  cpSwitchSimple: string;
  cpSwitchAdvanced: string;
  cpGroupActions: string;
  cpGroupView: string;
  cpGroupPanels: string;
  cpGroupTemplates: string;
  cpQuickEval: string;
  cpNoResults: string;
  cpSwitchLight: string;
  cpSwitchDark: string;
  cpClearAllHistVars: string;
  cpOpenSymbols: string;
  cpOpenFormulas: string;
  cpOpenTemplates: string;
  cpOpenSolver: string;
  cpOpenUnits: string;
  cpOpenBases: string;
  cpOpenHistory: string;
  cpOpenVariables: string;
  cpOpenGuide: string;

  // Keyboard Shortcuts
  ksTitle: string;
  ksEditor: string;
  ksNavigation: string;
  ksQuickActions: string;
  ksEvalExpression: string;
  ksInsertNewLine: string;
  ksInsertIndent: string;
  ksToggleComment: string;
  ksOpenCommandPalette: string;
  ksOpenCommandPaletteQuick: string;
  ksToggleSidebar: string;
  ksShowShortcuts: string;
  ksCloseDialog: string;
  ksCopyRenderedText: string;
  ksLoadIntoEditor: string;
  ksInsertAtCursor: string;
  ksZoomInOut: string;
  ksPanView: string;
  ksPressToShow: string;

  // Symbol categories
  symBasic: string;
  symGreek: string;
  symCalculus: string;
  symTrigonometry: string;
  symLogExp: string;
  symLinearAlgebra: string;
  symStatistics: string;
  symCombinatorics: string;
  symConstants: string;

  // History
  histNoHistory: string;
  histClear: string;
  histNoHistoryHint: string;
  histVariables: string;

  // Variables
  varsNoVars: string;
  varsName: string;
  varsValue: string;
  varsType: string;
  varsNoVarsHint: string;

  // Guide section titles
  guideGettingStarted: string;
  guideVariables: string;
  guideMatrices: string;
  guideFunctions: string;
  guidePlotting: string;
  guideEquationSolving: string;
  guideUnitConversion: string;
  guideNumberBases: string;
  guideKeyboardShortcuts: string;
  guideSimpleMode: string;

  // Equation Solver
  solverTitle: string;
  solverEquation: string;
  solverVariable: string;
  solverSolve: string;
  solverSolution: string;
  solverSteps: string;
  solverExamples: string;
  solverInsert: string;
  solverEquationForm: string;
  solverEnterEquation: string;
  solverError: string;
  solverStepSetup: string;
  solverStepSolve: string;
  solverStepSolution: string;

  // Unit Converter
  unitsTitle: string;
  unitsCategory: string;
  unitsFrom: string;
  unitsTo: string;
  unitsValue: string;
  unitsResult: string;
  unitsAllConversions: string;
  unitsSwap: string;
  unitsCopy: string;
  unitsEnterValue: string;
  unitsEnterNumber: string;

  // Base Converter
  basesTitle: string;
  basesInput: string;
  basesBinary: string;
  basesOctal: string;
  basesDecimal: string;
  basesHex: string;
  basesBits: string;
  basesInsert: string;
  basesCopy: string;
  basesConversions: string;
  basesInvalidNumber: string;
  basesEnterNumber: string;
  basesInputTag: string;

  // Templates
  tplInsert: string;

  // Formula Renderer
  frCopyLatex: string;
  frCopyText: string;
  frCopied: string;
  frClickToCopy: string;
  frLatexError: string;
  frEnterFormula: string;

  // Mobile
  mobileEditor: string;
  mobilePreview: string;
  mobileRun: string;
}

const zhCN: Translations = {
  // App
  appName: 'OmniMath',
  appSubtitle: '— 沉浸式数学工作台',

  // Menu
  menuFile: '文件',
  menuEdit: '编辑',
  menuView: '视图',
  menuHelp: '帮助',

  // Activity Bar
  abSymbols: '符号',
  abTemplates: '模板',
  abSolver: '方程求解',
  abUnits: '单位转换',
  abBases: '进制转换',
  abHistory: '历史',
  abVariables: '变量',
  abGuide: '指南',
  abFormulas: '公式库',
  abShowSidebar: '显示侧栏',
  abHideSidebar: '隐藏侧栏',

  // Side Panel
  spSymbols: '符号',
  spTemplates: '模板',
  spSolver: '方程求解',
  spUnits: '单位转换',
  spBases: '进制转换',
  spHistory: '历史记录',
  spGuide: '使用指南',
  spVariables: '变量',
  spFormulas: '公式库',

  // Editor
  editorTitle: '编辑器',
  editorReset: '重置',
  editorClear: '清空',
  editorRun: '运行',
  editorModeSimple: '简单',
  editorModeAdvanced: '高级',
  editorVars: '变量',
  editorEnterToEval: 'Enter 计算',
  editorShiftEnterNewLine: 'Shift+Enter 换行',
  editorCtrlSlashComment: 'Ctrl+/ 注释',
  editorPlaceholder: '输入数学表达式，按 Enter 计算...\n\n示例：\n  2 + 3\n  sin x\n  arctan x\n  x = 5\n  A = [1,2;3,4]\n  plot(sin(x))',

  // Preview
  previewTitle: '预览',
  previewCopy: '复制',
  previewFormula: '公式',
  previewPlot: '绘图',
  previewLog: '日志',
  previewInput: '输入',
  previewResult: '结果',
  previewError: '错误',
  previewEmpty: '计算表达式以查看结果',
  previewEmptyHint: '在编辑器中输入并按 Enter',
  previewNoHistory: '暂无计算记录',
  previewClearAll: '全部清除',

  // Plot
  plotZoomIn: '放大',
  plotZoomOut: '缩小',
  plotReset: '重置视图',
  plotToggleGrid: '切换网格',
  plotCopyImage: '复制图像',
  plotDownloadPNG: '下载 PNG',
  plotEmpty: '使用 plot(expr) 创建图表',
  plotEmptyHint: '例如 plot(sin(x))',
  plotZoom: '缩放',

  // Status Bar
  sbCommand: '命令',
  sbCalc: '计算',
  sbLight: '浅色',
  sbDark: '深色',
  sbReady: '就绪',
  sbError: '错误',
  sbOk: '正常',
  sbErr: '错误',
  sbVars: '变量',

  // Quick Calc
  qcPlaceholder: '快速计算... (Enter 计算, Esc 关闭)',

  // Command Palette
  cpTitle: '命令面板',
  cpPlaceholder: '输入命令或搜索...',
  cpRunAll: '运行全部',
  cpClearEditor: '清空编辑器',
  cpClearHistory: '清除历史',
  cpToggleTheme: '切换主题',
  cpToggleSidebar: '切换侧栏',
  cpTogglePreview: '切换预览',
  cpSwitchSimple: '切换到简单模式',
  cpSwitchAdvanced: '切换到高级模式',
  cpGroupActions: '操作',
  cpGroupView: '视图',
  cpGroupPanels: '面板',
  cpGroupTemplates: '模板',
  cpQuickEval: '快速计算',
  cpNoResults: '未找到结果',
  cpSwitchLight: '切换到浅色主题',
  cpSwitchDark: '切换到深色主题',
  cpClearAllHistVars: '清除所有历史和变量',
  cpOpenSymbols: '打开：符号',
  cpOpenFormulas: '打开：公式库',
  cpOpenTemplates: '打开：模板',
  cpOpenSolver: '打开：方程求解',
  cpOpenUnits: '打开：单位转换',
  cpOpenBases: '打开：进制转换',
  cpOpenHistory: '打开：历史',
  cpOpenVariables: '打开：变量',
  cpOpenGuide: '打开：使用指南',

  // Keyboard Shortcuts
  ksTitle: '键盘快捷键',
  ksEditor: '编辑器',
  ksNavigation: '导航',
  ksQuickActions: '快捷操作',
  ksEvalExpression: '计算表达式',
  ksInsertNewLine: '插入新行',
  ksInsertIndent: '插入缩进（2 空格）',
  ksToggleComment: '切换注释',
  ksOpenCommandPalette: '打开命令面板',
  ksOpenCommandPaletteQuick: '打开命令面板 / 快速计算',
  ksToggleSidebar: '切换侧栏',
  ksShowShortcuts: '显示键盘快捷键帮助',
  ksCloseDialog: '关闭对话框 / 取消',
  ksCopyRenderedText: '复制渲染文本',
  ksLoadIntoEditor: '加载到编辑器',
  ksInsertAtCursor: '在光标处插入',
  ksZoomInOut: '缩放',
  ksPanView: '平移视图',
  ksPressToShow: '随时按 ? 显示此帮助',

  // Symbol categories
  symBasic: '基础',
  symGreek: '希腊字母',
  symCalculus: '微积分',
  symTrigonometry: '三角函数',
  symLogExp: '对数与指数',
  symLinearAlgebra: '线性代数',
  symStatistics: '统计',
  symCombinatorics: '组合',
  symConstants: '常数',

  // History
  histNoHistory: '暂无计算记录',
  histClear: '清除',
  histNoHistoryHint: '计算结果将显示在这里',
  histVariables: '变量',

  // Variables
  varsNoVars: '暂无变量',
  varsName: '名称',
  varsValue: '值',
  varsType: '类型',
  varsNoVarsHint: '使用 = 赋值：x = 5',

  // Guide section titles
  guideGettingStarted: '快速入门',
  guideVariables: '变量',
  guideMatrices: '矩阵',
  guideFunctions: '函数',
  guidePlotting: '绘图',
  guideEquationSolving: '方程求解',
  guideUnitConversion: '单位转换',
  guideNumberBases: '进制转换',
  guideKeyboardShortcuts: '键盘快捷键',
  guideSimpleMode: '简单模式',

  // Equation Solver
  solverTitle: '方程求解器',
  solverEquation: '方程',
  solverVariable: '求解变量',
  solverSolve: '求解',
  solverSolution: '解',
  solverSteps: '求解步骤',
  solverExamples: '示例',
  solverInsert: '插入编辑器',
  solverEquationForm: '方程（= 0 形式）',
  solverEnterEquation: '请输入方程',
  solverError: '错误',
  solverStepSetup: '建立方程',
  solverStepSolve: '使用求根法求解',
  solverStepSolution: '解',

  // Unit Converter
  unitsTitle: '单位转换器',
  unitsCategory: '类别',
  unitsFrom: '从',
  unitsTo: '到',
  unitsValue: '数值',
  unitsResult: '结果',
  unitsAllConversions: '所有转换',
  unitsSwap: '交换',
  unitsCopy: '复制',
  unitsEnterValue: '输入数值...',
  unitsEnterNumber: '输入有效数字进行转换',

  // Base Converter
  basesTitle: '进制转换器',
  basesInput: '输入',
  basesBinary: '二进制',
  basesOctal: '八进制',
  basesDecimal: '十进制',
  basesHex: '十六进制',
  basesBits: '位',
  basesInsert: '插入编辑器',
  basesCopy: '复制',
  basesConversions: '转换结果',
  basesInvalidNumber: '无效的数字',
  basesEnterNumber: '输入有效数字进行转换',
  basesInputTag: '输入',

  // Templates
  tplInsert: '插入',

  // Formula Renderer
  frCopyLatex: '复制 LaTeX',
  frCopyText: '复制文本',
  frCopied: '已复制',
  frClickToCopy: '点击公式复制',
  frLatexError: 'LaTeX 错误',
  frEnterFormula: '输入公式...',

  // Mobile
  mobileEditor: '编辑',
  mobilePreview: '预览',
  mobileRun: '运行',
};

const en: Translations = {
  // App
  appName: 'OmniMath',
  appSubtitle: '— Immersive Math Workbench',

  // Menu
  menuFile: 'File',
  menuEdit: 'Edit',
  menuView: 'View',
  menuHelp: 'Help',

  // Activity Bar
  abSymbols: 'Symbols',
  abTemplates: 'Templates',
  abSolver: 'Equation Solver',
  abUnits: 'Unit Converter',
  abBases: 'Base Converter',
  abHistory: 'History',
  abVariables: 'Variables',
  abGuide: 'Guide',
  abFormulas: 'Formulas',
  abShowSidebar: 'Show Sidebar',
  abHideSidebar: 'Hide Sidebar',

  // Side Panel
  spSymbols: 'SYMBOLS',
  spTemplates: 'TEMPLATES',
  spSolver: 'EQUATION SOLVER',
  spUnits: 'UNIT CONVERTER',
  spBases: 'BASE CONVERTER',
  spHistory: 'HISTORY',
  spGuide: 'GUIDE',
  spVariables: 'VARIABLES',
  spFormulas: 'FORMULA LIBRARY',

  // Editor
  editorTitle: 'Editor',
  editorReset: 'Reset',
  editorClear: 'Clear',
  editorRun: 'Run',
  editorModeSimple: 'Simple',
  editorModeAdvanced: 'Advanced',
  editorVars: 'vars',
  editorEnterToEval: 'Enter to evaluate',
  editorShiftEnterNewLine: 'Shift+Enter for new line',
  editorCtrlSlashComment: 'Ctrl+/ to comment',
  editorPlaceholder: 'Type a mathematical expression and press Enter to evaluate...\n\nExamples:\n  2 + 3\n  sin(pi/4)\n  x = 5\n  A = [1,2;3,4]\n  plot(sin(x))',

  // Preview
  previewTitle: 'Preview',
  previewCopy: 'Copy',
  previewFormula: 'Formula',
  previewPlot: 'Plot',
  previewLog: 'Log',
  previewInput: 'Input',
  previewResult: 'Result',
  previewError: 'Error',
  previewEmpty: 'Evaluate an expression to see the result',
  previewEmptyHint: 'Type in the editor and press Enter',
  previewNoHistory: 'No calculations yet',
  previewClearAll: 'Clear All',

  // Plot
  plotZoomIn: 'Zoom in',
  plotZoomOut: 'Zoom out',
  plotReset: 'Reset view',
  plotToggleGrid: 'Toggle grid',
  plotCopyImage: 'Copy image to clipboard',
  plotDownloadPNG: 'Download PNG',
  plotEmpty: 'Use plot(expr) to create graphs',
  plotEmptyHint: 'e.g. plot(sin(x))',
  plotZoom: 'Zoom',

  // Status Bar
  sbCommand: 'Command',
  sbCalc: 'Calc',
  sbLight: 'Light',
  sbDark: 'Dark',
  sbReady: 'Ready',
  sbError: 'Error',
  sbOk: 'ok',
  sbErr: 'err',
  sbVars: 'vars',

  // Quick Calc
  qcPlaceholder: 'Quick calculate... (Enter to eval, Esc to close)',

  // Command Palette
  cpTitle: 'Command Palette',
  cpPlaceholder: 'Type a command or search...',
  cpRunAll: 'Run All',
  cpClearEditor: 'Clear Editor',
  cpClearHistory: 'Clear History',
  cpToggleTheme: 'Toggle Theme',
  cpToggleSidebar: 'Toggle Sidebar',
  cpTogglePreview: 'Toggle Preview',
  cpSwitchSimple: 'Switch to Simple Mode',
  cpSwitchAdvanced: 'Switch to Advanced Mode',
  cpGroupActions: 'Actions',
  cpGroupView: 'View',
  cpGroupPanels: 'Panels',
  cpGroupTemplates: 'Templates',
  cpQuickEval: 'Quick Evaluate',
  cpNoResults: 'No results found',
  cpSwitchLight: 'Switch to Light Theme',
  cpSwitchDark: 'Switch to Dark Theme',
  cpClearAllHistVars: 'Clear All History & Variables',
  cpOpenSymbols: 'Open: Symbols',
  cpOpenFormulas: 'Open: Formulas',
  cpOpenTemplates: 'Open: Templates',
  cpOpenSolver: 'Open: Equation Solver',
  cpOpenUnits: 'Open: Unit Converter',
  cpOpenBases: 'Open: Base Converter',
  cpOpenHistory: 'Open: History',
  cpOpenVariables: 'Open: Variables',
  cpOpenGuide: 'Open: User Guide',

  // Keyboard Shortcuts
  ksTitle: 'Keyboard Shortcuts',
  ksEditor: 'Editor',
  ksNavigation: 'Navigation',
  ksQuickActions: 'Quick Actions',
  ksEvalExpression: 'Evaluate expression',
  ksInsertNewLine: 'Insert new line',
  ksInsertIndent: 'Insert indentation (2 spaces)',
  ksToggleComment: 'Toggle comment',
  ksOpenCommandPalette: 'Open Command Palette',
  ksOpenCommandPaletteQuick: 'Open Command Palette / Quick Calc',
  ksToggleSidebar: 'Toggle Sidebar',
  ksShowShortcuts: 'Show this keyboard shortcuts help',
  ksCloseDialog: 'Close dialog / Cancel',
  ksCopyRenderedText: 'Copy rendered text',
  ksLoadIntoEditor: 'Load into editor',
  ksInsertAtCursor: 'Insert at cursor',
  ksZoomInOut: 'Zoom in/out',
  ksPanView: 'Pan view',
  ksPressToShow: 'Press ? anytime to show this help',

  // Symbol categories
  symBasic: 'Basic',
  symGreek: 'Greek',
  symCalculus: 'Calculus',
  symTrigonometry: 'Trigonometry',
  symLogExp: 'Log & Exp',
  symLinearAlgebra: 'Linear Algebra',
  symStatistics: 'Statistics',
  symCombinatorics: 'Combinatorics',
  symConstants: 'Constants',

  // History
  histNoHistory: 'No calculations yet',
  histClear: 'Clear',
  histNoHistoryHint: 'Calculations will appear here',
  histVariables: 'Variables',

  // Variables
  varsNoVars: 'No variables defined',
  varsName: 'Name',
  varsValue: 'Value',
  varsType: 'Type',
  varsNoVarsHint: 'Assign with = operator: x = 5',

  // Guide section titles
  guideGettingStarted: 'Getting Started',
  guideVariables: 'Variables',
  guideMatrices: 'Matrices',
  guideFunctions: 'Functions',
  guidePlotting: 'Plotting',
  guideEquationSolving: 'Equation Solving',
  guideUnitConversion: 'Unit Conversion',
  guideNumberBases: 'Number Bases',
  guideKeyboardShortcuts: 'Keyboard Shortcuts',
  guideSimpleMode: 'Simple Mode',

  // Equation Solver
  solverTitle: 'Equation Solver',
  solverEquation: 'Equation',
  solverVariable: 'Variable',
  solverSolve: 'Solve',
  solverSolution: 'Solution',
  solverSteps: 'Steps',
  solverExamples: 'Examples',
  solverInsert: 'Insert into Editor',
  solverEquationForm: 'Equation (= 0 form)',
  solverEnterEquation: 'Please enter an equation',
  solverError: 'Error',
  solverStepSetup: 'Set up equation',
  solverStepSolve: 'Solve using root-finding',
  solverStepSolution: 'Solution',

  // Unit Converter
  unitsTitle: 'Unit Converter',
  unitsCategory: 'Category',
  unitsFrom: 'From',
  unitsTo: 'To',
  unitsValue: 'Value',
  unitsResult: 'Result',
  unitsAllConversions: 'All Conversions',
  unitsSwap: 'Swap',
  unitsCopy: 'Copy',
  unitsEnterValue: 'Enter value...',
  unitsEnterNumber: 'Enter a valid number to convert',

  // Base Converter
  basesTitle: 'Base Converter',
  basesInput: 'Input',
  basesBinary: 'Binary',
  basesOctal: 'Octal',
  basesDecimal: 'Decimal',
  basesHex: 'Hexadecimal',
  basesBits: 'Bits',
  basesInsert: 'Insert into Editor',
  basesCopy: 'Copy',
  basesConversions: 'Conversions',
  basesInvalidNumber: 'Invalid number',
  basesEnterNumber: 'Enter a valid number to convert',
  basesInputTag: 'INPUT',

  // Templates
  tplInsert: 'Insert',

  // Formula Renderer
  frCopyLatex: 'LaTeX',
  frCopyText: 'Text',
  frCopied: 'Copied',
  frClickToCopy: 'Click formula to copy',
  frLatexError: 'LaTeX Error',
  frEnterFormula: 'Enter a formula...',

  // Mobile
  mobileEditor: 'Editor',
  mobilePreview: 'Preview',
  mobileRun: 'Run',
};

const translationMap: Record<Locale, Translations> = {
  'zh-CN': zhCN,
  'en': en,
};

// Current locale - defaults to zh-CN
let currentLocale: Locale = 'zh-CN';

export function setLocale(locale: Locale) {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: keyof Translations): string {
  return translationMap[currentLocale]?.[key] ?? translationMap['en']?.[key] ?? key;
}

// Get all translations for current locale
export function getTranslations(): Translations {
  return translationMap[currentLocale] ?? translationMap['en'];
}
