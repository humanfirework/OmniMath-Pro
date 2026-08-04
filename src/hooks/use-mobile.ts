import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // 默认返回 false，保证 SSR / hydration 阶段与服务端输出一致，
  // 避免在客户端首屏渲染时因窗口宽度不同产生 React hydration mismatch。
  const [isMobile, setIsMobile] = React.useState<boolean>(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
