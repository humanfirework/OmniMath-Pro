'use client';

/**
 * OmniMath Studio — 工作台首页
 *
 * 卡片入口，只回答“今天想做什么”；点开后再进入紧凑工作区。
 */

import {
  ArrowRight,
  BarChart3,
  Code2,
  Command,
  FileCode2,
  FunctionSquare,
  Grid3x3,
  House,
  LineChart,
  PencilRuler,
  Sparkles,
  Workflow,
  CircleGauge,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { useFileSystemStore } from '@/lib/store/fileSystemStore';
import { useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type StudioAction =
  | 'codePlot'
  | 'functionPlot'
  | 'whiteboard'
  | 'pipeline'
  | 'linalg'
  | 'stats'
  | 'solver'
  | 'control';

interface CardCopy {
  title: string;
  desc: string;
  tag: string;
}

interface Copy {
  eyebrow: string;
  title: string;
  subtitle: string;
  teaching: string;
  basics: string;
  back: string;
  command: string;
  hint: string;
  recent: string;
  cards: Record<StudioAction, CardCopy>;
}

const COPY: Record<'zh-CN' | 'en', Copy> = {
  'zh-CN': {
    eyebrow: 'OMNIMATH STUDIO',
    title: '今天想做什么？',
    subtitle: '代码、函数、矩阵、白板、蓝图都在同一个工作台里。先从一张卡片开始，需要细节时再展开。',
    teaching: '教学与创作',
    basics: '基础工具',
    back: '打开编辑器',
    command: '命令面板',
    hint: '写一笔、跑一行、画一张图——不用先想清楚它在哪个菜单里。',
    recent: '最近使用',
    cards: {
      codePlot: { title: '代码画图', desc: '写一行 plot(sin(x))，立刻看到曲线。', tag: '脚本' },
      functionPlot: { title: '函数画图', desc: 'Desmos 式表达式列表，参数和曲线实时联动。', tag: '2D / 3D' },
      whiteboard: { title: '手写白板', desc: '钢笔、马克笔、荧光笔、橡皮与套圈。', tag: '手写' },
      pipeline: { title: '蓝图', desc: '把计算连成图，节点之间实时传值。', tag: '节点' },
      linalg: { title: '矩阵实验室', desc: '一个矩阵、五个常用运算，不再铺满整页。', tag: '线代' },
      stats: { title: '概率统计', desc: '数据、分布、拟合，结果用表格说话。', tag: '统计' },
      solver: { title: '方程求解', desc: '代数方程与方程组，步骤和条件可查。', tag: '求解' },
      control: { title: '控制理论', desc: '传递函数、方框图与稳定性分析。', tag: '控制' },
    },
  },
  en: {
    eyebrow: 'OMNIMATH STUDIO',
    title: 'What do you want to make today?',
    subtitle:
      'Code, functions, matrices, handwriting and node graphs live in one workspace. Start with a card, expand only when you need details.',
    teaching: 'Teach & Create',
    basics: 'Core Tools',
    back: 'Open Editor',
    command: 'Command Palette',
    hint: 'Write a stroke, run a line, draw a curve — without hunting through menus first.',
    recent: 'Recent',
    cards: {
      codePlot: { title: 'Code to Plot', desc: 'Write plot(sin(x)) and see the curve immediately.', tag: 'Script' },
      functionPlot: { title: 'Function Plot', desc: 'A Desmos-style expression list with live parameters.', tag: '2D / 3D' },
      whiteboard: { title: 'Handwriting', desc: 'Pen, marker, highlighter, eraser and lasso.', tag: 'Ink' },
      pipeline: { title: 'Blueprint', desc: 'Wire computations into a graph with live values.', tag: 'Nodes' },
      linalg: { title: 'Matrix Lab', desc: 'One matrix, five core operations — no wall of panels.', tag: 'Linear' },
      stats: { title: 'Statistics', desc: 'Data, distributions and fits, reported as tables.', tag: 'Stats' },
      solver: { title: 'Solver', desc: 'Equations and systems with steps and conditions.', tag: 'Solve' },
      control: { title: 'Control', desc: 'Transfer functions, block diagrams and stability.', tag: 'Control' },
    },
  },
};

const TEACHING: StudioAction[] = ['codePlot', 'functionPlot', 'whiteboard', 'pipeline'];
const BASICS: StudioAction[] = ['linalg', 'stats', 'solver', 'control'];

const ICONS: Record<StudioAction, typeof Code2> = {
  codePlot: Code2,
  functionPlot: LineChart,
  whiteboard: PencilRuler,
  pipeline: Workflow,
  linalg: Grid3x3,
  stats: BarChart3,
  solver: FunctionSquare,
  control: CircleGauge,
};

const TONES: Record<StudioAction, string> = {
  codePlot: 'bg-sky-500/10 text-sky-500',
  functionPlot: 'bg-emerald-500/10 text-emerald-500',
  whiteboard: 'bg-violet-500/10 text-violet-500',
  pipeline: 'bg-amber-500/10 text-amber-500',
  linalg: 'bg-cyan-500/10 text-cyan-500',
  stats: 'bg-rose-500/10 text-rose-500',
  solver: 'bg-indigo-500/10 text-indigo-500',
  control: 'bg-teal-500/10 text-teal-500',
};

/** 短相对时间，例如「刚刚」「12 分钟前」「3 天前」。 */
function relativeTime(ts: number, locale: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - ts) / 60000));
  if (minutes < 1) return locale === 'en' ? 'just now' : '刚刚';
  if (minutes < 60) return locale === 'en' ? `${minutes}m ago` : `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return locale === 'en' ? `${hours}h ago` : `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return locale === 'en' ? `${days}d ago` : `${days} 天前`;
  return new Date(ts).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-CN');
}

/** 取文件正文的第一条有效行，作为「最近文件」的一行摘要。 */
function fileSummary(content: string | undefined): string {
  if (!content) return '';
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed === '---') continue;
    return trimmed;
  }
  return '';
}

interface RecentItem {
  id: string;
  kind: 'file' | 'result';
  title: string;
  meta: string;
  ts: number;
  /** 结果条目：点击后载入编辑器的表达式。 */
  input?: string;
}

export function StudioHome() {
  const locale = useLocale();
  const copy = COPY[locale] ?? COPY['zh-CN'];
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const setActivePreviewTab = useWorkbenchStore((s) => s.setActivePreviewTab);
  const setInputView = useWorkbenchStore((s) => s.setInputView);
  const setPreviewVisible = useWorkbenchStore((s) => s.setPreviewVisible);
  const setEditorVisible = useWorkbenchStore((s) => s.setEditorVisible);
  const setEditorContent = useWorkbenchStore((s) => s.setEditorContent);
  const setCommandPaletteOpen = useWorkbenchStore((s) => s.setCommandPaletteOpen);
  const results = useWorkbenchStore((s) => s.results);

  // 最近文件来自 IndexedDB；首页先加载一次，文件列表才有内容可选。
  const fsLoaded = useFileSystemStore((s) => s.loaded);
  const loadFsFromStorage = useFileSystemStore((s) => s.loadFromStorage);
  const nodes = useFileSystemStore((s) => s.nodes);
  const openFile = useFileSystemStore((s) => s.openFile);
  useEffect(() => {
    if (!fsLoaded) void loadFsFromStorage();
  }, [fsLoaded, loadFsFromStorage]);

  const recentItems = useMemo<RecentItem[]>(() => {
    const files: RecentItem[] = Object.values(nodes)
      .filter((n) => n.type === 'file')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 2)
      .map((n) => ({
        id: n.id,
        kind: 'file',
        title: n.name,
        meta: fileSummary(n.content) || (locale === 'en' ? 'Empty file' : '空文件'),
        ts: n.updatedAt,
      }));

    const history: RecentItem[] = [...results]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 2)
      .map((r) => ({
        id: r.id,
        kind: 'result',
        title: r.input,
        meta: r.error ? r.error : `= ${r.output}`,
        ts: r.timestamp,
        input: r.input,
      }));

    return [...files, ...history].sort((a, b) => b.ts - a.ts).slice(0, 4);
  }, [nodes, results, locale]);

  const openRecent = (item: RecentItem) => {
    if (item.kind === 'file') {
      openFile(item.id);
    } else if (item.input) {
      setEditorContent(item.input);
    }
    setEditorVisible(true);
    setViewMode('workbench');
    window.dispatchEvent(new CustomEvent('omnimath:mobile-tab', { detail: 'editor' }));
  };

  const open = (action: StudioAction) => {
    switch (action) {
      case 'codePlot':
        setEditorVisible(true);
        setPreviewVisible(true);
        setActivePreviewTab('plot2d');
        setViewMode('workbench');
        // 手机端没有桌面布局：直接切到「编辑器」标签，否则点了卡片看起来没反应。
        window.dispatchEvent(new CustomEvent('omnimath:mobile-tab', { detail: 'editor' }));
        break;
      case 'functionPlot':
        setEditorVisible(true);
        setPreviewVisible(true);
        setInputView('demos');
        setActivePreviewTab('plot2d');
        setViewMode('workbench');
        window.dispatchEvent(new CustomEvent('omnimath:mobile-tab', { detail: 'editor' }));
        break;
      default:
        setViewMode(action);
        break;
    }
  };

  const renderCard = (action: StudioAction) => {
    const Icon = ICONS[action];
    const card = copy.cards[action];
    return (
      <button
        key={action}
        type="button"
        onClick={() => open(action)}
        className="group relative flex min-h-[112px] flex-col items-start gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/70 hover:shadow-lg hover:shadow-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="flex w-full items-start justify-between gap-2">
          <span className={cn('grid size-9 place-items-center rounded-xl', TONES[action])}>
            <Icon className="size-[18px]" />
          </span>
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[9px] text-muted-foreground">
            {card.tag}
          </span>
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1 text-sm font-medium text-foreground">
            {card.title}
            <ArrowRight className="size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{card.desc}</p>
        </div>
      </button>
    );
  };

  return (
    <div className="h-full w-full overflow-auto bg-background">
      {/* 手机端底部有悬浮计算器 FAB：多留一段底部空白，
          滚到底时最后一张卡片不会被 FAB 长期压住。 */}
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 pt-8 pb-28 sm:px-8 md:pb-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-foreground">
              <House className="size-5" />
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {copy.eyebrow}
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {copy.title}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {copy.subtitle}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
            >
              <Command className="size-3.5" />
              {copy.command}
            </button>
            {/* 手机端由底部标签负责切到编辑器/画布，「返回工作台」在移动端
                布局里点了没有可见效果，直接隐藏；平板/桌面保留。 */}
            <button
              type="button"
              onClick={() => setViewMode('workbench')}
              className="hidden md:inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-white transition-colors hover:bg-primary/90"
            >
              {copy.back}
            </button>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/12 via-primary/5 to-transparent px-5 py-5 sm:px-6">
          <div className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex flex-wrap items-center gap-3">
            <Sparkles className="size-4 text-muted-foreground" />
            <p className="text-sm text-foreground/80">{copy.hint}</p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {copy.teaching}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{TEACHING.map(renderCard)}</div>
        </section>

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {copy.basics}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{BASICS.map(renderCard)}</div>
        </section>

        {recentItems.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {copy.recent}
            </h2>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {recentItems.map((item) => {
                const Icon = item.kind === 'file' ? FileCode2 : LineChart;
                return (
                  <button
                    key={`${item.kind}-${item.id}`}
                    type="button"
                    onClick={() => openRecent(item)}
                    className="group flex min-w-0 items-center gap-2.5 rounded-xl border border-border/60 bg-card/30 px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-card/60"
                  >
                    <span
                      className={cn(
                        'grid size-8 shrink-0 place-items-center rounded-lg',
                        item.kind === 'file'
                          ? 'bg-sky-500/10 text-sky-500'
                          : 'bg-emerald-500/10 text-emerald-500',
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-foreground">{item.title}</span>
                      <span className="block truncate font-mono text-[10.5px] text-muted-foreground">
                        {item.meta}
                      </span>
                    </span>
                    <span className="shrink-0 text-[10px] text-muted-foreground/70">
                      {relativeTime(item.ts, locale)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
