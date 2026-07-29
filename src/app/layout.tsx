import type { Metadata, Viewport } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

/* OmniMath Pro — 本地字体策略
 *
 * 不再依赖 next/font/google（需要联网下载，离线/沙箱环境会失败导致
 * 整个 UI 字体 unloaded，文本挤在一起像乱码）。
 *
 * 字体全部自托管：Inter 与 Noto Sans SC（含中文 unicode-range 分片）
 * 及 STIX Two Math 的 woff2 放在 public/fonts，@font-face 在
 * globals.css 顶部注册（font-display: swap），栈首同名命中；
 * 其后保留各平台系统字体（PingFang SC / 微软雅黑等）作为回退。
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
        {/* 阻塞式主题初始化脚本 — 在首次绘制前同步读取 localStorage
            并切换 dark 类，避免 light 主题用户看到 dark 闪烁。
            必须内联且同步执行，放在 body 之前。 */}
        <script dangerouslySetInnerHTML={{
          __html: `try {
            var raw = localStorage.getItem('omnimath-workbench-v1') || localStorage.getItem('omnimath-pro-v2');
            if (raw) {
              var s = JSON.parse(raw);
              var theme = s && (s.theme || (s.state && s.state.theme));
              if (theme === 'light') {
                document.documentElement.classList.remove('dark');
              }
            }
          } catch (e) { /* ignore — fall back to default dark */ }`,
        }} />
      </head>
      <body className="antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
