/**
 * OmniMath Pro — 轻量公式排版（无 mathjs）
 *
 * 编辑器顶部的「当前行公式预览」只需要把常见数学输入变成好看的 KaTeX，
 * 不需要完整解析器。之前这条预览调用 `inputToLatex`（mathjs），结果是
 * 光标一移进表达式行就会在后台下载整个 mathjs（约 0.5 MB），既拖慢
 * 首屏也让「只在运行时加载引擎」的按需策略失效。
 *
 * 这里用一组保守的 token 替换覆盖 90% 的日常输入：
 *   - 希腊字母 / 常量：theta → \theta，pi → \pi
 *   - 函数名：sin → \sin，ln → \ln
 *   - 运算符：* → \cdot，<= → \le
 *   - 幂 / 下标：x^2 → x^{2}，x_1 → x_{1}
 *   - 绘图包装：plot(f) → y = f，polar(f) → r = f
 *
 * 拿不准的输入（中文、注释、分隔符、LaTeX 反斜杠）直接返回空串，
 * 宁可不预览，也不要渲染出一堆奇怪的符号。
 */

const GREEK: Record<string, string> = {
  alpha: '\\alpha',
  beta: '\\beta',
  gamma: '\\gamma',
  delta: '\\delta',
  epsilon: '\\epsilon',
  varepsilon: '\\varepsilon',
  zeta: '\\zeta',
  eta: '\\eta',
  theta: '\\theta',
  iota: '\\iota',
  kappa: '\\kappa',
  lambda: '\\lambda',
  mu: '\\mu',
  nu: '\\nu',
  xi: '\\xi',
  pi: '\\pi',
  rho: '\\rho',
  sigma: '\\sigma',
  tau: '\\tau',
  upsilon: '\\upsilon',
  phi: '\\phi',
  varphi: '\\varphi',
  chi: '\\chi',
  psi: '\\psi',
  omega: '\\omega',
  Gamma: '\\Gamma',
  Delta: '\\Delta',
  Theta: '\\Theta',
  Lambda: '\\Lambda',
  Xi: '\\Xi',
  Pi: '\\Pi',
  Sigma: '\\Sigma',
  Phi: '\\Phi',
  Psi: '\\Psi',
  Omega: '\\Omega',
  infinity: '\\infty',
};

/** 函数名：加反斜杠后由 KaTeX 按数学运算符排版（直立、带正确间距）。 */
const FUNCTIONS = [
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'coth',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'log', 'ln', 'lg', 'exp',
  'min', 'max', 'det', 'inv', 'rank', 'trace',
  'floor', 'ceil', 'round', 'sign',
];

const FUNCTION_RE = new RegExp(`\\b(${FUNCTIONS.join('|')})\\b`, 'g');

/** 转义 LaTeX 特殊字符（希腊/函数命令在转义之后才插入）。 */
function escapeLatex(s: string): string {
  return s.replace(/[\\{}$%#&~]/g, (c) => `\\${c}`);
}

/**
 * 把一行计算器输入变成 KaTeX 源码。无法可靠排版时返回 ''。
 */
export function toLiteLatex(input: string): string {
  let s = input.trim();
  if (!s) return '';
  // 注释 / 分隔符 / 中文说明 / 显式 LaTeX：不猜，直接不预览。
  if (/^[#%/]/.test(s) || /^---+$|^%%%$/.test(s)) return '';
  if (/[\u4e00-\u9fff]/.test(s)) return '';
  if (s.includes('\\')) return '';

  // 绘图包装：只预览被画的表达式，和运行后的结果图对应。
  const plot = s.match(/^\s*(plot|polar(?:plot)?|plot3d|surface|surf)\s*\(([\s\S]+)\)\s*$/i);
  if (plot) {
    const kind = plot[1].toLowerCase();
    const inner = plot[2].split(',')[0].trim();
    const lhs = kind === 'polar' || kind === 'polarplot' ? 'r = ' : /^plot3d|^surface|^surf/.test(kind) ? 'z = ' : 'y = ';
    s = lhs + inner;
  }

  s = escapeLatex(s);

  // 幂与下标：必须在函数 / 运算符替换之前做，避免 `^` 后面的 `\sin` 被卷进括号。
  s = s.replace(/\^\(([^()]*)\)/g, '^{$1}');
  s = s.replace(/\^(-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*)/g, '^{$1}');
  s = s.replace(/_([A-Za-z0-9]+)/g, '_{$1}');

  // 希腊字母 / 常量 / 函数。
  s = s.replace(/\b(alpha|beta|gamma|delta|varepsilon|epsilon|zeta|eta|theta|iota|kappa|lambda|mu|nu|xi|pi|rho|sigma|tau|upsilon|varphi|phi|chi|psi|omega|Gamma|Delta|Theta|Lambda|Xi|Pi|Sigma|Phi|Psi|Omega|infinity)\b/g,
    (name) => GREEK[name] ?? `\\${name}`);
  s = s.replace(FUNCTION_RE, '\\$1');

  // 根号 / 绝对值：括号形式比 `\sqrt(x)` 更接近手写。
  s = s.replace(/\bsqrt\(([^()]*)\)/g, '\\sqrt{$1}');
  s = s.replace(/\babs\(([^()]*)\)/g, '\\left|$1\\right|');

  // 运算符。
  s = s.replace(/<=/g, '\\le ').replace(/>=/g, '\\ge ').replace(/!=/g, '\\ne ');
  s = s.replace(/×/g, '\\times ').replace(/÷/g, '\\div ').replace(/·/g, '\\cdot ');
  s = s.replace(/\s*\*\s*/g, ' \\cdot ');
  s = s.replace(/°/g, '^{\\circ}');
  s = s.replace(/π/g, '\\pi ').replace(/θ/g, '\\theta ').replace(/α/g, '\\alpha ')
    .replace(/β/g, '\\beta ').replace(/λ/g, '\\lambda ').replace(/μ/g, '\\mu ')
    .replace(/σ/g, '\\sigma ').replace(/φ/g, '\\phi ').replace(/ω/g, '\\omega ');

  // 压平多余空白（KaTeX 不关心，但便于测试与调试）。
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}
