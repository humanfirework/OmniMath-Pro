import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静态导出，供 Tauri 作为桌面应用前端 dist 使用
  output: "export",
  // Tauri 内通过 file:// 加载，无需服务端图片优化
  images: { unoptimized: true },
  // 让静态资源路径更稳健（Tauri webview 友好）
  trailingSlash: true,
  // Next 16 默认阻止跨域 HMR，本地/沙箱通过 127.0.0.1 访问需显式放行
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // output:"export" 默认即导出到 ./out/，无需显式设 distDir
  // （设 distDir:"out" 会让 dev 模式也写进 out/，与导出产物冲突）
  typescript: {
    // 不再吞掉 TS 构建错误：让类型问题在构建期暴露
    ignoreBuildErrors: false,
  },
  // Next 16 已移除 next.config 中的 eslint 字段，改由 eslint.config.mjs 控制
  reactStrictMode: true,
};

export default nextConfig;
