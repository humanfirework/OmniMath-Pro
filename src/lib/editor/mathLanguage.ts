/**
 * OmniMath Pro — Math StreamLanguage for CodeMirror
 *
 * A lightweight tokenizer for the "Simple" and "MATLAB" input modes.
 * Recognizes: comments, numbers, strings, function names, keywords,
 * operators, and variables.
 *
 * This is NOT a full parser — it's for syntax highlighting only.
 * Actual evaluation is done by mathjs in the engine.
 */

import { tags as t } from '@lezer/highlight';
import type { StreamParser } from '@codemirror/language';

interface State {
  inString: boolean;
  stringChar: string;
}

export const KEYWORDS = [
  'plot', 'polarplot', 'polar', 'solve', 'derivative', 'integrate',
  'limit', 'taylor', 'eigenvectors', 'if', 'else', 'for', 'while',
  'function', 'return', 'break', 'continue', 'end',
  'elseif', 'switch', 'case', 'otherwise', 'try', 'catch', 'global', 'persistent',
];

export const FUNCTIONS = [
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'log', 'log10', 'log2', 'ln', 'lg', 'exp',
  'sqrt', 'cbrt', 'abs', 'sign', 'floor', 'ceil', 'round', 'fix',
  'min', 'max', 'gcd', 'lcm', 'mod', 'rem',
  'factorial', 'gamma', 'erf', 'erfc',
  'real', 'imag', 'conj', 'arg', 'angle',
  'det', 'inv', 'transpose', 'ctranspose', 'trace', 'rank',
  'rref', 'lu', 'qr', 'cholesky', 'svd',
  'eye', 'zeros', 'ones', 'rand',
  'sum', 'prod', 'cumsum', 'cumprod', 'diff', 'sort',
  'reshape', 'size', 'length', 'numel',
  'simplify', 'rationalize', 'derivative',
  // 绘图命令（含 3D 曲面；大小写均可，与引擎 preprocess 一致）
  'plot', 'plot2d', 'plot3d', 'surface', 'surf', 'polar', 'polarplot',
  // MATLAB 常用命令 / 脚本级函数
  'fplot', 'syms', 'disp', 'hold', 'grid', 'xlabel', 'ylabel', 'title',
  'legend', 'axis', 'clc', 'clear', 'whos', 'pause', 'fprintf', 'figure',
];

/**
 * MATLAB 风格函数签名 / 文档数据。
 *
 * 用于为数学编辑器提供"类 MATLAB"的体验：
 *  1. 补全面板里的函数签名摘要（`info`）；
 *  2. 悬浮在函数名上时弹出签名 + 参数说明的文档浮窗（hoverTooltip）；
 *  3. 输入函数名后键入 `(` 时，可弹出参数提示（signature help / 函数设计弹窗）。
 *
 * 每个条目：{ signature, args, doc, params? }。
 *  - signature：完整调用签名（用于浮窗标题与补全摘要）。
 *  - args：参数名数组（用于逐个高亮 / 提示）。
 *  - doc：简短中文说明（用于浮窗正文）。
 *  - params：可选，functionSignatures.json 风格的参数元数据（kind / type / default）。
 *    用于在"函数设计弹窗"中区分必选/可选参数并展示默认值 —— 复刻 MATLAB 编辑器体验。
 */
export type MathArgKind = 'required' | 'optional' | 'flag' | 'namevalue';

export interface MathFnParam {
  name: string;
  /** 参数类别：required 必选 / optional 可选 / flag 标志 / namevalue 名值对。 */
  kind: MathArgKind;
  /** 期望类型（char / numeric / matrix / function handle / ...）。 */
  type?: string;
  /** 默认值（可选参数时展示）。 */
  default?: string;
  /** 该参数的一句话说明。 */
  doc?: string;
}

export interface MathFnInfo {
  signature: string;
  args: string[];
  doc: string;
  /** functionSignatures.json 风格参数元数据（可选，用于增强弹窗）。 */
  params?: MathFnParam[];
}

/**
 * MATLAB 语句片段（snippet）—— 复刻 MATLAB 编辑器 / VS Code 的代码片段补全。
 *
 * 在补全面板中，用 ` @snippet` 类型列出；选中后插入对应控制流模板，
 * 并把光标定位到第一个可编辑位置（如条件 / 上下界 / 函数签名）。
 */
export interface MatlabStatement {
  /** 补全候选的显示标签。 */
  label: string;
  /** 一句中文说明。 */
  detail: string;
  /** 生成模板文本；`indent` 为当前行的前导空白。 */
  template: (indent: string) => string;
  /** 插入后光标应落在模板中「第一个可编辑处」的占位字符（首个 occurrence）。 */
  cursorPlaceholder: string;
}

export const MATLAB_STATEMENTS: MatlabStatement[] = [
  {
    label: 'if  …end  条件分支',
    detail: 'if / elseif / else 条件语句',
    cursorPlaceholder: '条件',
    template: (ind) => ['if 条件', `${ind}\t语句`, `${ind}else`, `${ind}\t语句`, `${ind}end`].join('\n'),
  },
  {
    label: 'for  …end  循环',
    detail: 'for 循环（默认 1..n 步进 1）',
    cursorPlaceholder: 'i',
    template: (ind) => [`for i = 1:n`, `${ind}\t语句`, `${ind}end`].join('\n'),
  },
  {
    label: 'while  …end  循环',
    detail: 'while 循环（条件成立时执行）',
    cursorPlaceholder: '条件',
    template: (ind) => [`while 条件`, `${ind}\t语句`, `${ind}end`].join('\n'),
  },
  {
    label: 'function  …end  函数',
    detail: '定义函数 function [y] = f(x)',
    cursorPlaceholder: '输入',
    template: (ind) => {
      const prefix = ind ? ind.slice(0, -1) : '';
      return [
        `function [输出] = 函数名(输入)`,
        `${prefix}\t% 在此编写函数体`,
        `${prefix}\t输出 = 表达式;`,
        `${prefix}end`,
      ].join('\n');
    },
  },
  {
    label: 'switch  …case  …end  分支',
    detail: 'switch / case / otherwise 多分支',
    cursorPlaceholder: '表达式',
    template: (ind) => [
      'switch 表达式',
      `${ind}\tcase 值1`,
      `${ind}\t\t语句`,
      `${ind}\tcase 值2`,
      `${ind}\t\t语句`,
      `${ind}\totherwise`,
      `${ind}\t\t语句`,
      `${ind}end`,
    ].join('\n'),
  },
  {
    label: 'plot(x, y)  绘图',
    detail: 'MATLAB 绘图模板',
    cursorPlaceholder: 'x',
    template: (ind) => [
      `x = 0:0.01:2*pi;`,
      `y = sin(x);`,
      `plot(x, y);`,
      `xlabel('x'); ylabel('y');`,
      `title('示例'); grid on;`,
    ].join(`\n${ind}`),
  },
  {
    label: 'solve(方程, 变量)  解方程',
    detail: '符号求解方程',
    cursorPlaceholder: '方程',
    template: () => `syms x\nsol = solve(方程, x);\ndisp(sol);`,
  },
  {
    label: 'fplot(表达式)  函数绘图',
    detail: 'fplot 绘制符号函数',
    cursorPlaceholder: '表达式',
    template: () => `syms x\nfplot(表达式, [xmin, xmax]);\naxis equal; grid on;`,
  },
];

export const MATLAB_SIGNATURES: Record<string, MathFnInfo> = {
  sin: {
    signature: 'sin(x)', args: ['x'], doc: '正弦函数（弧度）。Y = sin(X)。',
    params: [{ name: 'x', kind: 'required', type: 'numeric | matrix', doc: '输入角度（弧度）或数组' }],
  },
  cos: {
    signature: 'cos(x)', args: ['x'], doc: '余弦函数（弧度）。Y = cos(X)。',
    params: [{ name: 'x', kind: 'required', type: 'numeric | matrix' }],
  },
  tan: { signature: 'tan(x)', args: ['x'], doc: '正切函数（弧度）。Y = tan(X)。' },
  asin: { signature: 'asin(x)', args: ['x'], doc: '反正弦，返回弧度。' },
  acos: { signature: 'acos(x)', args: ['x'], doc: '反余弦，返回弧度。' },
  atan: { signature: 'atan(x)', args: ['x'], doc: '反正切，返回弧度。' },
  atan2: { signature: 'atan2(y, x)', args: ['y', 'x'], doc: '四象限反正切 Y/X。' },
  sinh: { signature: 'sinh(x)', args: ['x'], doc: '双曲正弦。' },
  cosh: { signature: 'cosh(x)', args: ['x'], doc: '双曲余弦。' },
  tanh: { signature: 'tanh(x)', args: ['x'], doc: '双曲正切。' },
  log: {
    signature: 'log(x, [base])', args: ['x', 'base'], doc: '对数。默认自然对数 ln(x)；二参时 log(x,base)。',
    params: [
      { name: 'x', kind: 'required', type: 'numeric', doc: '真数（>0）' },
      { name: 'base', kind: 'optional', type: 'numeric', default: 'e', doc: '底数；默认自然对数' },
    ],
  },
  log10: { signature: 'log10(x)', args: ['x'], doc: '以 10 为底的对数。' },
  log2: { signature: 'log2(x)', args: ['x'], doc: '以 2 为底的对数。' },
  ln: { signature: 'ln(x)', args: ['x'], doc: '自然对数 log_e(x)。' },
  exp: { signature: 'exp(x)', args: ['x'], doc: '指数函数 e^x。' },
  sqrt: { signature: 'sqrt(x)', args: ['x'], doc: '平方根。' },
  cbrt: { signature: 'cbrt(x)', args: ['x'], doc: '立方根。' },
  abs: { signature: 'abs(x)', args: ['x'], doc: '绝对值 / 复数的模。' },
  sign: { signature: 'sign(x)', args: ['x'], doc: '符号函数：x<0→-1，x=0→0，x>0→1。' },
  floor: { signature: 'floor(x)', args: ['x'], doc: '向下取整。' },
  ceil: { signature: 'ceil(x)', args: ['x'], doc: '向上取整。' },
  round: { signature: 'round(x, [n])', args: ['x', 'n'], doc: '四舍五入；可指定小数位 n。' },
  fix: { signature: 'fix(x)', args: ['x'], doc: '向零取整。' },
  min: { signature: 'min(a, b, ...)', args: ['a', 'b'], doc: '返回最小值（可传数组）。' },
  max: { signature: 'max(a, b, ...)', args: ['a', 'b'], doc: '返回最大值（可传数组）。' },
  gcd: { signature: 'gcd(a, b)', args: ['a', 'b'], doc: '最大公约数。' },
  lcm: { signature: 'lcm(a, b)', args: ['a', 'b'], doc: '最小公倍数。' },
  mod: { signature: 'mod(a, b)', args: ['a', 'b'], doc: '取模（结果的符号与 a 一致）。' },
  rem: { signature: 'rem(a, b)', args: ['a', 'b'], doc: '取余（结果的符号与 a 一致）。' },
  factorial: { signature: 'factorial(n)', args: ['n'], doc: '阶乘 n!。' },
  gamma: { signature: 'gamma(x)', args: ['x'], doc: '伽马函数 Γ(x)。' },
  erf: { signature: 'erf(x)', args: ['x'], doc: '误差函数。' },
  erfc: { signature: 'erfc(x)', args: ['x'], doc: '互补误差函数 1−erf(x)。' },
  real: { signature: 'real(z)', args: ['z'], doc: '复数的实部。' },
  imag: { signature: 'imag(z)', args: ['z'], doc: '复数的虚部。' },
  conj: { signature: 'conj(z)', args: ['z'], doc: '共轭复数。' },
  arg: { signature: 'arg(z)', args: ['z'], doc: '复数的幅角（弧度）。' },
  angle: { signature: 'angle(z)', args: ['z'], doc: '复数的相位角（弧度）。' },
  det: { signature: 'det(A)', args: ['A'], doc: '矩阵的行列式。' },
  inv: { signature: 'inv(A)', args: ['A'], doc: '矩阵的逆。' },
  transpose: { signature: 'transpose(A)', args: ['A'], doc: '矩阵转置 Aᵀ。' },
  ctranspose: { signature: 'ctranspose(A)', args: ['A'], doc: '共轭转置 Aᴴ（即 MATLAB 的 A\'）。' },
  trace: { signature: 'trace(A)', args: ['A'], doc: '矩阵的迹（主对角线和）。' },
  rank: { signature: 'rank(A)', args: ['A'], doc: '矩阵的秩。' },
  rref: { signature: 'rref(A)', args: ['A'], doc: '行最简阶梯形（化简）。' },
  lu: { signature: 'lu(A)', args: ['A'], doc: 'LU 分解。' },
  qr: { signature: 'qr(A)', args: ['A'], doc: 'QR 分解。' },
  cholesky: { signature: 'cholesky(A)', args: ['A'], doc: 'Cholesky 分解（正定矩阵）。' },
  svd: { signature: 'svd(A)', args: ['A'], doc: '奇异值分解。' },
  eye: { signature: 'eye(n)', args: ['n'], doc: 'n×n 单位矩阵。' },
  zeros: { signature: 'zeros(m, n)', args: ['m', 'n'], doc: '全零矩阵。' },
  ones: { signature: 'ones(m, n)', args: ['m', 'n'], doc: '全 1 矩阵。' },
  rand: { signature: 'rand(m, n)', args: ['m', 'n'], doc: '随机矩阵（[0,1) 均匀分布）。(m, n) 可选。' },
  sum: { signature: 'sum(v)', args: ['v'], doc: '数组元素求和。' },
  prod: { signature: 'prod(v)', args: ['v'], doc: '数组元素求积。' },
  cumsum: { signature: 'cumsum(v)', args: ['v'], doc: '累积和。' },
  cumprod: { signature: 'cumprod(v)', args: ['v'], doc: '累积积。' },
  diff: { signature: 'diff(v)', args: ['v'], doc: '相邻元素差分。' },
  sort: { signature: 'sort(v)', args: ['v'], doc: '升序排序。' },
  reshape: { signature: 'reshape(M, m, n)', args: ['M', 'm', 'n'], doc: '重排矩阵尺寸。' },
  size: { signature: 'size(M)', args: ['M'], doc: '矩阵尺寸 [m, n]。' },
  length: { signature: 'length(v)', args: ['v'], doc: '向量的长度。' },
  numel: { signature: 'numel(M)', args: ['M'], doc: '矩阵元素总数。' },
  simplify: { signature: 'simplify(expr)', args: ['expr'], doc: '符号化简表达式。' },
  rationalize: { signature: 'rationalize(expr)', args: ['expr'], doc: '有理化表达式。' },
  derivative: { signature: 'derivative(expr, var)', args: ['expr', 'var'], doc: '对表达式求关于 var 的符号导数。' },
  integrate: { signature: 'integrate(expr, a, b)', args: ['expr', 'a', 'b'], doc: '数值定积分（Simpson 1/3）。' },
  limit: { signature: 'limit(expr, x, a)', args: ['expr', 'x', 'a'], doc: '求极限 x→a。' },
  taylor: { signature: 'taylor(expr, x, n, a)', args: ['expr', 'x', 'n', 'a'], doc: '泰勒展开到 n 阶（在 a 处）。' },
  solve: { signature: 'solve(expr)', args: ['expr'], doc: '解方程（返回解的数组）。' },
  plot: { signature: 'plot(expr, [xmin], [xmax])', args: ['expr', 'xmin', 'xmax'], doc: '绘制函数曲线。' },
  polarplot: { signature: 'polarplot(r, [tmin], [tmax])', args: ['r', 'tmin', 'tmax'], doc: '绘制极坐标曲线。' },

  /* ── MATLAB 脚本级命令 ─────────────────────────────────────── */
  fplot: {
    signature: 'fplot(expr, [xmin xmax])', args: ['expr', 'range'], doc: '绘制符号/函数句柄表达式的曲线。',
    params: [
      { name: 'expr', kind: 'required', type: 'function handle | sym', doc: '要绘制的函数' },
      { name: 'range', kind: 'optional', type: '1x2 numeric', default: '[-5 5]', doc: 'x 轴范围 [xmin xmax]' },
    ],
  },
  syms: { signature: 'syms var1 ... varN', args: ['vars'], doc: '声明符号变量（用于符号运算）。' },
  disp: { signature: 'disp(x)', args: ['x'], doc: '在命令窗口显示变量/文本。' },
  hold: { signature: 'hold [on|off]', args: ['state'], doc: '保持当前图形，叠加下一次绘图。' },
  grid: { signature: 'grid [on|off]', args: ['state'], doc: '开关网格线。' },
  axis: { signature: 'axis([xmin xmax ymin ymax])', args: ['limits'], doc: '设置坐标轴范围/比例。' },
  xlabel: { signature: 'xlabel(str)', args: ['str'], doc: '设置 x 轴标签。' },
  ylabel: { signature: 'ylabel(str)', args: ['str'], doc: '设置 y 轴标签。' },
  title: { signature: 'title(str)', args: ['str'], doc: '设置图形标题。' },
  legend: { signature: 'legend(...)', args: ['labels'], doc: '添加图例。' },
  figure: { signature: 'figure', args: [], doc: '创建新的图形窗口。' },
  clc: { signature: 'clc', args: [], doc: '清空命令窗口。' },
  clear: { signature: 'clear [vars]', args: ['vars'], doc: '清除工作区变量。' },
  whos: { signature: 'whos', args: [], doc: '列出工作区变量的详细信息。' },
  pause: { signature: 'pause([sec])', args: ['sec'], doc: '暂停执行（秒）。' },
  fprintf: {
    signature: 'fprintf(fmt, ...)', args: ['fmt'], doc: '格式化输出到命令窗口。',
    params: [
      { name: 'fmt', kind: 'required', type: 'char', doc: '格式字符串' },
      { name: 'varargin', kind: 'optional', type: 'any', doc: '格式化参数' },
    ],
  },
};

/** 取一个函数的签名信息；无则返回 null。 */
export function getFunctionInfo(name: string): MathFnInfo | null {
  return MATLAB_SIGNATURES[name] ?? (FUNCTIONS.includes(name) ? { signature: `${name}(...)`, args: [], doc: `${name}` } : null);
}

export const math: StreamParser<State> = {
  name: 'math',

  startState: () => ({
    inString: false,
    stringChar: '',
  }),

  token: (stream, state) => {
    // Comment (# or //)
    if (stream.sol() && (stream.peek() === '#' || (stream.peek() === '/' && stream.string.slice(stream.pos + 1, stream.pos + 2) === '/'))) {
      stream.skipToEnd();
      return 'comment';
    }
    if (stream.peek() === '#' || (stream.peek() === '/' && stream.string.slice(stream.pos + 1, stream.pos + 2) === '/')) {
      stream.skipToEnd();
      return 'comment';
    }

    // MATLAB % comment
    if (stream.peek() === '%') {
      stream.skipToEnd();
      return 'comment';
    }

    // String
    if (stream.peek() === '"' || stream.peek() === "'") {
      // Distinguish string from MATLAB transpose
      // Heuristic: if preceded by a letter/number/closing bracket, it's transpose, not string
      const current = stream.current().trimEnd();
      const lastChar = current[current.length - 1];
      if (lastChar && /[a-zA-Z0-9\)\]\}]/.test(lastChar)) {
        stream.next();
        return 'operator';
      }
      const quote = stream.next()!;
      while (!stream.eol()) {
        const ch = stream.next()!;
        if (ch === quote) break;
      }
      return 'string';
    }

    // Whitespace
    if (stream.eatSpace()) return null;

    // Number (including decimals, scientific notation, hex)
    if (stream.match(/^0[xX][0-9a-fA-F]+/)) return 'number';
    if (stream.match(/^\d+\.?\d*([eE][+-]?\d+)?/)) {
      // Check for implicit multiplication like "2x" — don't consume the x
      return 'number';
    }
    if (stream.match(/^\.\d+/)) return 'number';

    // Greek / Unicode math symbols (θ π α β Σ Δ ω …). Previously these were
    // not matched by any rule, so they rendered as uncolored plain text and
    // "couldn't be recognized". Treat them as variables/constants like the
    // engine does (θ = theta, π = pi, …).
    if (stream.match(/^\p{Script=Greek}/u)) {
      const glyph = stream.current();
      // Common constants → atom (teal/red) so π/θ read as constants, like pi/theta.
      if (glyph === 'π' || glyph === 'Π') return 'atom';
      if (glyph === 'θ' || glyph === 'Θ' || glyph === 'φ' || glyph === 'Φ') return 'atom';
      return 'variableName';
    }

    // Variable/identifier
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const word = stream.current();
      if (KEYWORDS.includes(word)) return 'keyword';
      // `function` 在 @lezer/highlight 中是「修饰符」（modifier）而非独立标签。
      // 若单独返回 'function'，CodeMirror 的 StreamLanguage 解析器会触发
      // "Modifier function used at start of tag" 告警。必须把修饰符与基础标签
      // 写在同一个 name 内、用「点」连接：'variableName.function'
      // （即 t.function(t.variableName)）。注意不能用空格分隔——createTokenType
      // 会按空格把每个 name 当成独立 token，导致修饰符仍落在起始位置而告警。
      if (FUNCTIONS.includes(word)) return 'variableName.function';
      // Constants (pi, e, inf, …) → 'atom'，使其在 VSCode Dark+/Light+ 调色板中
      // 拥有专属的 --syntax-constant 颜色（青色 / 红色），与普通变量区分。
      if (['pi', 'e', 'inf', 'infinity', 'nan'].includes(word)) {
        return 'atom';
      }
      // 布尔 (true / false) → 'bool'，在 VSCode 调色板里以蓝色加粗呈现。
      if (word === 'true' || word === 'false') {
        return 'bool';
      }
      return 'variableName';
    }

    // Operators
    if (stream.match(/^[+\-*/^%=<>!&|~]/)) {
      stream.match(/^[+\-*/^%=<>!&|~]/); // multi-char operators like ==, <=, &&, etc.
      return 'operator';
    }

    // Common Unicode math symbols (∞ ≤ ≥ ≠ ± × ÷ √ ∫ ∑ ∏ ∂ ∇ …). These were
    // previously unmatched → rendered as uncolored plain text ("无法识别").
    // Highlight them as operators so they read consistently with + − * /.
    if (stream.match(/^[∞≤≥≠±∓×÷√∫∑∏∈∉∂∇∝≈≡⋅⊙⊕⊗]/)) {
      return 'operator';
    }

    // Punctuation
    if (stream.match(/^[(){}\[\];,:.]/)) return 'punctuation';

    // Fallback
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: '#' },
    closeBrackets: ['(', '[', '{', '"', "'"],
  },
};
