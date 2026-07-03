# OmniMath Pro

VSCode 风格的沉浸式数学工作台，基于 **Tauri 2 + Next.js 16 + React 19** 构建，支持跨平台桌面运行（Windows / macOS / Linux）。

## 功能

- 符号计算与实时求值（mathjs 引擎）
- 2D 函数绘图（含极坐标，Canvas 渲染）
- LaTeX 公式渲染（KaTeX）
- 方程求解、单位转换、进制转换
- 命令面板、键盘快捷键、变量滑块
- 中英文 i18n、深色 / 浅色主题
- VSCode 风格三栏可调布局（ActivityBar / SidePanel / Editor / Preview / StatusBar）

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Next.js 16（static export）、React 19、Tailwind v4、shadcn/ui、Zustand |
| 计算 | mathjs、KaTeX |
| 桌面壳 | Tauri 2（Rust，wry/webkit） |
| 打包 | Tauri bundler（.deb / .msi / .exe / .dmg） |

## 目录结构

```
omnimath-pro/
├── src/                     # Next.js 应用（纯客户端计算器）
│   ├── app/                 # App Router（layout / page / globals.css）
│   ├── components/          # CalculatorLayout 等计算器组件
│   └── lib/                 # 工具与状态
├── src-tauri/               # Tauri 桌面壳（Rust）
│   ├── src/                 # main.rs / lib.rs
│   ├── icons/               # 应用图标（已生成全平台）
│   ├── capabilities/        # Tauri 权限配置
│   └── tauri.conf.json      # Tauri 构建/窗口/打包配置
├── prisma/                  # Prisma schema（当前未接入业务，保留脚手架）
├── public/                  # 静态资源
├── .github/workflows/       # 多平台发布工作流（release.yml）
├── legacy/                  # 旧 Tauri+React+Python 项目备份（供创新功能融合参考）
├── next.config.ts           # output:"export" 静态导出
└── package.json
```

## 前置依赖

### 通用
- [Node.js](https://nodejs.org/) / [bun](https://bun.sh/)（包管理器）
- [Rust](https://rustup.rs/)（stable，含 cargo）

### Linux 额外系统依赖
```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev
```

### Windows
- [Microsoft Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 已自带）

### macOS
- Xcode Command Line Tools（`xcode-select --install`）

## 开发

```bash
bun install                # 安装前端依赖

# 方式一：纯 Web 开发（浏览器）
bun run dev                # http://localhost:3000

# 方式二：Tauri 桌面开发（启动 Tauri 窗口，自动拉起 dev server）
bun run tauri:dev
```

## 构建 Web 产物

```bash
bun run build              # 静态导出到 ./out/
bun run preview            # 本地预览 ./out/
```

## 构建桌面安装包

### Linux（.deb）
```bash
bun run tauri:build        # 产出 src-tauri/target/release/bundle/deb/*.deb
```

### Windows（.msi + .exe）
在 **Windows** 机器上运行：
```bash
bun run tauri:build        # 产出 .msi（WiX）与 -setup.exe（NSIS）
```

### macOS（.dmg / .app）
在 **macOS** 上运行：
```bash
bun run tauri:build
```

### 一键多平台发布（推荐）
推送 `v*` 标签触发 GitHub Actions（见 `.github/workflows/release.yml`），
在 windows-latest / macos-latest / ubuntu 各 runner 原生产出对应安装包并发布到 Release：

```bash
git tag v0.3.0
git push origin v0.3.0
```

> 本地从 Linux 交叉编译 Windows .exe 受网络与工具链限制不稳定，推荐使用上述 GitHub Actions 在原生 Windows runner 上构建。

## 跨平台说明

- 前端通过 Next.js `output: "export"` 产出纯静态文件（`out/`），Tauri 以 `file://` 加载，无服务端依赖。
- 计算器核心为纯客户端逻辑，不依赖 Prisma / API 路由（`src/app/api` 已移除）。
- `tauri.conf.json` 中 `bundle.targets: "all"` 会按当前平台自动选择打包格式。

## 脚本速查

| 命令 | 作用 |
|---|---|
| `bun run dev` | Next.js dev server（:3000） |
| `bun run build` | 静态导出 → `out/` |
| `bun run tauri:dev` | Tauri 桌面开发模式 |
| `bun run tauri:build` | 构建桌面安装包（当前平台） |
| `bun run db:push` | Prisma 同步 schema（可选） |
