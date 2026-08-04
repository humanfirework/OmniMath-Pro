/**
 * 数据输入解析器 — Task 10a
 *
 * 边界情况测试说明（不用写 .test.ts，只在注释中验证逻辑正确）：
 *
 * 1) 空串 ""
 *    split 得到 [""], 每项 trim 后 "", 空跳过 → { numbers: [], invalid: [] }  ✓
 *
 * 2) 全非法 "abc, foo bar"
 *    split 得到 ["abc", "foo", "bar"], 每项 parseFloat → NaN
 *    → { numbers: [], invalid: ["abc","foo","bar"] }                    ✓
 *
 * 3) 单数字 "42"
 *    split 得到 ["42"], parseFloat → 42 (有限)
 *    → { numbers: [42], invalid: [] }                                    ✓
 *
 * 4) 科学计数法 "1.2e-3, 5e2, -1E+10"
 *    parseFloat("1.2e-3") = 0.0012, 有限
 *    parseFloat("5e2") = 500, 有限
 *    parseFloat("-1E+10") = -10000000000, 有限
 *    → { numbers: [0.0012, 500, -10000000000], invalid: [] }            ✓
 *
 * 5) 混合 "1, abc, 2.5, -, 3e10, NaN"
 *    → numbers: [1, 2.5, 3e10]
 *    → invalid: ["abc", "-", "NaN"]                                     ✓
 */
export function parseNumericInput(raw: string): { numbers: number[]; invalid: string[] } {
  const tokens = raw.split(/[,;\s\n\t]+/);
  const numbers: number[] = [];
  const invalid: string[] = [];

  for (const tok of tokens) {
    const t = tok.trim();
    if (t.length === 0) continue;
    const n = parseFloat(t);
    if (Number.isFinite(n)) {
      numbers.push(n);
    } else {
      invalid.push(t);
    }
  }

  return { numbers, invalid };
}
