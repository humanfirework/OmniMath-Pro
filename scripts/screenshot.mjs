/**
 * OmniMath Web — dev server 截图脚本
 *
 * 直接访问 Next.js dev server (localhost:3000)，截取主界面与几个核心面板。
 * 用法：node scripts/screenshot.mjs
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const URL = process.env.URL || "http://localhost:3000";
const OUT_DIR = path.resolve(process.cwd(), "screenshots");

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const exePath =
    process.env.PLAYWRIGHT_CHROMIUM ||
    ["/tmp/chromium-dl/chromium-extracted/chrome-linux64/chrome"].find((p) =>
      fs.existsSync(p),
    );

  const browser = await chromium.launch({
    executablePath: exePath,
    args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[browser error]", msg.text());
  });
  page.on("pageerror", (err) => console.log("[pageerror]", err.message));

  console.log(`[screenshot] goto ${URL}`);
  await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
  // 等待 React 挂载 + KaTeX 渲染
  await page.waitForTimeout(3000);

  // 截图 1：默认主界面（dark 主题）
  await page.screenshot({ path: path.join(OUT_DIR, "01-main-dark.png") });
  console.log("[screenshot] saved 01-main-dark.png");

  // 尝试在编辑器里输入表达式并运行，触发结果区渲染
  try {
    const editor = page.locator("textarea").first();
    if (await editor.count()) {
      await editor.click();
      await editor.fill("sin(pi/4) + log(100)");
      await page.waitForTimeout(800);
      await page.screenshot({ path: path.join(OUT_DIR, "02-eval-result.png") });
      console.log("[screenshot] saved 02-eval-result.png");
    }
  } catch (e) {
    console.log("[screenshot] eval failed:", e.message);
  }

  // 尝试切换到公式库 / 历史等侧边栏面板（ActivityBar 按钮）
  try {
    const abItems = await page.locator("[class*='activity'] button, [class*='ActivityBar'] button, nav button").all();
    console.log(`[screenshot] found ${abItems.length} activity bar items`);
    // 点第 3 个（通常是 history 或 formulas）
    if (abItems[2]) {
      await abItems[2].click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT_DIR, "03-sidebar-1.png") });
      console.log("[screenshot] saved 03-sidebar-1.png");
    }
    if (abItems[4]) {
      await abItems[4].click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT_DIR, "04-sidebar-2.png") });
      console.log("[screenshot] saved 04-sidebar-2.png");
    }
  } catch (e) {
    console.log("[screenshot] sidebar switch failed:", e.message);
  }

  // 切到浅色主题（点 status bar 的主题切换按钮）
  try {
    // 状态栏主题按钮通常含 sun/moon 图标或"暗/亮"文字
    const themeBtn = page.locator("button:has-text('亮'), button:has-text('浅'), button:has-text('Light'), button:has-text('Dark'), [title*='主题'], [title*='theme' i]").first();
    if (await themeBtn.count()) {
      await themeBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(OUT_DIR, "05-light-theme.png") });
      console.log("[screenshot] saved 05-light-theme.png");
    }
  } catch (e) {
    console.log("[screenshot] theme switch failed:", e.message);
  }

  await browser.close();
  console.log("[screenshot] done");
}

main().catch((e) => {
  console.error("[screenshot] failed:", e);
  process.exit(1);
});
