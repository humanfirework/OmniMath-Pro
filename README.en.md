> Language: [中文](README.md) | English

# OmniMath Pro

A **VSCode-style immersive math workbench** built for users who frequently need symbolic computation, formula editing, function plotting, and data exploration.

**Omni** means "all-encompassing", and **Math** is the core. OmniMath Pro brings together the tools you need for everyday math work—calculation, graphing, formulas, unit conversion, base conversion, and variable management—into a single fast, clean, offline-first desktop app.

![License](https://img.shields.io/github/license/humanfirework/OmniMath-Pro)
![Release](https://img.shields.io/github/v/release/humanfirework/OmniMath-Pro)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-blue)

---

## Why OmniMath Pro?

Regular calculators are too simple, and professional math software is often too heavy. OmniMath Pro aims for a sweet spot:

- Fast startup and fully offline
- Editor-like interface that feels familiar
- Instant results with LaTeX and keyboard shortcuts
- Calculation, plotting, formulas, and variable management in one window

## Core Features

- **Symbolic computation & real-time evaluation**: powered by mathjs, supports variables, functions, matrices, complex numbers, and more
- **2D function plotting**: Cartesian and polar coordinates, Canvas rendering, multi-function overlay
- **LaTeX formula rendering**: powered by KaTeX, instant preview as you type
- **Equation solving**: single-variable and system equations
- **Unit & base conversion**: common units for length, mass, time, angle; base 2 to base 36 conversion
- **Command palette & shortcuts**: VSCode-style `Ctrl/Cmd + Shift + P` for quick navigation
- **Variable sliders & panel**: tweak parameters in real time and watch results/graphs update
- **Chinese / English i18n**: switch interface language anytime
- **Dark / light theme**: follow system or manual toggle
- **VSCode-style three-pane layout**: adjustable ActivityBar / SidePanel / Editor / Preview / StatusBar

## Download & Install

Head to the [Releases](https://github.com/humanfirework/OmniMath-Pro/releases) page and pick the installer for your platform:

| Platform | Recommended Installer |
|---|---|
| Windows | `OmniMath-Pro_xxx_x64-setup.exe` |
| macOS (Apple Silicon / M series) | `OmniMath-Pro_xxx_aarch64.dmg` |
| macOS (Intel) | `OmniMath-Pro_xxx_x64.dmg` |
| Linux | `OmniMath-Pro_xxx_amd64.deb` / `.AppImage` |

> `xxx` in the filename is the version number. Choose the file matching your system architecture.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (Static Export), React 19, TypeScript |
| Styling & Components | Tailwind CSS v4, shadcn/ui |
| State Management | Zustand |
| Computation Engine | mathjs |
| Formula Rendering | KaTeX |
| Desktop Shell | Tauri 2 (Rust + wry/WebKit) |
| Bundling | Tauri bundler (.msi / .exe / .dmg / .deb / .AppImage) |

## Project Structure

```
omnimath-pro/
├── src/                     # Next.js app (pure client-side calculator)
│   ├── app/                 # App Router (layout / page / globals.css)
│   ├── components/          # Calculator components (CalculatorLayout, etc.)
│   └── lib/                 # Utilities, state, and computation engine
├── src-tauri/               # Tauri desktop shell (Rust)
│   ├── src/                 # main.rs / lib.rs
│   ├── icons/               # Platform app icons
│   ├── capabilities/        # Tauri permission config
│   └── tauri.conf.json      # Build / window / bundle config
├── prisma/                  # Prisma schema (reserved for future use)
├── public/                  # Static assets (logo, etc.)
└── .github/workflows/       # Multi-platform auto-release workflow
```

## Development

### Prerequisites

- [Node.js](https://nodejs.org/) or [bun](https://bun.sh/) (bun recommended)
- [Rust](https://rustup.rs/) stable

#### Linux Extra Dependencies

```bash
sudo apt-get update
sudo apt-get install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libgtk-3-dev
```

#### Windows

- [Microsoft Visual C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
- [WebView2](https://developer.microsoft.com/microsoft-edge/webview2/) (included in Windows 11)

#### macOS

- Xcode Command Line Tools: `xcode-select --install`

### Local Development

```bash
# Install dependencies
bun install

# Option 1: Pure web development (browser at http://localhost:3000)
bun run dev

# Option 2: Tauri desktop development mode (opens desktop window)
bun run tauri:dev
```

### Build Web Output

```bash
bun run build       # Static export to ./out/
bun run preview     # Preview ./out/ locally
```

### Build Desktop Installer (Current Platform)

```bash
bun run tauri:build
```

Output is located at `src-tauri/target/release/bundle/`.

## Automated Releases

Push a `v*` tag to trigger GitHub Actions, which automatically builds and publishes installers for Windows, macOS (Intel + Apple Silicon), and Linux:

```bash
git tag v0.1.0
git push origin v0.1.0
```

See [`.github/workflows/release.yml`](.github/workflows/release.yml) for details.

## Cross-Platform Notes

- The frontend uses Next.js `output: "export"` to produce a fully static site, loaded by Tauri via `file://` with no server dependency
- The calculator core is pure client-side logic and currently does not rely on Prisma / API routes
- `tauri.conf.json` uses `bundle.targets: "all"` so the bundler picks the correct format per platform

## Common Commands

| Command | Description |
|---|---|
| `bun run dev` | Start Next.js dev server |
| `bun run build` | Static export to `out/` |
| `bun run tauri:dev` | Tauri desktop development mode |
| `bun run tauri:build` | Build desktop installer for current platform |
| `bun run db:push` | Sync Prisma schema (optional) |

## License

[MIT](LICENSE)
