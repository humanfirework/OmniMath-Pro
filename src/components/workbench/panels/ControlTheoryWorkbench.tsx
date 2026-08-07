'use client';

/**
 * OmniMath Pro — 控制理论独立工作台（ControlTheoryWorkbench）
 *
 * 将控制理论从「求解器」中独立出来，作为与求解器 / 线性代数 / 概率统计平级的
 * 全屏视图。按《自动控制原理》章节组织：
 *   - 经典分析（Bode / 阶跃 / 根轨迹 / 奈奎斯特 / PID 整定）→ 复用 ControlTheorySection
 *   - 稳定性判据：劳斯（Routh）表格
 *   - 信号流图：梅逊（Mason）增益公式
 *   - 校正器设计：超前（Lead）/ 滞后（Lag）
 */

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { ControlTheorySection } from '@/components/workbench/panels/ControlTheorySection';
import { RouthSection } from '@/components/workbench/panels/control/RouthSection';
import { MasonSection } from '@/components/workbench/panels/control/MasonSection';
import { SignalFlowGraphEditor } from '@/components/workbench/panels/control/SignalFlowGraphEditor';
import { CompensatorSection } from '@/components/workbench/panels/control/CompensatorSection';

type ControlTab = 'analysis' | 'stability' | 'signal' | 'compensate';

const NAV: { id: ControlTab; label: string; desc: string }[] = [
  { id: 'analysis', label: '经典分析', desc: 'Bode / 阶跃 / 根轨迹 / 奈奎斯特 / PID' },
  { id: 'stability', label: '稳定性判据', desc: '劳斯判据 Routh' },
  { id: 'signal', label: '信号流图', desc: '图形建模 + 梅逊公式' },
  { id: 'compensate', label: '校正器设计', desc: '超前 / 滞后校正' },
];

type SignalSub = 'visual' | 'formula';

export function ControlTheoryWorkbench() {
  const [tab, setTab] = useState<ControlTab>('analysis');
  const [signalSub, setSignalSub] = useState<SignalSub>('visual');

  return (
    <div className="h-full w-full flex min-h-0 bg-background/40">
      {/* ─── 左侧章节导航 ─────────────────────────────────────── */}
      <aside className="w-56 shrink-0 flex flex-col border-r border-border/60 bg-card/30 backdrop-blur-sm">
        <div className="shrink-0 h-10 px-3 flex items-center gap-1.5 border-b border-border/60 bg-background/40">
          <span className="text-[12px] font-semibold tracking-tight">控制理论</span>
        </div>
        <ScrollArea className="flex-1 min-h-0">
          <ul className="p-2 space-y-1">
            {NAV.map((item) => {
              const isActive = item.id === tab;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={cn(
                      'w-full text-left px-2.5 py-2 rounded-md transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    <div className="text-[12px] font-medium leading-tight">{item.label}</div>
                    <div className="text-[10px] text-muted-foreground/80 leading-tight mt-0.5">{item.desc}</div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      </aside>

      {/* ─── 右侧主区域 ──────────────────────────────────────── */}
      <main className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="shrink-0 h-11 px-4 flex items-center gap-2 border-b border-border/60 bg-background/30">
          <span className="text-[13px] font-semibold tracking-tight">
            {NAV.find((n) => n.id === tab)?.label}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {NAV.find((n) => n.id === tab)?.desc}
          </span>
        </div>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-4">
            {tab === 'analysis' && <ControlTheorySection />}
            {tab === 'stability' && <RouthSection />}
            {tab === 'signal' && (
              <>
                <div className="flex flex-wrap items-center gap-1 mb-3">
                  <span className="text-[11px] text-muted-foreground mr-1">建模方式</span>
                  {(['visual', 'formula'] as SignalSub[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSignalSub(s)}
                      className={cn(
                        'h-7 px-3 rounded-md text-[11.5px] border transition-colors',
                        signalSub === s
                          ? 'border-primary/50 bg-primary/10 text-primary'
                          : 'border-border/50 text-muted-foreground hover:bg-accent/60',
                      )}
                    >
                      {s === 'visual' ? '图形建模（画图）' : '公式输入（梅逊）'}
                    </button>
                  ))}
                </div>
                {signalSub === 'visual' ? <SignalFlowGraphEditor /> : <MasonSection />}
              </>
            )}
            {tab === 'compensate' && <CompensatorSection />}
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}