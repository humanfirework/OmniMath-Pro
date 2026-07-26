import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

/* OmniMath Pro — 本地字体策略
 *
 * 不再依赖 next/font/google（需要联网下载，离线/沙箱环境会失败导致
 * 整个 UI 字体 unloaded，文本挤在一起像乱码）。
 *
 * 改用系统字体栈兜底：在每个目标平台都使用最合适的预装字体。
 * CSS 变量在 globals.css 中定义 --font-sans / --font-mono / --font-math。
 */

export const metadata: Metadata = {
  title: "OmniMath Pro — 全能脚本式AI数学工作台",
  description:
    "VSCode/MATLAB 风格的沉浸式数学工作台：实时公式渲染、绘图、线性代数、AI 辅助。",
  keywords: [
    "OmniMath",
    "数学工作台",
    "计算器",
    "LaTeX",
    "KaTeX",
    "VSCode",
    "绘图",
    "线性代数",
    "AI",
  ],
  authors: [{ name: "OmniMath Team" }],
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafa" },
    { media: "(prefers-color-scheme: dark)", color: "#2e3437" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
      </head>
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
