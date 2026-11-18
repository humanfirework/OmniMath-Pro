/**
 * 首次启动时写入编辑器的示例脚本。
 *
 * 放在独立模块（而不是 EditorPanel）里，是因为工作台 store 需要在
 * `loadFromStorage()` 阶段就决定「是不是首次启动」并写入内容。
 * 编辑器现在是按需加载的，如果还由 EditorPanel 初始化，store 的自动保存
 * 会先把空内容写进 localStorage，编辑器再挂载时就会误判「已有存储」，
 * 首次启动变成一片空白。
 */

export const DEFAULT_SCRIPT = `# 按 Ctrl+Enter 运行（手机点右上角「运行」）
# 用 --- 分隔独立计算块；含 x 的表达式自动画图

sin(x) * cos(x)
integrate(x^2 * e^x, x)

---
# 极坐标：r = 2(1 + cosθ)
r = 2*(1 + cos(theta))`;
