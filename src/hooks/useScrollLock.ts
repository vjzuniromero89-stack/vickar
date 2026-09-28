import { useEffect } from "react"

/** Locks page scroll while an overlay is open. `scrollbar-gutter: stable` on <html> prevents layout shift. */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = "hidden"
    return () => {
      html.style.overflow = prev
    }
  }, [locked])
}
