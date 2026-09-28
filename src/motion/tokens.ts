import type { Transition } from "motion/react"

/**
 * VICKAR motion language — "blueprint to product".
 * Things are drawn (lines), then materialise (fill), then settle. Fast in, calm out,
 * no toy-like bounce. Mirrors the CSS custom properties in styles/tokens.css.
 */

export const ease = {
  /** Entrances and reveals: fast start, long soft settle. */
  out: [0.22, 1, 0.36, 1],
  /** Exits: accelerate away, ~70% of the entrance duration. */
  exit: [0.4, 0, 1, 1],
  /** Symmetric moves and line drawing. */
  inOut: [0.65, 0, 0.35, 1],
} as const

export const duration = {
  micro: 0.16,
  ui: 0.28,
  reveal: 0.8,
  draw: 1.1,
  counter: 1.2,
} as const

export const stagger = {
  lines: 0.08,
  items: 0.05,
} as const

export const spring = {
  /** Drawers, modals, layout reflow — interruptible, near-zero overshoot. */
  ui: { type: "spring", bounce: 0.1, visualDuration: 0.4 },
  /** Small state feedback (tabs, swatches, counters). */
  snap: { type: "spring", bounce: 0, visualDuration: 0.25 },
  /** Grid reflow when filtering. */
  layout: { type: "spring", bounce: 0.05, visualDuration: 0.5 },
} satisfies Record<string, Transition>

export const transition = {
  reveal: { duration: duration.reveal, ease: ease.out },
  ui: { duration: duration.ui, ease: ease.out },
  exit: { duration: duration.ui * 0.7, ease: ease.exit },
  micro: { duration: duration.micro, ease: ease.out },
} satisfies Record<string, Transition>

/** Viewport config for one-shot reveals. */
export const inView = { once: true, margin: "0px 0px -12% 0px" } as const
