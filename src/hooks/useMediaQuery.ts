import { useSyncExternalStore } from "react"

/** Subscribes to a CSS media query. SSR-safe default: false. */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", notify)
      return () => mql.removeEventListener("change", notify)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

export const DESKTOP = "(min-width: 1024px)"
