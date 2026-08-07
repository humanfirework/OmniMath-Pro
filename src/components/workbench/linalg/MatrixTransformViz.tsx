'use client';

/**
 * OmniMath Pro — Matrix Transform Visualizer (WF-3.1)
 *
 * 多模式线性变换可视化容器，使用 Radix Tabs 组织 4 个子可视化：
 *   1. 2D 变换   — Transform2D   (剪切/旋转/缩放/投影 + 特征向量 + 行列式面积)
 *   2. 3D 变换   — Transform3D    (React Three Fiber 立方体/球体/基向量)
 *   3. 特征分析  — EigenVisualizer (特征值/特征向量 + SVD 分解)
 *   4. 二次型    — QuadraticFormViz (ax² + 2bxy + cy² 等高线 + 矩阵分类)
 *
 * 共享状态：2D 矩阵 (4 元素) 与 3D 矩阵 (9 元素) 在容器内维护，
 * 切换 Tab 时保持一致。每个子组件通过 onMatrixChange 回写共享状态。
 * 顶部工具栏提供 2D/3D 矩阵的快速预设与重置。
 */

import { useState, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { RotateCcw, Boxes, Box, Variable, Spline, Move3d } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { FormulaRenderer } from '@/components/workbench/FormulaRenderer';
import { Transform2D } from './Transform2D';
import { Transform3D } from './Transform3D';
import { EigenVisualizer } from './EigenVisualizer';
import { QuadraticFormViz } from './QuadraticFormViz';
import { AffineTransform2D } from './AffineTransform2D';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ *
 * 预设矩阵
 * ------------------------------------------------------------------ */

/** 2D 预设：4 元素 [a, b, c, d] 表示 [[a, b], [c, d]] */
const PRESETS_2D: { label: string; matrix: number[]; desc: string }[] = [
  { label: '单位', matrix: [1, 0, 0, 1], desc: 'I₂ 恒等变换' },
  { label: '剪切', matrix: [1, 1, 0, 1], desc: 'x 方向剪切' },
  { label: '旋转 45°', matrix: [Math.SQRT1_2, -Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2], desc: '逆时针旋转 45°' },
  { label: '缩放 2x', matrix: [2, 0, 0, 2], desc: '均匀放大 2 倍' },
  { label: '投影 X', matrix: [1, 0, 0, 0], desc: '投影到 x 轴（奇异）' },
  { label: '反射', matrix: [1, 0, 0, -1], desc: '关于 x 轴反射' },
];

/** 3D 预设：9 元素 [a,b,c, d,e,f, g,h,i] 表示 3×3 行主序 */
const PRESETS_3D: { label: string; matrix: number[]; desc: string }[] = [
  { label: '单位', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], desc: 'I₃ 恒等变换' },
  { label: '绕 Z 旋转', matrix: [Math.SQRT1_2, -Math.SQRT1_2, 0, Math.SQRT1_2, Math.SQRT1_2, 0, 0, 0, 1], desc: '绕 Z 轴旋转 45°' },
  { label: '绕 X 旋转', matrix: [1, 0, 0, 0, Math.SQRT1_2, -Math.SQRT1_2, 0, Math.SQRT1_2, Math.SQRT1_2], desc: '绕 X 轴旋转 45°' },
  { label: '缩放 2x', matrix: [2, 0, 0, 0, 2, 0, 0, 0, 2], desc: '均匀放大 2 倍' },
  { label: '剪切 XY', matrix: [1, 0.5, 0, 0, 1, 0, 0, 0, 1], desc: 'x 方向剪切' },
  { label: '投影 XY', matrix: [1, 0, 0, 0, 1, 0, 0, 0, 0], desc: '投影到 XY 平面' },
];

/* ------------------------------------------------------------------ *
 * 工具函数
 * ------------------------------------------------------------------ */

/** 将 4 元素数组格式化为 LaTeX 2×2 bmatrix */
function matrix2ToLatex(m: number[]): string {
  const [a, b, c, d] = m;
  const fmt = (v: number) => {
    if (!Number.isFinite(v)) return '\\text{—}';
    const r = Math.round(v);
    if (Math.abs(v - r) < 1e-10) return String(r);
    return parseFloat(v.toPrecision(6)).toString();
  };
  return `\\begin{bmatrix} ${fmt(a)} & ${fmt(b)} \\\\ ${fmt(c)} & ${fmt(d)} \\end{bmatrix}`;
}

/** 将 9 元素数组格式化为 LaTeX 3×3 bmatrix */
function matrix3ToLatex(m: number[]): string {
  const fmt = (v: number) => {
    if (!Number.isFinite(v)) return '\\text{—}';
    const r = Math.round(v);
    if (Math.abs(v - r) < 1e-10) return String(r);
    return parseFloat(v.toPrecision(6)).toString();
  };
  const rows = [
    `${fmt(m[0])} & ${fmt(m[1])} & ${fmt(m[2])}`,
    `${fmt(m[3])} & ${fmt(m[4])} & ${fmt(m[5])}`,
    `${fmt(m[6])} & ${fmt(m[7])} & ${fmt(m[8])}`,
  ];
  return `\\begin{bmatrix} ${rows.join(' \\\\ ')} \\end{bmatrix}`;
}

/* ================================================================== *
 * 主容器组件
 * ================================================================== */
export function MatrixTransformViz() {
  // 共享矩阵状态
  const [matrix2D, setMatrix2D] = useState<number[]>([1, 0, 0, 1]);
  const [matrix3D, setMatrix3D] = useState<number[]>([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const [activeTab, setActiveTab] = useState<string>('2d');

  const is3DTab = activeTab === '3d';

  const handleMatrix2DChange = useCallback((m: number[]) => {
    setMatrix2D(m);
  }, []);
  const handleMatrix3DChange = useCallback((m: number[]) => {
    setMatrix3D(m);
  }, []);

  const handleReset = useCallback(() => {
    if (is3DTab) {
      setMatrix3D([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    } else {
      setMatrix2D([1, 0, 0, 1]);
    }
  }, [is3DTab]);

  const currentPresets = is3DTab ? PRESETS_3D : PRESETS_2D;
  const handlePreset = useCallback(
    (m: number[]) => {
      if (is3DTab) setMatrix3D(m);
      else setMatrix2D(m);
    },
    [is3DTab],
  );

  const currentLatex = useMemo(() => {
    return is3DTab ? matrix3ToLatex(matrix3D) : matrix2ToLatex(matrix2D);
  }, [is3DTab, matrix2D, matrix3D]);

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* 顶部工具栏：预设 + 当前矩阵 + 重置 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-card/40 p-2 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">预设:</span>
          <div className="flex flex-wrap gap-1">
            {currentPresets.map((p) => (
              <Tooltip key={p.label}>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => handlePreset(p.matrix)}
                  >
                    {p.label}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{p.desc}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1">
            <span className="text-[10px] text-muted-foreground">M =</span>
            <FormulaRenderer latex={currentLatex} className="text-[11px]" />
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleReset}>
                <RotateCcw className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">重置为单位矩阵</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Tabs 容器 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="self-start">
          <TabsTrigger value="2d" className="gap-1.5 text-xs">
            <Box className="size-3.5" />
            2D 变换
          </TabsTrigger>
          <TabsTrigger value="3d" className="gap-1.5 text-xs">
            <Boxes className="size-3.5" />
            3D 变换
          </TabsTrigger>
          <TabsTrigger value="eigen" className="gap-1.5 text-xs">
            <Variable className="size-3.5" />
            特征分析
          </TabsTrigger>
          <TabsTrigger value="quadratic" className="gap-1.5 text-xs">
            <Spline className="size-3.5" />
            二次型
          </TabsTrigger>
          <TabsTrigger value="affine" className="gap-1.5 text-xs">
            <Move3d className="size-3.5" />
            平移/仿射/透视
          </TabsTrigger>
        </TabsList>

        <TabsContent value="2d" className="min-h-0 flex-1 overflow-auto">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <Transform2D matrix={matrix2D} onMatrixChange={handleMatrix2DChange} />
          </motion.div>
        </TabsContent>

        <TabsContent value="3d" className="min-h-0 flex-1 overflow-auto">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <Transform3D matrix={matrix3D} onMatrixChange={handleMatrix3DChange} />
          </motion.div>
        </TabsContent>

        <TabsContent value="eigen" className="min-h-0 flex-1 overflow-auto">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <EigenVisualizer matrix={matrix2D} onMatrixChange={handleMatrix2DChange} dimension={2} />
          </motion.div>
        </TabsContent>

        <TabsContent value="quadratic" className="min-h-0 flex-1 overflow-auto">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <QuadraticFormViz matrix={matrix2D} onMatrixChange={handleMatrix2DChange} />
          </motion.div>
        </TabsContent>

        <TabsContent value="affine" className="min-h-0 flex-1 overflow-auto">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="h-full"
          >
            <AffineTransform2D />
          </motion.div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
