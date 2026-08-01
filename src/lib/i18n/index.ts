/* ============================================================
   OmniMath Pro — i18n module
   Lightweight synchronous dictionary lookup.
   Default locale: zh-CN. Secondary: en.
   Usage:
     import { t, setLocale, getLocale, type Locale } from "@/lib/i18n";
     t("appTitle");
   ============================================================ */

export type Locale = "zh-CN" | "en";

/** Shape of the translation dictionary. Every key must exist in every locale. */
export interface TranslationDict {
  /* ---------------- App / brand ---------------- */
  appTitle: string;
  appSubtitle: string;
  appLoading: string;

  /* ---------------- Top menu bar ---------------- */
  menuFile: string;
  menuEdit: string;
  menuView: string;
  menuHelp: string;
  menuRun: string;
  menuNew: string;
  menuOpen: string;
  menuSave: string;
  menuExport: string;
  menuUndo: string;
  menuRedo: string;
  menuFind: string;
  menuCommandPalette: string;
  menuToggleSidebar: string;
  menuTogglePreview: string;
  menuZoomIn: string;
  menuZoomOut: string;
  menuResetZoom: string;
  menuTheme: string;
  menuLight: string;
  menuDark: string;
  menuShortcuts: string;
  menuAbout: string;

  /* ---------------- Editor ---------------- */
  editorTitle: string;
  editorPlaceholder: string;
  editorRun: string;
  editorReset: string;
  editorClear: string;
  editorModeSimple: string;
  editorModePython: string;
  editorModeMatlab: string;
  editorModeAdvanced: string;
  editorEnterToEval: string;
  editorShiftEnterNewLine: string;
  editorCtrlSlashComment: string;
  editorVars: string;
  editorLines: string;
  editorCol: string;
  editorLn: string;
  editorIndent: string;
  editorOutdent: string;
  editorCopy: string;
  editorPaste: string;
  editorCut: string;
  editorSelectAll: string;
  editorComment: string;
  editorUncomment: string;
  editorLineComment: string;

  /* ---------------- Preview panel ---------------- */
  previewTitle: string;
  previewFormula: string;
  previewPlot: string;
  preview3D: string;
  preview3DLoading: string;
  previewLog: string;
  previewCopy: string;
  previewInput: string;
  previewResult: string;
  previewError: string;
  previewEmpty: string;
  previewEmptyHint: string;
  previewClearAll: string;
  previewNoHistory: string;
  previewDownload: string;
  previewZoomIn: string;
  previewZoomOut: string;
  previewReset: string;
  previewToggleGrid: string;
  previewCopyImage: string;
  previewDownloadPNG: string;
  previewLatex: string;
  previewSteps: string;
  previewType: string;

  /* ---------------- Formula export ---------------- */
  formulaExport: string;
  formulaExportPNG: string;
  formulaExportSVG: string;
  formulaExportLatex: string;
  formulaExportHint: string;

  /* ---------------- Layout switching ---------------- */
  layoutSwitch: string;
  layoutRight: string;
  layoutBottom: string;
  layoutCompact: string;
  layoutLarge: string;
  layoutSize: string;

  /* ---------------- Settings panel ---------------- */
  settingsTitle: string;
  settingsAppearance: string;
  settingsEditor: string;
  settingsLayout: string;
  settingsExport: string;
  settingsLanguage: string;
  settingsTheme: string;
  settingsActivityBar: string;
  settingsActivityBarPosition: string;
  settingsActivityBarLocked: string;
  settingsActivityBarAutoHide: string;
  settingsDefaultExportDpi: string;
  settingsFormulaFontSize: string;
  settingsUseMathFont: string;
  settingsFontPreset: string;
  fontPresetModern: string;
  fontPresetScholarly: string;
  fontPresetSystem: string;
  settingsResetAll: string;
  settingsResetConfirm: string;
  settingsShortcuts: string;
  settingsAbout: string;

  /* ---------------- Side panel tabs ---------------- */
  tabHistory: string;
  tabVariables: string;
  tabFiles: string;
  tabFormulas: string;
  tabPipeline: string;
  tabAI: string;
  tabLinalg: string;
  tabMatrix: string;
  tabSolver: string;
  tabSymbols: string;
  tabTemplates: string;
  tabUnits: string;
  tabBases: string;
  tabGuide: string;
  tabPlots: string;

  /* ---------------- Activity bar ---------------- */
  abSymbols: string;
  abTemplates: string;
  abSolver: string;
  abUnits: string;
  abBases: string;
  abHistory: string;
  abVariables: string;
  abGuide: string;
  abFormulas: string;
  abPipeline: string;
  abWhiteboard: string;
  abLayoutMenu: string;
  abAI: string;
  abLinalg: string;
  abMatrix: string;
  abFiles: string;
  abStats: string;
  abPlots: string;
  abShowSidebar: string;
  abHideSidebar: string;
  abToggleEditor: string;
  abTogglePreview: string;
  abMoveLeft: string;
  abMoveRight: string;
  abLockTaskbar: string;
  abUnlockTaskbar: string;
  abAutoHide: string;
  abDisableAutoHide: string;
  abHideTaskbar: string;
  abShowTaskbar: string;
  abLocked: string;

  /* ---------------- Status bar ---------------- */
  statusReady: string;
  statusCalculating: string;
  statusError: string;
  statusLines: string;
  statusVars: string;
  statusPlots: string;
  statusLight: string;
  statusDark: string;
  statusCommand: string;
  statusCalc: string;
  statusOk: string;
  statusErr: string;
  statusChars: string;
  statusWords: string;
  statusLang: string;
  statusConflicts: string;
  statusConflictTooltip: string;
  statusNoConflicts: string;
  statusConflictFix: string;
  statusConflictDismiss: string;

  /* ---------------- Language label ---------------- */
  languageLabel: string;
  languageZh: string;
  languageEn: string;
  languageSwitch: string;

  /* ---------------- Quick calc ---------------- */
  qcPlaceholder: string;
  qcTitle: string;
  qcNotepad: string;
  qcShowNotepad: string;
  qcHideNotepad: string;
  qcPin: string;
  qcUnpin: string;
  qcCopyResult: string;
  qcDragHint: string;
  qcModeBasic: string;
  qcModeSci: string;
  qcModeProg: string;
  qcModeLin: string;
  qcModeConv: string;
  qcSendToNotepad: string;
  qcHistTitle: string;
  qcNotepadPlaceholder: string;
  qcFloatingCalc: string;
  qcClearHistory: string;
  qcMemoryClear: string;
  qcMemoryRecall: string;

  /* ---------------- History ---------------- */
  histTitle: string;
  histNoHistory: string;
  histNoHistoryHint: string;
  histClear: string;
  histVariables: string;
  histCopy: string;
  histRerun: string;
  histInsert: string;
  histJustNow: string;
  histMinAgo: string;
  histMinAgoPlural: string;
  histHourAgo: string;
  histHourAgoPlural: string;
  histDayAgo: string;
  histDayAgoPlural: string;

  /* ---------------- Variables ---------------- */
  varsTitle: string;
  varsNoVars: string;
  varsNoVarsHint: string;
  varsName: string;
  varsValue: string;
  varsType: string;
  varsDelete: string;
  varsEdit: string;
  varsInsert: string;
  varsSlider: string;
  varsSliderHint: string;
  varsSliderMin: string;
  varsSliderMax: string;
  varsSliderStep: string;

  /* ---------------- Templates ---------------- */
  tplTitle: string;
  tplInsert: string;
  tplSearch: string;
  tplEmpty: string;

  /* ---------------- Formula library ---------------- */
  formulasTitle: string;
  formulasSearch: string;
  formulasCategories: string;
  formulasExample: string;
  formulasInsertExample: string;
  formulasCategoryAlgebra: string;
  formulasCategoryGeometry: string;
  formulasCategoryTrigonometry: string;
  formulasCategoryCalculus: string;
  formulasCategoryStatistics: string;
  formulasCategoryPhysics: string;
  formulasCategoryFinance: string;
  formulasAddCustom: string;
  formulasCustom: string;
  formulasName: string;
  formulasLatex: string;
  formulasDescription: string;
  formulasExampleInput: string;
  formulasCustomEmpty: string;
  formulasCategoryManage: string;
  formulasCategoryAdd: string;
  formulasCategoryName: string;
  formulasCategoryColor: string;
  formulasCategoryEmpty: string;
  formulasCategoryDeleteConfirm: string;

  /* ---------------- Equation solver ---------------- */
  solverTitle: string;
  solverEquationForm: string;
  solverVariable: string;
  solverSolve: string;
  solverSolution: string;
  solverSteps: string;
  solverExamples: string;
  solverInsert: string;
  solverEnterEquation: string;
  solverError: string;
  solverNoSolution: string;
  solverMultipleSolutions: string;
  solverStepSetup: string;
  solverStepSolve: string;
  solverStepSolution: string;

  /* ---------------- Unit converter ---------------- */
  unitsTitle: string;
  unitsCategory: string;
  unitsValue: string;
  unitsFrom: string;
  unitsTo: string;
  unitsResult: string;
  unitsAllConversions: string;
  unitsSwap: string;
  unitsCopy: string;
  unitsEnterValue: string;
  unitsEnterNumber: string;
  unitsLength: string;
  unitsMass: string;
  unitsTemperature: string;
  unitsVolume: string;
  unitsTime: string;
  unitsSpeed: string;
  unitsArea: string;
  unitsEnergy: string;
  unitsPressure: string;
  unitsAngle: string;
  unitsData: string;

  /* ---------------- Base converter ---------------- */
  basesTitle: string;
  basesInput: string;
  basesBinary: string;
  basesOctal: string;
  basesDecimal: string;
  basesHex: string;
  basesBits: string;
  basesConversions: string;
  basesInsert: string;
  basesInvalidNumber: string;
  basesEnterNumber: string;
  basesInputTag: string;

  /* ---------------- Linear algebra ---------------- */
  linalgTitle: string;
  linalgMatrixA: string;
  linalgMatrixB: string;
  linalgResult: string;
  linalgDet: string;
  linalgInv: string;
  linalgTranspose: string;
  linalgRank: string;
  linalgTrace: string;
  linalgEig: string;
  linalgAdd: string;
  linalgSub: string;
  linalgMul: string;
  linalgSolve: string;
  linalgLu: string;
  linalgQr: string;
  linalgInsert: string;
  linalgError: string;
  linalgEmpty: string;

  /* ---------------- Statistics ---------------- */
  statsTitle: string;

  /* ---------------- Statistics panel — extended ---------------- */
  statsTabRegression: string;
  statsHistogram: string;
  statsBoxPlot: string;
  statsScatterPlot: string;
  statsDatasets: string;
  statsSaveCurrent: string;
  statsLoad: string;
  statsExportCSV: string;
  statsImportCSV: string;
  statsNoDatasets: string;
  statsDatasetSaved: string;
  statsDatasetDeleted: string;
  statsDatasetLoaded: string;
  statsXData: string;
  statsYData: string;
  statsRegressionEquation: string;
  statsSlope: string;
  statsIntercept: string;
  statsRSquared: string;
  statsFitGood: string;
  statsFitModerate: string;
  statsFitWeak: string;
  statsFitPoor: string;
  statsNeedPairs: string;
  statsDistChiSquare: string;
  statsDistT: string;
  statsDistF: string;
  statsDistGeometric: string;
  statsDistNegBinomial: string;
  statsDiscreteNoPlot: string;

  /* ---------------- Matrix editor ---------------- */
  matrixTitle: string;
  matrixRows: string;
  matrixCols: string;
  matrixAddRow: string;
  matrixAddCol: string;
  matrixDelRow: string;
  matrixDelCol: string;
  matrixClear: string;
  matrixIdentity: string;
  matrixFill: string;
  matrixRandom: string;

  /* ---------------- Linear algebra panel — extended ---------------- */
  linalgTabEdit: string;
  linalgTabOps: string;
  linalgTabDecomp: string;
  linalgTabSystem: string;
  linalgTabTransform: string;
  linalgNewMatrix: string;
  linalgPaste: string;
  linalgSave: string;
  linalgPreview: string;
  linalgIdentity: string;
  linalgZeros: string;
  linalgRandom: string;
  linalgQuickFill: string;
  linalgOpsA: string;
  linalgOpsB: string;
  linalgOperation: string;
  linalgScalar: string;
  linalgPower: string;
  linalgCompute: string;
  linalgSteps: string;
  linalgSingular: string;
  linalgDimMismatch: string;
  linalgNonSquare: string;
  linalgNotPositiveDef: string;
  linalgMatrixSize: string;
  linalgNameInUse: string;
  linalgDeleteConfirm: string;
  linalgPasteHint: string;
  linalgPasteConfirm: string;
  linalgPasteInvalid: string;
  linalgSaved: string;

  /* Decomposition */
  linalgDecompType: string;
  linalgDecompose: string;
  linalgLmatrix: string;
  linalgUmatrix: string;
  linalgPmatrix: string;
  linalgQmatrix: string;
  linalgRmatrix: string;
  linalgSmatrix: string;
  linalgVmatrix: string;
  linalgEigenvalues: string;
  linalgEigenvectors: string;
  linalgJordan: string;
  linalgCholesky: string;
  linalgNotSupported: string;
  linalgSchur: string;
  linalgTmatrix: string;

  /* Linear system */
  linalgSolveAxb: string;
  linalgConstVec: string;
  linalgUniqueSolution: string;
  linalgNoSolution: string;
  linalgInfiniteSolution: string;
  linalgParticularSolution: string;
  linalgNullSpace: string;
  linalgAugmented: string;
  linalgGaussSteps: string;
  linalgAddRow: string;
  linalgSwapRows: string;
  linalgSingularHint: string;
  linalgConstVecSize: string;

  /* Vector operations tab */
  linalgTabVector: string;
  linalgVectorA: string;
  linalgVectorB: string;
  linalgVectorInputHint: string;
  linalgDotProduct: string;
  linalgCrossProduct: string;
  linalgMagnitude: string;
  linalgAngle: string;
  linalgProjection: string;
  linalgGramSchmidt: string;
  linalgVectorDimMismatch: string;
  linalgCross3DOnly: string;
  linalgOrthogonalized: string;
  linalgGramSchmidtHint: string;
  linalgGramSchmidtSteps: string;

  /* Matrix norms & properties */
  linalgNormsProps: string;
  linalgNorm1: string;
  linalgNormInf: string;
  linalgNormFrobenius: string;
  linalgNormSpectral: string;
  linalgSymmetric: string;
  linalgPositiveDefinite: string;
  linalgInvertible: string;
  linalgOrthogonal: string;

  /* Homogeneous system & enhanced infinite solution */
  linalgHomogeneousSystem: string;
  linalgNonHomogeneousSystem: string;
  linalgFreeVars: string;
  linalgGeneralSolution: string;
  linalgFundamentalSystem: string;

  /* ---------------- Linear algebra workbench — Task 11 ---------------- */
  linalgMatrixLib: string;
  linalgDeleteMatrix: string;
  linalgNeedSquare: string;
  linalgSavedVar: string;
  linalgAddRowBtn: string;
  linalgDelRowBtn: string;
  linalgAddColBtn: string;
  linalgDelColBtn: string;
  linalgSaveToVar: string;
  linalgKatexPreview: string;
  linalgPasteExpandHint: string;
  linalgMatrixEmpty: string;
  linalgMatrixBEmpty: string;
  linalgDimMismatchMul: string;
  linalgDimMismatchBin: string;
  linalgSingularNonInv: string;
  linalgUnknownOp: string;
  linalgCalcError: string;
  linalgOperandA: string;
  linalgOperandB: string;
  linalgPowerInt: string;
  linalgCalcResult: string;
  linalgDerivationSteps: string;
  linalgOpsInputPrompt: string;
  linalgEigenDecomp: string;
  linalgSvdNotSupportedItem: string;
  linalgSvdNotSupported: string;
  linalgSvdNotSupportedNote: string;
  linalgNotSupportedShort: string;
  linalgMatrixLabel: string;
  linalgDecompInputPrompt: string;
  linalgCholeskyNotSymmetric: string;
  linalgCholeskyNotPosDef: string;
  linalgCholeskyNote: string;
  linalgConstVecSizeMismatch: string;
  linalgSolveError: string;
  linalgSystemInputPrompt: string;
  linalgRankInfo: string;
  linalgUnknownsInfo: string;
  linalgFreeVarsCount: string;
  linalgFreeVarsColon: string;
  linalgCountItems: string;
  linalgOmittedSteps: string;
  linalgRowReduced: string;
  linalgSystemNoSolution: string;
  linalgBackSubstitution: string;
  linalgFreeVarsLatex: string;
  linalgGeneralSolutionLatex: string;
  linalgLinearlyDependent: string;
  linalgMaxIndepRows: string;
  linalgInvertibleLatex: string;
  linalgTimesOp: string;

  /* ---------------- Solver panel — extended ---------------- */
  solverTabEquation: string;
  solverTabSystem: string;
  solverTabCalculus: string;
  solverTabNumeric: string;
  solverEquationPlaceholder: string;
  solverRange: string;
  solverNoRoots: string;
  solverFoundRoots: string;
  solverRealRoots: string;
  solverComplexRoots: string;
  solverPolynomialInfo: string;
  solverSystemPlaceholder: string;
  solverSystemSolve: string;
  solverSystemSolution: string;
  solverSystemInvalid: string;
  solverSystemCount: string;
  solverSystemParseFail: string;
  solverCalcDerivative: string;
  solverCalcIntegral: string;
  solverCalcLimit: string;
  solverCalcTaylor: string;
  solverCalcInput: string;
  solverCalcVar: string;
  solverCalcLower: string;
  solverCalcUpper: string;
  solverCalcPoint: string;
  solverCalcOrder: string;
  solverCalcCompute: string;
  solverCalcResult: string;
  solverNumericFunction: string;
  solverNumericRange: string;
  solverNumericMethod: string;
  solverNumericBisection: string;
  solverNumericNewton: string;
  solverNumericIter: string;
  solverNumericRoot: string;
  solverNumericCompute: string;
  solverNumericGuess: string;
  solverNumericTolerance: string;
  solverNumericNoSignChange: string;
  solverResultLabel: string;

  /* ---------------- Solver workbench — Task 11 ---------------- */
  solverNavEquation: string;
  solverNavEquationDesc: string;
  solverNavSystem: string;
  solverNavSystemDesc: string;
  solverNavDerivative: string;
  solverNavDerivativeDesc: string;
  solverNavIntegral: string;
  solverNavIntegralDesc: string;
  solverNavLimit: string;
  solverNavLimitDesc: string;
  solverSendToPlot2D: string;
  solverSentToPlot2D: string;
  solverSelectExample: string;
  solverSolveMode: string;
  solverNumericSolution: string;
  solverSymbolicSolution: string;
  solverSolveResult: string;
  solverInputPrompt: string;
  solverSymbolicFallback: string;
  solverKindPolynomial: string;
  solverKindTranscendental: string;
  solverKindSymbolic: string;
  solverSystemInput: string;
  solverNonlinearSystem: string;
  solverNumericMethodNote: string;
  solverUniqueSolution: string;
  solverSystemInputPrompt: string;
  solverDerivativeOrder: string;
  solverOrder1: string;
  solverOrder2: string;
  solverOrder3: string;
  solverDerivativeResult: string;
  solverDerivativeInputPrompt: string;
  solverDefiniteIntegral: string;
  solverIndefiniteIntegral: string;
  solverIntegralResult: string;
  solverIntegralInputPrompt: string;
  solverNumericResult: string;
  solverPointMustBeNumber: string;
  solverPointPlaceholder: string;
  solverComputeLimit: string;
  solverLimitResult: string;
  solverLimitInputPrompt: string;
  solverWorkbenchTitle: string;
  solverFooterHint: string;
  /* Solver example groups */
  solverExPolynomial: string;
  solverExTranscendental: string;
  solverExLinearSystem: string;
  solverExNonlinear: string;
  solverDerivExRules: string;
  solverDerivExPoly: string;
  solverIntegralExBasic: string;
  solverIntegralExAdvanced: string;
  solverLimitExClassic: string;
  solverLimitExInfinite: string;
  /* Solver example hints */
  solverHintFactor: string;
  solverHintCubic: string;
  solverHintComplexRoots: string;
  solverHintNumeric: string;
  solverHintLog: string;
  solverHint2VarLinear: string;
  solverHint3VarLinear: string;
  solverHintNonlinear: string;
  solverHintProductRule: string;
  solverHintQuotientRule: string;
  solverHintChainRule: string;
  solverHintPowerRule: string;
  solverHintPowerFunc: string;
  solverHintTrigFunc: string;
  solverHintExpFunc: string;
  solverHintLogIntegral: string;
  solverHintByParts: string;
  solverHintSubstitution: string;
  solverHintArctan: string;
  solverHintDefOfE: string;
  /* Solver example labels */
  solverLabel2x2Linear: string;
  solverLabel3x3Linear: string;
  solverLabelHasQuadratic: string;

  /* ---------------- Pipeline / nodes (ComfyUI style) ---------------- */
  pipelineTitle: string;
  pipelineEnterView: string;
  pipelineAddNode: string;
  pipelineRun: string;
  pipelineClear: string;
  pipelineEmpty: string;
  pipelineEmptyHint: string;
  pipelineNodeInput: string;
  pipelineNodeOp: string;
  pipelineNodeOutput: string;
  pipelineNodePlot: string;
  pipelineNodeSolve: string;
  pipelineConnect: string;
  pipelineDisconnect: string;
  pipelineDelete: string;
  pipelineDuplicate: string;
  pipelineAutoLayout: string;
  pipelineExport: string;

  /* Node-pipeline UI (Task 6) */
  npBackToWorkbench: string;
  npDoubleClickHint: string;
  npExported: string;
  npConnecting: string;
  npInvalidConnection: string;
  npRunAll: string;
  npClearAll: string;
  npExportScript: string;
  npResetView: string;
  npZoomIn: string;
  npZoomOut: string;
  npResult: string;
  npError: string;
  npEmpty: string;
  npAddNodeTitle: string;
  npAddNodeHint: string;
  npCategoryInput: string;
  npCategoryOp: string;
  npCategoryFunction: string;
  npCategoryPlot: string;
  npCategoryMatrix: string;
  npCategoryCalculus: string;
  npCategoryOutput: string;
  npNumberInput: string;
  npExpressionInput: string;
  npVariable: string;
  npArithmetic: string;
  npFunctionApply: string;
  npPlotOutput: string;
  npMatrixInput: string;
  npMatrixOp: string;
  npDerivative: string;
  npIntegrate: string;
  npMatrixDecompose: string;
  npSymbolicIntegrate: string;
  npSimplify: string;
  npSolveEquation: string;
  npDecompMethod: string;
  npSearchRange: string;
  npEvaluate: string;
  npDisplay: string;
  npPortValue: string;
  npPortA: string;
  npPortB: string;
  npPortX: string;
  npPortExpr: string;
  npPortMatrix: string;
  npPortResult: string;
  npPortPlot: string;
  npValue: string;
  npMin: string;
  npMax: string;
  npStep: string;
  npExpression: string;
  npVarName: string;
  npNoVariables: string;
  npDependsOn: string;
  npOperator: string;
  npFunction: string;
  npCustom: string;
  npCustomExpr: string;
  npXMin: string;
  npXMax: string;
  npMatrixSize: string;
  npAddRow: string;
  npAddCol: string;
  npDelRow: string;
  npDelCol: string;
  npLowerBound: string;
  npUpperBound: string;
  npVariable_: string;
  npNodes: string;
  npEdges: string;
  npConstant: string;
  npConstantName: string;
  npMatrixMultiply: string;
  npTemplates: string;
  npFitView: string;
  npMinimap: string;

  /* ---------------- AI assistant ---------------- */
  aiTitle: string;
  aiPlaceholder: string;
  aiSend: string;
  aiStop: string;
  aiClear: string;
  aiThinking: string;
  aiWelcome: string;
  aiWelcomeHint: string;
  aiInputPlaceholder: string;
  aiSuggest1: string;
  aiSuggest2: string;
  aiSuggest3: string;
  aiExplain: string;
  aiSolve: string;
  aiPlot: string;
  aiStep: string;
  aiCopy: string;
  aiInsertEditor: string;
  aiErrNoKey: string;
  aiErrNetwork: string;
  aiErrAuth: string;
  aiErrRateLimit: string;
  aiErrParse: string;
  aiErrEmpty: string;
  aiErrCancelled: string;
  aiConfig: string;
  aiCancel: string;
  aiSave: string;
  aiEmptyReply: string;
  aiNotConfigured: string;
  aiSettings: string;
  aiAskPlaceholder: string;

  /* ---------------- Plot panel ---------------- */
  plotEmpty: string;
  plotEmptyHint: string;
  plotZoom: string;
  plotPan: string;
  plotLegend: string;
  plotXAxis: string;
  plotYAxis: string;
  plotRange: string;
  plotTypeCartesian: string;
  plotTypePolar: string;
  plotTypeParametric: string;
  plotCurveSettings: string;
  plotColor: string;
  plotLineWidth: string;
  plotExprY: string;
  plotExprR: string;
  plotExprX: string;
  plotExprYParam: string;
  plotThetaRange: string;
  plotTRange: string;

  /* ---------------- 3D plot panel — example groups ---------------- */
  plot3dGroupBasic: string;
  plot3dGroupAdvanced: string;
  plot3dExWave: string;
  plot3dExSaddle: string;
  plot3dExParaboloid: string;
  plot3dExGaussian: string;
  plot3dExSombrero: string;
  plot3dExTiltedWave: string;

  /* ---------------- 3D plot panel — errors & toasts ---------------- */
  plot3dErrNoGeometry: string;
  plot3dErrEmpty: string;
  plot3dErrEval: string;
  plot3dErrEvalVars: string;
  plot3dErrExampleEval: string;
  plot3dErrExampleEvalVars: string;
  plot3dAdded: string;
  plot3dExampleAdded: string;

  /* ---------------- 3D plot panel — input bar ---------------- */
  plot3dInputPlaceholder: string;
  plot3dExprInputAria: string;
  plot3dAdd: string;
  plot3dAddSurface: string;
  plot3dCollapseControls: string;
  plot3dExpandControls: string;
  plot3dToggleControlsAria: string;
  plot3dResetCameraAria: string;
  plot3dResetCameraView: string;
  plot3dExportPngAria: string;
  plot3dExportScene: string;

  /* ---------------- 3D plot panel — preview ---------------- */
  plot3dPreview: string;
  plot3dPreviewHint: string;

  /* ---------------- 3D plot panel — controls ---------------- */
  plot3dWireframe: string;
  plot3dAxes: string;
  plot3dGrid: string;
  plot3dAutoRotate: string;
  plot3dResolution: string;
  plot3dGridResolutionAria: string;
  plot3dColorScheme: string;
  plot3dSchemeHeight: string;
  plot3dSchemeHeightAria: string;
  plot3dSchemeMono: string;
  plot3dSchemeMonoAria: string;
  plot3dUpAxis: string;
  plot3dYUp: string;
  plot3dYUpAria: string;
  plot3dZUp: string;
  plot3dZUpAria: string;

  /* ---------------- 3D plot panel — examples menu & surface list ---------------- */
  plot3dExamples: string;
  plot3dOpenExamplesAria: string;
  plot3dHide: string;
  plot3dShow: string;
  plot3dHideSurface: string;
  plot3dShowSurface: string;
  plot3dRemoveSurface: string;
  plot3dRemoveAria: string;

  /* ---------------- 3D plot panel — canvas overlay & expand dialog ---------------- */
  plot3dZoomIn: string;
  plot3dZoomInAria: string;
  plot3dControlsHint: string;
  plot3dExpandAria: string;
  plot3dExpandTitle: string;
  plot3dExpandSubtitle: string;
  plot3dExportPng: string;
  plot3dCloseAria: string;

  /* ---------------- 3D plot panel — error & empty states ---------------- */
  plot3dSampleFailed: string;
  plot3dSampleFailedHint: string;
  plot3dSurfacesFailed: string;
  plot3dWorkspaceTitle: string;
  plot3dWorkspaceHintPre: string;
  plot3dWorkspaceHintPost: string;
  plot3dWorkspaceSupported: string;

  /* ---------------- AI 助手（上下文与工具调用） ---------------- */
  aiContextToggle: string;
  aiContextAttached: string;
  aiContextAttachedHint: string;
  aiContextNoFile: string;
  aiContextPlots: string;
  aiContextVars: string;
  aiToolCallLabel: string;
  aiToolFailedLabel: string;
  aiToolArgsLabel: string;
  aiToolResultLabel: string;

  /* ---------------- 编辑器标签页 ---------------- */
  editorTabClose: string;
  editorTabsEmptyTitle: string;
  editorTabsEmptyHint: string;

  /* ---------------- Command palette ---------------- */
  cpTitle: string;
  cpPlaceholder: string;
  cpNoResults: string;
  cpQuickEval: string;
  cpGroupActions: string;
  cpGroupView: string;
  cpGroupPanels: string;
  cpGroupLayout: string;
  cpGroupTemplates: string;
  cpRunAll: string;
  cpClearEditor: string;
  cpClearAllHistVars: string;
  cpSwitchLight: string;
  cpSwitchDark: string;
  cpToggleSidebar: string;
  cpTogglePreview: string;
  cpToggleEditor: string;
  cpToggleActivityBar: string;
  cpMoveActivityBarLeft: string;
  cpMoveActivityBarRight: string;
  cpLockActivityBar: string;
  cpUnlockActivityBar: string;
  cpAutoHideActivityBar: string;
  cpDisableAutoHideActivityBar: string;
  cpHideActivityBar: string;
  cpShowActivityBar: string;
  cpOpenSymbols: string;
  cpOpenTemplates: string;
  cpOpenSolver: string;
  cpOpenUnits: string;
  cpOpenBases: string;
  cpOpenHistory: string;
  cpOpenVariables: string;
  cpOpenGuide: string;
  cpOpenFormulas: string;
  cpOpenPipeline: string;
  cpOpenAI: string;
  cpOpenLinalg: string;

  /* ---------------- Workbench layout ---------------- */
  wbAllPanelsHidden: string;
  wbAllPanelsHiddenHint: string;

  /* ---------------- View modes ---------------- */
  viewWorkbench: string;
  viewFocus: string;
  editorLivePreview: string;
  editorLivePreviewHint: string;

  /* ---------------- Keyboard shortcuts ---------------- */
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
  ksTogglePreview: string;
  ksShowShortcuts: string;
  ksCloseDialog: string;
  ksCopyRenderedText: string;
  ksLoadIntoEditor: string;
  ksInsertAtCursor: string;
  ksZoomInOut: string;
  ksPanView: string;
  ksPressToShow: string;

  /* ---------------- Symbols palette ---------------- */
  symBasic: string;
  symGreek: string;
  symCalculus: string;
  symTrigonometry: string;
  symLogExp: string;
  symLinearAlgebra: string;
  symStatistics: string;
  symCombinatorics: string;
  symConstants: string;
  symInsert: string;
  symbolPaletteTitle: string;
  symbolPaletteToggle: string;
  symCatInverseTrig: string;
  symCatPower: string;
  symCatRounding: string;
  symCatComplex: string;

  /* ---------------- Common UI ---------------- */
  commonCopy: string;
  commonCopied: string;
  commonInsert: string;
  commonCancel: string;
  commonConfirm: string;
  commonClose: string;
  commonSave: string;
  commonDelete: string;
  commonEdit: string;
  commonClear: string;
  commonReset: string;
  commonRun: string;
  commonStop: string;
  commonLoading: string;
  commonSearch: string;
  commonYes: string;
  commonNo: string;
  commonError: string;
  commonSuccess: string;
  commonWarning: string;
  commonInfo: string;
  commonExpand: string;
  commonCollapse: string;

  /* ---------------- Errors ---------------- */
  errInvalidExpression: string;
  errUndefinedVar: string;
  errDivisionByZero: string;
  errSyntax: string;
  errTimeout: string;
  errNetwork: string;
  errAIUnavailable: string;
  errMatrixDimMismatch: string;
  errSingularMatrix: string;
}

/* ============================================================
   Dictionaries
   ============================================================ */
const zhCN: TranslationDict = {
  /* App / brand */
  appTitle: "OmniMath Pro",
  appSubtitle: "全能脚本式AI数学工作台",
  appLoading: "正在初始化…",

  /* Top menu */
  menuFile: "文件",
  menuEdit: "编辑",
  menuView: "视图",
  menuHelp: "帮助",
  menuRun: "运行",
  menuNew: "新建",
  menuOpen: "打开",
  menuSave: "保存",
  menuExport: "导出",
  menuUndo: "撤销",
  menuRedo: "重做",
  menuFind: "查找",
  menuCommandPalette: "命令面板",
  menuToggleSidebar: "切换侧栏",
  menuTogglePreview: "切换预览",
  menuZoomIn: "放大",
  menuZoomOut: "缩小",
  menuResetZoom: "重置缩放",
  menuTheme: "主题",
  menuLight: "浅色",
  menuDark: "深色",
  menuShortcuts: "快捷键",
  menuAbout: "关于",

  /* Editor */
  editorTitle: "编辑器",
  editorPlaceholder:
    "# 输入数学表达式，按 Enter 求值\n# 示例：\n2 + 3 * 4\nsin(pi/4)\nx = 42\nplot(sin(x))",
  editorRun: "运行",
  editorReset: "重置",
  editorClear: "清空",
  editorModeSimple: "简单",
  editorModePython: "Python",
  editorModeMatlab: "MATLAB",
  editorModeAdvanced: "高级",
  editorEnterToEval: "Enter 求值",
  editorShiftEnterNewLine: "Shift+Enter 换行",
  editorCtrlSlashComment: "Ctrl+/ 注释",
  editorVars: "变量",
  editorLines: "行",
  editorCol: "列",
  editorLn: "行",
  editorIndent: "缩进",
  editorOutdent: "取消缩进",
  editorCopy: "复制",
  editorPaste: "粘贴",
  editorCut: "剪切",
  editorSelectAll: "全选",
  editorComment: "注释",
  editorUncomment: "取消注释",
  editorLineComment: "行注释",

  /* Preview */
  previewTitle: "预览",
  previewFormula: "公式",
  previewPlot: "绘图",
  preview3D: "3D",
  preview3DLoading: "3D 模块加载中…",
  previewLog: "日志",
  previewCopy: "复制",
  previewInput: "输入",
  previewResult: "结果",
  previewError: "错误",
  previewEmpty: "暂无结果",
  previewEmptyHint: "在编辑器中输入表达式并按 Enter",
  previewClearAll: "全部清除",
  previewNoHistory: "暂无计算历史",
  previewDownload: "下载",
  previewZoomIn: "放大",
  previewZoomOut: "缩小",
  previewReset: "重置",
  previewToggleGrid: "切换网格",
  previewCopyImage: "复制图像",
  previewDownloadPNG: "下载 PNG",
  previewLatex: "LaTeX",
  previewSteps: "步骤",
  previewType: "类型",

  /* Formula export */
  formulaExport: "导出公式",
  formulaExportPNG: "导出为 PNG",
  formulaExportSVG: "导出为 SVG",
  formulaExportLatex: "导出为 LaTeX",
  formulaExportHint: "选择导出格式",

  /* Layout switching */
  layoutSwitch: "切换布局",
  layoutRight: "预览在右侧",
  layoutBottom: "预览在下方",
  layoutCompact: "紧凑尺寸",
  layoutLarge: "大尺寸预览",
  layoutSize: "预览尺寸",

  /* Settings panel */
  settingsTitle: "设置",
  settingsAppearance: "外观",
  settingsEditor: "编辑器",
  settingsLayout: "布局",
  settingsExport: "导出",
  settingsLanguage: "语言",
  settingsTheme: "主题",
  settingsActivityBar: "任务栏",
  settingsActivityBarPosition: "任务栏位置",
  settingsActivityBarLocked: "锁定任务栏",
  settingsActivityBarAutoHide: "自动隐藏",
  settingsDefaultExportDpi: "默认导出分辨率",
  settingsFormulaFontSize: "公式字号",
  settingsUseMathFont: "使用数学字体",
  settingsFontPreset: "字体预设",
  fontPresetModern: "现代",
  fontPresetScholarly: "学术",
  fontPresetSystem: "系统",
  settingsResetAll: "重置全部设置",
  settingsResetConfirm: "确定要重置所有设置吗？此操作不可撤销。",
  settingsShortcuts: "快捷键",
  settingsAbout: "关于",

  /* Tabs */
  tabHistory: "历史",
  tabVariables: "变量",
  tabFiles: "文件",
  tabFormulas: "公式库",
  tabPipeline: "流水线",
  tabAI: "AI",
  tabLinalg: "线代",
  tabMatrix: "矩阵",
  tabSolver: "求解",
  tabSymbols: "符号",
  tabTemplates: "模板",
  tabUnits: "单位",
  tabBases: "进制",
  tabGuide: "指南",
  tabPlots: "图表",

  /* Activity bar */
  abSymbols: "符号",
  abTemplates: "模板",
  abSolver: "求解器",
  abUnits: "单位转换",
  abBases: "进制转换",
  abHistory: "历史",
  abVariables: "变量",
  abGuide: "指南",
  abFormulas: "公式库",
  abPipeline: "流水线",
  abWhiteboard: "白板",
  abLayoutMenu: "布局选项",
  abAI: "AI 助手",
  abLinalg: "线性代数",
  abMatrix: "矩阵",
  abFiles: "文件",
  abStats: "概率统计",
  abPlots: "图表",
  abShowSidebar: "显示侧栏",
  abHideSidebar: "隐藏侧栏",
  abToggleEditor: "切换编辑器",
  abTogglePreview: "切换预览区",
  abMoveLeft: "移到左侧",
  abMoveRight: "移到右侧",
  abLockTaskbar: "锁定任务栏",
  abUnlockTaskbar: "解锁任务栏",
  abAutoHide: "自动隐藏任务栏",
  abDisableAutoHide: "取消自动隐藏",
  abHideTaskbar: "隐藏任务栏",
  abShowTaskbar: "显示任务栏",
  abLocked: "任务栏已锁定",

  /* Status */
  statusReady: "就绪",
  statusCalculating: "计算中…",
  statusError: "错误",
  statusLines: "行",
  statusVars: "变量",
  statusPlots: "图",
  statusLight: "浅色",
  statusDark: "深色",
  statusCommand: "命令",
  statusCalc: "计算",
  statusOk: "正常",
  statusErr: "出错",
  statusChars: "字符",
  statusWords: "词",
  statusLang: "语言",
  statusConflicts: "冲突",
  statusConflictTooltip: "检测到状态冲突",
  statusNoConflicts: "无冲突",
  statusConflictFix: "修复",
  statusConflictDismiss: "忽略",

  /* Language */
  languageLabel: "语言",
  languageZh: "中文",
  languageEn: "English",
  languageSwitch: "切换语言",

  /* Quick calc */
  qcPlaceholder: "快速计算…",
  qcTitle: "快捷计算",
  qcNotepad: "便签",
  qcShowNotepad: "显示便签",
  qcHideNotepad: "隐藏便签",
  qcPin: "固定",
  qcUnpin: "取消固定",
  qcCopyResult: "复制结果",
  qcDragHint: "拖动移动",
  qcModeBasic: "基础",
  qcModeSci: "科学",
  qcModeProg: "程序员",
  qcModeLin: "线性代数",
  qcModeConv: "单位换算",
  qcSendToNotepad: "追加到便签",
  qcHistTitle: "计算历史",
  qcNotepadPlaceholder: "草稿 / 记录数据…",
  qcFloatingCalc: "浮动计算器",
  qcClearHistory: "清除历史",
  qcMemoryClear: "清除记忆",
  qcMemoryRecall: "记忆召回",

  /* History */
  histTitle: "计算历史",
  histNoHistory: "暂无历史",
  histNoHistoryHint: "你的计算将出现在这里",
  histClear: "清除历史",
  histVariables: "变量",
  histCopy: "复制",
  histRerun: "重新运行",
  histInsert: "插入编辑器",
  histJustNow: "刚刚",
  histMinAgo: "分钟前",
  histMinAgoPlural: "分钟前",
  histHourAgo: "小时前",
  histHourAgoPlural: "小时前",
  histDayAgo: "天前",
  histDayAgoPlural: "天前",

  /* Variables */
  varsTitle: "变量",
  varsNoVars: "暂无变量",
  varsNoVarsHint: "在编辑器中赋值以创建变量",
  varsName: "名称",
  varsValue: "值",
  varsType: "类型",
  varsDelete: "删除",
  varsEdit: "编辑",
  varsInsert: "插入",
  varsSlider: "滑块",
  varsSliderHint: "拖动滑块以调整变量值",
  varsSliderMin: "最小",
  varsSliderMax: "最大",
  varsSliderStep: "步长",

  /* Templates */
  tplTitle: "模板",
  tplInsert: "插入",
  tplSearch: "搜索模板…",
  tplEmpty: "未找到模板",

  /* Formula library */
  formulasTitle: "公式库",
  formulasSearch: "搜索公式…",
  formulasCategories: "分类",
  formulasExample: "示例",
  formulasInsertExample: "插入示例",
  formulasCategoryAlgebra: "代数",
  formulasCategoryGeometry: "几何",
  formulasCategoryTrigonometry: "三角函数",
  formulasCategoryCalculus: "微积分",
  formulasCategoryStatistics: "统计",
  formulasCategoryPhysics: "物理",
  formulasCategoryFinance: "金融",
  formulasAddCustom: "新增公式",
  formulasCustom: "自定义",
  formulasName: "名称",
  formulasLatex: "LaTeX 表达式",
  formulasDescription: "描述",
  formulasExampleInput: "示例输入",
  formulasCustomEmpty: "暂无自定义公式",
  formulasCategoryManage: "分类管理",
  formulasCategoryAdd: "新增分类",
  formulasCategoryName: "分类名称",
  formulasCategoryColor: "颜色",
  formulasCategoryEmpty: "暂无自定义分类",
  formulasCategoryDeleteConfirm: "删除该分类后，其下公式将归入「自定义」。确认删除？",

  /* Solver */
  solverTitle: "方程求解",
  solverEquationForm: "方程",
  solverVariable: "变量",
  solverSolve: "求解",
  solverSolution: "解",
  solverSteps: "步骤",
  solverExamples: "示例",
  solverInsert: "插入编辑器",
  solverEnterEquation: "请输入方程",
  solverError: "求解失败",
  solverNoSolution: "无解",
  solverMultipleSolutions: "多个解",
  solverStepSetup: "建立方程",
  solverStepSolve: "求解过程",
  solverStepSolution: "得到解",

  /* Units */
  unitsTitle: "单位转换",
  unitsCategory: "类别",
  unitsValue: "数值",
  unitsFrom: "从",
  unitsTo: "到",
  unitsResult: "结果",
  unitsAllConversions: "全部转换",
  unitsSwap: "交换",
  unitsCopy: "复制",
  unitsEnterValue: "请输入数值",
  unitsEnterNumber: "请输入数字",
  unitsLength: "长度",
  unitsMass: "质量",
  unitsTemperature: "温度",
  unitsVolume: "体积",
  unitsTime: "时间",
  unitsSpeed: "速度",
  unitsArea: "面积",
  unitsEnergy: "能量",
  unitsPressure: "压强",
  unitsAngle: "角度",
  unitsData: "数据",

  /* Bases */
  basesTitle: "进制转换",
  basesInput: "输入",
  basesBinary: "二进制",
  basesOctal: "八进制",
  basesDecimal: "十进制",
  basesHex: "十六进制",
  basesBits: "位",
  basesConversions: "全部进制",
  basesInsert: "插入编辑器",
  basesInvalidNumber: "无效的数字",
  basesEnterNumber: "请输入数字",
  basesInputTag: "输入",

  /* Linear algebra */
  linalgTitle: "线性代数",
  linalgMatrixA: "矩阵 A",
  linalgMatrixB: "矩阵 B",
  linalgResult: "结果",
  linalgDet: "行列式",
  linalgInv: "逆矩阵",
  linalgTranspose: "转置",
  linalgRank: "秩",
  linalgTrace: "迹",
  linalgEig: "特征值",
  linalgAdd: "A + B",
  linalgSub: "A - B",
  linalgMul: "A × B",
  linalgSolve: "解 Ax = b",
  linalgLu: "LU 分解",
  linalgQr: "QR 分解",
  linalgInsert: "插入编辑器",
  linalgError: "矩阵运算错误",
  linalgEmpty: "请输入矩阵",

  /* Statistics */
  statsTitle: "概率统计",
  statsTabRegression: "回归分析",
  statsHistogram: "直方图",
  statsBoxPlot: "箱线图",
  statsScatterPlot: "散点图",
  statsDatasets: "数据集",
  statsSaveCurrent: "保存当前数据",
  statsLoad: "载入",
  statsExportCSV: "导出 CSV",
  statsImportCSV: "导入 CSV",
  statsNoDatasets: "暂无保存的数据集",
  statsDatasetSaved: "数据集已保存",
  statsDatasetDeleted: "数据集已删除",
  statsDatasetLoaded: "数据集已载入",
  statsXData: "X 数据",
  statsYData: "Y 数据",
  statsRegressionEquation: "回归方程",
  statsSlope: "斜率 a",
  statsIntercept: "截距 b",
  statsRSquared: "决定系数 R²",
  statsFitGood: "拟合优度极佳",
  statsFitModerate: "拟合优度良好",
  statsFitWeak: "拟合优度较弱",
  statsFitPoor: "拟合优度很差",
  statsNeedPairs: "需要至少 2 组有效 (x, y) 数据",
  statsDistChiSquare: "卡方分布 χ²(df)",
  statsDistT: "t 分布 t(df)",
  statsDistF: "F 分布 F(d1, d2)",
  statsDistGeometric: "几何分布 Geo(p)",
  statsDistNegBinomial: "负二项分布 NB(r, p)",
  statsDiscreteNoPlot: "离散分布不支持发送 PDF 曲线",

  /* Matrix editor */
  matrixTitle: "矩阵编辑器",
  matrixRows: "行",
  matrixCols: "列",
  matrixAddRow: "增加行",
  matrixAddCol: "增加列",
  matrixDelRow: "删除行",
  matrixDelCol: "删除列",
  matrixClear: "清空",
  matrixIdentity: "单位阵",
  matrixFill: "填充",
  matrixRandom: "随机",

  /* Linear algebra panel — extended */
  linalgTabEdit: "矩阵编辑",
  linalgTabOps: "运算",
  linalgTabDecomp: "分解",
  linalgTabSystem: "方程组",
  linalgTabTransform: "变换",
  linalgNewMatrix: "新建矩阵",
  linalgPaste: "从文本粘贴",
  linalgSave: "保存到变量",
  linalgPreview: "实时预览",
  linalgIdentity: "单位矩阵",
  linalgZeros: "零矩阵",
  linalgRandom: "随机矩阵",
  linalgQuickFill: "快捷填充",
  linalgOpsA: "矩阵 A",
  linalgOpsB: "矩阵 B",
  linalgOperation: "运算",
  linalgScalar: "标量 k",
  linalgPower: "幂次 k",
  linalgCompute: "计算",
  linalgSteps: "步骤",
  linalgSingular: "矩阵不可逆",
  linalgDimMismatch: "矩阵维度不匹配",
  linalgNonSquare: "矩阵非方阵",
  linalgNotPositiveDef: "矩阵非正定",
  linalgMatrixSize: "大小",
  linalgNameInUse: "变量名已被占用",
  linalgDeleteConfirm: "确认删除该矩阵？",
  linalgPasteHint: "粘贴 TSV / CSV / MATLAB 格式，如：\n1,2,3\n4,5,6\n或 [1,2;3,4]",
  linalgPasteConfirm: "解析并填入",
  linalgPasteInvalid: "无法解析为矩阵",
  linalgSaved: "已保存到变量",

  /* Decomposition */
  linalgDecompType: "分解类型",
  linalgDecompose: "分解",
  linalgLmatrix: "L 矩阵",
  linalgUmatrix: "U 矩阵",
  linalgPmatrix: "P 矩阵",
  linalgQmatrix: "Q 矩阵",
  linalgRmatrix: "R 矩阵",
  linalgSmatrix: "Σ 矩阵",
  linalgVmatrix: "V 矩阵",
  linalgEigenvalues: "特征值",
  linalgEigenvectors: "特征向量",
  linalgJordan: "Jordan 标准型",
  linalgCholesky: "Cholesky 分解",
  linalgNotSupported: "该分解类型暂不支持，请选择其他类型",
  linalgSchur: "Schur 分解",
  linalgTmatrix: "T 矩阵",

  /* Linear system */
  linalgSolveAxb: "求解 Ax = b",
  linalgConstVec: "常数向量 b",
  linalgUniqueSolution: "唯一解",
  linalgNoSolution: "无解",
  linalgInfiniteSolution: "无穷多解",
  linalgParticularSolution: "特解",
  linalgNullSpace: "零空间基",
  linalgAugmented: "增广矩阵 [A | b]",
  linalgGaussSteps: "高斯消元步骤",
  linalgAddRow: "行运算",
  linalgSwapRows: "交换行",
  linalgSingularHint: "det(A) = 0，方程组可能无解或有无穷多解",
  linalgConstVecSize: "b 的长度需与 A 的行数相同",

  /* Vector operations tab */
  linalgTabVector: "向量运算",
  linalgVectorA: "向量 A",
  linalgVectorB: "向量 B",
  linalgVectorInputHint: "逗号或空格分隔的数字",
  linalgDotProduct: "点积",
  linalgCrossProduct: "叉积",
  linalgMagnitude: "模长",
  linalgAngle: "夹角",
  linalgProjection: "投影",
  linalgGramSchmidt: "Gram-Schmidt 正交化",
  linalgVectorDimMismatch: "向量维度不匹配",
  linalgCross3DOnly: "叉积仅支持 3D 向量",
  linalgOrthogonalized: "正交化结果",
  linalgGramSchmidtHint: "每行一个向量，逗号或空格分隔",
  linalgGramSchmidtSteps: "正交化步骤",

  /* Matrix norms & properties */
  linalgNormsProps: "矩阵范数与性质",
  linalgNorm1: "1-范数",
  linalgNormInf: "∞-范数",
  linalgNormFrobenius: "Frobenius 范数",
  linalgNormSpectral: "谱范数",
  linalgSymmetric: "对称性",
  linalgPositiveDefinite: "正定性",
  linalgInvertible: "可逆性",
  linalgOrthogonal: "正交性",

  /* Homogeneous system & enhanced infinite solution */
  linalgHomogeneousSystem: "齐次方程组",
  linalgNonHomogeneousSystem: "非齐次方程组",
  linalgFreeVars: "自由变量",
  linalgGeneralSolution: "通解",
  linalgFundamentalSystem: "基础解系",

  /* Linear algebra workbench — Task 11 */
  linalgMatrixLib: "矩阵库",
  linalgDeleteMatrix: "删除矩阵",
  linalgNeedSquare: "需方阵",
  linalgSavedVar: "已保存: {name}",
  linalgAddRowBtn: "加行",
  linalgDelRowBtn: "减行",
  linalgAddColBtn: "加列",
  linalgDelColBtn: "减列",
  linalgSaveToVar: "保存到变量 →",
  linalgKatexPreview: "KaTeX 预览",
  linalgPasteExpandHint: "提示：支持粘贴 TSV / CSV / MATLAB 风格 [1,2;3,4]，会自动扩展目标网格。",
  linalgMatrixEmpty: "矩阵为空",
  linalgMatrixBEmpty: "矩阵 B 为空",
  linalgDimMismatchMul: "维度不匹配: A({ar}×{ac}) × B({br}×{bc})",
  linalgDimMismatchBin: "维度不匹配: A({ar}×{ac}) vs B({br}×{bc})",
  linalgSingularNonInv: "奇异矩阵，不可逆",
  linalgUnknownOp: "未知操作",
  linalgCalcError: "计算错误",
  linalgOperandA: "操作数 A",
  linalgOperandB: "操作数 B",
  linalgPowerInt: "幂次 k（整数）",
  linalgCalcResult: "计算结果",
  linalgDerivationSteps: "推导步骤",
  linalgOpsInputPrompt: "选择操作数与运算后点击 \"计算\"",
  linalgEigenDecomp: "特征值分解",
  linalgSvdNotSupportedItem: "SVD（暂不支持）",
  linalgSvdNotSupported: "mathjs 未内置 SVD，请使用 \"特征值分解\" 替代",
  linalgSvdNotSupportedNote: "mathjs 未提供 SVD 实现；建议使用 QR 或特征值分解代替",
  linalgNotSupportedShort: "暂不支持",
  linalgMatrixLabel: "矩阵",
  linalgDecompInputPrompt: "选择矩阵与分解方法后点击 \"分解\"",
  linalgCholeskyNotSymmetric: "非对称，无法做 Cholesky 分解",
  linalgCholeskyNotPosDef: "非正定，无法做 Cholesky 分解",
  linalgCholeskyNote: "A = L · L^T  (要求对称正定)",
  linalgConstVecSizeMismatch: "常向量长度需等于矩阵行数",
  linalgSolveError: "求解错误",
  linalgSystemInputPrompt: "填写系数矩阵与常向量后点击 \"求解\"",
  linalgRankInfo: "rank(A) = {rankA}，rank([A|b]) = {rankAug}",
  linalgUnknownsInfo: "，未知数 n = {n}",
  linalgFreeVarsCount: "，自由变量 = {n}",
  linalgFreeVarsColon: "自由变量：",
  linalgCountItems: "（{n} 个）",
  linalgOmittedSteps: "省略 {n} 步行变换",
  linalgRowReduced: "行简化后：",
  linalgSystemNoSolution: "方程组无解",
  linalgBackSubstitution: "回代得：",
  linalgFreeVarsLatex: "自由变量：",
  linalgGeneralSolutionLatex: "通解：",
  linalgLinearlyDependent: "线性相关，跳过",
  linalgMaxIndepRows: "线性无关行的最大数目",
  linalgInvertibleLatex: " 可逆",
  linalgTimesOp: " 次",

  /* Solver panel — extended */
  solverTabEquation: "方程求解",
  solverTabSystem: "方程组",
  solverTabCalculus: "微积分",
  solverTabNumeric: "数值求根",
  solverEquationPlaceholder: "如 x^2 - 5*x + 6 = 0 或 sin(x) = 0.5",
  solverRange: "求根范围",
  solverNoRoots: "未找到实根",
  solverFoundRoots: "找到的根",
  solverRealRoots: "实根",
  solverComplexRoots: "复根",
  solverPolynomialInfo: "多项式信息",
  solverSystemPlaceholder: "每行一个方程，如：\nx + y = 5\nx - y = 1",
  solverSystemSolve: "求解方程组",
  solverSystemSolution: "方程组解",
  solverSystemInvalid: "存在无法解析的方程",
  solverSystemCount: "方程数量",
  solverSystemParseFail: "方程解析失败",
  solverCalcDerivative: "求导",
  solverCalcIntegral: "积分",
  solverCalcLimit: "极限",
  solverCalcTaylor: "Taylor 展开",
  solverCalcInput: "表达式 f(x)",
  solverCalcVar: "变量",
  solverCalcLower: "下限",
  solverCalcUpper: "上限",
  solverCalcPoint: "趋于",
  solverCalcOrder: "阶数",
  solverCalcCompute: "计算",
  solverCalcResult: "结果",
  solverNumericFunction: "f(x)",
  solverNumericRange: "区间 [a, b]",
  solverNumericMethod: "方法",
  solverNumericBisection: "二分法",
  solverNumericNewton: "牛顿法",
  solverNumericIter: "迭代次数",
  solverNumericRoot: "根",
  solverNumericCompute: "求解",
  solverNumericGuess: "初值 x0",
  solverNumericTolerance: "容差",
  solverNumericNoSignChange: "区间端点函数值同号，无法使用二分法",
  solverResultLabel: "结果",

  /* Solver workbench — Task 11 */
  solverNavEquation: "方程",
  solverNavEquationDesc: "多项式 / 超越方程求根",
  solverNavSystem: "方程组",
  solverNavSystemDesc: "线性方程组逐步消元",
  solverNavDerivative: "求导",
  solverNavDerivativeDesc: "分步求导 · 法则标注",
  solverNavIntegral: "积分",
  solverNavIntegralDesc: "不定 / 定积分 · 数值回退",
  solverNavLimit: "极限",
  solverNavLimitDesc: "符号极限 · 数值回退",
  solverSendToPlot2D: "发送到 2D 绘图",
  solverSentToPlot2D: "已发送到 2D 绘图",
  solverSelectExample: "选择示例…",
  solverSolveMode: "求解模式",
  solverNumericSolution: "数值解",
  solverSymbolicSolution: "符号解",
  solverSolveResult: "求解结果",
  solverInputPrompt: "输入方程后点击 \"求解\"",
  solverSymbolicFallback: "⚠️ 符号解失败，已回退到数值解",
  solverKindPolynomial: "🧮 多项式方程 · ",
  solverKindTranscendental: "📈 超越方程 · ",
  solverKindSymbolic: "🔤 符号解 · ",
  solverSystemInput: "方程组（每行一个方程）",
  solverNonlinearSystem: "非线性方程组",
  solverNumericMethodNote: "数值方法说明",
  solverUniqueSolution: "唯一解",
  solverSystemInputPrompt: "输入方程组后点击 \"求解方程组\"",
  solverDerivativeOrder: "求导阶数",
  solverOrder1: "1 阶",
  solverOrder2: "2 阶",
  solverOrder3: "3 阶",
  solverDerivativeResult: "求导结果",
  solverDerivativeInputPrompt: "输入表达式后点击 \"求导\"",
  solverDefiniteIntegral: "定积分",
  solverIndefiniteIntegral: "不定",
  solverIntegralResult: "积分结果",
  solverIntegralInputPrompt: "输入表达式后点击 \"积分\"",
  solverNumericResult: "数值结果 ≈",
  solverPointMustBeNumber: "趋于点需为数字或 inf",
  solverPointPlaceholder: "0 或 inf",
  solverComputeLimit: "求极限",
  solverLimitResult: "极限结果",
  solverLimitInputPrompt: "输入表达式后点击 \"求极限\"",
  solverWorkbenchTitle: "求解器",
  solverFooterHint: "分步求解：法则标注 / 逐步消元 / 积分提示",
  /* Solver example groups */
  solverExPolynomial: "多项式方程",
  solverExTranscendental: "超越方程",
  solverExLinearSystem: "线性方程组",
  solverExNonlinear: "非线性（给出数值说明）",
  solverDerivExRules: "乘积 / 商 / 链式",
  solverDerivExPoly: "多项式 / 复合",
  solverIntegralExBasic: "基本积分",
  solverIntegralExAdvanced: "进阶",
  solverLimitExClassic: "经典极限",
  solverLimitExInfinite: "无穷极限",
  /* Solver example hints */
  solverHintFactor: "因式分解",
  solverHintCubic: "三次方程",
  solverHintComplexRoots: "复数根",
  solverHintNumeric: "数值求解",
  solverHintLog: "对数解",
  solverHint2VarLinear: "二元一次",
  solverHint3VarLinear: "三元一次",
  solverHintNonlinear: "非线性",
  solverHintProductRule: "乘积法则",
  solverHintQuotientRule: "商法则",
  solverHintChainRule: "链式法则",
  solverHintPowerRule: "幂法则",
  solverHintPowerFunc: "幂函数",
  solverHintTrigFunc: "三角函数",
  solverHintExpFunc: "指数函数",
  solverHintLogIntegral: "对数积分",
  solverHintByParts: "分部积分",
  solverHintSubstitution: "换元",
  solverHintArctan: "反正切",
  solverHintDefOfE: "e 的定义",
  /* Solver example labels */
  solverLabel2x2Linear: "2×2 线性",
  solverLabel3x3Linear: "3×3 线性",
  solverLabelHasQuadratic: "含二次项",

  /* Pipeline / nodes */
  pipelineTitle: "计算流水线",
  pipelineEnterView: "进入流水线视图",
  pipelineAddNode: "添加节点",
  pipelineRun: "运行",
  pipelineClear: "清空",
  pipelineEmpty: "画布为空",
  pipelineEmptyHint: "添加节点以构建计算流水线",
  pipelineNodeInput: "输入",
  pipelineNodeOp: "运算",
  pipelineNodeOutput: "输出",
  pipelineNodePlot: "绘图",
  pipelineNodeSolve: "求解",
  pipelineConnect: "连接",
  pipelineDisconnect: "断开",
  pipelineDelete: "删除",
  pipelineDuplicate: "复制",
  pipelineAutoLayout: "自动布局",
  pipelineExport: "导出",

  /* Node-pipeline UI (Task 6) */
  npBackToWorkbench: "返回工作台",
  npDoubleClickHint: "双击画布添加节点",
  npExported: "已导出到编辑器",
  npConnecting: "连接中…",
  npInvalidConnection: "端口类型不兼容",
  npRunAll: "运行",
  npClearAll: "清空",
  npExportScript: "导出脚本",
  npResetView: "重置视图",
  npZoomIn: "放大",
  npZoomOut: "缩小",
  npResult: "结果",
  npError: "错误",
  npEmpty: "空流水线",
  npAddNodeTitle: "添加节点",
  npAddNodeHint: "点击添加到画布",
  npCategoryInput: "输入",
  npCategoryOp: "运算",
  npCategoryFunction: "函数",
  npCategoryPlot: "绘图",
  npCategoryMatrix: "线性代数",
  npCategoryCalculus: "微积分",
  npCategoryOutput: "输出",
  npNumberInput: "数字输入",
  npExpressionInput: "表达式输入",
  npVariable: "变量",
  npArithmetic: "算术运算",
  npFunctionApply: "函数应用",
  npPlotOutput: "绘图",
  npMatrixInput: "矩阵",
  npMatrixOp: "矩阵运算",
  npDerivative: "求导",
  npIntegrate: "积分",
  npMatrixDecompose: "矩阵分解",
  npSymbolicIntegrate: "符号积分",
  npSimplify: "化简",
  npSolveEquation: "解方程",
  npDecompMethod: "分解方法",
  npSearchRange: "搜索范围",
  npEvaluate: "求值",
  npDisplay: "输出/显示",
  npPortValue: "值",
  npPortA: "a",
  npPortB: "b",
  npPortX: "x",
  npPortExpr: "表达式",
  npPortMatrix: "矩阵",
  npPortResult: "结果",
  npPortPlot: "绘图",
  npValue: "值",
  npMin: "最小",
  npMax: "最大",
  npStep: "步长",
  npExpression: "表达式",
  npVarName: "变量名",
  npNoVariables: "无变量",
  npDependsOn: "依赖",
  npOperator: "运算符",
  npFunction: "函数",
  npCustom: "自定义",
  npCustomExpr: "自定义表达式",
  npXMin: "x 最小",
  npXMax: "x 最大",
  npMatrixSize: "矩阵尺寸",
  npAddRow: "加行",
  npAddCol: "加列",
  npDelRow: "删行",
  npDelCol: "删列",
  npLowerBound: "下限",
  npUpperBound: "上限",
  npVariable_: "变量",
  npNodes: "节点",
  npEdges: "连接",
  npConstant: "常数",
  npConstantName: "常数",
  npMatrixMultiply: "矩阵乘法",
  npTemplates: "模板",
  npFitView: "适应视图",
  npMinimap: "缩略图",

  /* AI */
  aiTitle: "AI 助手",
  aiPlaceholder: "向 AI 提问…",
  aiSend: "发送",
  aiStop: "停止",
  aiClear: "清空",
  aiThinking: "思考中…",
  aiWelcome: "你好！我是 OmniMath AI 助手。",
  aiWelcomeHint: "可以让我解释公式、求解方程或绘制图像。",
  aiInputPlaceholder: "问任何数学问题…",
  aiSuggest1: "解释欧拉公式",
  aiSuggest2: "求解 x^2 - 5x + 6 = 0",
  aiSuggest3: "绘制 sin(x) 的图像",
  aiExplain: "解释",
  aiSolve: "求解",
  aiPlot: "绘图",
  aiStep: "分步",
  aiCopy: "复制",
  aiInsertEditor: "插入编辑器",
  aiErrNoKey: "尚未配置 API key，请在下方设置中填写。",
  aiErrNetwork: "网络连接失败，请检查网络或 API 地址是否可访问。",
  aiErrAuth: "API key 无效或没有权限（鉴权失败），请检查配置。",
  aiErrRateLimit: "请求过于频繁或额度不足（429），请稍后再试。",
  aiErrParse: "无法解析 AI 的响应，可能是 API 地址不正确。",
  aiErrEmpty: "AI 返回了空回复，请重试。",
  aiErrCancelled: "请求已取消。",
  aiConfig: "配置 AI 助手",
  aiCancel: "取消",
  aiSave: "保存",
  aiEmptyReply: "(空回复)",
  aiNotConfigured: "未配置",
  aiSettings: "AI 设置",
  aiAskPlaceholder: "问任何数学问题…",

  /* Plot */
  plotEmpty: "暂无图像",
  plotEmptyHint: "简单模式直接输入 sin(x) 即可绘图，或使用 plot(expr)",
  plotZoom: "缩放",
  plotPan: "平移",
  plotLegend: "图例",
  plotXAxis: "X 轴",
  plotYAxis: "Y 轴",
  plotRange: "范围",
  plotTypeCartesian: "直角坐标",
  plotTypePolar: "极坐标",
  plotTypeParametric: "参数方程",
  plotCurveSettings: "曲线设置",
  plotColor: "颜色",
  plotLineWidth: "线宽",
  plotExprY: "y =",
  plotExprR: "r(θ) =",
  plotExprX: "x(t) =",
  plotExprYParam: "y(t) =",
  plotThetaRange: "θ 范围",
  plotTRange: "t 范围",

  /* 3D plot panel — example groups */
  plot3dGroupBasic: "基础",
  plot3dGroupAdvanced: "进阶",
  plot3dExWave: "波纹",
  plot3dExSaddle: "鞍面",
  plot3dExParaboloid: "抛物面",
  plot3dExGaussian: "高斯钟形",
  plot3dExSombrero: "墨西哥帽",
  plot3dExTiltedWave: "倾斜波纹",

  /* 3D plot panel — errors & toasts */
  plot3dErrNoGeometry: "表达式未生成可绘制的几何（请确认变量为 x 和 y）",
  plot3dErrEmpty: "请输入 z = f(x, y) 表达式",
  plot3dErrEval: "表达式无法求值：{err}",
  plot3dErrEvalVars: "表达式无法求值，请检查变量是否为 x 和 y",
  plot3dErrExampleEval: "示例表达式无法求值：{err}",
  plot3dErrExampleEvalVars: "示例表达式无法求值",
  plot3dAdded: "已添加 3D 曲面",
  plot3dExampleAdded: "已添加示例曲面",

  /* 3D plot panel — input bar */
  plot3dInputPlaceholder: "输入 f(x, y)，例如 sin(x)*cos(y)",
  plot3dExprInputAria: "3D 函数表达式输入",
  plot3dAdd: "添加",
  plot3dAddSurface: "添加曲面 (Enter)",
  plot3dCollapseControls: "折叠控制面板",
  plot3dExpandControls: "展开控制面板",
  plot3dToggleControlsAria: "折叠/展开控制面板",
  plot3dResetCameraAria: "重置相机",
  plot3dResetCameraView: "重置相机视角",
  plot3dExportPngAria: "导出 PNG",
  plot3dExportScene: "导出 3D 场景为 PNG",

  /* 3D plot panel — preview */
  plot3dPreview: "预览",
  plot3dPreviewHint: "输入表达式后将显示 LaTeX 预览，例如 z = sin(x)·cos(y)",

  /* 3D plot panel — controls */
  plot3dWireframe: "线框",
  plot3dAxes: "坐标轴",
  plot3dGrid: "网格",
  plot3dAutoRotate: "自动旋转",
  plot3dResolution: "分辨率",
  plot3dGridResolutionAria: "网格分辨率",
  plot3dColorScheme: "配色",
  plot3dSchemeHeight: "高度",
  plot3dSchemeHeightAria: "按高度配色",
  plot3dSchemeMono: "单色",
  plot3dSchemeMonoAria: "单色",
  plot3dUpAxis: "上方向",
  plot3dYUp: "Y 向上",
  plot3dYUpAria: "Y 轴向上",
  plot3dZUp: "Z 向上",
  plot3dZUpAria: "Z 轴向上",

  /* 3D plot panel — examples menu & surface list */
  plot3dExamples: "示例",
  plot3dOpenExamplesAria: "打开示例菜单",
  plot3dHide: "隐藏",
  plot3dShow: "显示",
  plot3dHideSurface: "隐藏该曲面",
  plot3dShowSurface: "显示该曲面",
  plot3dRemoveSurface: "移除该曲面",
  plot3dRemoveAria: "移除",

  /* 3D plot panel — canvas overlay & expand dialog */
  plot3dZoomIn: "放大",
  plot3dZoomInAria: "放大查看 3D",
  plot3dControlsHint: "拖拽旋转 · 滚轮缩放 · 右键平移",
  plot3dExpandAria: "放大查看 3D 绘图",
  plot3dExpandTitle: "3D 曲面大图查看",
  plot3dExpandSubtitle: "{n} 个曲面 · 拖拽旋转 · 滚轮缩放 · 右键平移",
  plot3dExportPng: "导出 PNG",
  plot3dCloseAria: "关闭",

  /* 3D plot panel — error & empty states */
  plot3dSampleFailed: "3D 曲面采样失败",
  plot3dSampleFailedHint: "请修正上方表达式后重新添加，或检查变量 / 范围设置。",
  plot3dSurfacesFailed: "{n} 个曲面采样失败",
  plot3dWorkspaceTitle: "3D 曲面工作区",
  plot3dWorkspaceHintPre: "输入",
  plot3dWorkspaceHintPost: "表达式或点击下方示例，添加可自由旋转 / 缩放 / 平移的 3D 曲面。",
  plot3dWorkspaceSupported: "支持 sin / cos / exp / sqrt 等函数，变量必须为 x 和 y。",
  aiContextToggle: "附带工作台上下文",
  aiContextAttached: "已附加上下文",
  aiContextAttachedHint: "发送时会附带当前文件、绘图与变量信息",
  aiContextNoFile: "无文件",
  aiContextPlots: "绘图",
  aiContextVars: "变量",
  aiToolCallLabel: "调用",
  aiToolFailedLabel: "失败",
  aiToolArgsLabel: "参数",
  aiToolResultLabel: "结果",
  editorTabClose: "关闭标签页",
  editorTabsEmptyTitle: "没有打开的文件",
  editorTabsEmptyHint: "在左侧文件树中点击文件开始编辑",

  /* Command palette */
  cpTitle: "命令面板",
  cpPlaceholder: "输入命令…",
  cpNoResults: "无匹配结果",
  cpQuickEval: "快速求值",
  cpGroupActions: "操作",
  cpGroupView: "视图",
  cpGroupPanels: "面板",
  cpGroupLayout: "布局",
  cpGroupTemplates: "模板",
  cpRunAll: "运行全部",
  cpClearEditor: "清空编辑器",
  cpClearAllHistVars: "清除全部历史与变量",
  cpSwitchLight: "切换到浅色主题",
  cpSwitchDark: "切换到深色主题",
  cpToggleSidebar: "切换侧栏",
  cpTogglePreview: "切换预览",
  cpToggleEditor: "切换编辑器",
  cpToggleActivityBar: "切换任务栏",
  cpMoveActivityBarLeft: "任务栏移到左侧",
  cpMoveActivityBarRight: "任务栏移到右侧",
  cpLockActivityBar: "锁定任务栏",
  cpUnlockActivityBar: "解锁任务栏",
  cpAutoHideActivityBar: "任务栏自动隐藏",
  cpDisableAutoHideActivityBar: "任务栏取消自动隐藏",
  cpHideActivityBar: "隐藏任务栏",
  cpShowActivityBar: "显示任务栏",
  cpOpenSymbols: "打开：符号",
  cpOpenTemplates: "打开：模板",
  cpOpenSolver: "打开：求解器",
  cpOpenUnits: "打开：单位转换",
  cpOpenBases: "打开：进制转换",
  cpOpenHistory: "打开：历史",
  cpOpenVariables: "打开：变量",
  cpOpenGuide: "打开：指南",
  cpOpenFormulas: "打开：公式库",
  cpOpenPipeline: "打开：流水线",
  cpOpenAI: "打开：AI 助手",
  cpOpenLinalg: "打开：线性代数",

  /* Workbench layout */
  wbAllPanelsHidden: "所有面板已隐藏",
  wbAllPanelsHiddenHint: "可通过命令面板或任务栏恢复编辑器、预览区和任务栏",

  /* View modes */
  viewWorkbench: "工作台",
  viewFocus: "专注模式",
  editorLivePreview: "预览",
  editorLivePreviewHint: "输入表达式查看实时预览",

  /* Keyboard shortcuts */
  ksTitle: "键盘快捷键",
  ksEditor: "编辑器",
  ksNavigation: "导航",
  ksQuickActions: "快速操作",
  ksEvalExpression: "求值当前表达式",
  ksInsertNewLine: "插入新行",
  ksInsertIndent: "插入缩进",
  ksToggleComment: "切换注释",
  ksOpenCommandPalette: "打开命令面板",
  ksOpenCommandPaletteQuick: "快速打开命令面板",
  ksToggleSidebar: "切换侧栏",
  ksTogglePreview: "切换预览",
  ksShowShortcuts: "显示快捷键",
  ksCloseDialog: "关闭对话框",
  ksCopyRenderedText: "复制渲染文本",
  ksLoadIntoEditor: "载入编辑器",
  ksInsertAtCursor: "在光标处插入",
  ksZoomInOut: "放大 / 缩小",
  ksPanView: "平移视图",
  ksPressToShow: "按 ? 显示此面板",

  /* Symbols */
  symBasic: "基本",
  symGreek: "希腊字母",
  symCalculus: "微积分",
  symTrigonometry: "三角函数",
  symLogExp: "对数与指数",
  symLinearAlgebra: "线性代数",
  symStatistics: "统计",
  symCombinatorics: "组合",
  symConstants: "常数",
  symInsert: "插入",
  symbolPaletteTitle: "符号面板",
  symbolPaletteToggle: "切换符号面板",
  symCatInverseTrig: "反三角",
  symCatPower: "幂与根",
  symCatRounding: "取整",
  symCatComplex: "复数",

  /* Common */
  commonCopy: "复制",
  commonCopied: "已复制",
  commonInsert: "插入",
  commonCancel: "取消",
  commonConfirm: "确认",
  commonClose: "关闭",
  commonSave: "保存",
  commonDelete: "删除",
  commonEdit: "编辑",
  commonClear: "清空",
  commonReset: "重置",
  commonRun: "运行",
  commonStop: "停止",
  commonLoading: "加载中…",
  commonSearch: "搜索",
  commonYes: "是",
  commonNo: "否",
  commonError: "错误",
  commonSuccess: "成功",
  commonWarning: "警告",
  commonInfo: "信息",
  commonExpand: "展开",
  commonCollapse: "折叠",

  /* Errors */
  errInvalidExpression: "无效的表达式",
  errUndefinedVar: "未定义的变量",
  errDivisionByZero: "除以零",
  errSyntax: "语法错误",
  errTimeout: "操作超时",
  errNetwork: "网络错误",
  errAIUnavailable: "AI 服务不可用",
  errMatrixDimMismatch: "矩阵维度不匹配",
  errSingularMatrix: "矩阵为奇异矩阵",
};

const en: TranslationDict = {
  /* App / brand */
  appTitle: "OmniMath Pro",
  appSubtitle: "All-in-one scriptable AI math workbench",
  appLoading: "Initializing…",

  /* Top menu */
  menuFile: "File",
  menuEdit: "Edit",
  menuView: "View",
  menuHelp: "Help",
  menuRun: "Run",
  menuNew: "New",
  menuOpen: "Open",
  menuSave: "Save",
  menuExport: "Export",
  menuUndo: "Undo",
  menuRedo: "Redo",
  menuFind: "Find",
  menuCommandPalette: "Command Palette",
  menuToggleSidebar: "Toggle Sidebar",
  menuTogglePreview: "Toggle Preview",
  menuZoomIn: "Zoom In",
  menuZoomOut: "Zoom Out",
  menuResetZoom: "Reset Zoom",
  menuTheme: "Theme",
  menuLight: "Light",
  menuDark: "Dark",
  menuShortcuts: "Shortcuts",
  menuAbout: "About",

  /* Editor */
  editorTitle: "Editor",
  editorPlaceholder:
    "# Type a math expression and press Enter to evaluate\n# Examples:\n2 + 3 * 4\nsin(pi/4)\nx = 42\nplot(sin(x))",
  editorRun: "Run",
  editorReset: "Reset",
  editorClear: "Clear",
  editorModeSimple: "Simple",
  editorModePython: "Python",
  editorModeMatlab: "MATLAB",
  editorModeAdvanced: "Advanced",
  editorEnterToEval: "Enter to evaluate",
  editorShiftEnterNewLine: "Shift+Enter for new line",
  editorCtrlSlashComment: "Ctrl+/ to comment",
  editorVars: "vars",
  editorLines: "lines",
  editorCol: "Col",
  editorLn: "Ln",
  editorIndent: "Indent",
  editorOutdent: "Outdent",
  editorCopy: "Copy",
  editorPaste: "Paste",
  editorCut: "Cut",
  editorSelectAll: "Select All",
  editorComment: "Comment",
  editorUncomment: "Uncomment",
  editorLineComment: "Line Comment",

  /* Preview */
  previewTitle: "Preview",
  previewFormula: "Formula",
  previewPlot: "Plot",
  preview3D: "3D",
  preview3DLoading: "Loading 3D module…",
  previewLog: "Log",
  previewCopy: "Copy",
  previewInput: "Input",
  previewResult: "Result",
  previewError: "Error",
  previewEmpty: "No results yet",
  previewEmptyHint: "Type an expression in the editor and press Enter",
  previewClearAll: "Clear All",
  previewNoHistory: "No calculations yet",
  previewDownload: "Download",
  previewZoomIn: "Zoom In",
  previewZoomOut: "Zoom Out",
  previewReset: "Reset",
  previewToggleGrid: "Toggle Grid",
  previewCopyImage: "Copy Image",
  previewDownloadPNG: "Download PNG",
  previewLatex: "LaTeX",
  previewSteps: "Steps",
  previewType: "Type",

  /* Formula export */
  formulaExport: "Export Formula",
  formulaExportPNG: "Export as PNG",
  formulaExportSVG: "Export as SVG",
  formulaExportLatex: "Export as LaTeX",
  formulaExportHint: "Choose export format",

  /* Layout switching */
  layoutSwitch: "Switch Layout",
  layoutRight: "Preview on Right",
  layoutBottom: "Preview on Bottom",
  layoutCompact: "Compact Size",
  layoutLarge: "Large Preview",
  layoutSize: "Preview Size",

  /* Settings panel */
  settingsTitle: "Settings",
  settingsAppearance: "Appearance",
  settingsEditor: "Editor",
  settingsLayout: "Layout",
  settingsExport: "Export",
  settingsLanguage: "Language",
  settingsTheme: "Theme",
  settingsActivityBar: "Activity Bar",
  settingsActivityBarPosition: "Position",
  settingsActivityBarLocked: "Lock",
  settingsActivityBarAutoHide: "Auto-hide",
  settingsDefaultExportDpi: "Default Export DPI",
  settingsFormulaFontSize: "Formula Font Size",
  settingsUseMathFont: "Use Math Font",
  settingsFontPreset: "Font Preset",
  fontPresetModern: "Modern",
  fontPresetScholarly: "Scholarly",
  fontPresetSystem: "System",
  settingsResetAll: "Reset All Settings",
  settingsResetConfirm: "Are you sure you want to reset all settings? This cannot be undone.",
  settingsShortcuts: "Shortcuts",
  settingsAbout: "About",

  /* Tabs */
  tabHistory: "History",
  tabVariables: "Variables",
  tabFiles: "Files",
  tabFormulas: "Formulas",
  tabPipeline: "Pipeline",
  tabAI: "AI",
  tabLinalg: "Linalg",
  tabMatrix: "Matrix",
  tabSolver: "Solver",
  tabSymbols: "Symbols",
  tabTemplates: "Templates",
  tabUnits: "Units",
  tabBases: "Bases",
  tabGuide: "Guide",
  tabPlots: "Plots",

  /* Activity bar */
  abSymbols: "Symbols",
  abTemplates: "Templates",
  abSolver: "Equation Solver",
  abUnits: "Unit Converter",
  abBases: "Base Converter",
  abHistory: "History",
  abVariables: "Variables",
  abGuide: "Guide",
  abFormulas: "Formula Library",
  abPipeline: "Pipeline",
  abWhiteboard: "Whiteboard",
  abLayoutMenu: "Layout Options",
  abAI: "AI Assistant",
  abLinalg: "Linear Algebra",
  abMatrix: "Matrix",
  abFiles: "Files",
  abStats: "Statistics",
  abPlots: "Plots",
  abShowSidebar: "Show Sidebar",
  abHideSidebar: "Hide Sidebar",
  abToggleEditor: "Toggle Editor",
  abTogglePreview: "Toggle Preview",
  abMoveLeft: "Move Left",
  abMoveRight: "Move Right",
  abLockTaskbar: "Lock Taskbar",
  abUnlockTaskbar: "Unlock Taskbar",
  abAutoHide: "Auto-hide Taskbar",
  abDisableAutoHide: "Disable Auto-hide",
  abHideTaskbar: "Hide Taskbar",
  abShowTaskbar: "Show Taskbar",
  abLocked: "Taskbar Locked",

  /* Status */
  statusReady: "Ready",
  statusCalculating: "Calculating…",
  statusError: "Error",
  statusLines: "lines",
  statusVars: "vars",
  statusPlots: "plots",
  statusLight: "Light",
  statusDark: "Dark",
  statusCommand: "Command",
  statusCalc: "Calc",
  statusOk: "ok",
  statusErr: "err",
  statusChars: "chars",
  statusWords: "words",
  statusLang: "Language",
  statusConflicts: "conflicts",
  statusConflictTooltip: "State conflicts detected",
  statusNoConflicts: "No conflicts",
  statusConflictFix: "Fix",
  statusConflictDismiss: "Dismiss",

  /* Language */
  languageLabel: "Language",
  languageZh: "中文",
  languageEn: "English",
  languageSwitch: "Switch language",

  /* Quick calc */
  qcPlaceholder: "Quick calc…",
  qcTitle: "Quick Calc",
  qcNotepad: "Notepad",
  qcShowNotepad: "Show notepad",
  qcHideNotepad: "Hide notepad",
  qcPin: "Pin",
  qcUnpin: "Unpin",
  qcCopyResult: "Copy result",
  qcDragHint: "Drag to move",
  qcModeBasic: "Basic",
  qcModeSci: "Sci",
  qcModeProg: "Prog",
  qcModeLin: "Lin",
  qcModeConv: "Conv",
  qcSendToNotepad: "Append to notepad",
  qcHistTitle: "History",
  qcNotepadPlaceholder: "Drafts / notes…",
  qcFloatingCalc: "Floating Calculator",
  qcClearHistory: "Clear history",
  qcMemoryClear: "Memory clear",
  qcMemoryRecall: "Memory recall",

  /* History */
  histTitle: "Calculation History",
  histNoHistory: "No history yet",
  histNoHistoryHint: "Your calculations will appear here",
  histClear: "Clear History",
  histVariables: "Variables",
  histCopy: "Copy",
  histRerun: "Rerun",
  histInsert: "Insert into editor",
  histJustNow: "just now",
  histMinAgo: "min ago",
  histMinAgoPlural: "min ago",
  histHourAgo: "hour ago",
  histHourAgoPlural: "hours ago",
  histDayAgo: "day ago",
  histDayAgoPlural: "days ago",

  /* Variables */
  varsTitle: "Variables",
  varsNoVars: "No variables yet",
  varsNoVarsHint: "Assign a value in the editor to create a variable",
  varsName: "Name",
  varsValue: "Value",
  varsType: "Type",
  varsDelete: "Delete",
  varsEdit: "Edit",
  varsInsert: "Insert",
  varsSlider: "Slider",
  varsSliderHint: "Drag the slider to adjust the variable value",
  varsSliderMin: "Min",
  varsSliderMax: "Max",
  varsSliderStep: "Step",

  /* Templates */
  tplTitle: "Templates",
  tplInsert: "Insert",
  tplSearch: "Search templates…",
  tplEmpty: "No templates found",

  /* Formula library */
  formulasTitle: "Formula Library",
  formulasSearch: "Search formulas…",
  formulasCategories: "Categories",
  formulasExample: "Example",
  formulasInsertExample: "Insert example",
  formulasCategoryAlgebra: "Algebra",
  formulasCategoryGeometry: "Geometry",
  formulasCategoryTrigonometry: "Trigonometry",
  formulasCategoryCalculus: "Calculus",
  formulasCategoryStatistics: "Statistics",
  formulasCategoryPhysics: "Physics",
  formulasCategoryFinance: "Finance",
  formulasAddCustom: "Add formula",
  formulasCustom: "Custom",
  formulasName: "Name",
  formulasLatex: "LaTeX expression",
  formulasDescription: "Description",
  formulasExampleInput: "Example input",
  formulasCustomEmpty: "No custom formulas",
  formulasCategoryManage: "Manage categories",
  formulasCategoryAdd: "Add category",
  formulasCategoryName: "Category name",
  formulasCategoryColor: "Color",
  formulasCategoryEmpty: "No custom categories",
  formulasCategoryDeleteConfirm:
    "Formulas in this category will be moved to Custom. Delete this category?",

  /* Solver */
  solverTitle: "Equation Solver",
  solverEquationForm: "Equation",
  solverVariable: "Variable",
  solverSolve: "Solve",
  solverSolution: "Solution",
  solverSteps: "Steps",
  solverExamples: "Examples",
  solverInsert: "Insert into editor",
  solverEnterEquation: "Please enter an equation",
  solverError: "Failed to solve",
  solverNoSolution: "No solution",
  solverMultipleSolutions: "Multiple solutions",
  solverStepSetup: "Set up the equation",
  solverStepSolve: "Solving",
  solverStepSolution: "Solution found",

  /* Units */
  unitsTitle: "Unit Converter",
  unitsCategory: "Category",
  unitsValue: "Value",
  unitsFrom: "From",
  unitsTo: "To",
  unitsResult: "Result",
  unitsAllConversions: "All Conversions",
  unitsSwap: "Swap",
  unitsCopy: "Copy",
  unitsEnterValue: "Please enter a value",
  unitsEnterNumber: "Please enter a number",
  unitsLength: "Length",
  unitsMass: "Mass",
  unitsTemperature: "Temperature",
  unitsVolume: "Volume",
  unitsTime: "Time",
  unitsSpeed: "Speed",
  unitsArea: "Area",
  unitsEnergy: "Energy",
  unitsPressure: "Pressure",
  unitsAngle: "Angle",
  unitsData: "Data",

  /* Bases */
  basesTitle: "Base Converter",
  basesInput: "Input",
  basesBinary: "Binary",
  basesOctal: "Octal",
  basesDecimal: "Decimal",
  basesHex: "Hexadecimal",
  basesBits: "Bits",
  basesConversions: "All Bases",
  basesInsert: "Insert into editor",
  basesInvalidNumber: "Invalid number",
  basesEnterNumber: "Please enter a number",
  basesInputTag: "Input",

  /* Linear algebra */
  linalgTitle: "Linear Algebra",
  linalgMatrixA: "Matrix A",
  linalgMatrixB: "Matrix B",
  linalgResult: "Result",
  linalgDet: "Determinant",
  linalgInv: "Inverse",
  linalgTranspose: "Transpose",
  linalgRank: "Rank",
  linalgTrace: "Trace",
  linalgEig: "Eigenvalues",
  linalgAdd: "A + B",
  linalgSub: "A - B",
  linalgMul: "A × B",
  linalgSolve: "Solve Ax = b",
  linalgLu: "LU Decomposition",
  linalgQr: "QR Decomposition",
  linalgInsert: "Insert into editor",
  linalgError: "Matrix operation error",
  linalgEmpty: "Please enter a matrix",

  /* Statistics */
  statsTitle: "Statistics",
  statsTabRegression: "Regression",
  statsHistogram: "Histogram",
  statsBoxPlot: "Box Plot",
  statsScatterPlot: "Scatter",
  statsDatasets: "Datasets",
  statsSaveCurrent: "Save Current Data",
  statsLoad: "Load",
  statsExportCSV: "Export CSV",
  statsImportCSV: "Import CSV",
  statsNoDatasets: "No saved datasets",
  statsDatasetSaved: "Dataset saved",
  statsDatasetDeleted: "Dataset deleted",
  statsDatasetLoaded: "Dataset loaded",
  statsXData: "X data",
  statsYData: "Y data",
  statsRegressionEquation: "Regression equation",
  statsSlope: "Slope a",
  statsIntercept: "Intercept b",
  statsRSquared: "R²",
  statsFitGood: "Excellent fit",
  statsFitModerate: "Good fit",
  statsFitWeak: "Weak fit",
  statsFitPoor: "Poor fit",
  statsNeedPairs: "Need at least 2 valid (x, y) pairs",
  statsDistChiSquare: "Chi-square χ²(df)",
  statsDistT: "t-distribution t(df)",
  statsDistF: "F-distribution F(d1, d2)",
  statsDistGeometric: "Geometric Geo(p)",
  statsDistNegBinomial: "Negative Binomial NB(r, p)",
  statsDiscreteNoPlot: "Discrete distributions cannot send PDF curve",

  /* Matrix editor */
  matrixTitle: "Matrix Editor",
  matrixRows: "Rows",
  matrixCols: "Cols",
  matrixAddRow: "Add Row",
  matrixAddCol: "Add Col",
  matrixDelRow: "Delete Row",
  matrixDelCol: "Delete Col",
  matrixClear: "Clear",
  matrixIdentity: "Identity",
  matrixFill: "Fill",
  matrixRandom: "Random",

  /* Linear algebra panel — extended */
  linalgTabEdit: "Matrix Editor",
  linalgTabOps: "Operations",
  linalgTabDecomp: "Decomposition",
  linalgTabSystem: "Linear System",
  linalgTabTransform: "Transform",
  linalgNewMatrix: "New Matrix",
  linalgPaste: "Paste from Text",
  linalgSave: "Save to Variable",
  linalgPreview: "Live Preview",
  linalgIdentity: "Identity",
  linalgZeros: "Zeros",
  linalgRandom: "Random",
  linalgQuickFill: "Quick Fill",
  linalgOpsA: "Matrix A",
  linalgOpsB: "Matrix B",
  linalgOperation: "Operation",
  linalgScalar: "Scalar k",
  linalgPower: "Power k",
  linalgCompute: "Compute",
  linalgSteps: "Steps",
  linalgSingular: "Matrix is singular",
  linalgDimMismatch: "Dimension mismatch",
  linalgNonSquare: "Matrix is not square",
  linalgNotPositiveDef: "Matrix is not positive definite",
  linalgMatrixSize: "Size",
  linalgNameInUse: "Variable name already in use",
  linalgDeleteConfirm: "Delete this matrix?",
  linalgPasteHint: "Paste TSV / CSV / MATLAB format, e.g.:\n1,2,3\n4,5,6\nor [1,2;3,4]",
  linalgPasteConfirm: "Parse & Fill",
  linalgPasteInvalid: "Cannot parse as matrix",
  linalgSaved: "Saved to variable",

  /* Decomposition */
  linalgDecompType: "Decomposition",
  linalgDecompose: "Decompose",
  linalgLmatrix: "L matrix",
  linalgUmatrix: "U matrix",
  linalgPmatrix: "P matrix",
  linalgQmatrix: "Q matrix",
  linalgRmatrix: "R matrix",
  linalgSmatrix: "Σ matrix",
  linalgVmatrix: "V matrix",
  linalgEigenvalues: "Eigenvalues",
  linalgEigenvectors: "Eigenvectors",
  linalgJordan: "Jordan Form",
  linalgCholesky: "Cholesky",
  linalgNotSupported: "This decomposition type is not supported; please pick another",
  linalgSchur: "Schur Decomposition",
  linalgTmatrix: "T matrix",

  /* Linear system */
  linalgSolveAxb: "Solve Ax = b",
  linalgConstVec: "Constant vector b",
  linalgUniqueSolution: "Unique solution",
  linalgNoSolution: "No solution",
  linalgInfiniteSolution: "Infinitely many solutions",
  linalgParticularSolution: "Particular solution",
  linalgNullSpace: "Null space basis",
  linalgAugmented: "Augmented [A | b]",
  linalgGaussSteps: "Gaussian elimination steps",
  linalgAddRow: "Row op",
  linalgSwapRows: "Swap rows",
  linalgSingularHint: "det(A) = 0; system may have no solution or infinitely many.",
  linalgConstVecSize: "Length of b must equal number of rows in A",

  /* Vector operations tab */
  linalgTabVector: "Vector Ops",
  linalgVectorA: "Vector A",
  linalgVectorB: "Vector B",
  linalgVectorInputHint: "comma or space separated numbers",
  linalgDotProduct: "Dot product",
  linalgCrossProduct: "Cross product",
  linalgMagnitude: "Magnitude",
  linalgAngle: "Angle",
  linalgProjection: "Projection",
  linalgGramSchmidt: "Gram-Schmidt",
  linalgVectorDimMismatch: "Vector dimension mismatch",
  linalgCross3DOnly: "Cross product only supports 3D vectors",
  linalgOrthogonalized: "Orthogonalized vectors",
  linalgGramSchmidtHint: "one vector per line, comma or space separated",
  linalgGramSchmidtSteps: "Orthogonalization steps",

  /* Matrix norms & properties */
  linalgNormsProps: "Matrix Norms & Properties",
  linalgNorm1: "1-Norm",
  linalgNormInf: "∞-Norm",
  linalgNormFrobenius: "Frobenius Norm",
  linalgNormSpectral: "Spectral Norm",
  linalgSymmetric: "Symmetric",
  linalgPositiveDefinite: "Positive Definite",
  linalgInvertible: "Invertible",
  linalgOrthogonal: "Orthogonal",

  /* Homogeneous system & enhanced infinite solution */
  linalgHomogeneousSystem: "Homogeneous system",
  linalgNonHomogeneousSystem: "Non-homogeneous system",
  linalgFreeVars: "Free variables",
  linalgGeneralSolution: "General solution",
  linalgFundamentalSystem: "Fundamental solution system",

  /* Linear algebra workbench — Task 11 */
  linalgMatrixLib: "Matrix Library",
  linalgDeleteMatrix: "Delete matrix",
  linalgNeedSquare: "Matrix must be square",
  linalgSavedVar: "Saved: {name}",
  linalgAddRowBtn: "Add row",
  linalgDelRowBtn: "Del row",
  linalgAddColBtn: "Add col",
  linalgDelColBtn: "Del col",
  linalgSaveToVar: "Save to variable →",
  linalgKatexPreview: "KaTeX Preview",
  linalgPasteExpandHint: "Tip: supports pasting TSV / CSV / MATLAB style [1,2;3,4]; auto-expands the target grid.",
  linalgMatrixEmpty: "Matrix is empty",
  linalgMatrixBEmpty: "Matrix B is empty",
  linalgDimMismatchMul: "Dimension mismatch: A({ar}×{ac}) × B({br}×{bc})",
  linalgDimMismatchBin: "Dimension mismatch: A({ar}×{ac}) vs B({br}×{bc})",
  linalgSingularNonInv: "Singular matrix, not invertible",
  linalgUnknownOp: "Unknown operation",
  linalgCalcError: "Calculation error",
  linalgOperandA: "Operand A",
  linalgOperandB: "Operand B",
  linalgPowerInt: "Power k (integer)",
  linalgCalcResult: "Result",
  linalgDerivationSteps: "Derivation steps",
  linalgOpsInputPrompt: "Select operands and operation, then click \"Compute\"",
  linalgEigenDecomp: "Eigen decomposition",
  linalgSvdNotSupportedItem: "SVD (unsupported)",
  linalgSvdNotSupported: "mathjs has no built-in SVD; use \"Eigen decomposition\" instead",
  linalgSvdNotSupportedNote: "mathjs provides no SVD implementation; use QR or eigen decomposition instead",
  linalgNotSupportedShort: "Not supported",
  linalgMatrixLabel: "Matrix",
  linalgDecompInputPrompt: "Select a matrix and decomposition method, then click \"Decompose\"",
  linalgCholeskyNotSymmetric: "Not symmetric; cannot perform Cholesky decomposition",
  linalgCholeskyNotPosDef: "Not positive definite; cannot perform Cholesky decomposition",
  linalgCholeskyNote: "A = L · L^T  (requires symmetric positive-definite)",
  linalgConstVecSizeMismatch: "Constant vector length must equal the number of matrix rows",
  linalgSolveError: "Solve error",
  linalgSystemInputPrompt: "Fill in the coefficient matrix and constant vector, then click \"Solve\"",
  linalgRankInfo: "rank(A) = {rankA}, rank([A|b]) = {rankAug}",
  linalgUnknownsInfo: ", unknowns n = {n}",
  linalgFreeVarsCount: ", free vars = {n}",
  linalgFreeVarsColon: "Free variables: ",
  linalgCountItems: " ({n})",
  linalgOmittedSteps: "omitted {n} row operations",
  linalgRowReduced: "Row reduced: ",
  linalgSystemNoSolution: "System has no solution",
  linalgBackSubstitution: "Back-substitution: ",
  linalgFreeVarsLatex: "Free variables: ",
  linalgGeneralSolutionLatex: "General solution: ",
  linalgLinearlyDependent: "linearly dependent, skipped",
  linalgMaxIndepRows: "max number of linearly independent rows",
  linalgInvertibleLatex: " invertible",
  linalgTimesOp: " times",

  /* Solver panel — extended */
  solverTabEquation: "Equation",
  solverTabSystem: "System",
  solverTabCalculus: "Calculus",
  solverTabNumeric: "Numeric Roots",
  solverEquationPlaceholder: "e.g. x^2 - 5*x + 6 = 0 or sin(x) = 0.5",
  solverRange: "Root range",
  solverNoRoots: "No real roots found",
  solverFoundRoots: "Roots found",
  solverRealRoots: "Real roots",
  solverComplexRoots: "Complex roots",
  solverPolynomialInfo: "Polynomial info",
  solverSystemPlaceholder: "One equation per line, e.g.:\nx + y = 5\nx - y = 1",
  solverSystemSolve: "Solve System",
  solverSystemSolution: "System solution",
  solverSystemInvalid: "Some equations failed to parse",
  solverSystemCount: "Equations",
  solverSystemParseFail: "Failed to parse equations",
  solverCalcDerivative: "Derivative",
  solverCalcIntegral: "Integral",
  solverCalcLimit: "Limit",
  solverCalcTaylor: "Taylor Series",
  solverCalcInput: "Expression f(x)",
  solverCalcVar: "Variable",
  solverCalcLower: "Lower",
  solverCalcUpper: "Upper",
  solverCalcPoint: "Approaches",
  solverCalcOrder: "Order",
  solverCalcCompute: "Compute",
  solverCalcResult: "Result",
  solverNumericFunction: "f(x)",
  solverNumericRange: "Interval [a, b]",
  solverNumericMethod: "Method",
  solverNumericBisection: "Bisection",
  solverNumericNewton: "Newton",
  solverNumericIter: "Iterations",
  solverNumericRoot: "Root",
  solverNumericCompute: "Solve",
  solverNumericGuess: "Initial x0",
  solverNumericTolerance: "Tolerance",
  solverNumericNoSignChange: "Endpoints have the same sign; bisection cannot proceed.",
  solverResultLabel: "Result",

  /* Solver workbench — Task 11 */
  solverNavEquation: "Equation",
  solverNavEquationDesc: "Polynomial / transcendental roots",
  solverNavSystem: "System",
  solverNavSystemDesc: "Linear system step-by-step elimination",
  solverNavDerivative: "Derivative",
  solverNavDerivativeDesc: "Step-by-step derivative · rules",
  solverNavIntegral: "Integral",
  solverNavIntegralDesc: "Indefinite / definite · numeric fallback",
  solverNavLimit: "Limit",
  solverNavLimitDesc: "Symbolic limit · numeric fallback",
  solverSendToPlot2D: "Send to 2D Plot",
  solverSentToPlot2D: "Sent to 2D plot",
  solverSelectExample: "Select example…",
  solverSolveMode: "Solve mode",
  solverNumericSolution: "Numeric",
  solverSymbolicSolution: "Symbolic",
  solverSolveResult: "Solution",
  solverInputPrompt: "Enter an equation and click \"Solve\"",
  solverSymbolicFallback: "⚠️ Symbolic solve failed, fell back to numeric",
  solverKindPolynomial: "🧮 Polynomial · ",
  solverKindTranscendental: "📈 Transcendental · ",
  solverKindSymbolic: "🔤 Symbolic · ",
  solverSystemInput: "System (one equation per line)",
  solverNonlinearSystem: "Nonlinear system",
  solverNumericMethodNote: "Numerical method notes",
  solverUniqueSolution: "Unique solution",
  solverSystemInputPrompt: "Enter a system and click \"Solve System\"",
  solverDerivativeOrder: "Derivative order",
  solverOrder1: "1st",
  solverOrder2: "2nd",
  solverOrder3: "3rd",
  solverDerivativeResult: "Derivative",
  solverDerivativeInputPrompt: "Enter an expression and click \"Derivative\"",
  solverDefiniteIntegral: "Definite",
  solverIndefiniteIntegral: "Indefinite",
  solverIntegralResult: "Integral",
  solverIntegralInputPrompt: "Enter an expression and click \"Integral\"",
  solverNumericResult: "Numeric result ≈",
  solverPointMustBeNumber: "Point must be a number or inf",
  solverPointPlaceholder: "0 or inf",
  solverComputeLimit: "Compute Limit",
  solverLimitResult: "Limit",
  solverLimitInputPrompt: "Enter an expression and click \"Compute Limit\"",
  solverWorkbenchTitle: "Solver",
  solverFooterHint: "Step-by-step: rules / elimination / integral hints",
  /* Solver example groups */
  solverExPolynomial: "Polynomial",
  solverExTranscendental: "Transcendental",
  solverExLinearSystem: "Linear system",
  solverExNonlinear: "Nonlinear (numeric notes)",
  solverDerivExRules: "Product / Quotient / Chain",
  solverDerivExPoly: "Polynomial / Composite",
  solverIntegralExBasic: "Basic",
  solverIntegralExAdvanced: "Advanced",
  solverLimitExClassic: "Classic limits",
  solverLimitExInfinite: "Infinite limits",
  /* Solver example hints */
  solverHintFactor: "Factoring",
  solverHintCubic: "Cubic",
  solverHintComplexRoots: "Complex roots",
  solverHintNumeric: "Numeric",
  solverHintLog: "Logarithmic",
  solverHint2VarLinear: "2-var linear",
  solverHint3VarLinear: "3-var linear",
  solverHintNonlinear: "Nonlinear",
  solverHintProductRule: "Product rule",
  solverHintQuotientRule: "Quotient rule",
  solverHintChainRule: "Chain rule",
  solverHintPowerRule: "Power rule",
  solverHintPowerFunc: "Power function",
  solverHintTrigFunc: "Trig function",
  solverHintExpFunc: "Exponential",
  solverHintLogIntegral: "Logarithmic integral",
  solverHintByParts: "Integration by parts",
  solverHintSubstitution: "Substitution",
  solverHintArctan: "Arctangent",
  solverHintDefOfE: "Definition of e",
  /* Solver example labels */
  solverLabel2x2Linear: "2×2 linear",
  solverLabel3x3Linear: "3×3 linear",
  solverLabelHasQuadratic: "Has quadratic term",

  /* Pipeline / nodes */
  pipelineTitle: "Computation Pipeline",
  pipelineEnterView: "Enter pipeline view",
  pipelineAddNode: "Add Node",
  pipelineRun: "Run",
  pipelineClear: "Clear",
  pipelineEmpty: "Canvas is empty",
  pipelineEmptyHint: "Add nodes to build a computation pipeline",
  pipelineNodeInput: "Input",
  pipelineNodeOp: "Operation",
  pipelineNodeOutput: "Output",
  pipelineNodePlot: "Plot",
  pipelineNodeSolve: "Solve",
  pipelineConnect: "Connect",
  pipelineDisconnect: "Disconnect",
  pipelineDelete: "Delete",
  pipelineDuplicate: "Duplicate",
  pipelineAutoLayout: "Auto Layout",
  pipelineExport: "Export",

  /* Node-pipeline UI (Task 6) */
  npBackToWorkbench: "Back to workbench",
  npDoubleClickHint: "Double-click canvas to add a node",
  npExported: "Exported to editor",
  npConnecting: "Connecting…",
  npInvalidConnection: "Incompatible port types",
  npRunAll: "Run",
  npClearAll: "Clear",
  npExportScript: "Export script",
  npResetView: "Reset view",
  npZoomIn: "Zoom in",
  npZoomOut: "Zoom out",
  npResult: "Result",
  npError: "Error",
  npEmpty: "Empty pipeline",
  npAddNodeTitle: "Add node",
  npAddNodeHint: "Click to add to canvas",
  npCategoryInput: "Input",
  npCategoryOp: "Operation",
  npCategoryFunction: "Function",
  npCategoryPlot: "Plot",
  npCategoryMatrix: "Linear algebra",
  npCategoryCalculus: "Calculus",
  npCategoryOutput: "Output",
  npNumberInput: "Number input",
  npExpressionInput: "Expression input",
  npVariable: "Variable",
  npArithmetic: "Arithmetic",
  npFunctionApply: "Function",
  npPlotOutput: "Plot",
  npMatrixInput: "Matrix",
  npMatrixOp: "Matrix op",
  npDerivative: "Derivative",
  npIntegrate: "Integrate",
  npMatrixDecompose: "Matrix decompose",
  npSymbolicIntegrate: "Symbolic integrate",
  npSimplify: "Simplify",
  npSolveEquation: "Solve equation",
  npDecompMethod: "Method",
  npSearchRange: "Search range",
  npEvaluate: "Evaluate",
  npDisplay: "Display",
  npPortValue: "value",
  npPortA: "a",
  npPortB: "b",
  npPortX: "x",
  npPortExpr: "expr",
  npPortMatrix: "matrix",
  npPortResult: "result",
  npPortPlot: "plot",
  npValue: "Value",
  npMin: "Min",
  npMax: "Max",
  npStep: "Step",
  npExpression: "Expression",
  npVarName: "Variable name",
  npNoVariables: "No variables",
  npDependsOn: "Depends on",
  npOperator: "Operator",
  npFunction: "Function",
  npCustom: "Custom",
  npCustomExpr: "Custom expression",
  npXMin: "x min",
  npXMax: "x max",
  npMatrixSize: "Matrix size",
  npAddRow: "Add row",
  npAddCol: "Add column",
  npDelRow: "Delete row",
  npDelCol: "Delete column",
  npLowerBound: "Lower bound",
  npUpperBound: "Upper bound",
  npVariable_: "Variable",
  npNodes: "nodes",
  npEdges: "edges",
  npConstant: "Constant",
  npConstantName: "Constant",
  npMatrixMultiply: "Matrix multiply",
  npTemplates: "Templates",
  npFitView: "Fit view",
  npMinimap: "Minimap",

  /* AI */
  aiTitle: "AI Assistant",
  aiPlaceholder: "Ask the AI…",
  aiSend: "Send",
  aiStop: "Stop",
  aiClear: "Clear",
  aiThinking: "Thinking…",
  aiWelcome: "Hi! I'm the OmniMath AI assistant.",
  aiWelcomeHint: "Ask me to explain formulas, solve equations, or plot graphs.",
  aiInputPlaceholder: "Ask any math question…",
  aiSuggest1: "Explain Euler's identity",
  aiSuggest2: "Solve x^2 - 5x + 6 = 0",
  aiSuggest3: "Plot sin(x)",
  aiExplain: "Explain",
  aiSolve: "Solve",
  aiPlot: "Plot",
  aiStep: "Step-by-step",
  aiCopy: "Copy",
  aiInsertEditor: "Insert to editor",
  aiErrNoKey: "API key not configured. Please fill it in settings below.",
  aiErrNetwork: "Network connection failed. Check your network or API URL.",
  aiErrAuth: "Invalid API key or insufficient permissions.",
  aiErrRateLimit: "Rate limited or quota exceeded (429). Try again later.",
  aiErrParse: "Cannot parse AI response. The API URL may be incorrect.",
  aiErrEmpty: "AI returned an empty reply. Please retry.",
  aiErrCancelled: "Request cancelled.",
  aiConfig: "Configure AI Assistant",
  aiCancel: "Cancel",
  aiSave: "Save",
  aiEmptyReply: "(empty reply)",
  aiNotConfigured: "Not configured",
  aiSettings: "AI Settings",
  aiAskPlaceholder: "Ask any math question…",

  /* Plot */
  plotEmpty: "No plots yet",
  plotEmptyHint: "In simple mode just type sin(x), or use plot(expr)",
  plotZoom: "Zoom",
  plotPan: "Pan",
  plotLegend: "Legend",
  plotXAxis: "X axis",
  plotYAxis: "Y axis",
  plotRange: "Range",
  plotTypeCartesian: "Cartesian",
  plotTypePolar: "Polar",
  plotTypeParametric: "Parametric",
  plotCurveSettings: "Curve Settings",
  plotColor: "Color",
  plotLineWidth: "Line width",
  plotExprY: "y =",
  plotExprR: "r(θ) =",
  plotExprX: "x(t) =",
  plotExprYParam: "y(t) =",
  plotThetaRange: "θ range",
  plotTRange: "t range",

  /* 3D plot panel — example groups */
  plot3dGroupBasic: "Basic",
  plot3dGroupAdvanced: "Advanced",
  plot3dExWave: "Ripple",
  plot3dExSaddle: "Saddle",
  plot3dExParaboloid: "Paraboloid",
  plot3dExGaussian: "Gaussian bell",
  plot3dExSombrero: "Sombrero",
  plot3dExTiltedWave: "Tilted ripple",

  /* 3D plot panel — errors & toasts */
  plot3dErrNoGeometry: "Expression produced no drawable geometry (confirm variables are x and y)",
  plot3dErrEmpty: "Please enter a z = f(x, y) expression",
  plot3dErrEval: "Expression could not be evaluated: {err}",
  plot3dErrEvalVars: "Expression could not be evaluated; check that variables are x and y",
  plot3dErrExampleEval: "Example expression could not be evaluated: {err}",
  plot3dErrExampleEvalVars: "Example expression could not be evaluated",
  plot3dAdded: "3D surface added",
  plot3dExampleAdded: "Example surface added",

  /* 3D plot panel — input bar */
  plot3dInputPlaceholder: "Enter f(x, y), e.g. sin(x)*cos(y)",
  plot3dExprInputAria: "3D function expression input",
  plot3dAdd: "Add",
  plot3dAddSurface: "Add surface (Enter)",
  plot3dCollapseControls: "Collapse controls panel",
  plot3dExpandControls: "Expand controls panel",
  plot3dToggleControlsAria: "Toggle controls panel",
  plot3dResetCameraAria: "Reset camera",
  plot3dResetCameraView: "Reset camera view",
  plot3dExportPngAria: "Export PNG",
  plot3dExportScene: "Export 3D scene as PNG",

  /* 3D plot panel — preview */
  plot3dPreview: "Preview",
  plot3dPreviewHint: "LaTeX preview appears after typing, e.g. z = sin(x)·cos(y)",

  /* 3D plot panel — controls */
  plot3dWireframe: "Wireframe",
  plot3dAxes: "Axes",
  plot3dGrid: "Grid",
  plot3dAutoRotate: "Auto-rotate",
  plot3dResolution: "Resolution",
  plot3dGridResolutionAria: "Grid resolution",
  plot3dColorScheme: "Color scheme",
  plot3dSchemeHeight: "Height",
  plot3dSchemeHeightAria: "Color by height",
  plot3dSchemeMono: "Solid",
  plot3dSchemeMonoAria: "Solid color",
  plot3dUpAxis: "Up axis",
  plot3dYUp: "Y up",
  plot3dYUpAria: "Y axis up",
  plot3dZUp: "Z up",
  plot3dZUpAria: "Z axis up",

  /* 3D plot panel — examples menu & surface list */
  plot3dExamples: "Examples",
  plot3dOpenExamplesAria: "Open examples menu",
  plot3dHide: "Hide",
  plot3dShow: "Show",
  plot3dHideSurface: "Hide this surface",
  plot3dShowSurface: "Show this surface",
  plot3dRemoveSurface: "Remove this surface",
  plot3dRemoveAria: "Remove",

  /* 3D plot panel — canvas overlay & expand dialog */
  plot3dZoomIn: "Zoom",
  plot3dZoomInAria: "Expand 3D view",
  plot3dControlsHint: "Drag to rotate · Scroll to zoom · Right-click to pan",
  plot3dExpandAria: "Expand 3D plot view",
  plot3dExpandTitle: "3D Surface Expanded View",
  plot3dExpandSubtitle: "{n} surfaces · Drag to rotate · Scroll to zoom · Right-click to pan",
  plot3dExportPng: "Export PNG",
  plot3dCloseAria: "Close",

  /* 3D plot panel — error & empty states */
  plot3dSampleFailed: "3D surface sampling failed",
  plot3dSampleFailedHint: "Fix the expression above and re-add it, or check variables / range settings.",
  plot3dSurfacesFailed: "{n} surfaces failed to sample",
  plot3dWorkspaceTitle: "3D Surface Workspace",
  plot3dWorkspaceHintPre: "Enter",
  plot3dWorkspaceHintPost: "an expression or click an example below to add a freely rotatable / zoomable / pannable 3D surface.",
  plot3dWorkspaceSupported: "Supports sin / cos / exp / sqrt and more; variables must be x and y.",
  aiContextToggle: "Attach workbench context",
  aiContextAttached: "Context attached",
  aiContextAttachedHint: "The current file, plots and variables are sent with each message",
  aiContextNoFile: "No file",
  aiContextPlots: "Plots",
  aiContextVars: "Variables",
  aiToolCallLabel: "Call",
  aiToolFailedLabel: "Failed",
  aiToolArgsLabel: "Arguments",
  aiToolResultLabel: "Result",
  editorTabClose: "Close tab",
  editorTabsEmptyTitle: "No open files",
  editorTabsEmptyHint: "Click a file in the file tree to start editing",

  /* Command palette */
  cpTitle: "Command Palette",
  cpPlaceholder: "Type a command…",
  cpNoResults: "No matching results",
  cpQuickEval: "Quick evaluate",
  cpGroupActions: "Actions",
  cpGroupView: "View",
  cpGroupPanels: "Panels",
  cpGroupLayout: "Layout",
  cpGroupTemplates: "Templates",
  cpRunAll: "Run All",
  cpClearEditor: "Clear Editor",
  cpClearAllHistVars: "Clear All History & Variables",
  cpSwitchLight: "Switch to Light Theme",
  cpSwitchDark: "Switch to Dark Theme",
  cpToggleSidebar: "Toggle Sidebar",
  cpTogglePreview: "Toggle Preview",
  cpToggleEditor: "Toggle Editor",
  cpToggleActivityBar: "Toggle Activity Bar",
  cpMoveActivityBarLeft: "Move Activity Bar Left",
  cpMoveActivityBarRight: "Move Activity Bar Right",
  cpLockActivityBar: "Lock Activity Bar",
  cpUnlockActivityBar: "Unlock Activity Bar",
  cpAutoHideActivityBar: "Auto-hide Activity Bar",
  cpDisableAutoHideActivityBar: "Disable Activity Bar Auto-hide",
  cpHideActivityBar: "Hide Activity Bar",
  cpShowActivityBar: "Show Activity Bar",
  cpOpenSymbols: "Open: Symbols",
  cpOpenTemplates: "Open: Templates",
  cpOpenSolver: "Open: Equation Solver",
  cpOpenUnits: "Open: Unit Converter",
  cpOpenBases: "Open: Base Converter",
  cpOpenHistory: "Open: History",
  cpOpenVariables: "Open: Variables",
  cpOpenGuide: "Open: Guide",
  cpOpenFormulas: "Open: Formula Library",
  cpOpenPipeline: "Open: Pipeline",
  cpOpenAI: "Open: AI Assistant",
  cpOpenLinalg: "Open: Linear Algebra",

  /* Workbench layout */
  wbAllPanelsHidden: "All panels are hidden",
  wbAllPanelsHiddenHint: "Restore editor, preview, or activity bar via the command palette or activity bar",

  /* View modes */
  viewWorkbench: "Workbench",
  viewFocus: "Focus Mode",
  editorLivePreview: "Preview",
  editorLivePreviewHint: "Type an expression to see live preview",

  /* Keyboard shortcuts */
  ksTitle: "Keyboard Shortcuts",
  ksEditor: "Editor",
  ksNavigation: "Navigation",
  ksQuickActions: "Quick Actions",
  ksEvalExpression: "Evaluate current expression",
  ksInsertNewLine: "Insert new line",
  ksInsertIndent: "Insert indent",
  ksToggleComment: "Toggle comment",
  ksOpenCommandPalette: "Open command palette",
  ksOpenCommandPaletteQuick: "Quick open command palette",
  ksToggleSidebar: "Toggle sidebar",
  ksTogglePreview: "Toggle preview",
  ksShowShortcuts: "Show shortcuts",
  ksCloseDialog: "Close dialog",
  ksCopyRenderedText: "Copy rendered text",
  ksLoadIntoEditor: "Load into editor",
  ksInsertAtCursor: "Insert at cursor",
  ksZoomInOut: "Zoom in / out",
  ksPanView: "Pan view",
  ksPressToShow: "Press ? to show this panel",

  /* Symbols */
  symBasic: "Basic",
  symGreek: "Greek",
  symCalculus: "Calculus",
  symTrigonometry: "Trigonometry",
  symLogExp: "Log & Exp",
  symLinearAlgebra: "Linear Algebra",
  symStatistics: "Statistics",
  symCombinatorics: "Combinatorics",
  symConstants: "Constants",
  symInsert: "Insert",
  symbolPaletteTitle: "Symbol Palette",
  symbolPaletteToggle: "Toggle Symbol Palette",
  symCatInverseTrig: "Inverse Trig",
  symCatPower: "Power & Root",
  symCatRounding: "Rounding",
  symCatComplex: "Complex",

  /* Common */
  commonCopy: "Copy",
  commonCopied: "Copied",
  commonInsert: "Insert",
  commonCancel: "Cancel",
  commonConfirm: "Confirm",
  commonClose: "Close",
  commonSave: "Save",
  commonDelete: "Delete",
  commonEdit: "Edit",
  commonClear: "Clear",
  commonReset: "Reset",
  commonRun: "Run",
  commonStop: "Stop",
  commonLoading: "Loading…",
  commonSearch: "Search",
  commonYes: "Yes",
  commonNo: "No",
  commonError: "Error",
  commonSuccess: "Success",
  commonWarning: "Warning",
  commonInfo: "Info",
  commonExpand: "Expand",
  commonCollapse: "Collapse",

  /* Errors */
  errInvalidExpression: "Invalid expression",
  errUndefinedVar: "Undefined variable",
  errDivisionByZero: "Division by zero",
  errSyntax: "Syntax error",
  errTimeout: "Operation timed out",
  errNetwork: "Network error",
  errAIUnavailable: "AI service unavailable",
  errMatrixDimMismatch: "Matrix dimension mismatch",
  errSingularMatrix: "Matrix is singular",
};

/* ============================================================
   Dictionary registry
   ============================================================ */
const dictionaries: Record<Locale, TranslationDict> = {
  "zh-CN": zhCN,
  en,
};

/* ============================================================
   Module-level state (synchronous, no async)
   ============================================================ */
let currentLocale: Locale = "zh-CN";

export const DEFAULT_LOCALE: Locale = "zh-CN";

export const LOCALES: Locale[] = ["zh-CN", "en"];

/** Get the current locale. */
export function getLocale(): Locale {
  return currentLocale;
}

/** Set the current locale. Triggers a re-render of any component using t(). */
export function setLocale(locale: Locale): void {
  if (locale === currentLocale) return;
  if (!(locale in dictionaries)) return;
  currentLocale = locale;
  // Notify subscribers (lightweight pub/sub for React stores)
  notifySubscribers();
}

/** Translate a key in the current locale. Falls back to zh-CN, then to the key itself. */
export function t<K extends keyof TranslationDict>(key: K): string {
  const dict = dictionaries[currentLocale] ?? zhCN;
  const value = dict[key];
  if (value !== undefined && value !== "") return value;
  // Fallback to default locale
  const fallback = zhCN[key];
  if (fallback !== undefined) return fallback;
  // Last resort — return the key itself so missing keys are visible
  return String(key);
}

/** Translate with parameter interpolation: t("statusLines", { n: 42 }) → "42 行" */
export function tf<K extends keyof TranslationDict>(
  key: K,
  params: Record<string, string | number>,
): string {
  let value = t(key);
  for (const [k, v] of Object.entries(params)) {
    value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }
  return value;
}

/* ============================================================
   Lightweight pub/sub — lets React components re-render on locale change
   Components can useLocale() hook to subscribe.
   ============================================================ */
type Listener = () => void;
const listeners = new Set<Listener>();

function notifySubscribers(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      // Ignore listener errors — never let one bad subscriber break others.
    }
  }
}

/** Subscribe to locale changes. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/* ============================================================
   React hook — useLocale
   Components using i18n should call this to re-render on locale change.
   ============================================================ */
import { useSyncExternalStore } from "react";

export function useLocale(): Locale {
  return useSyncExternalStore(
    subscribe,
    getLocale,
    getLocale, // server snapshot
  );
}

/** Hook that returns a bound t() function that updates on locale change. */
export function useT(): <K extends keyof TranslationDict>(key: K) => string {
  useLocale(); // subscribe to locale changes
  return t;
}
