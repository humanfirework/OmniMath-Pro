import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // 默认返回 false，保证 SSR / hydration 阶段与服务端输出一致，
  // 避免在客户端首屏渲染时因窗口宽度不同产生 React hydration mismatch。
  const [isMobile, setIsMobile] = React.useState<boolean>(false)

  React.useEffect(() => {
    // 横屏手机（例如 844×390）宽度会超过 768，但高度和指针类型仍然是手机：
    // 若不单独判断，会掉进桌面三栏布局，390px 高度根本放不下。
    const mql = window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT - 1}px), (max-height: 480px) and (pointer: coarse)`,
    )
    const onChange = () => {
      setIsMobile(mql.matches)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
