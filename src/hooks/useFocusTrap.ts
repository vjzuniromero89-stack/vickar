import { useEffect, type RefObject } from "react"

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Keeps keyboard focus inside a dialog while it is open, closes on Escape,
 * and returns focus to whatever opened it.
 */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active || !ref.current) return
    const root = ref.current
    const previous = document.activeElement as HTMLElement | null

    const items = () => Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    // Defer so enter animations don't fight the focus scroll
    const raf = requestAnimationFrame(() => (items()[0] ?? root).focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onEscape()
        return
      }
      if (e.key !== "Tab") return
      const list = items()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKey)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener("keydown", onKey)
      previous?.focus({ preventScroll: true })
    }
  }, [active, ref, onEscape])
}
