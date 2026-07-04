import { create, all, MathJsInstance, Matrix } from 'mathjs';

const math = create(all) as MathJsInstance;

// Configure math.js for our needs
math.config({
  number: 'number',
  precision: 64,
});

// Override log to be base-10 by default (more intuitive for users)
// math.js default: log(x) = natural log. We want log(x) = base-10.
// ln(x) stays as natural log. log10, log2 also available.
const originalLog = math.log;
// @ts-expect-error - overriding function
math.log = function (x: number, base?: number) {
  if (base !== undefined) {
    return originalLog(x, base);
  }
  // Default to base-10
  return originalLog(x, 10);
};

// Add ln as natural logarithm (math.js doesn't have ln by default)
const naturalLog = originalLog;

// Import the typed function to allow proper chaining
math.import({
  log: math.log,
  ln: naturalLog,
  // Add log10 explicitly
  log10: function (x: number) { return originalLog(x, 10); },
  // Add arctan/arcsin/arccos as aliases for atan/asin/acos (Desmos-like)
  arctan: function (x: number) { return math.atan(x); },
  arcsin: function (x: number) { return math.asin(x); },
  arccos: function (x: number) { return math.acos(x); },
  arccot: function (x: number) { return Math.PI / 2 - math.atan(x); },
  arcsec: function (x: number) { return math.acos(1 / x); },
  arccsc: function (x: number) { return math.asin(1 / x); },
  sec: function (x: number) { return 1 / Math.cos(x); },
  csc: function (x: number) { return 1 / Math.sin(x); },
  cot: function (x: number) { return Math.cos(x) / Math.sin(x); },
}, { override: true });

// Custom scope for variable tracking
let scope: Record<string, unknown> = {};

export function resetScope() {
  scope = {};
}

export function getScope() {
  return { ...scope };
}

// Convert common input formats to math.js compatible format
function preprocessInput(input: string, mode: 'simple' | 'advanced' = 'simple'): string {
  let processed = input.trim();

  // Replace common math notations
  processed = processed.replace(/π/g, 'pi');
  processed = processed.replace(/∞/g, 'Infinity');
  processed = processed.replace(/×/g, '*');
  processed = processed.replace(/÷/g, '/');
  processed = processed.replace(/−/g, '-');

  if (mode === 'simple') {
    // Simple mode: Desmos-like lenient parsing
    processed = lenientPreprocess(processed);
  } else {
    // Advanced mode: only basic auto-multiplication
    processed = processed.replace(/(\d)([a-zA-Z_])/g, '$1*$2');
    processed = processed.replace(/(\))(\d)/g, '$1*$2');
    processed = processed.replace(/(\d)(\()/g, '$1*$2');
    processed = processed.replace(/(\))(\()/g, '$1*$2');
    processed = processed.replace(/(\d)(pi\b)/g, '$1*$2');
  }

  return processed;
}

// Desmos-like lenient preprocessor for simple mode
// Handles: sin x, arctan x, 2x, x^2, etc.
// Uses a scanner approach to properly consume arguments
function lenientPreprocess(input: string): string {
  // List of math functions that can be used without parentheses (longest first)
  // Includes both math functions AND command-style functions that should NOT be converted to implicit multiplication
  const funcNames = [
    // Command-style functions (solve, plot, etc.)
    'polarplot', 'integrate', 'derivative', 'factorial', 'permutations', 'combinations',
    'arctan2', 'arctan', 'arcsin', 'arccos', 'arccot', 'arcsec', 'arccsc',
    'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
    'solve', 'plot', 'graph', 'draw', 'polar', 'limit', 'taylor', 'series',
    'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
    'asin', 'acos', 'atan',
    'sqrt', 'cbrt', 'abs', 'sign', 'ceil', 'floor', 'round',
    'exp', 'log2', 'log10', 'log', 'ln',
    'sum', 'prod', 'mean', 'median', 'std', 'variance',
    'min', 'max', 'gcd', 'lcm', 'det', 'inv', 'trace', 'rank', 'eigs',
  ].sort((a, b) => b.length - a.length);

  // Handle superscript notation: x² -> x^2, x³ -> x^3, etc.
  let processed = input;
  processed = processed.replace(/²/g, '^2');
  processed = processed.replace(/³/g, '^3');
  processed = processed.replace(/⁴/g, '^4');
  processed = processed.replace(/⁵/g, '^5');
  processed = processed.replace(/⁶/g, '^6');
  processed = processed.replace(/⁷/g, '^7');
  processed = processed.replace(/⁸/g, '^8');
  processed = processed.replace(/⁹/g, '^9');
  processed = processed.replace(/⁰/g, '^0');
  processed = processed.replace(/ⁿ/g, '^n');

  // Step 1: Convert "func arg" to "func(arg)" using a scanner
  // We scan the string and when we find a function name followed by a space
  // (but NOT already followed by "("), we wrap the next argument in parens
  let result = '';
  let i = 0;

  while (i < processed.length) {
    let matched = false;

    // Try to match a function name at the current position
    for (const func of funcNames) {
      if (processed.substring(i, i + func.length) === func) {
        // Check word boundary: the char before must not be alphanumeric
        const beforeChar = i > 0 ? processed[i - 1] : ' ';
        const isWordBoundary = !/[a-zA-Z0-9_]/.test(beforeChar);

        if (!isWordBoundary) continue;

        // Check what comes after the function name
        const afterFunc = i + func.length;

        // Case 1: Already has parentheses - func(...) - leave as is
        if (afterFunc < processed.length && processed[afterFunc] === '(') {
          result += func;
          i += func.length;
          matched = true;
          break;
        }

        // Case 2: Followed by space(s) and then something - convert to func(arg)
        if (afterFunc < processed.length && /\s/.test(processed[afterFunc])) {
          // Find the start of the argument (skip spaces)
          let argStart = afterFunc;
          while (argStart < processed.length && /\s/.test(processed[argStart])) {
            argStart++;
          }

          // If the argument starts with '(' then it's already parenthesized - just add the function name
          if (argStart < processed.length && processed[argStart] === '(') {
            result += func;
            i += func.length;
            matched = true;
            break;
          }

          // Extract the argument: everything until we hit a + or - or , or end at proper boundary
          let argEnd = argStart;
          let parenDepth = 0;

          while (argEnd < processed.length) {
            const ch = processed[argEnd];
            if (ch === '(') parenDepth++;
            else if (ch === ')') {
              if (parenDepth === 0) break;
              parenDepth--;
            }
            // Stop at + or - at paren depth 0 (but not if it's part of an exponent like x^-2)
            else if (parenDepth === 0 && (ch === '+' || ch === '-')) {
              // Allow negative exponents: x^-2
              if (argEnd > 0 && processed[argEnd - 1] === '^') {
                // This is part of an exponent, continue
              } else if (argEnd === argStart) {
                // This is a leading sign, e.g., sin -x -> sin(-x)
                // Continue to include it
              } else {
                break;
              }
            }
            // Stop at comma at paren depth 0
            else if (parenDepth === 0 && ch === ',') {
              break;
            }
            argEnd++;
          }

          const arg = processed.substring(argStart, argEnd).trim();
          if (arg) {
            result += `${func}(${arg})`;
            i = argEnd;
            matched = true;
            break;
          }
        }

        // Case 3: Function name not followed by space or paren - leave as is (might be part of another word)
        // Don't match here, fall through
      }
    }

    if (!matched) {
      result += processed[i];
      i++;
    }
  }

  processed = result;

  // Step 2: Auto-multiply: 2x -> 2*x, 3sin -> 3*sin
  // But be careful not to break function names
  processed = processed.replace(/(\d)([a-zA-Z_])/g, '$1*$2');

  // Step 3: Auto-multiply: )2 -> )*2, )( -> )*(, 2( -> 2*(
  processed = processed.replace(/(\))(\d)/g, '$1*$2');
  processed = processed.replace(/(\d)(\()/g, '$1*$2');
  processed = processed.replace(/(\))(\()/g, '$1*$2');

  // Step 4: Handle implicit multiplication with pi
  processed = processed.replace(/(\d)(pi\b)/g, '$1*$2');

  // Step 5: x( -> x*( but NOT for function calls like sin(
  // We need to check if the identifier before ( is a known function name
  // Use a function-based replacement to properly check
  processed = processed.replace(
    /([a-zA-Z_]\w*)\(/g,
    (match, identifier) => {
      // If the identifier is a known function name, don't add *
      if (funcNames.includes(identifier)) {
        return match;
      }
      // Otherwise, it's implicit multiplication: x( -> x*(
      return `${identifier}*(`;
    }
  );

  // Step 6: )x -> )*x
  processed = processed.replace(/\)([a-zA-Z_])/g, ')*$1');

  // Step 7: x pi -> x*pi
  processed = processed.replace(/\b([a-zA-Z_]\w*)\s+(pi)\b/g, '$1*$2');

  // Step 8: Auto-close unclosed parentheses
  const openParens = (processed.match(/\(/g) || []).length;
  const closeParens = (processed.match(/\)/g) || []).length;
  if (openParens > closeParens) {
    processed += ')'.repeat(openParens - closeParens);
  }

  return processed;
}

// Detect the type of expression
function detectType(input: string): CalculationResult['type'] {
  const lower = input.toLowerCase().trim();

  if (/^(int|integral|integrate|derive|diff|derivative|limit|taylor|series)\b/.test(lower)) return 'calculus';
  if (/^(solve|roots?|findroot)\b/.test(lower)) return 'equation';
  if (/^(plot|graph|draw|polarplot|polar)\b/.test(lower)) return 'plot';
  if (/[\[\];]/.test(input) && /[\d\w]/.test(input)) return 'matrix';

  return 'expression';
}

// Helper to extract content between balanced parentheses
function extractBalanced(str: string, startIdx: number): string | null {
  if (str[startIdx] !== '(') return null;
  let depth = 1;
  let i = startIdx + 1;
  while (i < str.length && depth > 0) {
    if (str[i] === '(') depth++;
    else if (str[i] === ')') depth--;
    if (depth === 0) return str.substring(startIdx + 1, i);
    i++;
  }
  return depth === 0 ? str.substring(startIdx + 1, i) : null;
}

// Convert math.js result to LaTeX string
function resultToLatex(result: unknown): string {
  if (result === null || result === undefined) return '';

  if (typeof result === 'boolean') {
    return result ? '\\text{true}' : '\\text{false}';
  }

  if (typeof result === 'number') {
    if (!isFinite(result)) {
      return result > 0 ? '\\infty' : '-\\infty';
    }
    if (Number.isInteger(result)) return result.toString();
    // Round near-zero values to 0 (fixes floating point errors like 1.22e-16)
    if (Math.abs(result) < 1e-10) return '0';
    // Try to display as a fraction for clean fractions (e.g., 1/3, 1/2, 3/4)
    const frac = tryFraction(result);
    if (frac) return frac;
    const formatted = result.toFixed(10).replace(/\.?0+$/, '');
    return formatted;
  }

  if (typeof result === 'string') {
    return `\\text{${result}}`;
  }

  // Handle complex numbers - round near-zero imaginary/real parts
  if (result && typeof result === 'object' && 're' in result && 'im' in result) {
    const re = (result as { re: number }).re;
    const im = (result as { im: number }).im;
    // Round near-zero values to 0 (fixes Euler's identity floating point error)
    const roundedRe = Math.abs(re) < 1e-10 ? 0 : re;
    const roundedIm = Math.abs(im) < 1e-10 ? 0 : im;
    if (roundedIm === 0) return resultToLatex(roundedRe);
    if (roundedRe === 0) {
      if (roundedIm === 1) return 'i';
      if (roundedIm === -1) return '-i';
      return `${resultToLatex(roundedIm)}i`;
    }
    const imAbs = Math.abs(roundedIm);
    const imStr = imAbs === 1 ? 'i' : `${resultToLatex(imAbs)}i`;
    return `${resultToLatex(roundedRe)} ${roundedIm > 0 ? '+' : '-'} ${imStr}`;
  }

  // Handle Matrix / Array - MUST check before BigNumber (Matrix also has format method)
  if (result && typeof result === 'object') {
    // Try multiple detection methods
    let isMatrixResult = false;
    let typeName = '';

    try {
      typeName = math.typeOf(result);
      isMatrixResult = typeName === 'Matrix' || typeName === 'DenseMatrix' || typeName === 'SparseMatrix';
    } catch {
      // ignore
    }

    // Also check using isMatrix function
    if (!isMatrixResult) {
      try {
        isMatrixResult = !!(math.isMatrix && math.isMatrix(result));
      } catch {
        // ignore
      }
    }

    // Also check for toArray method (Matrix-like)
    if (!isMatrixResult) {
      const r = result as { toArray?: unknown };
      isMatrixResult = typeof r.toArray === 'function';
    }

    if (isMatrixResult) {
      try {
        const m = result as Matrix & { toArray: () => unknown[]; size: () => number[] };
        const size = m.size();
        const data = m.toArray();
        if (size.length === 2 || (Array.isArray(data) && data.length > 0 && Array.isArray(data[0]))) {
          const rows = data as unknown[][];
          let latex = '\\begin{bmatrix}';
          rows.forEach((row, i) => {
            latex += row.map(v => formatCellValue(v)).join(' & ');
            if (i < rows.length - 1) latex += ' \\\\ ';
          });
          latex += '\\end{bmatrix}';
          return latex;
        }
        if (size.length === 1 || Array.isArray(data)) {
          const arr = data as unknown[];
          let latex = '\\begin{bmatrix}';
          latex += arr.map(v => formatCellValue(v)).join(' \\\\ ');
          latex += '\\end{bmatrix}';
          return latex;
        }
      } catch {
        // Fall through
      }
    }

    // Handle arrays (plain JS arrays)
    if (Array.isArray(result)) {
      if (result.length > 0 && Array.isArray(result[0])) {
        let latex = '\\begin{bmatrix}';
        (result as unknown[][]).forEach((row, i) => {
          latex += row.map(v => formatCellValue(v)).join(' & ');
          if (i < result.length - 1) latex += ' \\\\ ';
        });
        latex += '\\end{bmatrix}';
        return latex;
      }
      let latex = '\\begin{bmatrix}';
      latex += result.map(v => formatCellValue(v)).join(' \\\\ ');
      latex += '\\end{bmatrix}';
      return latex;
    }
  }

  // Handle BigNumber (check after Matrix to avoid false positives)
  if (result && typeof result === 'object' && 'format' in result && typeof (result as { format: unknown }).format === 'function') {
    try {
      const typeName = math.typeOf(result);
      if (typeName === 'BigNumber') {
        return (result as { format: (digits: number) => string }).format(8);
      }
    } catch {
      // ignore
    }
  }

  if (typeof result === 'function') {
    return 'f(x)';
  }

  // Last resort: try to detect matrix-like string output
  const strResult = String(result);
  // If it looks like a JSON 2D array [[...], [...]], reformat as LaTeX matrix
  if (strResult.startsWith('[[') && strResult.endsWith(']]')) {
    try {
      const parsed = JSON.parse(strResult);
      if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
        let latex = '\\begin{bmatrix}';
        parsed.forEach((row: unknown[], i: number) => {
          latex += row.map(v => formatCellValue(v)).join(' & ');
          if (i < parsed.length - 1) latex += ' \\\\ ';
        });
        latex += '\\end{bmatrix}';
        return latex;
      }
      if (Array.isArray(parsed)) {
        let latex = '\\begin{bmatrix}';
        latex += parsed.map(v => formatCellValue(v)).join(' \\\\ ');
        latex += '\\end{bmatrix}';
        return latex;
      }
    } catch {
      // Not valid JSON, return as-is
    }
  }

  return strResult;
}

function formatCellValue(v: unknown): string {
  if (typeof v === 'number') {
    if (!isFinite(v)) return v > 0 ? '\\infty' : '-\\infty';
    return Number.isInteger(v) ? v.toString() : v.toFixed(4).replace(/\.?0+$/, '');
  }
  return String(v);
}

// Try to convert a decimal to a simple fraction (e.g., 0.333... -> 1/3, 0.5 -> 1/2)
// Returns the LaTeX fraction string if successful, or null if not a clean fraction
function tryFraction(value: number): string | null {
  if (!isFinite(value) || Number.isInteger(value)) return null;
  if (Math.abs(value) < 1e-10) return null;

  // Use continued fraction expansion to find the best rational approximation
  // This handles floating point errors (e.g., 0.3333333333 -> 1/3)
  const sign = value < 0 ? -1 : 1;
  const absValue = Math.abs(value);

  // Continued fraction algorithm
  let h1 = 1, h0 = 0; // previous and current numerator
  let k1 = 0, k0 = 1; // previous and current denominator
  let x = absValue;
  const maxIterations = 20;
  const tolerance = 1e-9;

  for (let i = 0; i < maxIterations; i++) {
    const a = Math.floor(x);
    const h2 = a * h1 + h0;
    const k2 = a * k1 + k0;

    // Check if this approximation is close enough
    if (Math.abs(absValue - h2 / k2) < tolerance * absValue) {
      // Found a good fraction
      if (k2 > 1 && k2 <= 1000 && h2 <= 10000) {
        const n = sign * h2;
        const d = k2;
        const absN = Math.abs(n);
        // For improper fractions, show as mixed number
        if (absN > d) {
          const whole = Math.floor(absN / d);
          const remainder = absN % d;
          if (remainder === 0) return null;
          return `${n < 0 ? '-' : ''}${whole} \\frac{${remainder}}{${d}}`;
        }
        return `${n < 0 ? '-' : ''}\\frac{${absN}}{${d}}`;
      }
      return null;
    }

    h0 = h1; h1 = h2;
    k0 = k1; k1 = k2;

    if (x === a) break; // exact
    x = 1 / (x - a);
    if (!isFinite(x) || x > 1e15) break;
  }

  return null;
}

// Convert input expression to LaTeX for rendering
export function inputToLatex(input: string): string {
  let latex = input.trim();

  // Basic conversions
  latex = latex.replace(/\*/g, ' \\cdot ');
  latex = latex.replace(/\bpi\b/g, '\\pi');
  latex = latex.replace(/\binf\b/gi, '\\infty');
  latex = latex.replace(/sqrt\(([^)]+)\)/g, '\\sqrt{$1}');
  latex = latex.replace(/sin\(/g, '\\sin(');
  latex = latex.replace(/cos\(/g, '\\cos(');
  latex = latex.replace(/tan\(/g, '\\tan(');
  latex = latex.replace(/log\(/g, '\\log(');
  latex = latex.replace(/ln\(/g, '\\ln(');
  latex = latex.replace(/exp\(/g, '\\exp(');
  latex = latex.replace(/abs\(/g, '\\left|');
  latex = latex.replace(/factorial\(/g, '');
  latex = latex.replace(/(\d+)!/g, '$1!');

  // Handle exponents: x^2 -> x^{2}, x^{already} stays
  latex = latex.replace(/\^(\d+(\.\d+)?)/g, '^{$1}');
  latex = latex.replace(/\^\(([^)]+)\)/g, '^{$1}');

  // Fractions: a/b -> \frac{a}{b} (only for simple cases)
  // Skip this for now to avoid breaking things

  // Matrix notation: [1,2;3,4] -> \begin{bmatrix}1&2\\3&4\end{bmatrix}
  latex = latex.replace(/\[([^\]]+)\]/g, (match, content) => {
    if (content.includes(';')) {
      const rows = content.split(';');
      const formatted = rows.map((row: string) =>
        row.split(',').map((cell: string) => cell.trim()).join(' & ')
      ).join(' \\\\ ');
      return `\\begin{bmatrix}${formatted}\\end{bmatrix}`;
    }
    return match;
  });

  return latex;
}

// Extract variable assignments
function extractVariables(input: string, result: unknown): Record<string, number> {
  const vars: Record<string, number> = {};
  const assignmentMatch = input.match(/^([a-zA-Z_]\w*)\s*=/);

  if (assignmentMatch) {
    const varName = assignmentMatch[1];
    if (typeof result === 'number') {
      vars[varName] = result;
    }
  }

  return vars;
}

// Numerical root finding using bisection method
// Finds roots of f(var) = 0 in the range [-100, 100]
function findRootsNumerically(expression: string, varName: string): number[] {
  const roots: number[] = [];
  const range = 100;
  const step = 0.1;
  const tolerance = 1e-8;

  const evalAt = (val: number): number | null => {
    try {
      const expr = expression.replace(new RegExp(`\\b${varName}\\b`, 'g'), `(${val})`);
      const result = math.evaluate(expr, scope);
      if (typeof result === 'number' && isFinite(result)) {
        return result;
      }
      return null;
    } catch {
      return null;
    }
  };

  // Scan for sign changes
  let prevVal = evalAt(-range);
  for (let x = -range + step; x <= range; x += step) {
    const currVal = evalAt(x);
    if (prevVal !== null && currVal !== null && prevVal * currVal < 0) {
      // Sign change - use bisection to find the root
      let lo = x - step;
      let hi = x;
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2;
        const midVal = evalAt(mid);
        if (midVal === null) break;
        if (Math.abs(midVal) < tolerance) {
          // Check if we already found this root
          if (!roots.some(r => Math.abs(r - mid) < 0.001)) {
            roots.push(mid);
          }
          break;
        }
        const loVal = evalAt(lo);
        if (loVal === null) break;
        if (loVal * midVal < 0) {
          hi = mid;
        } else {
          lo = mid;
        }
      }
    }
    prevVal = currVal;
  }

  return roots;
}

// Main evaluate function
export interface EvalResult {
  success: boolean;
  result: string;
  latex: string;
  inputLatex: string;
  type: CalculationResult['type'];
  variables: Record<string, number>;
  error?: string;
  plotExpression?: string;
  plotRange?: [number, number];
  plotType?: 'cartesian' | 'polar';
}

export function evaluateExpression(input: string, mode: 'simple' | 'advanced' = 'simple'): EvalResult {
  if (!input.trim()) {
    return {
      success: false,
      result: '',
      latex: '',
      inputLatex: '',
      type: 'unknown',
      variables: {},
      error: 'Empty expression',
    };
  }

  const type = detectType(input);
  const inputLatex = inputToLatex(input);

  // Preprocess input outside try block so it's accessible in catch for auto-plot
  const processed = preprocessInput(input, mode);

  try {
    // Handle plot command - extract expression inside plot(...)
    if (type === 'plot') {
      // Check for polar plot: polarplot(...) or polar(...)
      const polarMatch = processed.match(/^polarplot\s*\(/) || processed.match(/^polar\s*\(/);
      const isPolar = !!polarMatch;

      const plotMatch = processed.match(/^(?:plot|graph|draw|polarplot|polar)\s*\(/);
      if (plotMatch) {
        const openParenIdx = plotMatch[0].length - 1;
        const expr = extractBalanced(processed, openParenIdx);
        if (expr !== null) {
          // Check for range arguments: plot(expr, xmin, xmax)
          const parts = expr.split(',').map(s => s.trim());
          let plotExpr = expr;
          let plotRange: [number, number] | undefined;

          if (parts.length >= 3) {
            // Try to parse last two as range (evaluate them to handle pi, e, etc.)
            try {
              const maybeMin = math.evaluate(parts[parts.length - 2], scope);
              const maybeMax = math.evaluate(parts[parts.length - 1], scope);
              if (typeof maybeMin === 'number' && typeof maybeMax === 'number' && maybeMin < maybeMax) {
                plotExpr = parts.slice(0, -2).join(',');
                plotRange = [maybeMin, maybeMax];
              }
            } catch {
              // Range parsing failed, treat as single expression
            }
          }

          // Validate the expression is parseable
          try {
            // Try parsing with a sample x value (for polar, x is the angle θ)
            const testExpr = plotExpr.replace(/\bx\b/g, '(1)');
            math.evaluate(testExpr, { ...scope });
          } catch {
            return {
              success: false,
              result: '',
              latex: '',
              inputLatex,
              type: 'plot',
              variables: {},
              error: `Invalid plot expression: ${plotExpr}`,
            };
          }
          const varLabel = isPolar ? 'r' : 'y';
          const paramLabel = isPolar ? 'θ' : 'x';
          return {
            success: true,
            result: plotRange
              ? `${isPolar ? 'Polar' : 'Plot'} of ${varLabel} = ${plotExpr.trim()} on [${plotRange[0]}, ${plotRange[1]}]`
              : `${isPolar ? 'Polar' : 'Plot'} of ${varLabel} = ${plotExpr.trim()}`,
            latex: inputLatex,
            inputLatex,
            type: 'plot',
            variables: {},
            plotExpression: plotExpr.trim(),
            plotRange,
            plotType: isPolar ? 'polar' : 'cartesian',
          };
        }
      }
      // Also support "plot expr" without parens
      const plotNoParens = processed.match(/^(?:plot|graph|draw)\s+(.+)$/);
      if (plotNoParens) {
        return {
          success: true,
          result: `Plot of y = ${plotNoParens[1].trim()}`,
          latex: inputLatex,
          inputLatex,
          type: 'plot',
          variables: {},
          plotExpression: plotNoParens[1].trim(),
          plotType: 'cartesian',
        };
      }
    }

    // Handle solve command - supports both solve(equation, var) and solve(expression, var)
    if (type === 'equation') {
      const solveMatch = processed.match(/solve\s*\(/);
      if (solveMatch) {
        const openParenIdx = solveMatch[0].length - 1;
        const expr = extractBalanced(processed, openParenIdx);
        if (expr !== null) {
          try {
            // Check if there's a second argument (the variable to solve for)
            const parts = expr.split(',').map(s => s.trim());
            if (parts.length === 2) {
              const equationPart = parts[0];
              const varName = parts[1].replace(/['"]/g, '');
              // Handle equations with = sign: x^2 - 5*x + 6 = 0
              let lhs = equationPart;
              let rhs = '0';
              if (equationPart.includes('=')) {
                const eqParts = equationPart.split('=');
                lhs = eqParts[0].trim();
                rhs = eqParts[1].trim();
              }
              // Move everything to LHS: lhs - rhs = 0
              const exprToSolve = `(${lhs}) - (${rhs})`;
              try {
                // Use math.js's solve function if available, otherwise use symbolic algebra
                const solutions = math.evaluate(`solve(${exprToSolve}, ${varName})`, scope) as unknown;
                const resultStr = resultToLatex(solutions);
                return {
                  success: true,
                  result: resultStr,
                  latex: resultStr,
                  inputLatex,
                  type: 'equation',
                  variables: extractVariables(input, solutions),
                };
              } catch {
                // Fall back to numerical root finding for polynomials
                const roots = findRootsNumerically(exprToSolve, varName);
                if (roots.length > 0) {
                  // Round roots to clean up numerical errors
                  const cleanRoots = roots.map(r => {
                    // Try to round to nearby integer
                    const rounded = Math.round(r);
                    if (Math.abs(r - rounded) < 1e-6) return rounded;
                    // Try to round to nearby fraction with small denominator
                    for (let d = 2; d <= 20; d++) {
                      const numerator = Math.round(r * d);
                      if (Math.abs(r - numerator / d) < 1e-6) return numerator / d;
                    }
                    return Math.round(r * 1e6) / 1e6;
                  });
                  const rootsStr = cleanRoots.map(r => `${varName} = ${r}`).join(', ');
                  const rootsLatex = cleanRoots.map(r => `${varName} = ${resultToLatex(r)}`).join(', \\quad ');
                  return {
                    success: true,
                    result: rootsStr,
                    latex: rootsLatex,
                    inputLatex,
                    type: 'equation',
                    variables: {},
                  };
                }
                return {
                  success: false,
                  result: '',
                  latex: '',
                  inputLatex,
                  type: 'equation',
                  variables: {},
                  error: 'Could not solve equation. Try a different form.',
                };
              }
            }
            // Single argument - just evaluate
            const solution = math.evaluate(expr, scope) as unknown;
            const resultStr = resultToLatex(solution);
            return {
              success: true,
              result: resultStr,
              latex: resultStr,
              inputLatex,
              type: 'equation',
              variables: extractVariables(input, solution),
            };
          } catch (err) {
            // Fall through to standard evaluation
          }
        }
      }
    }

    // Standard evaluation
    const result = math.evaluate(processed, scope);

    if (result === undefined || result === null) {
      return {
        success: false,
        result: 'No result',
        latex: '',
        inputLatex,
        type,
        variables: {},
        error: 'Expression returned no result',
      };
    }

    // Handle assignment
    if (type === 'expression') {
      const assignmentMatch = processed.match(/^([a-zA-Z_]\w*)\s*=/);
      if (assignmentMatch) {
        const varName = assignmentMatch[1];
        scope[varName] = result;
        const resultStr = resultToLatex(result);
        const vars: Record<string, number> = {};
        if (typeof result === 'number') {
          vars[varName] = result;
        }
        return {
          success: true,
          result: `${varName} = ${resultStr}`,
          latex: resultStr,
          inputLatex,
          type: 'expression',
          variables: vars,
        };
      }
    }

    const resultStr = resultToLatex(result);
    return {
      success: true,
      result: resultStr,
      latex: resultStr,
      inputLatex,
      type,
      variables: extractVariables(input, result),
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';

    // In simple mode, if the expression contains 'x' and fails with "Undefined symbol",
    // automatically treat it as a plot expression (Desmos-like behavior)
    if (mode === 'simple' && /\bx\b/.test(processed)) {
      try {
        // Try to evaluate at x=1 to validate it's a valid expression
        const testExpr = processed.replace(/\bx\b/g, '(1)');
        math.evaluate(testExpr, { ...scope });
        // If it works, it's a valid expression of x - create a plot
        return {
          success: true,
          result: `Plot of y = ${processed}`,
          latex: inputLatex,
          inputLatex,
          type: 'plot',
          variables: {},
          plotExpression: processed,
        };
      } catch {
        // Not a valid expression even with x substituted, fall through to error
      }
    }

    // Provide friendlier error messages
    let friendlyError = errorMessage;
    if (errorMessage.toLowerCase().includes('undefined symbol') || errorMessage.toLowerCase().includes('is not defined') || errorMessage.toLowerCase().includes('undefined')) {
      if (mode === 'simple') {
        if (/\bx\b/.test(processed)) {
          friendlyError = `无法识别的符号。表达式含 x 但无法自动绘图，请检查语法`;
        } else {
          friendlyError = '无法识别的符号。是否需要先定义变量？';
        }
      } else {
        friendlyError = '无法识别的符号。是否需要先定义变量？';
      }
    } else if (errorMessage.includes('Unexpected end')) {
      friendlyError = '语法错误：缺少右括号或右方括号';
    }
    return {
      success: false,
      result: '',
      latex: '',
      inputLatex,
      type,
      variables: {},
      error: friendlyError,
    };
  }
}

// Quick evaluate for the instant calc bar
export function quickEval(input: string, mode: 'simple' | 'advanced' = 'simple'): string {
  try {
    const processed = preprocessInput(input, mode);
    const result = math.evaluate(processed, scope);
    return resultToLatex(result);
  } catch {
    return 'Error';
  }
}

// Evaluate at a specific x value (for plotting)
export function evalAtX(expression: string, x: number): number | null {
  try {
    const processed = preprocessInput(expression);
    const exprWithX = processed.replace(/\bx\b/g, `(${x})`);
    const result = math.evaluate(exprWithX, scope);
    if (typeof result === 'number' && isFinite(result)) {
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

// Unit conversion categories and factors (to base unit)
export interface UnitCategory {
  name: string;
  units: { name: string; symbol: string; toBase: number }[];
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    name: 'Length',
    units: [
      { name: 'Kilometer', symbol: 'km', toBase: 1000 },
      { name: 'Meter', symbol: 'm', toBase: 1 },
      { name: 'Centimeter', symbol: 'cm', toBase: 0.01 },
      { name: 'Millimeter', symbol: 'mm', toBase: 0.001 },
      { name: 'Micrometer', symbol: 'μm', toBase: 1e-6 },
      { name: 'Nanometer', symbol: 'nm', toBase: 1e-9 },
      { name: 'Mile', symbol: 'mi', toBase: 1609.344 },
      { name: 'Yard', symbol: 'yd', toBase: 0.9144 },
      { name: 'Foot', symbol: 'ft', toBase: 0.3048 },
      { name: 'Inch', symbol: 'in', toBase: 0.0254 },
      { name: 'Nautical Mile', symbol: 'nmi', toBase: 1852 },
    ],
  },
  {
    name: 'Mass',
    units: [
      { name: 'Tonne', symbol: 't', toBase: 1000 },
      { name: 'Kilogram', symbol: 'kg', toBase: 1 },
      { name: 'Gram', symbol: 'g', toBase: 0.001 },
      { name: 'Milligram', symbol: 'mg', toBase: 1e-6 },
      { name: 'Microgram', symbol: 'μg', toBase: 1e-9 },
      { name: 'Pound', symbol: 'lb', toBase: 0.45359237 },
      { name: 'Ounce', symbol: 'oz', toBase: 0.028349523125 },
      { name: 'Stone', symbol: 'st', toBase: 6.35029318 },
      { name: 'US Ton', symbol: 'ton', toBase: 907.18474 },
    ],
  },
  {
    name: 'Temperature',
    units: [
      { name: 'Celsius', symbol: '°C', toBase: 1 },
      { name: 'Fahrenheit', symbol: '°F', toBase: 1 },
      { name: 'Kelvin', symbol: 'K', toBase: 1 },
    ],
  },
  {
    name: 'Volume',
    units: [
      { name: 'Cubic Meter', symbol: 'm³', toBase: 1000 },
      { name: 'Liter', symbol: 'L', toBase: 1 },
      { name: 'Milliliter', symbol: 'mL', toBase: 0.001 },
      { name: 'Gallon (US)', symbol: 'gal', toBase: 3.785411784 },
      { name: 'Quart (US)', symbol: 'qt', toBase: 0.946352946 },
      { name: 'Pint (US)', symbol: 'pt', toBase: 0.473176473 },
      { name: 'Cup (US)', symbol: 'cup', toBase: 0.2365882365 },
      { name: 'Fluid Ounce (US)', symbol: 'fl oz', toBase: 0.0295735295625 },
      { name: 'Tablespoon', symbol: 'tbsp', toBase: 0.01478676478125 },
      { name: 'Teaspoon', symbol: 'tsp', toBase: 0.00492892159375 },
    ],
  },
  {
    name: 'Time',
    units: [
      { name: 'Year', symbol: 'yr', toBase: 31536000 },
      { name: 'Day', symbol: 'd', toBase: 86400 },
      { name: 'Hour', symbol: 'h', toBase: 3600 },
      { name: 'Minute', symbol: 'min', toBase: 60 },
      { name: 'Second', symbol: 's', toBase: 1 },
      { name: 'Millisecond', symbol: 'ms', toBase: 0.001 },
      { name: 'Microsecond', symbol: 'μs', toBase: 1e-6 },
      { name: 'Nanosecond', symbol: 'ns', toBase: 1e-9 },
    ],
  },
  {
    name: 'Speed',
    units: [
      { name: 'Meter/second', symbol: 'm/s', toBase: 1 },
      { name: 'Kilometer/hour', symbol: 'km/h', toBase: 0.277778 },
      { name: 'Mile/hour', symbol: 'mph', toBase: 0.44704 },
      { name: 'Foot/second', symbol: 'ft/s', toBase: 0.3048 },
      { name: 'Knot', symbol: 'kn', toBase: 0.514444 },
    ],
  },
  {
    name: 'Area',
    units: [
      { name: 'Square Kilometer', symbol: 'km²', toBase: 1e6 },
      { name: 'Square Meter', symbol: 'm²', toBase: 1 },
      { name: 'Square Centimeter', symbol: 'cm²', toBase: 0.0001 },
      { name: 'Square Mile', symbol: 'mi²', toBase: 2589988.110336 },
      { name: 'Square Yard', symbol: 'yd²', toBase: 0.83612736 },
      { name: 'Square Foot', symbol: 'ft²', toBase: 0.09290304 },
      { name: 'Square Inch', symbol: 'in²', toBase: 0.00064516 },
      { name: 'Acre', symbol: 'ac', toBase: 4046.8564224 },
      { name: 'Hectare', symbol: 'ha', toBase: 10000 },
    ],
  },
  {
    name: 'Energy',
    units: [
      { name: 'Joule', symbol: 'J', toBase: 1 },
      { name: 'Kilojoule', symbol: 'kJ', toBase: 1000 },
      { name: 'Calorie', symbol: 'cal', toBase: 4.184 },
      { name: 'Kilocalorie', symbol: 'kcal', toBase: 4184 },
      { name: 'Watt-hour', symbol: 'Wh', toBase: 3600 },
      { name: 'Kilowatt-hour', symbol: 'kWh', toBase: 3600000 },
      { name: 'Electronvolt', symbol: 'eV', toBase: 1.602176634e-19 },
      { name: 'BTU', symbol: 'BTU', toBase: 1055.05585262 },
    ],
  },
  {
    name: 'Pressure',
    units: [
      { name: 'Pascal', symbol: 'Pa', toBase: 1 },
      { name: 'Kilopascal', symbol: 'kPa', toBase: 1000 },
      { name: 'Megapascal', symbol: 'MPa', toBase: 1000000 },
      { name: 'Bar', symbol: 'bar', toBase: 100000 },
      { name: 'Atmosphere', symbol: 'atm', toBase: 101325 },
      { name: 'PSI', symbol: 'psi', toBase: 6894.757293168 },
      { name: 'Torr', symbol: 'Torr', toBase: 133.322368421 },
    ],
  },
  {
    name: 'Angle',
    units: [
      { name: 'Degree', symbol: '°', toBase: 1 },
      { name: 'Radian', symbol: 'rad', toBase: 57.29577951308232 },
      { name: 'Gradian', symbol: 'grad', toBase: 0.9 },
      { name: 'Arcminute', symbol: "'", toBase: 1/60 },
      { name: 'Arcsecond', symbol: '"', toBase: 1/3600 },
      { name: 'Revolution', symbol: 'rev', toBase: 360 },
    ],
  },
  {
    name: 'Data',
    units: [
      { name: 'Bit', symbol: 'bit', toBase: 1 },
      { name: 'Byte', symbol: 'B', toBase: 8 },
      { name: 'Kilobyte', symbol: 'KB', toBase: 8 * 1024 },
      { name: 'Megabyte', symbol: 'MB', toBase: 8 * 1024 * 1024 },
      { name: 'Gigabyte', symbol: 'GB', toBase: 8 * 1024 * 1024 * 1024 },
      { name: 'Terabyte', symbol: 'TB', toBase: 8 * 1024 ** 4 },
      { name: 'Petabyte', symbol: 'PB', toBase: 8 * 1024 ** 5 },
    ],
  },
];

// Convert a value from one unit to another
export function convertUnit(value: number, fromUnit: string, toUnit: string, category: string): number | null {
  const cat = UNIT_CATEGORIES.find(c => c.name === category);
  if (!cat) return null;

  // Special handling for temperature
  if (category === 'Temperature') {
    return convertTemperature(value, fromUnit, toUnit);
  }

  const from = cat.units.find(u => u.symbol === fromUnit || u.name === fromUnit);
  const to = cat.units.find(u => u.symbol === toUnit || u.name === toUnit);
  if (!from || !to) return null;

  // Convert to base, then to target
  const baseValue = value * from.toBase;
  return baseValue / to.toBase;
}

function convertTemperature(value: number, from: string, to: string): number {
  // Convert to Celsius first
  let celsius: number;
  if (from === '°C' || from === 'Celsius') celsius = value;
  else if (from === '°F' || from === 'Fahrenheit') celsius = (value - 32) * 5/9;
  else if (from === 'K' || from === 'Kelvin') celsius = value - 273.15;
  else celsius = value;

  // Convert from Celsius to target
  if (to === '°C' || to === 'Celsius') return celsius;
  if (to === '°F' || to === 'Fahrenheit') return celsius * 9/5 + 32;
  if (to === 'K' || to === 'Kelvin') return celsius + 273.15;
  return celsius;
}

// Number base conversion
export type NumberBase = 'bin' | 'oct' | 'dec' | 'hex';

export function convertBase(value: string, fromBase: NumberBase, toBase: NumberBase): string {
  try {
    // Parse the value from the source base
    let decimal: number;
    const cleaned = value.trim().replace(/^0[xbo]/i, '');

    switch (fromBase) {
      case 'bin': decimal = parseInt(cleaned, 2); break;
      case 'oct': decimal = parseInt(cleaned, 8); break;
      case 'dec': decimal = parseInt(cleaned, 10); break;
      case 'hex': decimal = parseInt(cleaned, 16); break;
    }

    if (isNaN(decimal)) return 'Invalid number';

    // Convert to target base
    let result: string;
    switch (toBase) {
      case 'bin': result = decimal.toString(2); break;
      case 'oct': result = decimal.toString(8); break;
      case 'dec': result = decimal.toString(10); break;
      case 'hex': result = decimal.toString(16).toUpperCase(); break;
    }

    return result;
  } catch {
    return 'Error';
  }
}

// Get all bases for a number
export function getAllBases(value: string, fromBase: NumberBase): { bin: string; oct: string; dec: string; hex: string } | null {
  try {
    const cleaned = value.trim().replace(/^0[xbo]/i, '');
    let decimal: number;

    switch (fromBase) {
      case 'bin': decimal = parseInt(cleaned, 2); break;
      case 'oct': decimal = parseInt(cleaned, 8); break;
      case 'dec': decimal = parseInt(cleaned, 10); break;
      case 'hex': decimal = parseInt(cleaned, 16); break;
    }

    if (isNaN(decimal)) return null;

    return {
      bin: decimal.toString(2),
      oct: decimal.toString(8),
      dec: decimal.toString(10),
      hex: decimal.toString(16).toUpperCase(),
    };
  } catch {
    return null;
  }
}

// Symbol definitions for the palette
export const SYMBOL_CATEGORIES: Record<string, SymbolItem[]> = {
  'Basic': [
    { label: '+', latex: '+', input: '+', category: 'Basic', description: '加法' },
    { label: '−', latex: '-', input: '-', category: 'Basic', description: '减法' },
    { label: '×', latex: '\\times', input: '*', category: 'Basic', description: '乘法' },
    { label: '÷', latex: '\\div', input: '/', category: 'Basic', description: '除法' },
    { label: '^', latex: '^', input: '^', category: 'Basic', description: '幂运算' },
    { label: '(', latex: '(', input: '(', category: 'Basic', description: '左括号' },
    { label: ')', latex: ')', input: ')', category: 'Basic', description: '右括号' },
    { label: '=', latex: '=', input: '=', category: 'Basic', description: '赋值' },
    { label: '!', latex: '!', input: '!', category: 'Basic', description: '阶乘' },
    { label: '%', latex: '\\%', input: '%', category: 'Basic', description: '取模' },
  ],
  'Greek': [
    { label: 'α', latex: '\\alpha', input: 'alpha', category: 'Greek', description: '阿尔法' },
    { label: 'β', latex: '\\beta', input: 'beta', category: 'Greek', description: '贝塔' },
    { label: 'γ', latex: '\\gamma', input: 'gamma', category: 'Greek', description: '伽马' },
    { label: 'δ', latex: '\\delta', input: 'delta', category: 'Greek', description: '德尔塔' },
    { label: 'ε', latex: '\\epsilon', input: 'epsilon', category: 'Greek', description: '伊普西龙' },
    { label: 'θ', latex: '\\theta', input: 'theta', category: 'Greek', description: '西塔' },
    { label: 'λ', latex: '\\lambda', input: 'lambda', category: 'Greek', description: '兰姆达' },
    { label: 'μ', latex: '\\mu', input: 'mu', category: 'Greek', description: '缪' },
    { label: 'π', latex: '\\pi', input: 'pi', category: 'Greek', description: '圆周率' },
    { label: 'σ', latex: '\\sigma', input: 'sigma', category: 'Greek', description: '西格玛' },
    { label: 'φ', latex: '\\phi', input: 'phi', category: 'Greek', description: '斐' },
    { label: 'ω', latex: '\\omega', input: 'omega', category: 'Greek', description: '欧米伽' },
  ],
  'Calculus': [
    { label: '∫', latex: '\\int', input: 'integrate(', category: 'Calculus', description: '积分' },
    { label: '∂', latex: '\\partial', input: 'derivative(', category: 'Calculus', description: '导数' },
    { label: 'lim', latex: '\\lim', input: 'limit(', category: 'Calculus', description: '极限' },
    { label: '∑', latex: '\\sum', input: 'sum(', category: 'Calculus', description: '求和' },
    { label: '∏', latex: '\\prod', input: 'prod(', category: 'Calculus', description: '求积' },
    { label: '∞', latex: '\\infty', input: 'Infinity', category: 'Calculus', description: '无穷大' },
  ],
  'Trigonometry': [
    { label: 'sin', latex: '\\sin', input: 'sin(', category: 'Trigonometry', description: '正弦' },
    { label: 'cos', latex: '\\cos', input: 'cos(', category: 'Trigonometry', description: '余弦' },
    { label: 'tan', latex: '\\tan', input: 'tan(', category: 'Trigonometry', description: '正切' },
    { label: 'asin', latex: '\\arcsin', input: 'asin(', category: 'Trigonometry', description: '反正弦' },
    { label: 'acos', latex: '\\arccos', input: 'acos(', category: 'Trigonometry', description: '反余弦' },
    { label: 'atan', latex: '\\arctan', input: 'atan(', category: 'Trigonometry', description: '反正切' },
    { label: 'sinh', latex: '\\sinh', input: 'sinh(', category: 'Trigonometry', description: '双曲正弦' },
    { label: 'cosh', latex: '\\cosh', input: 'cosh(', category: 'Trigonometry', description: '双曲余弦' },
    { label: 'tanh', latex: '\\tanh', input: 'tanh(', category: 'Trigonometry', description: '双曲正切' },
  ],
  'Log & Exp': [
    { label: 'log', latex: '\\log', input: 'log(', category: 'Log & Exp', description: '常用对数（底10）' },
    { label: 'ln', latex: '\\ln', input: 'ln(', category: 'Log & Exp', description: '自然对数' },
    { label: 'log₂', latex: '\\log_2', input: 'log2(', category: 'Log & Exp', description: '以2为底对数' },
    { label: 'exp', latex: '\\exp', input: 'exp(', category: 'Log & Exp', description: 'e的x次方' },
    { label: '√', latex: '\\sqrt{}', input: 'sqrt(', category: 'Log & Exp', description: '平方根' },
    { label: '∛', latex: '\\sqrt[3]{}', input: 'cbrt(', category: 'Log & Exp', description: '立方根' },
    { label: 'abs', latex: '||', input: 'abs(', category: 'Log & Exp', description: '绝对值' },
    { label: '⌊x⌋', latex: '\\lfloor \\rfloor', input: 'floor(', category: 'Log & Exp', description: '向下取整' },
    { label: '⌈x⌉', latex: '\\lceil \\rceil', input: 'ceil(', category: 'Log & Exp', description: '向上取整' },
    { label: '!', latex: '!', input: 'factorial(', category: 'Log & Exp', description: '阶乘' },
  ],
  'Linear Algebra': [
    { label: 'det', latex: '\\det', input: 'det(', category: 'Linear Algebra', description: '行列式' },
    { label: 'inv', latex: '^{-1}', input: 'inv(', category: 'Linear Algebra', description: '逆矩阵' },
    { label: 'T', latex: '^T', input: ".transpose()", category: 'Linear Algebra', description: '转置' },
    { label: '[ ]', latex: '\\begin{bmatrix}\\end{bmatrix}', input: '[[],[]]', category: 'Linear Algebra', description: '矩阵' },
    { label: 'eig', latex: '\\text{eig}', input: 'eigs(', category: 'Linear Algebra', description: '特征值' },
    { label: 'trace', latex: '\\text{tr}', input: 'trace(', category: 'Linear Algebra', description: '迹' },
    { label: 'rank', latex: '\\text{rank}', input: 'rank(', category: 'Linear Algebra', description: '秩' },
  ],
  'Statistics': [
    { label: 'mean', latex: '\\bar{x}', input: 'mean(', category: 'Statistics', description: '平均值' },
    { label: 'median', latex: '\\tilde{x}', input: 'median(', category: 'Statistics', description: '中位数' },
    { label: 'std', latex: '\\sigma', input: 'std(', category: 'Statistics', description: '标准差' },
    { label: 'var', latex: '\\sigma^2', input: 'variance(', category: 'Statistics', description: '方差' },
    { label: 'min', latex: '\\min', input: 'min(', category: 'Statistics', description: '最小值' },
    { label: 'max', latex: '\\max', input: 'max(', category: 'Statistics', description: '最大值' },
    { label: '∑', latex: '\\sum', input: 'sum(', category: 'Statistics', description: '求和' },
    { label: '∏', latex: '\\prod', input: 'prod(', category: 'Statistics', description: '求积' },
  ],
  'Combinatorics': [
    { label: 'nPr', latex: 'P', input: 'permutations(', category: 'Combinatorics', description: '排列' },
    { label: 'nCr', latex: 'C', input: 'combinations(', category: 'Combinatorics', description: '组合' },
    { label: 'gcd', latex: '\\gcd', input: 'gcd(', category: 'Combinatorics', description: '最大公约数' },
    { label: 'lcm', latex: '\\text{lcm}', input: 'lcm(', category: 'Combinatorics', description: '最小公倍数' },
    { label: '!', latex: '!', input: 'factorial(', category: 'Combinatorics', description: '阶乘' },
  ],
  'Constants': [
    { label: 'π', latex: '\\pi', input: 'pi', category: 'Constants', description: '圆周率 ≈ 3.14159' },
    { label: 'e', latex: 'e', input: 'e', category: 'Constants', description: '自然底数 ≈ 2.71828' },
    { label: 'φ', latex: '\\varphi', input: '(1+sqrt(5))/2', category: 'Constants', description: '黄金比例 ≈ 1.618' },
    { label: 'i', latex: 'i', input: 'i', category: 'Constants', description: '虚数单位' },
    { label: '∞', latex: '\\infty', input: 'Infinity', category: 'Constants', description: '无穷大' },
    { label: 'τ', latex: '\\tau', input: '2*pi', category: 'Constants', description: '2π ≈ 6.28318' },
  ],
};

// Guide content (Chinese)
export const GUIDE_SECTIONS = [
  {
    title: '快速入门',
    content: `欢迎使用 OmniMath！输入数学表达式，按 Enter 即可计算。

简单模式下可以直接输入：
  2 + 3          → 5
  sin pi/4       → 0.7071
  sqrt 2         → 1.4142
  arctan 1       → 0.7854

高级模式下使用严格语法：
  sin(pi/4)      → 0.7071
  sqrt(2)        → 1.4142
  factorial(5)   → 120`,
  },
  {
    title: '简单模式',
    content: `简单模式像 Desmos 一样自动识别，无需严格语法：

  sin x          → sin(x)
  cos 2x         → cos(2*x)
  arctan x       → atan(x)
  sqrt x         → sqrt(x)
  ln x           → ln(x)
  2x + 3         → 2*x + 3
  x² + 1         → x^2 + 1（支持上标字符）

函数后跟空格和参数即可，也可以使用括号：
  sin(x)         → 同样有效
  cos(x) + 1     → 同样有效

点击编辑器工具栏的"简单/高级"切换模式。`,
  },
  {
    title: '变量',
    content: `使用 = 赋值变量：

  x = 5          → x = 5
  y = x^2        → y = 25
  x + y          → 30

变量在计算间持久保存，可在变量面板中查看。`,
  },
  {
    title: '矩阵',
    content: `使用 [ ] 输入矩阵，用 ; 分隔行：

  A = [1,2;3,4]    → 矩阵
  det(A)            → -2
  inv(A)            → 逆矩阵
  A * A             → 矩阵乘法
  A.transpose()     → 转置`,
  },
  {
    title: '函数',
    content: `可用函数：
  三角函数：sin, cos, tan, asin, acos, atan, sinh, cosh, tanh
  对数：log（底10）, ln（自然对数）, log2, log10
  幂与根：sqrt, cbrt, exp, abs
  取整：floor, ceil, round
  统计：mean, median, std, variance, min, max
  数论：factorial, gcd, lcm, combinations, permutations`,
  },
  {
    title: '绘图',
    content: `使用 plot() 创建交互式 2D 图表：

  plot(sin(x))
  plot(x^2 - 3*x + 1)
  plot(exp(-x/5)*sin(x))

指定 x 范围（第三个和第四个参数）：

  plot(sin(x), -pi, pi)
  plot(x^2, -5, 5)

极坐标绘图（x 为角度 θ）：

  polarplot(cos(2*x))
  polarplot(sin(3*x))
  polarplot(1 + cos(x), 0, 2*pi)

简单模式下，含 x 的表达式会自动绘图：

  sin x           → 自动绘图
  x^2 + 2*x - 1   → 自动绘图

图表支持缩放（滚轮）、平移（拖拽）、悬停查看坐标。`,
  },
  {
    title: '方程求解',
    content: `使用 solve() 求解方程的根：

  solve(x^2 - 5*x + 6, x)    → x = 2, x = 3
  solve(x^3 - 6*x^2 + 11*x - 6, x)
  solve(sin(x) - 0.5, x)

求解器使用数值方法（二分法）查找根。`,
  },
  {
    title: '单位转换',
    content: `使用左侧栏的单位转换器进行转换：

  长度：m, km, cm, mm, mi, ft, in...
  质量：kg, g, lb, oz, t...
  温度：°C, °F, K
  体积：L, mL, gal, qt, cup...
  时间：s, min, h, d, yr...
  还有：速度、面积、能量、压力、角度、数据`,
  },
  {
    title: '进制转换',
    content: `使用进制转换器在不同进制间转换：

  二进制（基数2）：101010
  八进制（基数8）：52
  十进制（基数10）：42
  十六进制（基数16）：2A

还会显示小数字的位可视化。`,
  },
  {
    title: '键盘快捷键',
    content: `Enter       →  计算表达式
Shift+Enter →  换行
Ctrl+K      →  快速计算栏
Ctrl+Shift+P →  命令面板
Ctrl+B      →  切换侧栏
?           →  显示键盘快捷键
Esc         →  关闭对话框

点击历史记录项可重新加载到编辑器。`,
  },
];

// Example templates for quick insertion
export const EXAMPLE_TEMPLATES: { title: string; description: string; code: string }[] = [
  {
    title: '求根公式',
    description: '求解 ax² + bx + c = 0',
    code: `a = 1
b = -5
c = 6
x1 = (-b + sqrt(b^2 - 4*a*c)) / (2*a)
x2 = (-b - sqrt(b^2 - 4*a*c)) / (2*a)`,
  },
  {
    title: '矩阵运算',
    description: '线性代数示例',
    code: `A = [1,2;3,4]
B = [5,6;7,8]
A * B
det(A)
inv(A)`,
  },
  {
    title: '三角函数',
    description: '常用三角值',
    code: `sin(pi/6)
cos(pi/3)
tan(pi/4)
sin(pi/2)^2 + cos(pi/2)^2`,
  },
  {
    title: '统计分析',
    description: '数据分析示例',
    code: `data = [2, 4, 4, 4, 5, 5, 7, 9]
mean(data)
median(data)
std(data)
variance(data)`,
  },
  {
    title: '正弦波形',
    description: '交互式图表',
    code: `plot(sin(x))`,
  },
  {
    title: '阻尼振荡',
    description: '衰减正弦波',
    code: `plot(exp(-x/5) * sin(2*x))`,
  },
  {
    title: '复利计算',
    description: 'A = P(1 + r/n)^(nt)',
    code: `P = 1000
r = 0.05
n = 12
t = 10
A = P * (1 + r/n)^(n*t)`,
  },
  {
    title: '阶乘与组合',
    description: '计数示例',
    code: `factorial(10)
combinations(10, 3)
permutations(10, 3)
gcd(48, 36)
lcm(4, 6)`,
  },
  {
    title: '微积分 - 导数',
    description: '求函数导数',
    code: `derivative('x^3 + 2*x^2 - 5*x + 1', 'x')
derivative('sin(x) * cos(x)', 'x')
derivative('exp(x) * ln(x)', 'x')`,
  },
  {
    title: '微积分 - 积分',
    description: '定积分计算',
    code: `integrate('x^2', 'x', 0, 1)
integrate('sin(x)', 'x', 0, pi)
integrate('exp(x)', 'x', 0, 1)`,
  },
  {
    title: '多函数对比',
    description: '同时绘制多条曲线',
    code: `plot(sin(x), -2*pi, 2*pi)
plot(cos(x), -2*pi, 2*pi)
plot(sin(x) + cos(x), -2*pi, 2*pi)`,
  },
  {
    title: '参数方程绘图',
    description: '利萨如曲线',
    code: `plot(sin(3*x), -pi, pi)
plot(cos(2*x), -pi, pi)`,
  },
  {
    title: '极坐标绘图',
    description: '玫瑰曲线和心形线',
    code: `polarplot(cos(2*x), 0, 2*pi)
polarplot(sin(3*x), 0, 2*pi)
polarplot(1 + cos(x), 0, 2*pi)`,
  },
  {
    title: '指数与对数',
    description: '指数和对数函数',
    code: `plot(exp(x), -2, 2)
plot(log(x), 0.1, 10)
plot(ln(x), 0.1, 10)`,
  },
  {
    title: '三角函数族',
    description: '六种三角函数对比',
    code: `plot(sin(x), -2*pi, 2*pi)
plot(cos(x), -2*pi, 2*pi)
plot(tan(x), -pi/2, pi/2)`,
  },
];

// Formula Library - common mathematical formulas organized by category
export interface FormulaItem {
  name: string;       // Chinese name
  nameEn: string;     // English name (for reference)
  latex: string;      // LaTeX rendering
  description: string; // Chinese description
  example: string;    // Example input
}

export interface FormulaCategory {
  name: string;       // Category name (Chinese)
  nameEn: string;
  icon: string;       // Emoji icon
  formulas: FormulaItem[];
}

export const FORMULA_LIBRARY: FormulaCategory[] = [
  {
    name: '代数',
    nameEn: 'Algebra',
    icon: '🔤',
    formulas: [
      {
        name: '二次方程求根公式',
        nameEn: 'Quadratic Formula',
        latex: 'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
        description: '求解二次方程 ax² + bx + c = 0',
        example: 'solve(x^2 - 5*x + 6, x)',
      },
      {
        name: '完全平方公式',
        nameEn: 'Perfect Square',
        latex: '(a + b)^2 = a^2 + 2ab + b^2',
        description: '两数和的平方',
        example: '(a + b)^2',
      },
      {
        name: '平方差公式',
        nameEn: 'Difference of Squares',
        latex: 'a^2 - b^2 = (a+b)(a-b)',
        description: '两数平方差',
        example: 'a^2 - b^2',
      },
      {
        name: '等差数列求和',
        nameEn: 'Arithmetic Series',
        latex: 'S_n = \\frac{n(a_1 + a_n)}{2}',
        description: '等差数列前 n 项和',
        example: 'sum(2*k + 1, k, 1, 10)',
      },
      {
        name: '等比数列求和',
        nameEn: 'Geometric Series',
        latex: 'S_n = \\frac{a_1(1 - r^n)}{1 - r}',
        description: '等比数列前 n 项和',
        example: 'sum(2^k, k, 1, 10)',
      },
    ],
  },
  {
    name: '几何',
    nameEn: 'Geometry',
    icon: '📐',
    formulas: [
      {
        name: '勾股定理',
        nameEn: 'Pythagorean Theorem',
        latex: 'a^2 + b^2 = c^2',
        description: '直角三角形三边关系',
        example: 'sqrt(3^2 + 4^2)',
      },
      {
        name: '圆的面积',
        nameEn: 'Area of Circle',
        latex: 'A = \\pi r^2',
        description: '半径为 r 的圆面积',
        example: 'pi * 5^2',
      },
      {
        name: '圆的周长',
        nameEn: 'Circumference',
        latex: 'C = 2\\pi r',
        description: '半径为 r 的圆周长',
        example: '2 * pi * 5',
      },
      {
        name: '球体体积',
        nameEn: 'Sphere Volume',
        latex: 'V = \\frac{4}{3}\\pi r^3',
        description: '半径为 r 的球体体积',
        example: '(4/3) * pi * 3^3',
      },
      {
        name: '三角形面积',
        nameEn: 'Triangle Area',
        latex: 'A = \\frac{1}{2}bh',
        description: '底为 b，高为 h 的三角形面积',
        example: '0.5 * 6 * 4',
      },
      {
        name: '梯形面积',
        nameEn: 'Trapezoid Area',
        latex: 'A = \\frac{(a+b)h}{2}',
        description: '梯形面积公式',
        example: '(4 + 6) * 3 / 2',
      },
    ],
  },
  {
    name: '三角函数',
    nameEn: 'Trigonometry',
    icon: '📊',
    formulas: [
      {
        name: '毕达哥拉斯恒等式',
        nameEn: 'Pythagorean Identity',
        latex: '\\sin^2 \\theta + \\cos^2 \\theta = 1',
        description: '基本三角恒等式',
        example: 'sin(pi/4)^2 + cos(pi/4)^2',
      },
      {
        name: '正弦定理',
        nameEn: 'Law of Sines',
        latex: '\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}',
        description: '三角形边角关系',
        example: 'sin(pi/3) / 1',
      },
      {
        name: '余弦定理',
        nameEn: 'Law of Cosines',
        latex: 'c^2 = a^2 + b^2 - 2ab\\cos C',
        description: '三角形边角关系',
        example: 'sqrt(3^2 + 4^2 - 2*3*4*cos(pi/3))',
      },
      {
        name: '二倍角公式',
        nameEn: 'Double Angle',
        latex: '\\sin(2\\theta) = 2\\sin\\theta\\cos\\theta',
        description: '正弦二倍角公式',
        example: 'sin(2 * pi/6)',
      },
      {
        name: '半角公式',
        nameEn: 'Half Angle',
        latex: '\\sin^2\\frac{\\theta}{2} = \\frac{1 - \\cos\\theta}{2}',
        description: '正弦半角公式',
        example: '(1 - cos(pi/3)) / 2',
      },
    ],
  },
  {
    name: '微积分',
    nameEn: 'Calculus',
    icon: '∫',
    formulas: [
      {
        name: '导数定义',
        nameEn: 'Derivative Definition',
        latex: "f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}",
        description: '导数的极限定义',
        example: "derivative('x^2', 'x')",
      },
      {
        name: '幂函数导数',
        nameEn: 'Power Rule',
        latex: "\\frac{d}{dx} x^n = nx^{n-1}",
        description: '幂函数的导数公式',
        example: "derivative('x^3', 'x')",
      },
      {
        name: '链式法则',
        nameEn: 'Chain Rule',
        latex: "\\frac{d}{dx} f(g(x)) = f'(g(x)) \\cdot g'(x)",
        description: '复合函数求导',
        example: "derivative('sin(x^2)', 'x')",
      },
      {
        name: '基本积分',
        nameEn: 'Basic Integral',
        latex: '\\int x^n dx = \\frac{x^{n+1}}{n+1} + C',
        description: '幂函数的不定积分',
        example: "integrate('x^2', 'x')",
      },
      {
        name: '定积分',
        nameEn: 'Definite Integral',
        latex: '\\int_a^b f(x) dx = F(b) - F(a)',
        description: '牛顿-莱布尼茨公式',
        example: "integrate('x^2', 'x', 0, 1)",
      },
    ],
  },
  {
    name: '统计',
    nameEn: 'Statistics',
    icon: '📈',
    formulas: [
      {
        name: '平均值',
        nameEn: 'Mean',
        latex: '\\bar{x} = \\frac{1}{n} \\sum_{i=1}^{n} x_i',
        description: '算术平均值',
        example: 'mean([1, 2, 3, 4, 5])',
      },
      {
        name: '方差',
        nameEn: 'Variance',
        latex: '\\sigma^2 = \\frac{1}{n} \\sum_{i=1}^{n} (x_i - \\bar{x})^2',
        description: '总体方差',
        example: 'variance([1, 2, 3, 4, 5])',
      },
      {
        name: '标准差',
        nameEn: 'Standard Deviation',
        latex: '\\sigma = \\sqrt{\\frac{1}{n} \\sum_{i=1}^{n} (x_i - \\bar{x})^2}',
        description: '总体标准差',
        example: 'std([1, 2, 3, 4, 5])',
      },
      {
        name: '中位数',
        nameEn: 'Median',
        latex: '\\tilde{x} = \\text{中位数}',
        description: '数据集的中间值',
        example: 'median([1, 3, 5, 7, 9])',
      },
      {
        name: '排列数',
        nameEn: 'Permutation',
        latex: 'P(n, k) = \\frac{n!}{(n-k)!}',
        description: '从 n 个中取 k 个的排列数',
        example: 'permutations(5, 3)',
      },
      {
        name: '组合数',
        nameEn: 'Combination',
        latex: 'C(n, k) = \\frac{n!}{k!(n-k)!}',
        description: '从 n 个中取 k 个的组合数',
        example: 'combinations(5, 3)',
      },
    ],
  },
  {
    name: '物理',
    nameEn: 'Physics',
    icon: '⚛',
    formulas: [
      {
        name: '牛顿第二定律',
        nameEn: "Newton's Second Law",
        latex: 'F = ma',
        description: '力等于质量乘以加速度',
        example: '5 * 9.8',
      },
      {
        name: '动能',
        nameEn: 'Kinetic Energy',
        latex: 'E_k = \\frac{1}{2}mv^2',
        description: '物体动能',
        example: '0.5 * 2 * 10^2',
      },
      {
        name: '势能',
        nameEn: 'Potential Energy',
        latex: 'E_p = mgh',
        description: '重力势能',
        example: '2 * 9.8 * 10',
      },
      {
        name: '欧姆定律',
        nameEn: "Ohm's Law",
        latex: 'V = IR',
        description: '电压等于电流乘以电阻',
        example: '2 * 10',
      },
      {
        name: '万有引力',
        nameEn: 'Universal Gravitation',
        latex: 'F = G\\frac{m_1 m_2}{r^2}',
        description: '两质点间的引力',
        example: '6.674e-11 * 5 * 10 / 1^2',
      },
    ],
  },
  {
    name: '金融',
    nameEn: 'Finance',
    icon: '💰',
    formulas: [
      {
        name: '复利公式',
        nameEn: 'Compound Interest',
        latex: 'A = P(1 + \\frac{r}{n})^{nt}',
        description: '复利计算',
        example: '1000 * (1 + 0.05/12)^(12*10)',
      },
      {
        name: '连续复利',
        nameEn: 'Continuous Compounding',
        latex: 'A = Pe^{rt}',
        description: '连续复利计算',
        example: '1000 * exp(0.05 * 10)',
      },
      {
        name: '现值',
        nameEn: 'Present Value',
        latex: 'PV = \\frac{FV}{(1+r)^n}',
        description: '未来价值的现值',
        example: '1000 / (1.05)^10',
      },
      {
        name: '等额本息',
        nameEn: 'Loan Payment',
        latex: 'PMT = P \\cdot \\frac{r(1+r)^n}{(1+r)^n - 1}',
        description: '贷款等额本息月供',
        example: '100000 * (0.05/12 * (1 + 0.05/12)^360) / ((1 + 0.05/12)^360 - 1)',
      },
    ],
  },
];
