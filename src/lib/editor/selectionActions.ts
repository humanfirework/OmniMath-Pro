/**
 * 编辑器选区动作 —— 纯函数层
 *
 * 选中一段代码后，编辑器会浮出一条很窄的动作条：
 *   - 解释 / 简化：打包成 prompt 交给 AI 面板（`omnimath:ai-explain`）；
 *   - 画图：本地解析选区里的 f(x) 表达式，直接送进 2D 预览，无需 API Key。
 *
 * 这里只做「文本 → 动作数据」的转换（提示词、可绘制表达式提取），
 * 不接触 DOM / React / 编辑器实例，方便单测。
 */

export type EditorSelectionAction = 'explain' | 'simplify' | 'plot';

export interface SelectionActionDef {
  id: EditorSelectionAction;
  /** 动作条上的短标签（保持 2 个字，窄条也不拥挤）。 */
  label: string;
  title: string;
}

export const SELECTION_ACTIONS: readonly SelectionActionDef[] = [
  { id: 'explain', label: '解释', title: '让 AI 逐段解释选中的代码' },
  { id: 'simplify', label: '简化', title: '让 AI 简化并重构选中的代码' },
  { id: 'plot', label: '画图', title: '把选中的 f(x) 表达式画成曲线' },
] as const;

/** 送进 prompt 的选区长度的上限，避免把整份文件塞给模型。 */
export const MAX_PROMPT_SELECTION_CHARS = 6000;

/** 一次最多绘制几条曲线，防止误选整份脚本后预览被塞满。 */
export const MAX_PLOT_SELECTION_EXPRESSIONS = 6;

const LANGUAGE_LABEL: Record<string, string> = {
  simple: 'OmniMath 简单模式',
  python: 'Python',
  matlab: 'MATLAB',
};

/** 裁剪过长选区：保留头部，并在末尾注明已截断。 */
export function clipSelection(text: string, max = MAX_PROMPT_SELECTION_CHARS): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}\n…（选区过长，已截断）`;
}

/** 解释选区：强调「读懂」而非「重写」。 */
export function buildExplainPrompt(text: string, language: string): string {
  const lang = LANGUAGE_LABEL[language] ?? language;
  return [
    `请用中文解释下面这段${lang}代码。`,
    '',
    '要求：',
    '1) 逐段说明它做了什么、每一步对应的数学含义；',
    '2) 指出可能的边界情况或潜在错误；',
    '3) 不要重写代码，只在末尾给出必要的修正建议。',
    '',
    '```',
    clipSelection(text),
    '```',
  ].join('\n');
}

/** 简化选区：保持行为不变，优先可读性。 */
export function buildSimplifyPrompt(text: string, language: string): string {
  const lang = LANGUAGE_LABEL[language] ?? language;
  return [
    `请简化并重构下面这段${lang}代码。`,
    '',
    '要求：保持行为完全不变，去掉冗余，优先可读性；',
    '给出修改后的完整代码，并用 2–3 条说明改了什么、为什么。',
    '',
    '```',
    clipSelection(text),
    '```',
  ].join('\n');
}

const PLOT_WRAPPER = /^plot\s*\(\s*([\s\S]+?)\s*\)$/;

/**
 * 从选区文本中提取可以直接绘制的 f(x) 表达式。
 *
 * 规则刻意保守（宁可少画，也不画错）：
 *   - 跳过空行、注释（`#` / `//` / `%` 开头）；
 *   - 只接受 `y = f(x)` 或裸表达式 `f(x)`，其余含 `=` 的方程跳过；
 *   - 必须出现自变量 `x`，常数行不画；
 *   - `plot(...)` 包裹会先剥掉外壳；
 *   - 去重并限制数量。
 */
export function extractPlotExpressions(
  text: string,
  max = MAX_PLOT_SELECTION_EXPRESSIONS,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split('\n')) {
    let line = rawLine.trim();
    if (!line) continue;
    if (/^(#|\/\/|%)/.test(line)) continue;

    // 去掉语句末尾的分号（MATLAB / 习惯写法）。
    line = line.replace(/;+$/, '').trim();

    const wrapped = line.match(PLOT_WRAPPER);
    if (wrapped) line = wrapped[1].trim();

    // `y = ...` / `f(x) = ...`：只保留右侧。
    const assigned = line.match(/^(?:y|f\s*\(\s*x\s*\))\s*=\s*([\s\S]+)$/i);
    if (assigned) line = assigned[1].trim();

    // 剩下的 `=`（方程、赋值）不当作函数画。
    if (!line || line.includes('=')) continue;
    // 必须真的含自变量 x（避免把 `a + b`、`2 + 3` 画成常数线）。
    if (!/(^|[^A-Za-z0-9_])x([^A-Za-z0-9_]|$)/.test(line)) continue;

    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= max) break;
  }

  return out;
}
