> 语言：中文 | [English](README.en.md)

# OmniMath Pro

一款 **VSCode 风格的沉浸式数学工作台**，专为需要频繁进行符号计算、公式编辑、函数绘图与数据探索的用户打造。

**Omni** 意为“无所不包”，**Math** 是数学的核心。OmniMath Pro 试图把日常数学工作所需的工具——计算、绘图、公式、单位换算、进制转换、变量管理——统一到一个简洁、快速、可离线使用的桌面应用中。

![License](https://img.shields.io/github/license/humanfirework/OmniMath-Pro)
![Release](https://img.shields.io/github/v/release/humanfirework/OmniMath-Pro)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

---

## 为什么做 OmniMath Pro？

普通计算器太简单，专业数学软件又太厚重。OmniMath Pro 想做一个中间态：

- 启动快，离线可用
- 界面像代码编辑器一样顺手
- 输入即所得，支持 LaTeX 与键盘快捷键
- 一个窗口内完成计算、绘图、公式、变量管理

## 核心功能

- **符号计算与实时求值**：基于 mathjs，支持变量、函数、矩阵、复数等
- **2D 函数绘图**：含直角坐标与极坐标，Canvas 渲染，支持多函数叠加
- **LaTeX 公式渲染**：使用 KaTeX，输入公式即时呈现
- **方程求解**：一元方程、方程组求解
- **单位转换与进制转换**：长度、质量、时间、角度等常用单位，二到三十六进制互转
- **命令面板与快捷键**：类似 VSCode 的 `Ctrl/Cmd + Shift + P`，快速跳转功能
- **变量滑块与变量面板**：实时调节参数，观察结果与图像变化
- **中英文 i18n**：界面支持中/英切换
- **深色 / 浅色主题**：跟随系统或手动切换
- **VSCode 风格三栏布局**：ActivityBar / SidePanel / Editor / Preview / StatusBar 可调

## 下载安装

前往 [Releases](https://github.com/humanfirework/OmniMath-Pro/releases) 页面，选择对应平台的安装包：

| 平台 | 推荐安装包 |
|---|---|
| Windows | `OmniMath-Pro_xxx_x64-setup.exe` |
| macOS (Apple Silicon / M 系列) | `OmniMath-Pro_xxx_aarch64.dmg` |
| macOS (Intel) | `OmniMath-Pro_xxx_x64.dmg` |
| Linux | `OmniMath-Pro_xxx_amd64.deb` / `.AppImage` |

> 文件名中的 `xxx` 为版本号，请下载与你的系统架构匹配的版本。

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | Next.js 16（Static Export）、React 19、TypeScript |
| 样式与组件 | Tailwind CSS v4、shadcn/ui |
| 状态管理 | Zustand |
| 计算引擎 | mathjs |
| 公式渲染 | KaTeX |
| 桌面壳 | Tauri 2（Rust + wry/WebKit） |
| 打包 | Tauri bundler（.msi / .exe / .dmg / .deb / .AppImage） |

## 目录结构

```
omnimath-pro/
├── src/                     # Next.js 应用（纯客户端计算器）
│   ├── app/                 # App Router（layout / page / globals.css）
│   ├── components/          # 计算器组件（CalculatorLayout 等）
│   └── lib/                 # 工具、状态与计算引擎
├── src-tauri/               # Tauri 桌面壳（Rust）
│   ├── src/                 # main.rs / lib.rs
│   ├── icons/               # 全平台应用图标
│   ├── capabilities/        # Tauri 权限配置
│   └── tauri.conf.json      # 构建/窗口/打包配置
├── prisma/                  # Prisma schema（保留未来扩展）
├── public/                  # 静态资源（logo 等）
└── .github/workflows/       # 多平台自动发布工作流
```

## 开发环境

### 前置依赖

- [Node.js](https://nodejs.org/) 或 [bun](https://bun.sh/)（推荐 bun）
- [Rust](https://rustup.rs/) stable

#### Linux 额外依赖

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev
```

#### Windows

- [Microsoft Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/)（Win11 已自带）

#### macOS

- Xcode Command Line Tools：`xcode-select --install`

### 本地开发

```bash
# 安装依赖
bun install

# 方式一：纯 Web 开发（浏览器访问 http://localhost:3000）
bun run dev

# 方式二：Tauri 桌面开发模式（自动打开桌面窗口）
bun run tauri:dev
```

### 构建 Web 产物

```bash
bun run build       # 静态导出到 ./out/
bun run preview     # 本地预览 ./out/
```

### 构建桌面安装包（当前平台）

```bash
bun run tauri:build
```

产物位于 `src-tauri/target/release/bundle/`。

## 自动发布

推送 `v*` 标签即可触发 GitHub Actions，自动在 Windows、macOS（Intel + Apple Silicon）、Linux 上构建并发布到 Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

详见 [`.github/workflows/release.yml`](.github/workflows/release.yml)。

## 跨平台说明

- 前端使用 Next.js `output: "export"` 产出纯静态文件，Tauri 以 `file://` 方式加载，无服务端依赖
- 计算器核心为纯客户端逻辑，当前不依赖 Prisma / API 路由
- `tauri.conf.json` 中 `bundle.targets: "all"` 会按当前平台自动选择打包格式

## 常用命令

| 命令 | 作用 |
|---|---|
| `bun run dev` | 启动 Next.js 开发服务器 |
| `bun run build` | 静态导出到 `out/` |
| `bun run tauri:dev` | Tauri 桌面开发模式 |
| `bun run tauri:build` | 构建当前平台桌面安装包 |
| `bun run db:push` | Prisma schema 同步（可选） |

## 许可证

[MIT](LICENSE)
