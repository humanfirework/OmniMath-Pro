/**
 * OmniMath Pro — Pipeline templates
 *
 * Self-contained, working example pipelines that demonstrate the
 * different capabilities of the node graph. Loaded from the "模板"
 * dropdown in the pipeline toolbar; replaces the current canvas state.
 *
 * Each template ships with cascade-laid-out nodes (~280px apart
 * horizontally) and correct port-to-port edges so `executePipeline`
 * runs them without further wiring.
 */

import type { PipelineNode, PipelineEdge } from './pipelineEngine';

export interface TemplateOnLoad {
  viewMode?: string;
  activePreviewTab?: string;
}

export interface PipelineTemplate {
  /** Stable identifier (used as a React key in the dropdown). */
  id: string;
  /** Chinese display name shown in the dropdown. */
  name: string;
  /** Short Chinese description shown under the name. */
  description: string;
  /** i18n key for name (preferred over raw name when available). */
  nameKey?: string;
  /** i18n key for description (preferred over raw description when available). */
  descriptionKey?: string;
  /** Template category tag (e.g. 'vision', 'matrix'). */
  category?: string;
  /** Thumbnail accent color (hex). */
  thumbnailColor?: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  /** Optional auto-actions to trigger after template is loaded. */
  onLoad?: TemplateOnLoad;
}

/* ------------------------------------------------------------------ *
 * Edge helper — keeps edge IDs unique within a template and makes
 * the wiring declarative/readable.
 * ------------------------------------------------------------------ */
function edge(
  id: string,
  from: string,
  fromPort: string,
  to: string,
  toPort: string,
): PipelineEdge {
  return { id, from, fromPort, to, toPort };
}

/* ------------------------------------------------------------------ *
 * Template 1 — 综合数学展示（基础运算 + 三角函数 + 矩阵求逆 + 导数 + 复合函数）
 *
 *   把几个经典数学能力合并到一张蓝图上，分 5 条独立分支并行演示：
 *     A. 基础运算：a + b × c（运算优先级）
 *     B. 三角函数可视化：sin(x) → 绘图
 *     C. 矩阵求逆：3×3 → 求逆 → 显示
 *     D. 导数求解：x³+2x² → 求导 → 显示
 *     E. 复合函数：数字 → sin → abs → 显示
 *   一次看清 OmniMath 的数学节点能力，直观展示「功能多」。
 * ------------------------------------------------------------------ */
const templateMathShowcase: PipelineTemplate = {
  id: 'math-showcase',
  name: '综合数学展示（运算 · 三角 · 矩阵 · 导数 · 复合）',
  description: '一张蓝图并行演示：基础运算、三角函数可视化、矩阵求逆、导数求解、复合函数。直观展示数学节点能力。',
  category: 'math',
  thumbnailColor: '#6366f1',
  nodes: [
    // ── 分支 A：基础运算 a + b × c（运算优先级）──
    { id: 'm_a', type: 'number-input', position: { x: 80, y: 120 }, config: { value: 3, min: -10, max: 10, step: 0.1 }, group: { id: 'grp-op', title: '基础运算' } },
    { id: 'm_b', type: 'number-input', position: { x: 80, y: 280 }, config: { value: 4, min: -10, max: 10, step: 0.1 }, group: { id: 'grp-op', title: '基础运算' } },
    { id: 'm_c', type: 'number-input', position: { x: 80, y: 440 }, config: { value: 5, min: -10, max: 10, step: 0.1 }, group: { id: 'grp-op', title: '基础运算' } },
    { id: 'm_mul', type: 'arithmetic', position: { x: 380, y: 280 }, config: { op: '*' }, group: { id: 'grp-op', title: '基础运算' } },
    { id: 'm_add', type: 'arithmetic', position: { x: 680, y: 190 }, config: { op: '+' }, group: { id: 'grp-op', title: '基础运算' } },
    { id: 'm_disp1', type: 'display', position: { x: 980, y: 190 }, config: {} , group: { id: 'grp-op', title: '基础运算' } },
    // ── 分支 B：三角函数可视化 sin(x) ──
    { id: 'm_exprB', type: 'expression-input', position: { x: 80, y: 760 }, config: { expr: 'sin(x)' }, group: { id: 'grp-trig', title: '三角函数可视化' } },
    { id: 'm_plotB', type: 'plot-output', position: { x: 380, y: 760 }, config: { xMin: -10, xMax: 10 }, group: { id: 'grp-trig', title: '三角函数可视化' } },
    // ── 分支 C：矩阵求逆 ──
    {
      id: 'm_matC',
      type: 'matrix-input',
      position: { x: 80, y: 1040 },
      group: { id: 'grp-matrix', title: '矩阵求逆' },
      config: {
        cells: [
          [{ value: '1' }, { value: '2' }, { value: '3' }],
          [{ value: '0' }, { value: '1' }, { value: '4' }],
          [{ value: '5' }, { value: '6' }, { value: '0' }],
        ],
        rows: 3,
        cols: 3,
      },
    },
    { id: 'm_invC', type: 'matrix-op', position: { x: 380, y: 1040 }, config: { op: 'inv' }, group: { id: 'grp-matrix', title: '矩阵求逆' } },
    { id: 'm_dispC', type: 'display', position: { x: 680, y: 1040 }, config: {}, group: { id: 'grp-matrix', title: '矩阵求逆' } },
    // ── 分支 D：导数求解 ──
    { id: 'm_exprD', type: 'expression-input', position: { x: 80, y: 1320 }, config: { expr: 'x^3 + 2*x^2' }, group: { id: 'grp-derivative', title: '导数求解' } },
    { id: 'm_derivD', type: 'derivative', position: { x: 380, y: 1320 }, config: { variable: 'x' }, group: { id: 'grp-derivative', title: '导数求解' } },
    { id: 'm_dispD', type: 'display', position: { x: 680, y: 1320 }, config: {}, group: { id: 'grp-derivative', title: '导数求解' } },
    // ── 分支 E：复合函数 sin → abs ──
    { id: 'm_nE', type: 'number-input', position: { x: 80, y: 1600 }, config: { value: 1.5, min: -10, max: 10, step: 0.1 }, group: { id: 'grp-composite', title: '复合函数' } },
    { id: 'm_sinE', type: 'function-apply', position: { x: 380, y: 1600 }, config: { fn: 'sin', customExpr: '' }, group: { id: 'grp-composite', title: '复合函数' } },
    { id: 'm_absE', type: 'function-apply', position: { x: 680, y: 1600 }, config: { fn: 'abs', customExpr: '' }, group: { id: 'grp-composite', title: '复合函数' } },
    { id: 'm_dispE', type: 'display', position: { x: 980, y: 1600 }, config: {}, group: { id: 'grp-composite', title: '复合函数' } },
  ],
  edges: [
    // A
    edge('m_e1', 'm_a', 'value', 'm_add', 'a'),
    edge('m_e2', 'm_b', 'value', 'm_mul', 'a'),
    edge('m_e3', 'm_c', 'value', 'm_mul', 'b'),
    edge('m_e4', 'm_mul', 'result', 'm_add', 'b'),
    edge('m_e5', 'm_add', 'result', 'm_disp1', 'value'),
    // B
    edge('m_e6', 'm_exprB', 'value', 'm_plotB', 'expr'),
    // C
    edge('m_e7', 'm_matC', 'matrix', 'm_invC', 'matrix'),
    edge('m_e8', 'm_invC', 'result', 'm_dispC', 'value'),
    // D
    edge('m_e9', 'm_exprD', 'value', 'm_derivD', 'expr'),
    edge('m_e10', 'm_derivD', 'result', 'm_dispD', 'value'),
    // E
    edge('m_e11', 'm_nE', 'value', 'm_sinE', 'x'),
    edge('m_e12', 'm_sinE', 'result', 'm_absE', 'x'),
    edge('m_e13', 'm_absE', 'result', 'm_dispE', 'value'),
  ],
};

const templateImageVectorizationQuickstart: PipelineTemplate = {
  id: 'image-vectorization-quickstart',
  name: '图像矢量化快速入门',
  description: '从图片识别边缘 → 拟合贝塞尔曲线 → 叠加到 2D 画布。上传图片、点击运行，一键生成矢量轮廓。',
  nameKey: 'templates.imageVectorization.name',
  category: 'vision',
  descriptionKey: 'templates.imageVectorization.description',
  thumbnailColor: '#6366f1',
  nodes: [
    { id: 'img-in-1', type: 'image-input', position: { x: 80, y: 220 }, config: {} },
    { id: 'fine-1', type: 'fine-outline', position: { x: 420, y: 220 }, config: { imageType: 'auto', preset: 'normal', eps: 1.1 } },
    { id: 'cf-1', type: 'curve-fit', position: { x: 760, y: 220 }, config: { maxError: 1.5, maxSegments: 8, smooth: 0.3, flipY: true, flipX: false, scale: 1 } },
    { id: 'pc-1', type: 'plot-curves', position: { x: 1100, y: 220 }, config: { color: '#a78bfa', width: 2, flipX: false, flipY: true } },
  ],
  edges: [
    edge('e1', 'img-in-1', 'image', 'fine-1', 'image'),
    edge('e2', 'fine-1', 'contours', 'cf-1', 'contours'),
    edge('e3', 'cf-1', 'curves', 'pc-1', 'curves'),
  ],
  onLoad: {
    viewMode: 'pipeline',
    activePreviewTab: 'plot2d',
  },
};

/* ------------------------------------------------------------------ *
 * Template 6b — 线稿/草图矢量化（替代旧的「原始 Sobel/Canny 边缘检测」管线）
 *
 * 旧模板直接把 Sobel/Canny 全量边缘当曲线输出 → 线条爆炸、渲染卡顿、看不清。
 * 改为「线稿提取」管线，专为手绘线稿/示意图/白底黑线图优化：
 *   image → grayscale-threshold(multi) → contour-trace → curve-fit(smooth) → plot-curves
 *   - 多级阈值只保留「暗色前景线」，天然滤掉白底噪点；
 *   - smooth 拟合 + 较高误差阈值 → 曲线少而光滑，不卡顿；
 *   - 默认即出干净轮廓，开箱即用。
 * ------------------------------------------------------------------ */
const templateLineArt: PipelineTemplate = {
  id: 'line-art-extraction',
  name: '线稿/草图矢量化',
  description: '线稿/手绘图/示意图：灰度 → 多级阈值 → 轮廓追踪 → 贝塞尔拟合 → 2D 画布。专为线稿与草图优化，曲线简洁、渲染不卡顿。',
  category: 'vision',
  thumbnailColor: '#22d3ee',
  nodes: [
    { id: 'la_in', type: 'image-input', position: { x: 80, y: 220 }, config: {} },
    { id: 'la_gt', type: 'grayscale-threshold', position: { x: 360, y: 220 }, config: { method: 'multi', levels: 3 } },
    { id: 'la_ct', type: 'contour-trace', position: { x: 640, y: 220 }, config: { turdsize: 3, skeletonize: false } },
    { id: 'la_cf', type: 'curve-fit', position: { x: 920, y: 220 }, config: { fitMode: 'bezier', quality: 'smooth', errorThreshold: 2.0, flipY: true, flipX: false, scale: 1 } },
    { id: 'la_pc', type: 'plot-curves', position: { x: 1200, y: 220 }, config: { color: '#22d3ee', width: 2, flipX: false, flipY: true } },
  ],
  edges: [
    edge('la1', 'la_in', 'image', 'la_gt', 'image'),
    edge('la2', 'la_gt', 'binary', 'la_ct', 'image'),
    edge('la3', 'la_ct', 'contours', 'la_cf', 'contours'),
    edge('la4', 'la_cf', 'curves', 'la_pc', 'curves'),
  ],
  onLoad: { viewMode: 'pipeline', activePreviewTab: 'plot2d' },
};

/* ------------------------------------------------------------------ *
 * Template 6c — 人物姿态追踪（视频）
 *   video → frame-extract → pose-track → curve-animate
 *   用 MediaPipe Pose 对视频/GIF 逐帧检测人体关键点，把动作轨迹
 *   变成可播放的曲线动画（One Euro 平滑）。适合「识别一个人的姿态/动作」。
 *   注意：需在 video-input 节点选择视频/GIF 后运行；MediaPipe 模型
 *   首次加载需联网下载，失败时该节点会给出友好错误，其余节点不受影响。
 * ------------------------------------------------------------------ */
const templatePoseTrack: PipelineTemplate = {
  id: 'pose-track-animation',
  name: '人物姿态追踪',
  description: 'video → 抽帧 → MediaPipe 人体姿态关键点 → 曲线动画。追踪人物的动作轨迹并平滑成可播放动画。',
  category: 'vision',
  thumbnailColor: '#f43f5e',
  nodes: [
    { id: 'pt_video', type: 'video-input', position: { x: 80, y: 220 }, config: {} },
    { id: 'pt_frame', type: 'frame-extract', position: { x: 360, y: 220 }, config: { maxFrames: 120, fps: 30 } },
    { id: 'pt_pose', type: 'pose-track', position: { x: 640, y: 220 }, config: { smooth: true, minCutoff: 1.0, beta: 0.007 } },
    { id: 'pt_anim', type: 'curve-animate', position: { x: 920, y: 220 }, config: { color: '#f43f5e', width: 2, smooth: false } },
  ],
  edges: [
    edge('pt1', 'pt_video', 'video', 'pt_frame', 'video'),
    edge('pt2', 'pt_frame', 'frames', 'pt_pose', 'frames'),
    edge('pt3', 'pt_pose', 'animation', 'pt_anim', 'animation'),
  ],
  onLoad: { viewMode: 'pipeline', activePreviewTab: 'plot2d' },
};

/* ------------------------------------------------------------------ *
 * Template 6d — 视频转曲线动画
 *   video → frame-extract → curve-animate（frames 路径）
 *   curve-animate 的 frames 输入会走 videoToCurves：逐帧矢量化 +
 *   帧间质心关联 + Savitzky-Golay 时域平滑，产出随时间演化的曲线动画。
 *   适合把「运动物体的轮廓/轨迹」变成曲线。
 * ------------------------------------------------------------------ */
const templateVideoToCurves: PipelineTemplate = {
  id: 'video-to-curves-animation',
  name: '视频转曲线动画 · Beta',
  description: 'video → 抽帧 → 逐帧矢量化 + 帧间关联 + 时域平滑 → 可播放曲线动画。把视频里的运动轮廓变成平滑稳定的曲线（降帧 + 加大平滑，识别更稳、不卡顿）。',
  category: 'vision',
  thumbnailColor: '#8b5cf6',
  nodes: [
    { id: 'vc_video', type: 'video-input', position: { x: 80, y: 220 }, config: {} },
    { id: 'vc_frame', type: 'frame-extract', position: { x: 360, y: 220 }, config: { maxFrames: 90, fps: 30, maxDimension: 512 } },
    { id: 'vc_anim', type: 'curve-animate', position: { x: 640, y: 220 }, config: { color: '#8b5cf6', width: 2, stride: 2, maxFrames: 36, matchDistance: 64, sgWindow: 9, sgOrder: 2 } },
  ],
  edges: [
    edge('vc1', 'vc_video', 'video', 'vc_frame', 'video'),
    edge('vc2', 'vc_frame', 'frames', 'vc_anim', 'frames'),
  ],
  onLoad: { viewMode: 'pipeline', activePreviewTab: 'plot2d' },
};

/* ------------------------------------------------------------------ *
 * Template 7 — 一阶 ODE 闭环仿真（开环 vs 闭环对比，Simulink 风格）
 *   闭环：step → (sum: −feedback) → gain → integrator → scope
 *   开环：step → gain → integrator → scope（无反馈）
 *   两条路径共享同一阶跃信源，直观对比「反馈使输出收敛到设定值」vs
 *   「开环积分持续发散」，是所有控制原理教程的经典开篇图。
 * ------------------------------------------------------------------ */
const templateOdeLoop: PipelineTemplate = {
  id: 'ode-feedback-loop',
  name: '一阶系统反馈仿真',
  description: '开环 vs 闭环对比：闭环(负反馈)收敛到设定值，开环积分发散。演示反馈回路与 ODE 数值求解（Euler / RK4）。',
  category: 'simulation',
  thumbnailColor: '#a78bfa',
  nodes: [
    // 共享阶跃信源
    { id: 's_sp', type: 'sim-step', position: { x: 60, y: 200 }, config: { stepTime: 0, initialValue: 0, finalValue: 1 } },
    // —— 闭环支路：step → sum(−feedback) → gain → integrator → scope ——
    { id: 's_sum', type: 'sim-sum', position: { x: 320, y: 120 }, config: { signs: '+-' } },
    { id: 's_gain', type: 'sim-gain', position: { x: 560, y: 120 }, config: { gain: 2 } },
    { id: 's_int', type: 'sim-integrator', position: { x: 800, y: 120 }, config: { initialCondition: 0 } },
    { id: 's_scope', type: 'sim-scope', position: { x: 1040, y: 120 }, config: {} },
    // —— 开环支路：step → gain → integrator → scope（无反馈）——
    { id: 's_ol_gain', type: 'sim-gain', position: { x: 320, y: 300 }, config: { gain: 2 } },
    { id: 's_ol_int', type: 'sim-integrator', position: { x: 560, y: 300 }, config: { initialCondition: 0 } },
    { id: 's_ol_scope', type: 'sim-scope', position: { x: 800, y: 300 }, config: {} },
  ],
  edges: [
    // 闭环
    edge('s1', 's_sp', 'out', 's_sum', 'in1'),
    edge('s2', 's_int', 'out', 's_sum', 'in2'),
    edge('s3', 's_sum', 'out', 's_gain', 'u'),
    edge('s4', 's_gain', 'out', 's_int', 'u'),
    edge('s5', 's_int', 'out', 's_scope', 'u'),
    // 开环
    edge('s6', 's_sp', 'out', 's_ol_gain', 'u'),
    edge('s7', 's_ol_gain', 'out', 's_ol_int', 'u'),
    edge('s8', 's_ol_int', 'out', 's_ol_scope', 'u'),
  ],
  onLoad: { viewMode: 'pipeline', activePreviewTab: 'plot2d' },
};

/* ------------------------------------------------------------------ *
 * Template 8 — 一阶惯性环节阶跃响应（Simulink 经典 First-Order）
 *   step → first-order(1/(Ts+1)) → scope
 *   展示 Saturation 限幅与一阶惯性环节的响应曲线。
 * ------------------------------------------------------------------ */
const templateStepResponse: PipelineTemplate = {
  id: 'first-order-response',
  name: '一阶惯性环节阶跃响应',
  description: '阶跃 → 一阶惯性环节(1/(Ts+1)) → 饱和 → 示波器。观察时间常数 T 对上升曲线的影响。',
  category: 'simulation',
  thumbnailColor: '#f59e0b',
  nodes: [
    { id: 'f_step', type: 'sim-step', position: { x: 60, y: 120 }, config: { stepTime: 0, initialValue: 0, finalValue: 1 } },
    { id: 'f_fo', type: 'sim-first-order', position: { x: 340, y: 120 }, config: { timeConstant: 1, initialOutput: 0 } },
    { id: 'f_sat', type: 'sim-saturation', position: { x: 620, y: 120 }, config: { lowerLimit: 0, upperLimit: 0.8 } },
    { id: 'f_scope', type: 'sim-scope', position: { x: 900, y: 120 }, config: {} },
  ],
  edges: [
    edge('f1', 'f_step', 'out', 'f_fo', 'u'),
    edge('f2', 'f_fo', 'out', 'f_sat', 'u'),
    edge('f3', 'f_sat', 'out', 'f_scope', 'u'),
  ],
  onLoad: { viewMode: 'pipeline', activePreviewTab: 'plot2d' },
};

/* ------------------------------------------------------------------ *
 * Template 9 — 自动控制：传递函数分析（极点/伯德图/阶跃响应）
 *   单个 sim-transfer-fn 节点，由分子/分母多项式一键生成
 *   极点、伯德幅相曲线与阶跃响应，结果送入独立结果面板。
 * ------------------------------------------------------------------ */
const templateTransferFunction: PipelineTemplate = {
  id: 'transfer-function',
  name: '自动控制：传递函数分析',
  description: '传递函数 H(s)=1/(s²+3s+2)：一键生成极点、伯德图（幅值/相位）与阶跃响应。',
  category: 'simulation',
  thumbnailColor: '#f59e0b',
  nodes: [
    { id: 'tf_fn', type: 'sim-transfer-fn', position: { x: 120, y: 140 }, config: { num: '1', den: 's^2+3s+2', fMin: 0.01, fMax: 1000, tEnd: 10 } },
  ],
  edges: [],
  onLoad: { viewMode: 'pipeline', activePreviewTab: 'plot2d' },
};

/* ------------------------------------------------------------------ *
 * Template 10 — PID 闭环控制（比例 + 积分 + 微分，一阶对象）
 *   step(设定值 r) → Σ −y → 误差 e → { P 支路 Kp·e, I 支路 Ki∫e, D 支路 Kd·e' }
 *   → 控制器输出 u → 一阶对象(1/(Ts+1)) → 示波器(输出 y)
 *   反馈 y → Σ（负反馈）。经典 PID 整定，观察设定值跟踪与稳态误差消除。
 *   这是「自动控制实验」里做的最多的闭环整定仿真。
 * ------------------------------------------------------------------ */
const templatePidControl: PipelineTemplate = {
  id: 'pid-closed-loop',
  name: 'PID 闭环控制（设定值跟踪）',
  description: 'step → 比较器(误差) → PID(比例/积分/微分) → 一阶对象 → 示波器，输出负反馈。演示 PID 整定消除稳态误差、改善响应。',
  category: 'simulation',
  thumbnailColor: '#10b981',
  nodes: [
    { id: 'pid_step', type: 'sim-step', position: { x: 60, y: 200 }, config: { stepTime: 0, initialValue: 0, finalValue: 1 } },
    { id: 'pid_err', type: 'sim-sum', position: { x: 300, y: 200 }, config: { signs: '+-' } },
    // P / I / D 三支路
    { id: 'pid_gp', type: 'sim-gain', position: { x: 520, y: 120 }, config: { gain: 3 } },
    { id: 'pid_gi', type: 'sim-gain', position: { x: 520, y: 240 }, config: { gain: 2 } },
    { id: 'pid_int', type: 'sim-integrator', position: { x: 720, y: 240 }, config: { initialCondition: 0 } },
    { id: 'pid_der', type: 'sim-derivative', position: { x: 520, y: 360 }, config: { initialCondition: 0 } },
    { id: 'pid_gd', type: 'sim-gain', position: { x: 720, y: 360 }, config: { gain: 0.5 } },
    // 控制器输出求和 → 对象
    { id: 'pid_sum1', type: 'sim-sum', position: { x: 920, y: 180 }, config: { signs: '++' } },
    { id: 'pid_sum2', type: 'sim-sum', position: { x: 1100, y: 180 }, config: { signs: '++' } },
    { id: 'pid_plant', type: 'sim-first-order', position: { x: 1300, y: 180 }, config: { timeConstant: 1, initialOutput: 0 } },
    { id: 'pid_scope', type: 'sim-scope', position: { x: 1520, y: 180 }, config: {} },
  ],
  edges: [
    edge('pid1', 'pid_step', 'out', 'pid_err', 'in1'),
    edge('pid2', 'pid_err', 'out', 'pid_gp', 'u'),
    edge('pid3', 'pid_err', 'out', 'pid_gi', 'u'),
    edge('pid4', 'pid_err', 'out', 'pid_der', 'u'),
    edge('pid5', 'pid_gi', 'out', 'pid_int', 'u'),
    edge('pid6', 'pid_der', 'out', 'pid_gd', 'u'),
    edge('pid7', 'pid_gp', 'out', 'pid_sum1', 'in1'),
    edge('pid8', 'pid_int', 'out', 'pid_sum1', 'in2'),
    edge('pid9', 'pid_sum1', 'out', 'pid_sum2', 'in1'),
    edge('pid10', 'pid_gd', 'out', 'pid_sum2', 'in2'),
    edge('pid11', 'pid_sum2', 'out', 'pid_plant', 'u'),
    edge('pid12', 'pid_plant', 'out', 'pid_scope', 'u'),
    edge('pid13', 'pid_plant', 'out', 'pid_err', 'in2'),
  ],
  onLoad: { viewMode: 'pipeline', activePreviewTab: 'plot2d' },
};

/* ------------------------------------------------------------------ *
 * Template 11 — 二阶系统：质量-弹簧-阻尼（欠阻尼振荡）
 *   动力学：m·x'' + c·x' + k·x = F
 *   状态：x₁=x（输出），x₂=x'（速度）
 *   x₁' = x₂，x₂' = (F − c·x₂ − k·x₁)/m
 *   step(F) → Σ(F−c·x') → Σ(…−k·x) → 1/m → ∫x₂ → ∫x₁ → 示波器
 *   反馈：x₂(速度)→c gain 至第一和；x₁(位移)→k gain 至第二和。
 *   经典「二阶系统阻尼/固有频率」实验。
 * ------------------------------------------------------------------ */
const templateSpringDamper: PipelineTemplate = {
  id: 'mass-spring-damper',
  name: '二阶质量-弹簧-阻尼系统',
  description: '外力 F → 二重积分(质量块) → 位移，速度/位移反馈分别乘 c、k 构成阻尼与弹簧力。观察欠阻尼振荡、固有频率与阻尼比影响。',
  category: 'simulation',
  thumbnailColor: '#0ea5e9',
  nodes: [
    { id: 'msd_f', type: 'sim-step', position: { x: 60, y: 200 }, config: { stepTime: 0, initialValue: 0, finalValue: 1 } },
    { id: 'msd_s1', type: 'sim-sum', position: { x: 300, y: 200 }, config: { signs: '+-' } },
    { id: 'msd_s2', type: 'sim-sum', position: { x: 500, y: 200 }, config: { signs: '+-' } },
    { id: 'msd_inv', type: 'sim-gain', position: { x: 700, y: 200 }, config: { gain: 1 } },
    { id: 'msd_v', type: 'sim-integrator', position: { x: 900, y: 200 }, config: { initialCondition: 0 } },
    { id: 'msd_x', type: 'sim-integrator', position: { x: 1100, y: 200 }, config: { initialCondition: 0 } },
    { id: 'msd_scope', type: 'sim-scope', position: { x: 1300, y: 200 }, config: {} },
    // 阻尼反馈：c·x'（速度）
    { id: 'msd_c', type: 'sim-gain', position: { x: 900, y: 320 }, config: { gain: 0.4 } },
    // 弹簧反馈：k·x（位移）
    { id: 'msd_k', type: 'sim-gain', position: { x: 1100, y: 320 }, config: { gain: 1 } },
  ],
  edges: [
    edge('msd1', 'msd_f', 'out', 'msd_s1', 'in1'),
    edge('msd2', 'msd_s1', 'out', 'msd_s2', 'in1'),
    edge('msd3', 'msd_s2', 'out', 'msd_inv', 'u'),
    edge('msd4', 'msd_inv', 'out', 'msd_v', 'u'),
    edge('msd5', 'msd_v', 'out', 'msd_x', 'u'),
    edge('msd6', 'msd_x', 'out', 'msd_scope', 'u'),
    edge('msd7', 'msd_v', 'out', 'msd_c', 'u'),
    edge('msd8', 'msd_c', 'out', 'msd_s1', 'in2'),
    edge('msd9', 'msd_x', 'out', 'msd_k', 'u'),
    edge('msd10', 'msd_k', 'out', 'msd_s2', 'in2'),
  ],
  onLoad: { viewMode: 'pipeline', activePreviewTab: 'plot2d' },
};

/* ------------------------------------------------------------------ *
 * Template 12 — PI 控制 + 执行器饱和（积分饱和 windup）
 *   step → Σ −y → PI → Saturation(0..1) → 一阶对象 → 示波器
 *   反馈 y → Σ。当控制器输出被饱和限幅时，积分项继续累积，恢复后
 *   产生明显超调（积分饱和）。这是「过程控制实验」最重要的非线性现象。
 * ------------------------------------------------------------------ */
const templateSatIntegral: PipelineTemplate = {
  id: 'saturation-integral-windup',
  name: 'PI 控制 + 执行器饱和（积分饱和）',
  description: 'step → PI → Saturation(0..1) → 一阶对象 → 输出负反馈。执行器饱和时积分继续累积，恢复后超调——演示积分饱和 windup。',
  category: 'simulation',
  thumbnailColor: '#f59e0b',
  nodes: [
    { id: 'sw_step', type: 'sim-step', position: { x: 60, y: 200 }, config: { stepTime: 0, initialValue: 0, finalValue: 1 } },
    { id: 'sw_err', type: 'sim-sum', position: { x: 300, y: 200 }, config: { signs: '+-' } },
    { id: 'sw_gp', type: 'sim-gain', position: { x: 520, y: 140 }, config: { gain: 6 } },
    { id: 'sw_gi', type: 'sim-gain', position: { x: 520, y: 260 }, config: { gain: 3 } },
    { id: 'sw_int', type: 'sim-integrator', position: { x: 720, y: 260 }, config: { initialCondition: 0 } },
    { id: 'sw_sum', type: 'sim-sum', position: { x: 920, y: 200 }, config: { signs: '++' } },
    { id: 'sw_sat', type: 'sim-saturation', position: { x: 1120, y: 200 }, config: { lowerLimit: 0, upperLimit: 1 } },
    { id: 'sw_plant', type: 'sim-first-order', position: { x: 1320, y: 200 }, config: { timeConstant: 1, initialOutput: 0 } },
    { id: 'sw_scope', type: 'sim-scope', position: { x: 1520, y: 200 }, config: {} },
  ],
  edges: [
    edge('sw1', 'sw_step', 'out', 'sw_err', 'in1'),
    edge('sw2', 'sw_err', 'out', 'sw_gp', 'u'),
    edge('sw3', 'sw_err', 'out', 'sw_gi', 'u'),
    edge('sw4', 'sw_gi', 'out', 'sw_int', 'u'),
    edge('sw5', 'sw_int', 'out', 'sw_sum', 'in2'),
    edge('sw6', 'sw_gp', 'out', 'sw_sum', 'in1'),
    edge('sw7', 'sw_sum', 'out', 'sw_sat', 'u'),
    edge('sw8', 'sw_sat', 'out', 'sw_plant', 'u'),
    edge('sw9', 'sw_plant', 'out', 'sw_scope', 'u'),
    edge('sw10', 'sw_plant', 'out', 'sw_err', 'in2'),
  ],
  onLoad: { viewMode: 'pipeline', activePreviewTab: 'plot2d' },
};

export const PIPELINE_TEMPLATES: PipelineTemplate[] = [
  templateMathShowcase,
  templateImageVectorizationQuickstart,
  templateLineArt,
  templatePoseTrack,
  templateVideoToCurves,
  templateOdeLoop,
  templateStepResponse,
  templateTransferFunction,
  templatePidControl,
  templateSpringDamper,
  templateSatIntegral,
];

/**
 * Load a template by id, returning a deep-cloned { nodes, edges } so the
 * caller can mutate freely without polluting the shared template objects.
 * Returns null if the id is unknown.
 */
export function loadTemplate(
  id: string,
): { nodes: PipelineNode[]; edges: PipelineEdge[] } | null {
  const tpl = PIPELINE_TEMPLATES.find((t) => t.id === id);
  if (!tpl) return null;
  // Configs only contain JSON-safe primitives + nested arrays of cell
  // objects, so a structured clone keeps the shared template immutable.
  return {
    nodes: tpl.nodes.map((n) => ({
      ...n,
      position: { ...n.position },
      config: structuredClone(n.config) as Record<string, unknown>,
    })),
    edges: tpl.edges.map((e) => ({ ...e })),
  };
}
