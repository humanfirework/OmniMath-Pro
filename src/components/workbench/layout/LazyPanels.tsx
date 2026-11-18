'use client';

/**
 * 延迟加载的重面板。
 *
 * EditorPanel / PreviewPanel / SidePanel / SettingsPanel 在模块作用域静态依赖
 * mathjs（约 1.4 MB）和整套绘图引擎。首屏是 Studio 首页，这些面板一个都用不到，
 * 但静态导入会把 mathjs 塞进首屏 chunk，拖慢启动并常驻内存。
 *
 * 这里统一改成按需加载：只有用户真的进入工作台 / 打开设置时才下载对应代码块。
 * 每个包装自带 Suspense 边界，未加载完时显示同尺寸的空面板，避免布局跳动。
 */

import { lazy, Suspense, type ReactNode } from 'react';

const EditorPanelLazy = lazy(() =>
  import('@/components/workbench/layout/EditorPanel').then((m) => ({ default: m.EditorPanel })),
);
const PreviewPanelLazy = lazy(() =>
  import('@/components/workbench/layout/PreviewPanel').then((m) => ({ default: m.PreviewPanel })),
);
const SidePanelLazy = lazy(() =>
  import('@/components/workbench/layout/SidePanel').then((m) => ({ default: m.SidePanel })),
);
const SettingsPanelLazy = lazy(() =>
  import('@/components/workbench/panels/SettingsPanel').then((m) => ({ default: m.SettingsPanel })),
);

/** 面板加载占位：保持透明，不闪烁、不改变布局。 */
function PanelFallback() {
  return <div className="h-full w-full bg-background/30" aria-hidden />;
}

/** 浮层类（设置）加载占位：什么都不画。 */
function OverlayFallback() {
  return null;
}

function Boundary({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

export function LazyEditorPanel() {
  return (
    <Boundary fallback={<PanelFallback />}>
      <EditorPanelLazy />
    </Boundary>
  );
}

export function LazyPreviewPanel() {
  return (
    <Boundary fallback={<PanelFallback />}>
      <PreviewPanelLazy />
    </Boundary>
  );
}

export function LazySidePanel({ onClose }: { onClose?: () => void } = {}) {
  return (
    <Boundary fallback={<PanelFallback />}>
      <SidePanelLazy onClose={onClose} />
    </Boundary>
  );
}

export function LazySettingsPanel() {
  return (
    <Boundary fallback={<OverlayFallback />}>
      <SettingsPanelLazy />
    </Boundary>
  );
}
