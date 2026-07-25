import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Noto_Sans_SC } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

/* UI Latin font — Inter: outstanding legibility at 12–14px UI sizes,
 * neutral tone that pairs cleanly with CJK glyphs. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/* Code / math input font — JetBrains Mono: dotted zero, clear
 * l/1/I and O/0 differentiation, tabular figures for aligned output. */
const jbMono = JetBrains_Mono({
  variable: "--font-jb-mono",
  subsets: ["latin"],
  display: "swap",
});

/* CJK font — Noto Sans SC: consistent Chinese rendering across
 * Windows / macOS / Linux (replaces dated Microsoft YaHei fallback). */
const notoSansSC = Noto_Sans_SC({
  variable: "--font-noto-sc",
  weight: ["400", "500", "700"],
  display: "swap",
  preload: false,
});

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
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
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
      <body
        className={`${inter.variable} ${jbMono.variable} ${notoSansSC.variable} antialiased`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
