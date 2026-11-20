"use client"

import * as React from "react"
import { GripVerticalIcon } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "@/lib/utils"

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full data-[panel-group-direction=vertical]:flex-col",
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  style,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) {
  // data-panel-group-direction 属性写在父 PanelGroup 上而非 handle 上，
  // 导致 Tailwind 的 data-[panel-group-direction=vertical]:cursor-row-resize
  // 选择器不匹配，垂直布局时光标仍是 col-resize。这里直接通过
  // react-resizable-panels 暴露的 context 读取父级方向，用 inline style
  // 设置正确的 cursor（inline style 优先级高于 className，且会随 direction
  // 变化响应式更新，无需 ref / MutationObserver，也无需改调用方）。
  const { direction } = ResizablePrimitive.usePanelGroupContext()
  const cursor = direction === "vertical" ? "row-resize" : "col-resize"

  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        "relative flex w-px cursor-col-resize items-center justify-center bg-border transition-colors duration-150 before:absolute before:inset-y-0 before:-left-1 before:w-2 before:content-[''] hover:bg-primary/50 focus-visible:ring-ring after:absolute after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[resize-handle-state=drag]:bg-primary/70 data-[resize-handle-state=hover]:bg-primary/50 data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:cursor-row-resize data-[panel-group-direction=vertical]:before:inset-x-0 data-[panel-group-direction=vertical]:before:-top-1 data-[panel-group-direction=vertical]:before:h-2 data-[panel-group-direction=vertical]:before:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-2 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        className
      )}
      style={{ cursor, ...style }}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" strokeWidth={1.75} />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
