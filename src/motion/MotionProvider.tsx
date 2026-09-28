import { LazyMotion, MotionConfig, domMax } from "motion/react"
import type { ReactNode } from "react"
import { transition } from "./tokens"

/**
 * Global Motion setup.
 * - LazyMotion + `m` components keep the bundle lean (strict: `motion.*` throws).
 * - domMax is needed for layout/layoutId (card → product page morph).
 * - reducedMotion="user": transforms are dropped for users who ask for less motion;
 *   components additionally swap to opacity-only variants via useReducedMotion().
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={transition.ui}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}
