'use client';

/**
 * Blueprint template gallery.
 *
 * The old entry point was a text-only dropdown: users had to read node counts
 * and descriptions without seeing the shape of the graph. This dialog shows
 * a miniature node/edge preview per template, grouped by category, so
 * picking a starting point is visual instead of guesswork.
 */

import { useMemo } from 'react';
import { LayoutTemplate, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PIPELINE_TEMPLATES,
  TEMPLATE_GROUPS,
  type PipelineTemplate,
} from './pipelineTemplates';
import { NODE_WIDTH } from './pipelineEngine';

const APPROX_NODE_H = 130;
const VIEW_W = 160;
const VIEW_H = 88;
const PAD = 6;

interface Point {
  x: number;
  y: number;
}

/** Scale a template's node positions into a small SVG preview. */
function usePreview(tpl: PipelineTemplate) {
  return useMemo(() => {
    const minX = Math.min(...tpl.nodes.map((n) => n.position.x));
    const minY = Math.min(...tpl.nodes.map((n) => n.position.y));
    const maxX = Math.max(...tpl.nodes.map((n) => n.position.x + NODE_WIDTH));
    const maxY = Math.max(...tpl.nodes.map((n) => n.position.y + APPROX_NODE_H));
    const w = Math.max(1, maxX - minX);
    const h = Math.max(1, maxY - minY);
    const scale = Math.min((VIEW_W - PAD * 2) / w, (VIEW_H - PAD * 2) / h);
    const offsetX = (VIEW_W - w * scale) / 2;
    const offsetY = (VIEW_H - h * scale) / 2;
    const pos = new Map<string, Point>();
    for (const n of tpl.nodes) {
      pos.set(n.id, {
        x: offsetX + (n.position.x - minX) * scale,
        y: offsetY + (n.position.y - minY) * scale,
      });
    }
    const nodeW = Math.max(6, NODE_WIDTH * scale);
    const nodeH = Math.max(4, APPROX_NODE_H * scale);
    const edges = tpl.edges
      .map((e) => {
        const a = pos.get(e.from);
        const b = pos.get(e.to);
        if (!a || !b) return null;
        return { id: e.id, x1: a.x + nodeW / 2, y1: a.y + nodeH / 2, x2: b.x + nodeW / 2, y2: b.y + nodeH / 2 };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    return { nodes: [...pos.values()], nodeW, nodeH, edges };
  }, [tpl]);
}

function TemplateThumb({ tpl }: { tpl: PipelineTemplate }) {
  const { nodes, nodeW, nodeH, edges } = usePreview(tpl);
  const color = 'var(--primary)';
  const edgeColor = 'var(--primary-2)';
  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      className="h-full w-full"
      role="img"
      aria-label={`${tpl.name} 预览`}
    >
      {edges.map((e) => (
        <line
          key={e.id}
          x1={e.x1}
          y1={e.y1}
          x2={e.x2}
          y2={e.y2}
          stroke={edgeColor}
          strokeOpacity={0.45}
          strokeWidth={1}
        />
      ))}
      {nodes.map((n, i) => (
        <rect
          key={i}
          x={n.x}
          y={n.y}
          width={nodeW}
          height={nodeH}
          rx={2}
          fill={color}
          fillOpacity={0.1}
          stroke={color}
          strokeOpacity={0.55}
          strokeWidth={0.8}
        />
      ))}
    </svg>
  );
}

export interface TemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLoad: (id: string) => void;
}

export function TemplateGallery({ open, onOpenChange, onLoad }: TemplateGalleryProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="gap-1 border-b border-border/60 px-4 py-3.5">
          <DialogTitle className="flex items-center gap-2 text-[14px]">
            <LayoutTemplate className="size-4 text-primary" strokeWidth={1.75} />
            蓝图模板
          </DialogTitle>
          <DialogDescription className="text-[11px] leading-relaxed">
            选一个模板直接开始；加载后可以拖动节点、修改配置，或把它当作起点继续搭。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[72vh] space-y-5 overflow-y-auto p-4">
          {TEMPLATE_GROUPS.map((group) => {
            const items = PIPELINE_TEMPLATES.filter(
              (tpl) => (tpl.category ?? 'math') === group.key,
            );
            if (items.length === 0) return null;
            return (
              <section key={group.key}>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
                  {group.label}
                </div>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {items.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => {
                        onLoad(tpl.id);
                        onOpenChange(false);
                      }}
                      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    >
                      <div
                        className="h-[88px] w-full border-b border-border bg-muted/20 p-1.5"
                        style={{
                          backgroundImage:
                            'radial-gradient(circle at 1px 1px, var(--viz-grid) 1px, transparent 0)',
                          backgroundSize: '10px 10px',
                        }}
                      >
                        <TemplateThumb tpl={tpl} />
                      </div>
                      <div className="flex flex-1 flex-col gap-1 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[12.5px] font-medium">{tpl.name}</span>
                          <span className="ml-auto shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[9.5px] text-muted-foreground">
                            {tpl.nodes.length} 节点
                          </span>
                        </div>
                        <p className="line-clamp-2 text-[10.5px] leading-relaxed text-muted-foreground">
                          {tpl.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            );
          })}

          <div className="flex items-center gap-1.5 rounded-lg border border-dashed border-border/60 px-3 py-2 text-[10.5px] text-muted-foreground">
            <Sparkles className="size-3.5 text-primary/70" strokeWidth={1.75} />
            想从零开始？关闭这个窗口，双击画布空白处即可添加第一个节点。
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
