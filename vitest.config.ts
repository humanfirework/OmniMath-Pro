/**
 * OmniMath Pro — Vitest configuration
 *
 * - 使用 jsdom 环境以支持 nativeExport（依赖 document / canvas API）
 * - 复用项目的 @/* 路径别名
 * - 覆盖率收集 src/lib 下的纯逻辑模块
 */
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const srcDir = fileURLToPath(new URL('./src', import.meta.url));
console.error('[vitest.config] @ alias ->', srcDir);

export default defineConfig({
  resolve: {
    alias: [
      // 必须用 fileURLToPath 把 file:// URL 转成平台原生绝对路径。
      // 直接用 `.pathname` 在 Windows 上会得到 "/F:/..."（带前导斜杠的
      // POSIX 风格路径），Vite 无法用它做模块前缀匹配，导致所有
      // `@/lib/engine/mathInstance` 之类的别名解析失败、整个测试套件爆红。
      { find: '@', replacement: srcDir },
      { find: '@/', replacement: srcDir + '/' },
    ],
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
