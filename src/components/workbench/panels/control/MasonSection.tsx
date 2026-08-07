'use client';

/**
 * OmniMath Pro — 梅逊增益公式（信号流图）
 *
 * 输入：
 *   - 回路增益 loopGains（含符号，如 -G1G2）
 *   - 前向通路 {gain, touchedLoops}（touchedLoops 为该通路相交的回路下标）
 *   - 互不相交回路对（两两）与三元组
 * 输出：特征式 Δ、分子 ΣPₖΔₖ、总增益 T = ΣPₖΔₖ / Δ。
 */

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { masonGain, type MasonResult } from '@/lib/control/transferFunction';

interface Row {
  id: number;
  gain: string;
  touched: string;
}

const EXAMPLES: { label: string; loops: string; paths: string; pairs?: string; triples?: string }[] = [
  {
    label: '单回路',
    loops: '0.5',
    paths: '2:0',
  },
  {
    label: '两不相交回路',
    loops: '0.2, 0.3',
    paths: '1:',
    pairs: '0,1',
  },
  {
    label: '典型反馈',
    loops: '-0.5',
    paths: '1:0',
  },
];

function parsePairs(s: string): [number, number][] {
  if (!s.trim()) return [];
  return s
    .split(/[;；]/)
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const parts = seg.split(/[,，\s]+/).map(Number);
      return [parts[0], parts[1]] as [number, number];
    });
}

function parseTriples(s: string): [number, number, number][] {
  if (!s.trim()) return [];
  return s
    .split(/[;；]/)
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const parts = seg.split(/[,，\s]+/).map(Number);
      return [parts[0], parts[1], parts[2]] as [number, number, number];
    });
}

export function MasonSection() {
  const [loopStr, setLoopStr] = useState('-0.5');
  const [paths, setPaths] = useState<Row[]>([{ id: 1, gain: '1', touched: '0' }]);
  const [pairStr, setPairStr] = useState('');
  const [tripleStr, setTripleStr] = useState('');
  const [nextId, setNextId] = useState(2);

  const result = useMemo((): MasonResult | null => {
    try {
      const loopGains = loopStr
        .split(/[,，\s]+/)
        .filter((x) => x.trim() !== '')
        .map(Number);
      const parsedPaths = paths.map((p) => ({
        gain: Number(p.gain),
        touchedLoops: p.touched.trim()
          ? p.touched.split(/[,，\s]+/).map(Number)
          : [],
      }));
      if (loopGains.some((x) => !Number.isFinite(x))) return null;
      if (parsedPaths.some((p) => !Number.isFinite(p.gain))) return null;
      return masonGain({
        loopGains,
        paths: parsedPaths,
        nonTouchingPairs: parsePairs(pairStr),
        nonTouchingTriples: parseTriples(tripleStr),
      });
    } catch {
      return null;
    }
  }, [loopStr, paths, pairStr, tripleStr]);

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border/40 bg-background/30 p-3 space-y-3">
        <div className="text-[10.5px] font-medium text-muted-foreground">
          梅逊增益公式 T = Σ(Pₖ·Δₖ) / Δ
        </div>

        {/* 回路 */}
        <label className="block text-[10px] text-muted-foreground">
          回路增益 L_i（逗号分隔，注意符号，如 -0.5）
          <Input
            value={loopStr}
            onChange={(e) => setLoopStr(e.target.value)}
            className="mt-0.5 h-8 font-mono text-[12px]"
            placeholder="例：-0.5, 0.2"
          />
        </label>

        {/* 前向通路 */}
        <div>
          <div className="text-[10px] text-muted-foreground mb-1">前向通路 P_k（增益:接触回路下标，空=不接触）</div>
          <div className="space-y-1.5">
            {paths.map((p) => (
              <div key={p.id} className="flex gap-1.5">
                <Input
                  value={p.gain}
                  onChange={(e) =>
                    setPaths((prev) => prev.map((x) => (x.id === p.id ? { ...x, gain: e.target.value } : x)))
                  }
                  className="h-7 w-24 font-mono text-[12px]"
                  placeholder="增益"
                />
                <Input
                  value={p.touched}
                  onChange={(e) =>
                    setPaths((prev) => prev.map((x) => (x.id === p.id ? { ...x, touched: e.target.value } : x)))
                  }
                  className="h-7 flex-1 font-mono text-[12px]"
                  placeholder="接触回路下标，如 0,1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-rose-500"
                  onClick={() => setPaths((prev) => prev.filter((x) => x.id !== p.id))}
                >
                  删
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-1.5 h-7 text-[11px]"
            onClick={() => {
              setPaths((prev) => [...prev, { id: nextId, gain: '1', touched: '' }]);
              setNextId((v) => v + 1);
            }}
          >
            + 添加通路
          </Button>
        </div>

        {/* 独立回路组合 */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="block text-[10px] text-muted-foreground">
            两两不相交回路（如 0,1; 1,2）
            <Input
              value={pairStr}
              onChange={(e) => setPairStr(e.target.value)}
              className="mt-0.5 h-8 font-mono text-[12px]"
              placeholder="例：0,1"
            />
          </label>
          <label className="block text-[10px] text-muted-foreground">
            三元不相交回路（如 0,1,2）
            <Input
              value={tripleStr}
              onChange={(e) => setTripleStr(e.target.value)}
              className="mt-0.5 h-8 font-mono text-[12px]"
              placeholder="例：0,1,2"
            />
          </label>
        </div>

        {/* 示例 */}
        <div className="flex flex-wrap gap-1">
          {EXAMPLES.map((ex) => (
            <button
              key={ex.label}
              onClick={() => {
                setLoopStr(ex.loops);
                setPaths([{ id: 1, gain: ex.paths.split(':')[0], touched: ex.paths.split(':')[1] ?? '' }]);
                setPairStr(ex.pairs ?? '');
                setTripleStr(ex.triples ?? '');
              }}
              className="h-6 px-2 rounded text-[10px] border border-border/50 text-muted-foreground hover:bg-accent/60"
            >
              {ex.label}
            </button>
          ))}
        </div>
      </div>

      {result && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: '特征式 Δ', value: result.delta },
            { label: '分子 ΣPₖΔₖ', value: result.numerator },
            { label: '总增益 T', value: result.gain },
            { label: '前向通路数', value: result.pathDeltas.length },
          ].map((f) => (
            <div key={f.label} className="rounded-md border border-border/40 bg-muted/30 px-2 py-1.5 text-center">
              <div className="text-[9.5px] text-muted-foreground">{f.label}</div>
              <div className="font-mono text-[12px] text-primary tabular-nums">
                {Number.isFinite(f.value) ? Number(f.value).toPrecision(5) : '∞'}
              </div>
            </div>
          ))}
        </div>
      )}

      {result && result.pathDeltas.length > 0 && (
        <div className="rounded-md border border-border/40 bg-background/30 p-2.5 text-[11px]">
          <div className="text-muted-foreground mb-1">各前向通路余子式 Δₖ：</div>
          <div className="flex flex-wrap gap-x-3 font-mono">
            {result.pathDeltas.map((d, i) => (
              <span key={i} className="text-primary">
                Δ<sub>{i + 1}</sub> = {Number(d).toPrecision(5)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}