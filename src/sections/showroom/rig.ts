/**
 * Shared, mutable "rig" between the DOM overlay (buttons, keyboard) and the 3D scene.
 * The scene reads it every frame, so turning the piece never re-renders React.
 */
export type StageRig = {
  /** Pending rotation impulses (radians), consumed by the scene. */
  yaw: number
  pitch: number
  /** Ask the scene to ease the piece back to its front view. */
  reset: boolean
  /** Auto-spin paused by the visitor (or reduced motion). */
  paused: boolean
}

export const createRig = (paused = false): StageRig => ({ yaw: 0, pitch: 0, reset: false, paused })

/** Length of the cinematic entrance, in seconds. The DOM captions are timed against it. */
export const INTRO_SECONDS = 7.4

/** Caption cues for the entrance (seconds from the first rendered frame). */
export const introCaptions = [
  { at: 0.5, until: 2.5, label: "VICKAR / Maison", line: "Step inside." },
  { at: 2.8, until: 4.8, label: "The glass house", line: "Every piece, on its own stage." },
  { at: 5.0, until: 7.0, label: "Choose · Turn · Keep", line: "Touch it. Turn it. Make it yours." },
] as const
