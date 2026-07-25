/**
 * OmniMath Pro — Vitest configuration
 *
 * - 使用 jsdom 环境以支持 nativeExport（依赖 document / canvas API）
 * - 复用项目的 @/* 路径别名
 * - 覆盖率收集 src/lib 下的纯逻辑模块
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // 项目未安装 @types/node，用 import.meta.url 替代 node:path + __dirname。
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['node_modules', '.next', 'out'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts', 'src/lib/i18n/**'],
    },
  },
});
