'use client';

/**
 * OmniMath Pro — 教育模块（青少年身心健康教育 · 学习陪伴）
 *
 * 独立的全屏教学视图，位于「白板」之下。包含：
 *  - 每日一题：按日期确定性出题，先易后难，鼓励式反馈。
 *  - 进度轨迹：GitHub 风格贡献表 + 多类进度曲线 + 难度解锁。
 *  - 成就徽章 / 错题本：离线计算的成就体系与错题复盘。
 *  - AI 助教：面向学习的流式对话，与每日一题/错题本联动讲解。
 *
 * 数据完全本地（localStorage）、无登录、不上传，呼应「心灵陪伴/隐私底线」。
 * 挂载时从存储恢复学习数据。
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarCheck,
  TrendingUp,
  Award,
  GraduationCap,
  Sparkles,
  Grid3x3,
  FunctionSquare,
  BarChart3,
  CircleGauge,
  FlaskConical,
  Library,
  ShieldCheck,
  Puzzle,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useEducationStore } from '@/lib/store/educationStore';
import { useWorkbenchStore } from '@/lib/store/workbench';
import { STAGES, STAGE_LABEL } from '@/lib/education/content';
import { EducationDaily } from './EducationDaily';
import { EducationProgress } from './EducationProgress';
import { EducationAchievements } from './EducationAchievements';
import { EducationAiTutor } from './EducationAiTutor';
import { EducationBank } from './EducationBank';
import { EducationRiddles } from './EducationRiddles';
import { cn } from '@/lib/utils';

type EduNavId = 'daily' | 'progress' | 'achievements' | 'ai' | 'bank' | 'riddles';

const NAV_ITEMS: {
  id: EduNavId;
  icon: typeof CalendarCheck;
  label: string;
  desc: string;
}[] = [
  { id: 'daily', icon: CalendarCheck, label: '每日一题', desc: '今天练一道，天天不断' },
  { id: 'progress', icon: TrendingUp, label: '进度轨迹', desc: '贡献表 · 曲线 · 解锁' },
  { id: 'achievements', icon: Award, label: '成就 & 错题', desc: '徽章与错题复盘' },
  { id: 'ai', icon: GraduationCap, label: 'AI 助教', desc: '一步步带你学会' },
  { id: 'bank', icon: Library, label: '题库 & 导入', desc: '自定义题目 · PDF 导入' },
  { id: 'riddles', icon: Puzzle, label: '未解之谜', desc: '数学界的星辰大海' },
];

const RESEARCH_VIEWS = [
  { id: 'linalg', label: '线性代数', icon: Grid3x3 },
  { id: 'solver', label: '求解器', icon: FunctionSquare },
  { id: 'stats', label: '统计分析', icon: BarChart3 },
  { id: 'control', label: '控制理论', icon: CircleGauge },
] as const;

export function EducationModule() {
  const [nav, setNav] = useState<EduNavId>('daily');
  const loadFromStorage = useEducationStore((s) => s.loadFromStorage);
  const recordToolUse = useEducationStore((s) => s.recordToolUse);
  const setViewMode = useWorkbenchStore((s) => s.setViewMode);
  const stage = useEducationStore((s) => s.stage);
  const paperCount = useEducationStore((s) => s.paperCount);

  // 挂载时恢复本地学习数据。
  useEffect(() => {
    loadFromStorage();
  }, [loadFromStorage]);

  const active = NAV_ITEMS.find((n) => n.id === nav) ?? NAV_ITEMS[0];
  const ActiveIcon = active.icon;

  return (
    <div className="flex h-full w-full min-h-0">
      {/* 左侧模块导航 */}
      <aside className="w-60 shrink-0 flex flex-col border-r border-border bg-sidebar">
        {/* 头部 */}
        <div className="shrink-0 border-b border-border px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="relative grid size-8 shrink-0 place-items-center rounded-md border border-border text-muted-foreground">
              <Sparkles className="size-3.5" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-medium tracking-tight text-foreground">
                学习陪伴
              </div>
              <div className="text-[10px] text-muted-foreground">学段自适应 · 循序渐进</div>
            </div>
            <span className="shrink-0 rounded-[3px] border border-border px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground">
              {STAGE_LABEL[stage]}
            </span>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <ul className="space-y-0.5 p-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.id === nav;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setNav(item.id)}
                    className={cn(
                      'group relative w-full flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors',
                      isActive
                        ? 'bg-accent text-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-7 shrink-0 place-items-center rounded border transition-colors',
                        isActive
                          ? 'border-border bg-card text-foreground'
                          : 'border-transparent text-muted-foreground group-hover:text-foreground',
                      )}
                    >
                      <Icon className="size-3.5" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium">{item.label}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {item.desc}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        {/* 底部：隐私说明 */}
        <div className="shrink-0 border-t border-border p-3">
          <div className="rounded-md border border-border bg-card p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
              <ShieldCheck className="size-3" strokeWidth={1.75} />
              数据只在本机
            </div>
            <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">
              学习数据仅保存在本地，无登录、不上传。学段与「一键清空学习数据」可在
              <span className="text-muted-foreground/90"> 设置 </span>
              中管理。
            </p>
          </div>
        </div>
      </aside>

      {/* 右侧主区域 */}
      <main className="flex min-w-0 min-h-0 flex-1 flex-col bg-background">
        {/* 标题条 */}
        <div className="shrink-0 flex h-9 items-center gap-2 border-b border-border px-4">
          <ActiveIcon className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
          <span className="text-[12px] font-medium tracking-tight">{active.label}</span>
          <span className="text-[10.5px] text-muted-foreground">{active.desc}</span>

          <div className="ml-auto">
            {/* 学习 ↔ 科研模式转换 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-6 items-center gap-1.5 rounded border border-border px-2 text-[10.5px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <FlaskConical className="size-3" strokeWidth={1.75} />
                  切到科研模式
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  学习陪伴 → 科研 / 专业工具
                </DropdownMenuLabel>
                {RESEARCH_VIEWS.map((r) => {
                  const RIcon = r.icon;
                  return (
                    <DropdownMenuItem
                      key={r.id}
                      onClick={() => {
                        recordToolUse();
                        setViewMode(r.id);
                      }}
                      className="gap-2 text-[11.5px]"
                    >
                      <RIcon className="size-3.5" />
                      <span>{r.label}</span>
                    </DropdownMenuItem>
                  );
                })}
                <DropdownMenuSeparator />
                <p className="px-2 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  学到的知识可在专业工具里继续深挖，形成「学 → 用 → 研」闭环。
                </p>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-5">
            <motion.div
              key={nav}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              {nav === 'daily' && <EducationDaily />}
              {nav === 'progress' && <EducationProgress />}
              {nav === 'achievements' && <EducationAchievements />}
              {nav === 'ai' && <EducationAiTutor />}
              {nav === 'bank' && <EducationBank />}
              {nav === 'riddles' && (
                <EducationRiddles
                  onAskAI={(prompt) => {
                    setNav('ai');
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(
                        new CustomEvent('omnimath:ai-explain', { detail: prompt }),
                      );
                    }
                  }}
                />
              )}
            </motion.div>
          </div>
        </ScrollArea>
      </main>
    </div>
  );
}
