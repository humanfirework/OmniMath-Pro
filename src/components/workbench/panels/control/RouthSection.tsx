'use client';

/**
 * OmniMath Pro — 劳斯判据（Routh-Hurwitz）稳定性分析
 *
 * 输入特征方程系数（高次在前），构造劳斯表并给出稳定性结论。
 */

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { routhStability, parsePolynomial } from '@/lib/control/transferFunction';
import { polyToLatex } from '@/components/workbench/panels/ControlTheorySection';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { polyToLatexFrac } from '@/components/workbench/panels/control/latex';

const PRESETS: { name: string; coeffs: string; desc: string }[] = [
  { name: '稳定三阶', coeffs: '1, 6, 11, 6', desc: 's³+6s²+11s+6，极点 -1/-2/-3' },
  { name: '不稳定三阶', coeffs: '1, 2, 3, 6', desc: '存在右半平面根' },
  { name: '临界（虚轴根）', coeffs: '1, 1, 4, 4', desc: '存在 ±2i 共轭虚根' },
  { name: '二阶临界值判据', coeffs: '1, 2, 2', desc: 's²+2s+2，稳定欠阻尼' },
];

export function RouthSection() {
  const [coeffStr, setCoeffStr] = useState('1, 6, 11, 6');
  // 输入模式：'poly' 直接写多项式/系数串；'split' 逐项分格填写系数。
  const [inputMode, setInputMode] = useState<'poly' | 'split'>('poly');
  // 分格模式下逐项系数（高次在前）
  const [splitVals, setSplitVals] = useState<string[]>(['1', '6', '11', '6']);

  const stringCoeffs = useMemo(() => {
    try {
      const parsed = parsePolynomial(coeffStr);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [coeffStr]);

  const coeffs = useMemo(() => {
    if (inputMode === 'split') {
      return splitVals.map((v) => Number(v.trim()));
    }
    return stringCoeffs;
  }, [inputMode, splitVals, stringCoeffs]);

  const result = useMemo(() => {
    if (coeffs.length === 0 || coeffs.some((x) => !Number.isFinite(x))) return null;
    return routhStability(coeffs);
  }, [coeffs]);

  const switchMode = (mode: 'poly' | 'split') => {
    setInputMode(mode);
    if (mode === 'split') {
      // 从当前多项式/系数串同步到分格
      const cur = stringCoeffs.length && stringCoeffs.some(Number.isFinite) ? stringCoeffs : [];
      setSplitVals(cur.length ? cur.map(String) : ['1']);
    }
  };

  const updateSplit = (idx: number, val: string) => {
    setSplitVals((prev) => prev.map((v, i) => (i === idx ? val : v)));
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/40 bg-background/30 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10.5px] font-medium text-muted-foreground">
            特征方程（高次在前）
          </div>
          <div className="flex rounded-md border border-border/50 p-0.5 text-[10.5px]">
            <button
              onClick={() => switchMode('poly')}
              className={cn(
                'px-2 py-0.5 rounded transition-colors',
                inputMode === 'poly' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              写多项式
            </button>
            <button
              onClick={() => switchMode('split')}
              className={cn(
                'px-2 py-0.5 rounded transition-colors',
                inputMode === 'split' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              逐项填系数
            </button>
          </div>
        </div>

        {inputMode === 'poly' ? (
          <>
            <Input
              value={coeffStr}
              onChange={(e) => setCoeffStr(e.target.value)}
              className="h-8 font-mono text-[12px]"
              placeholder="例：s^3+6s^2+11s+6 或 1,6,11,6"
            />
            <div className="text-[10px] text-muted-foreground">
              可直接写多项式，如 <span className="font-mono">s^3+6s^2+11s+6</span>，或只写系数 <span className="font-mono">1,6,11,6</span>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-end gap-1.5">
              {splitVals.map((v, i) => (
                <div key={i} className="flex flex-col items-center gap-0.5">
                  <Input
                    value={v}
                    onChange={(e) => updateSplit(i, e.target.value)}
                    inputMode="decimal"
                    className="h-8 w-16 text-center font-mono text-[12px]"
                  />
                  <span className="text-[9px] text-muted-foreground">
                    {i === 0 ? '最高次' : splitVals.length - 1 - i === 0 ? '常数' : `s^${splitVals.length - 1 - i}`}
                  </span>
                </div>
              ))}
              <button
                onClick={() => setSplitVals((prev) => [...prev, '0'])}
                className={cn(
                  'h-7 px-2 rounded border text-[10px] transition-colors',
                  'border-dashed border-border/60 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
                title="增加高次项"
              >
                + 高次
              </button>
              {splitVals.length > 1 && (
                <button
                  onClick={() => setSplitVals((prev) => prev.slice(0, -1))}
                  className={cn(
                    'h-7 px-2 rounded border text-[10px] transition-colors',
                    'border-dashed border-border/60 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400',
                  )}
                  title="移除最低次项"
                >
                  − 低次
                </button>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground">
              每个输入框对应一个系数（高次在前）。可用「+ 高次 / − 低次」调整阶数。
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-1">
          {PRESETS.map((ex) => (
            <button
              key={ex.name}
              title={ex.desc}
              onClick={() => {
                const pc = parsePolynomial(ex.coeffs);
                if (inputMode === 'split') setSplitVals(pc.map(String));
                else setCoeffStr(ex.coeffs);
              }}
              className={cn(
                'h-6 px-2 rounded text-[10px] border transition-colors',
                (inputMode === 'poly' ? coeffStr : splitVals.join(',')) === ex.coeffs
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/50 text-muted-foreground hover:bg-accent/60',
              )}
            >
              {ex.name}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <>
          {('error' in result) ? (
            <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11.5px] text-rose-600 dark:text-rose-300">
              {result.error}
            </div>
          ) : (
            <>
              {/* 结论 */}
              <div
                className={cn(
                  'rounded-md border p-2.5 text-[12px]',
                  result.marginal
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                    : result.stable
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                      : 'border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-300',
                )}
              >
                <div className="font-semibold">
                  {result.marginal
                    ? '临界稳定（需辅助方程进一步判断）'
                    : result.stable
                      ? '系统稳定'
                      : `系统不稳定（右半平面根数 = ${result.changes}）`}
                </div>
                <div className="mt-0.5 text-[11px] opacity-90">{result.note}</div>
              </div>

              {/* 劳斯表 */}
              <div className="rounded-md border border-border/40 bg-background/30 p-3">
                <div className="text-[10.5px] font-medium text-muted-foreground mb-2">
                  劳斯表（首列符号变号 {result.changes} 次）
                </div>
                <div className="overflow-x-auto">
                  <table className="text-[11px] font-mono border-collapse">
                    <thead>
                      <tr>
                        <th className="px-2 py-1 text-left text-muted-foreground font-medium">s 次幂</th>
                        {result.table[0]?.cols.map((_, i) => (
                          <th key={i} className="px-3 py-1 text-left text-muted-foreground font-medium">
                            sⁿ⁻{i} 列
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.table.map((row, ri) => (
                        <tr
                          key={ri}
                          className={cn(
                            ri === 0 || ri === 1 ? 'bg-muted/20' : '',
                            'border-t border-border/30',
                          )}
                        >
                          <td className="px-2 py-1 text-muted-foreground">{row.label}</td>
                          {row.cols.map((c, ci) => (
                            <td key={ci} className="px-3 py-1 tabular-nums">
                              {Math.abs(c) < 1e-9 ? '0' : Number(c.toPrecision(5))}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* LaTeX 展示：特征方程写成 D(s)=0，并用 KaTeX 渲染 */}
              <div className="rounded-md border border-border/40 bg-background/30 p-2.5">
                <div className="text-[10px] text-muted-foreground mb-1">特征方程（渲染预览 + 文本）</div>
                <FormulaRenderer
                  latex={`D(s) = ${polyToLatex(coeffs)} = 0`}
                  displayMode
                  fitToContainer
                  className="text-sm"
                />
                <div className="mt-1 overflow-x-auto text-[11.5px] font-mono text-muted-foreground">
                  D(s) = {polyToLatex(coeffs)} = 0
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}