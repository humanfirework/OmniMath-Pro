'use client';

/**
 * OmniMath Pro — 劳斯判据（Routh-Hurwitz）稳定性分析
 *
 * 输入特征方程系数（高次在前），构造劳斯表并给出稳定性结论。
 */

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { routhStability } from '@/lib/control/transferFunction';
import { polyToLatex } from '@/components/workbench/panels/ControlTheorySection';

const PRESETS: { name: string; coeffs: string; desc: string }[] = [
  { name: '稳定三阶', coeffs: '1, 6, 11, 6', desc: 's³+6s²+11s+6，极点 -1/-2/-3' },
  { name: '不稳定三阶', coeffs: '1, 2, 3, 6', desc: '存在右半平面根' },
  { name: '临界（虚轴根）', coeffs: '1, 1, 4, 4', desc: '存在 ±2i 共轭虚根' },
  { name: '二阶临界值判据', coeffs: '1, 2, 2', desc: 's²+2s+2，稳定欠阻尼' },
];

export function RouthSection() {
  const [coeffStr, setCoeffStr] = useState('1, 6, 11, 6');

  const coeffs = useMemo(() => {
    try {
      return coeffStr
        .split(/[,，\s]+/)
        .filter((x) => x.trim() !== '')
        .map((x) => Number(x.trim()));
    } catch {
      return [];
    }
  }, [coeffStr]);

  const result = useMemo(() => {
    if (coeffs.length === 0 || coeffs.some((x) => !Number.isFinite(x))) return null;
    return routhStability(coeffs);
  }, [coeffs]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/40 bg-background/30 p-3 space-y-2">
        <div className="text-[10.5px] font-medium text-muted-foreground">
          特征方程系数（高次在前，逗号分隔）：aₙsⁿ + … + a₁s + a₀
        </div>
        <Input
          value={coeffStr}
          onChange={(e) => setCoeffStr(e.target.value)}
          className="h-8 font-mono text-[12px]"
          placeholder="例：1, 6, 11, 6"
        />
        <div className="flex flex-wrap gap-1">
          {PRESETS.map((ex) => (
            <button
              key={ex.name}
              title={ex.desc}
              onClick={() => setCoeffStr(ex.coeffs)}
              className={cn(
                'h-6 px-2 rounded text-[10px] border transition-colors',
                coeffStr === ex.coeffs
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

              {/* LaTeX 展示 */}
              <div className="rounded-md border border-border/40 bg-background/30 p-2.5">
                <div className="text-[10px] text-muted-foreground mb-1">特征多项式</div>
                <div className="overflow-x-auto text-[13px]">
                  D(s) = {polyToLatex(coeffs)}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}