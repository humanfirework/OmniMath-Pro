/**
 * 手写 / 键盘输入的函数参数修复。
 *
 * 手写时函数名后面的括号经常被认为「不用写」：`sin x`、`sinx`、`sin*x`
 * 都是常见写法。mathjs 只接受 `sin(x)`，之前这些输入会直接报「不认识的
 * 符号 sinx」或者把 `sin` 当成变量参与乘法，所以「写 sin x 没有用」。
 *
 * 这里把已知函数名后面紧跟的一个原子参数补上括号：
 *   sin x   → sin(x)
 *   sinx    → sin(x)
 *   sin*x   → sin(x)
 *   sin 2x  → sin(2x)  （后续隐式乘法会得到 sin(2*x)）
 *   ln x^2  → ln(x^2)
 *
 * 已经是 `sin(x)` 的写法原样保留；函数名前面必须是词边界，避免把
 * `xsin` 这类变量名拆开。模块不依赖 mathjs，可被手写识别器单独引用。
 */

/** 与 expression.ts 的 FUNCTIONS 保持一致；长名字在前（log10 优先于 log）。 */
export const CALLABLE_FUNCTIONS = [
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'asin', 'acos', 'atan', 'atan2', 'acot',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'sqrt', 'cbrt', 'nthRoot', 'abs', 'exp', 'log', 'ln', 'lg', 'log10', 'log2',
  'floor', 'ceil', 'round', 'fix', 'sign', 'min', 'max', 'mod', 'pow',
  'gamma', 'factorial', 'ncr', 'npr',
  're', 'im', 'arg', 'conj',
];

const NAMES = [...CALLABLE_FUNCTIONS].sort((a, b) => b.length - a.length);

/**
 * 从 `start` 开始读一个参数原子，返回结束下标（不含）。
 * 支持：括号组、标识符/数字、以及紧跟的 `^幂`。读不到返回 -1。
 */
function readArgumentEnd(input: string, start: number): number {
  const ch = input[start];
  if (!ch) return -1;

  if (ch === '(') {
    let depth = 0;
    for (let i = start; i < input.length; i++) {
      if (input[i] === '(') depth++;
      else if (input[i] === ')') {
        depth--;
        if (depth === 0) return i + 1;
      }
    }
    return -1;
  }

  if (!/[0-9a-zA-Z.]/.test(ch)) return -1;

  let i = start;
  while (i < input.length && /[0-9a-zA-Z.]/.test(input[i])) i++;

  // sin x^2 → 幂跟着参数一起进括号
  if (input[i] === '^') {
    let j = i + 1;
    while (input[j] === ' ') j++;
    if (input[j] === '(') {
      const end = readArgumentEnd(input, j);
      if (end > 0) i = end;
    } else {
      let k = j;
      while (k < input.length && /[0-9a-zA-Z.]/.test(input[k])) k++;
      if (k > j) i = k;
    }
  }
  return i;
}

export function attachFunctionArguments(input: string): string {
  if (!input) return input;

  let out = '';
  let i = 0;
  while (i < input.length) {
    const prev = input[i - 1];
    // 词边界：前面不能是字母（数字可以，2sin x 也要能修）。
    const atBoundary = !prev || !/[a-zA-Z]/.test(prev);
    const name = atBoundary ? NAMES.find((n) => input.startsWith(n, i)) : undefined;

    if (name) {
      let j = i + name.length;
      while (input[j] === ' ') j++;
      if (input[j] === '*') {
        j++;
        while (input[j] === ' ') j++;
      }
      if (input[j] === '(') {
        // 已经有括号，交给后续原样处理（sin*(x) 也顺手去掉多余的 *）。
        out += name;
        i = j;
        continue;
      }
      const end = readArgumentEnd(input, j);
      if (end > j) {
        out += `${name}(${input.slice(j, end).trim()})`;
        i = end;
        continue;
      }
    }

    out += input[i];
    i++;
  }
  return out;
}
