> 语言：中文 | [English](README.en.md)

# OmniMath Pro

一款 **VSCode 风格的沉浸式数学工作台**，为工程师、学生、科研人员和数学爱好者打造。

OmniMath Pro 将符号计算、函数绘图、公式渲染、矩阵运算、线性代数求解与可视化节点工作流整合进一个简洁、快速、可离线运行的桌面应用中。界面灵感来自现代代码编辑器，让你像写代码一样做数学。

![License](https://img.shields.io/github/license/humanfirework/OmniMath-Pro)
![Release](https://img.shields.io/github/v/release/humanfirework/OmniMath-Pro)

![Build](https://img.shields.io/github/actions/workflow/status/humanfirework/OmniMath-Pro/release.yml?logo=github&label=release%20build)
![Tauri](https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)

---

## 为什么是 OmniMath Pro？

普通计算器功能有限，专业数学软件又过于笨重。OmniMath Pro 取其中间态：

- **启动快、离线用** — 基于 Tauri 的本地桌面应用，无需网络
- **编辑器式交互** — 三栏布局、命令面板、快捷键，像 VSCode 一样顺手
- **输入即所得** — 支持类自然语言、Python/MATLAB 风格语法，实时渲染 LaTeX
- **可视化工作流** — 节点式 Pipeline，拖拽连接即可构建复杂计算图
- **深度可定制** — 任务栏位置、面板显隐、主题模式、自动隐藏均可记忆

---

## 核心功能

### 计算与符号运算
- 基于 **mathjs** 的高性能计算引擎
- 支持变量、函数、矩阵、复数、微积分、方程求解
- 多种输入风格：简洁模式 / Python 风格 / MATLAB 风格
- 变量面板实时查看与管理计算状态

### 2D / 3D 绘图
- 直角坐标、极坐标与参数方程 2D 绘图
- 多函数叠加、自动标注重值点与零点
- 鼠标滚轮缩放、拖拽平移、悬停读数
- 极端范围与异常表达式防御，避免崩溃

### 公式渲染
- 使用 **KaTeX** 即时渲染 LaTeX
- 长公式支持水平滚动、缩放（0.6x–2.0x）与折叠/展开
- 一键复制 LaTeX 源码

### 线性代数
- 矩阵输入、编辑与粘贴解析（支持 MATLAB / CSV / TSV 格式）
- 高斯消元、LU / QR 分解、特征值计算
- 线性方程组求解，自动判断唯一解 / 无解 / 无穷解

### 节点式工作流（Pipeline）
- ComfyUI / Blueprint 风格的数学节点图
- 拖拽节点、连接端口、实时传播计算结果
- 独立 mathjs 作用域，不污染主工作台变量

### 界面与体验
- **VSCode 风格布局**：ActivityBar / SidePanel / Editor / Preview / StatusBar
- **任务栏**：支持左右切换、锁定/解锁、自动隐藏、手动隐藏
- **面板显隐**：编辑器、预览区、侧边栏、任务栏均可独立显示/隐藏，状态自动记忆
- **深色 / 浅色主题**：高对比度配色，符合 WCAG 可读性标准
- **中英文 i18n**：界面一键切换中/英文
- **命令面板**：`Ctrl/Cmd + Shift + P` 快速执行命令

---

## 下载安装

前往 [Releases](https://github.com/humanfirework/OmniMath-Pro/releases) 页面，选择对应平台安装包：

| 平台 | 推荐安装包 |
|---|---|
| Windows | `OmniMath-Pro_xxx_x64-setup.exe` / `.msi` |
| macOS (Apple Silicon / M 系列) | `OmniMath-Pro_xxx_aarch64.dmg` |
| macOS (Intel) | `OmniMath-Pro_xxx_x64.dmg` |
| Linux | `OmniMath-Pro_xxx_amd64.deb` / `.AppImage` |

> 文件名中的 `xxx` 为版本号，请下载与你的系统架构匹配的版本。

---

## 技术栈

| 层级 | 技术 |
|---|---|
| 前端框架 | Next.js 16、React 19、TypeScript 5 |
| 样式与组件 | Tailwind CSS v4、shadcn/ui、Framer Motion |
| 状态管理 | Zustand |
| 计算引擎 | mathjs |
| 公式渲染 | KaTeX |
| 节点图 | 自研 Canvas + SVG 节点引擎 |
| 桌面壳 | Tauri 2（Rust + wry/WebKit） |
| 打包 | Tauri bundler（.msi / .exe / .dmg / .deb / .AppImage） |

---

## 项目结构

```
omnimath-pro/
├── src/
│   ├── app/                    # Next.js App Router（layout / page / globals.css）
│   ├── components/
│   │   ├── workbench/          # 主工作台（布局、面板、绘图、节点）
│   │   │   ├── layout/         # ActivityBar、EditorPanel、PreviewPanel、SidePanel、StatusBar
│   │   │   ├── panels/         # History、Variables、FormulaLibrary、LinearAlgebra、Solver、CommandPalette
│   │   │   ├── plots/          # Plot2DCanvas 等绘图组件
│   │   │   └── nodes/          # 节点式 Pipeline 引擎与 UI
│   │   └── ui/                 # shadcn/ui 组件库
│   ├── lib/
│   │   ├── engine/             # 数学计算引擎与求值器
│   │   ├── plots/              # 2D/3D 绘图采样与辅助函数
│   │   ├── store/              # Zustand 状态管理（含持久化）
│   │   └── i18n/               # 中英文翻译字典
│   └── hooks/                  # 自定义 React Hooks
├── src-tauri/                  # Tauri 桌面壳（Rust）
│   ├── src/                    # main.rs / lib.rs
│   ├── icons/                  # 全平台应用图标
│   ├── capabilities/           # Tauri 权限配置
│   └── tauri.conf.json         # 构建/窗口/打包配置
├── prisma/                     # Prisma schema（保留未来扩展）
├── public/                     # 静态资源（logo 等）
└── .github/workflows/          # 多平台自动发布工作流
```

---

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

---

## 自动发布

推送 `v*` 标签即可触发 GitHub Actions，自动在 Windows、macOS（Intel + Apple Silicon）、Linux 上构建并发布到 Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

详见 [`.github/workflows/release.yml`](.github/workflows/release.yml)。

---

## 最近更新（v0.0.2）

- 修复 2D 绘图在极端范围与异常表达式下的崩溃问题
- 优化深色模式对比度，所有文本与背景达到 WCAG 可读标准
- 任务栏支持左右切换、锁定/解锁、自动隐藏与手动隐藏
- 公式渲染支持缩放、折叠/展开与水平滚动
- 编辑器、预览区、侧边栏、任务栏支持独立显隐切换，状态自动持久化
- 修复 35+ TypeScript 类型错误，lint 与 build 全部通过

---

## 常用命令

| 命令 | 作用 |
|---|---|
| `bun run dev` | 启动 Next.js 开发服务器 |
| `bun run build` | 静态导出到 `out/` |
| `bun run lint` | 运行 ESLint 代码检查 |
| `bun run tauri:dev` | Tauri 桌面开发模式 |
| `bun run tauri:build` | 构建当前平台桌面安装包 |
| `bun run db:push` | Prisma schema 同步（可选） |

---

## 许可证

[MIT](LICENSE)
