'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCcw, Copy, Download, X, Grid3x3 } from 'lucide-react';
import { useCalculatorStore } from '@/lib/calculator/store';
import { evalAtX } from '@/lib/calculator/engine';
import { t } from '@/lib/calculator/i18n';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PlotPanelProps {
  expressions: string[];
  colors?: string[];
  onInsertExample?: (expr: string) => void;
}

interface SnappedPoint {
  expr: string;
  y: number;
  screenX: number;
  screenY: number;
}

export function PlotPanel({ expressions, colors, onInsertExample }: PlotPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStart, setDragStart] = React.useState({ x: 0, y: 0 });
  const [showGrid, setShowGrid] = React.useState(true);
  const [hoverPoint, setHoverPoint] = React.useState<{
    screenX: number;
    screenY: number;
    mathX: number;
    snapped: SnappedPoint[];
  } | null>(null);
  const { theme, removePlot, plots } = useCalculatorStore();

  const defaultColors = ['#4fc3f7', '#81c784', '#ffb74d', '#f06292', '#ba68c8', '#4db6ac', '#ff8a65', '#aed581'];
  const plotColors = colors ?? defaultColors;

  // Use the xRange from the first plot if available, otherwise default to [-10, 10]
  const xRange: [number, number] = plots[0]?.xRange ?? [-10, 10];
  const yRange: [number, number] = [-10, 10];

  const drawPlot = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width * dpr);
    canvas.height = Math.max(1, rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    // Colors based on theme
    const isDark = theme === 'dark';
    const bgColor = isDark ? '#1e1e1e' : '#ffffff';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const subGridColor = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)';
    const axisColor = isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)';
    const textColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.5)';
    const labelColor = isDark ? '#9cdcfe' : '#0066cc';

    // Clear
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // Transform helpers
    const effectiveXRange: [number, number] = [
      xRange[0] / zoom + offset.x,
      xRange[1] / zoom + offset.x,
    ];
    const effectiveYRange: [number, number] = [
      yRange[0] / zoom + offset.y,
      yRange[1] / zoom + offset.y,
    ];

    const toScreenX = (x: number) => ((x - effectiveXRange[0]) / (effectiveXRange[1] - effectiveXRange[0])) * w;
    const toScreenY = (y: number) => h - ((y - effectiveYRange[0]) / (effectiveYRange[1] - effectiveYRange[0])) * h;
    const toMathX = (sx: number) => effectiveXRange[0] + (sx / w) * (effectiveXRange[1] - effectiveXRange[0]);
    const toMathY = (sy: number) => effectiveYRange[1] - (sy / h) * (effectiveYRange[1] - effectiveYRange[0]);

    // Sub grid (0.5 step)
    if (showGrid) {
      ctx.strokeStyle = subGridColor;
      ctx.lineWidth = 1;
      const subStep = 0.5;
      for (let x = Math.ceil(effectiveXRange[0] / subStep) * subStep; x <= effectiveXRange[1]; x += subStep) {
        const sx = toScreenX(x);
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.stroke();
      }
      for (let y = Math.ceil(effectiveYRange[0] / subStep) * subStep; y <= effectiveYRange[1]; y += subStep) {
        const sy = toScreenY(y);
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
      }

      // Main grid lines
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      const gridStep = 1;
      for (let x = Math.ceil(effectiveXRange[0] / gridStep) * gridStep; x <= effectiveXRange[1]; x += gridStep) {
        const sx = toScreenX(x);
        ctx.beginPath();
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, h);
        ctx.stroke();
      }
      for (let y = Math.ceil(effectiveYRange[0] / gridStep) * gridStep; y <= effectiveYRange[1]; y += gridStep) {
        const sy = toScreenY(y);
        ctx.beginPath();
        ctx.moveTo(0, sy);
        ctx.lineTo(w, sy);
        ctx.stroke();
      }
    }

    // Axes
    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 1.5;
    // X axis
    const yAxisScreen = toScreenY(0);
    if (yAxisScreen >= 0 && yAxisScreen <= h) {
      ctx.beginPath();
      ctx.moveTo(0, yAxisScreen);
      ctx.lineTo(w, yAxisScreen);
      ctx.stroke();
      // Arrow
      ctx.beginPath();
      ctx.moveTo(w - 8, yAxisScreen - 4);
      ctx.lineTo(w, yAxisScreen);
      ctx.lineTo(w - 8, yAxisScreen + 4);
      ctx.stroke();
    }
    // Y axis
    const xAxisScreen = toScreenX(0);
    if (xAxisScreen >= 0 && xAxisScreen <= w) {
      ctx.beginPath();
      ctx.moveTo(xAxisScreen, 0);
      ctx.lineTo(xAxisScreen, h);
      ctx.stroke();
      // Arrow
      ctx.beginPath();
      ctx.moveTo(xAxisScreen - 4, 8);
      ctx.lineTo(xAxisScreen, 0);
      ctx.lineTo(xAxisScreen + 4, 8);
      ctx.stroke();
    }

    // Axis labels — slightly larger and brighter
    ctx.fillStyle = textColor;
    ctx.font = '11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    const labelStep = Math.max(1, Math.floor((effectiveXRange[1] - effectiveXRange[0]) / 10));
    for (let x = Math.ceil(effectiveXRange[0] / labelStep) * labelStep; x <= effectiveXRange[1]; x += labelStep) {
      if (x === 0) continue;
      const sx = toScreenX(x);
      const labelY = yAxisScreen >= 0 && yAxisScreen <= h ? Math.min(h - 4, yAxisScreen + 14) : h - 4;
      ctx.fillText(x.toString(), sx, labelY);
    }
    ctx.textAlign = 'right';
    for (let y = Math.ceil(effectiveYRange[0] / labelStep) * labelStep; y <= effectiveYRange[1]; y += labelStep) {
      if (y === 0) continue;
      const sy = toScreenY(y);
      const labelX = xAxisScreen >= 0 && xAxisScreen <= w ? xAxisScreen - 6 : 30;
      ctx.fillText(y.toString(), labelX, sy + 3);
    }

    // Plot expressions
    expressions.forEach((expr, idx) => {
      const color = plotColors[idx % plotColors.length];
      const plotConfig = plots[idx];
      const isPolar = plotConfig?.plotType === 'polar';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      let started = false;

      if (isPolar) {
        // Polar plot: x is θ (angle), evaluate r = f(θ), convert to cartesian
        const thetaRange = plotConfig?.xRange ?? [0, 2 * Math.PI];
        const steps = 500;
        const dTheta = (thetaRange[1] - thetaRange[0]) / steps;

        for (let i = 0; i <= steps; i++) {
          const theta = thetaRange[0] + i * dTheta;
          const r = evalAtX(expr, theta);
          if (r === null || !isFinite(r)) {
            started = false;
            continue;
          }
          // Convert polar to cartesian
          const cartX = r * Math.cos(theta);
          const cartY = r * Math.sin(theta);
          const sx = toScreenX(cartX);
          const sy = toScreenY(cartY);
          if (sx < -1000 || sx > w + 1000 || sy < -1000 || sy > h + 1000) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
      } else {
        // Cartesian plot: y = f(x)
        const step = (effectiveXRange[1] - effectiveXRange[0]) / w;
        for (let sx = 0; sx <= w; sx += 1) {
          const x = toMathX(sx);
          const y = evalAtX(expr, x);
          if (y === null) {
            started = false;
            continue;
          }
          const sy = toScreenY(y);
          if (sy < -1000 || sy > h + 1000) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(sx, sy);
            started = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
      }
      ctx.stroke();
    });

    // Expression labels (top-left legend)
    if (expressions.length > 0) {
      const legendX = 10;
      const legendY = 12;
      const lineHeight = 16;

      // Build legend labels (r = ... for polar, y = ... for cartesian)
      const labels = expressions.map((expr, idx) => {
        const isPolar = plots[idx]?.plotType === 'polar';
        return `${isPolar ? 'r' : 'y'} = ${expr}`;
      });

      // Background for legend
      ctx.fillStyle = isDark ? 'rgba(30,30,30,0.8)' : 'rgba(255,255,255,0.8)';
      const maxWidth = Math.max(...labels.map(l => ctx.measureText(l).width)) + 24;
      ctx.fillRect(legendX - 4, legendY - 4, maxWidth, expressions.length * lineHeight + 8);
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
      ctx.lineWidth = 1;
      ctx.strokeRect(legendX - 4, legendY - 4, maxWidth, expressions.length * lineHeight + 8);

      expressions.forEach((expr, idx) => {
        const color = plotColors[idx % plotColors.length];
        const y = legendY + idx * lineHeight + 4;

        // Color swatch
        ctx.fillStyle = color;
        ctx.fillRect(legendX, y - 6, 12, 3);

        // Text
        ctx.fillStyle = isDark ? '#cccccc' : '#333';
        ctx.font = '11px ui-monospace, monospace';
        ctx.textAlign = 'left';
        const displayLabel = labels[idx].length > 25 ? labels[idx].substring(0, 25) + '...' : labels[idx];
        ctx.fillText(displayLabel, legendX + 18, y);
      });
    }

    // Origin label
    if (xAxisScreen >= 0 && xAxisScreen <= w && yAxisScreen >= 0 && yAxisScreen <= h) {
      ctx.fillStyle = labelColor;
      ctx.font = '11px ui-monospace, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('0', xAxisScreen - 4, yAxisScreen + 12);
    }

    // Hover crosshair and snapped points
    if (hoverPoint) {
      const { screenX, mathX, snapped } = hoverPoint;

      // Draw crosshair lines (dashed)
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      // Vertical line at the hover x
      ctx.beginPath();
      ctx.moveTo(screenX, 0);
      ctx.lineTo(screenX, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw snap indicators: circles on each curve at the current x
      snapped.forEach((sp, idx) => {
        const color = plotColors[idx % plotColors.length];
        // Filled circle with white border
        ctx.beginPath();
        ctx.arc(sp.screenX, sp.screenY, 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Build tooltip text
      const tooltipLines: string[] = [`x = ${mathX.toFixed(3)}`];
      snapped.forEach((sp, idx) => {
        tooltipLines.push(`y = ${sp.y.toFixed(3)}`);
      });

      ctx.font = '11px ui-monospace, monospace';
      const tooltipW = Math.max(...tooltipLines.map(l => ctx.measureText(l).width)) + 16;
      const tooltipH = tooltipLines.length * 16 + 10;

      // Position tooltip: try to avoid overlapping the crosshair and snap dots
      // Default: right and below the hover point
      let tooltipX = screenX + 14;
      let tooltipY = snapped.length > 0 ? Math.min(...snapped.map(s => s.screenY)) + 14 : hoverPoint.screenY + 14;

      // If tooltip would go off right edge, put it to the left
      if (tooltipX + tooltipW > w - 4) {
        tooltipX = screenX - tooltipW - 14;
      }
      // If tooltip would go off bottom edge, move it up
      if (tooltipY + tooltipH > h - 4) {
        tooltipY = h - tooltipH - 4;
      }
      // Ensure tooltip stays in bounds
      tooltipX = Math.max(4, tooltipX);
      tooltipY = Math.max(4, tooltipY);

      // Draw tooltip background
      ctx.fillStyle = isDark ? 'rgba(30,30,30,0.95)' : 'rgba(255,255,255,0.95)';
      ctx.fillRect(tooltipX, tooltipY, tooltipW, tooltipH);
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(tooltipX, tooltipY, tooltipW, tooltipH);

      // Draw tooltip text
      ctx.textAlign = 'left';
      ctx.fillStyle = labelColor;
      ctx.fillText(tooltipLines[0], tooltipX + 8, tooltipY + 16);
      snapped.forEach((sp, i) => {
        ctx.fillStyle = plotColors[i % plotColors.length];
        ctx.fillText(tooltipLines[i + 1], tooltipX + 8, tooltipY + 16 * (i + 1) + 16);
      });
    }
  }, [expressions, plotColors, zoom, offset, theme, showGrid, hoverPoint, xRange, plots]);

  useEffect(() => {
    drawPlot();
    const handleResize = () => drawPlot();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawPlot]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(z => Math.max(0.1, Math.min(100, z * factor)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      const effectiveXSpan = (xRange[1] - xRange[0]) / zoom;
      const effectiveYSpan = (yRange[1] - yRange[0]) / zoom;
      setOffset(o => ({
        x: o.x - (dx / (rect.width || 1)) * effectiveXSpan,
        y: o.y + (dy / (rect.height || 1)) * effectiveYSpan,
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
    } else {
      // Compute snapped points: evaluate each curve at current x
      const effectiveXRange: [number, number] = [
        xRange[0] / zoom + offset.x,
        xRange[1] / zoom + offset.x,
      ];
      const effectiveYRange: [number, number] = [
        yRange[0] / zoom + offset.y,
        yRange[1] / zoom + offset.y,
      ];
      const mathX = effectiveXRange[0] + (mx / rect.width) * (effectiveXRange[1] - effectiveXRange[0]);

      const toScreenYLocal = (y: number) => rect.height - ((y - effectiveYRange[0]) / (effectiveYRange[1] - effectiveYRange[0])) * rect.height;

      const snapped: SnappedPoint[] = [];
      expressions.forEach((expr) => {
        const y = evalAtX(expr, mathX);
        if (y !== null) {
          const screenY = toScreenYLocal(y);
          // Only include points that are visible on screen
          if (screenY >= -50 && screenY <= rect.height + 50) {
            snapped.push({ expr, y, screenX: mx, screenY });
          }
        }
      });

      setHoverPoint({ screenX: mx, screenY: my, mathX, snapped });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoverPoint(null);
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleCopyImage = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (blob) await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      // Fallback
    }
  };

  const handleDownloadPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `omnmath-plot-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  if (expressions.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full ${
        theme === 'dark' ? 'text-[#5a5a5a]' : 'text-[#999]'
      }`}>
        <div className="text-center max-w-xs">
          {/* Animated plot icon */}
          <div className="relative mx-auto mb-4 w-24 h-24">
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* Grid lines */}
              <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
              <line x1="50" y1="0" x2="50" y2="100" stroke="currentColor" strokeWidth="0.5" opacity="0.3" />
              {/* Sine wave */}
              <path
                d="M 0 50 Q 12.5 20, 25 50 T 50 50 T 75 50 T 100 50"
                fill="none"
                stroke={theme === 'dark' ? '#4fc3f7' : '#007acc'}
                strokeWidth="2"
                strokeLinecap="round"
                opacity="0.6"
              >
                <animate
                  attributeName="d"
                  values="M 0 50 Q 12.5 20, 25 50 T 50 50 T 75 50 T 100 50;M 0 50 Q 12.5 80, 25 50 T 50 50 T 75 50 T 100 50;M 0 50 Q 12.5 20, 25 50 T 50 50 T 75 50 T 100 50"
                  dur="3s"
                  repeatCount="indefinite"
                />
              </path>
              {/* Point markers */}
              <circle cx="25" cy="50" r="2" fill={theme === 'dark' ? '#4fc3f7' : '#007acc'} opacity="0.8" />
              <circle cx="50" cy="50" r="2" fill={theme === 'dark' ? '#81c784' : '#10b981'} opacity="0.8" />
              <circle cx="75" cy="50" r="2" fill={theme === 'dark' ? '#ffb74d' : '#f59e0b'} opacity="0.8" />
            </svg>
          </div>
          <p className="text-[14px] font-medium mb-1">{t('plotEmpty')}</p>
          <p className={`text-[12px] ${theme === 'dark' ? 'text-[#4a4a4a]' : 'text-[#bbb]'}`}>
            {t('plotEmptyHint')}
          </p>
          {/* Example chips */}
          <div className="flex flex-wrap gap-1.5 justify-center mt-3">
            {['sin x', 'x^2', 'tan x', 'exp x'].map(ex => (
              <button
                key={ex}
                onClick={() => onInsertExample?.(ex)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-all hover:scale-105 ${
                  theme === 'dark'
                    ? 'bg-[#2d2d2d] text-[#4fc3f7] hover:bg-[#094771] border border-[#3c3c3c]'
                    : 'bg-[#f5f5f5] text-[#007acc] hover:bg-[#e5f1fb] border border-[#e0e0e0]'
                }`}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col" ref={containerRef}>
      {/* Toolbar */}
      <TooltipProvider delayDuration={300}>
        <div className={`flex items-center gap-1 px-2 py-1 border-b ${
          theme === 'dark' ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-[#f3f3f3] border-[#e0e0e0]'
        }`}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.min(100, z * 1.2))}>
                <ZoomIn className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-[#cccccc]' : 'text-[#666]'}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('plotZoomIn')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setZoom(z => Math.max(0.1, z * 0.8))}>
                <ZoomOut className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-[#cccccc]' : 'text-[#666]'}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('plotZoomOut')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={resetView}>
                <RotateCcw className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-[#cccccc]' : 'text-[#666]'}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('plotReset')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={`h-6 w-6 ${showGrid ? 'bg-[#094771]/30' : ''}`}
                onClick={() => setShowGrid(!showGrid)}
              >
                <Grid3x3 className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-[#cccccc]' : 'text-[#666]'}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('plotToggleGrid')}</TooltipContent>
          </Tooltip>
          <div className="flex-1" />
          <span className={`text-[10px] mr-2 ${theme === 'dark' ? 'text-[#858585]' : 'text-[#999]'}`}>
            {t('plotZoom')}: {zoom.toFixed(1)}x · {expressions.length} plot{expressions.length > 1 ? 's' : ''}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopyImage}>
                <Copy className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-[#cccccc]' : 'text-[#666]'}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('plotCopyImage')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDownloadPNG}>
                <Download className={`h-3.5 w-3.5 ${theme === 'dark' ? 'text-[#cccccc]' : 'text-[#666]'}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('plotDownloadPNG')}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Canvas */}
      <div
        className="flex-1 relative cursor-crosshair"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      {/* Plot list footer */}
      {plots.length > 0 && (
        <div className={`flex items-center gap-1 px-2 py-1 border-t overflow-x-auto ${
          theme === 'dark' ? 'bg-[#252526] border-[#3c3c3c]' : 'bg-[#f3f3f3] border-[#e0e0e0]'
        }`}>
          {plots.map((p, i) => (
            <div
              key={i}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] flex-shrink-0 ${
                theme === 'dark' ? 'bg-[#2d2d2d] text-[#cccccc]' : 'bg-white text-[#333]'
              }`}
            >
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: plotColors[i % plotColors.length] }}
              />
              <span className="font-mono max-w-[150px] truncate">{p.expression}</span>
              <button
                onClick={() => removePlot(i)}
                className={`ml-1 ${theme === 'dark' ? 'text-[#858585] hover:text-white' : 'text-[#999] hover:text-black'}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
