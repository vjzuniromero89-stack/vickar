import { isMotionValue, m, useMotionValue, useReducedMotion, useTransform, type MotionValue } from "motion/react"
import { useEffect, useId, type ReactNode } from "react"
import type { ArtKind } from "../../data/catalog"
import { duration, ease } from "../../motion/tokens"
import styles from "./ProductArt.module.css"

type ProductArtProps = {
  kind: ArtKind
  color: string
  /**
   * How "real" the product is: 0 = pure blueprint, 1 = finished product.
   * Accepts a MotionValue so the hero can scrub it with scroll.
   */
  materialize?: number | MotionValue<number>
  /** Draw the blueprint strokes (animates pathLength 0 → 1 when it becomes true). */
  draw?: boolean
  /**
   * "auto": blueprint fades as the product materialises (hero).
   * "overlay": blueprint sits on top of the finished product only while `draw` is true (card x-ray).
   */
  blueprint?: "auto" | "overlay"
  label?: string
  className?: string
}

/**
 * Vector product art in two layers:
 *  - blueprint: technical strokes that draw themselves
 *  - render: the finished object, tinted by the selected colour (stop-color transitions)
 */
export function ProductArt({
  kind,
  color,
  materialize = 1,
  draw = true,
  blueprint = "auto",
  label,
  className,
}: ProductArtProps) {
  const uid = useId().replace(/:/g, "")
  const reduced = useReducedMotion()
  const fallback = useMotionValue(typeof materialize === "number" ? materialize : 1)
  const mat = isMotionValue(materialize) ? materialize : fallback
  useEffect(() => {
    if (typeof materialize === "number") fallback.set(materialize)
  }, [materialize, fallback])

  const blueprintAuto = useTransform(mat, [0, 1], [1, 0.12])
  const art = arts[kind]

  return (
    <svg
      viewBox="0 0 200 300"
      className={`${styles.art} ${className ?? ""}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={`${uid}-metal`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${color} 55%, black)` }} />
          <stop offset="0.22" style={{ stopColor: color }} />
          <stop offset="0.38" style={{ stopColor: `color-mix(in srgb, ${color} 45%, white)` }} />
          <stop offset="0.55" style={{ stopColor: color }} />
          <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${color} 50%, black)` }} />
        </linearGradient>
        <linearGradient id={`${uid}-dark`} x1="0" x2="1">
          <stop offset="0" stopColor="#111316" />
          <stop offset="0.4" stopColor="#3a3e44" />
          <stop offset="1" stopColor="#0d0f11" />
        </linearGradient>
        <linearGradient id={`${uid}-lens`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${color} 35%, #050607)` }} />
          <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${color} 70%, #050607)` }} />
        </linearGradient>
        <radialGradient id={`${uid}-shadow`}>
          <stop offset="0" stopColor="#000" stopOpacity="0.35" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Render layer */}
      <m.g style={{ opacity: mat }}>
        {/* Contact shadow sits under the object: glasses float mid-frame, the rest stand on the base */}
        <ellipse cx="100" cy={kind === "sunglasses" ? 200 : 284} rx={kind === "sunglasses" ? 78 : 62} ry="7" fill={`url(#${uid}-shadow)`} />
        {art.render(uid, color, reduced ?? false)}
      </m.g>

      {/* Blueprint layer */}
      <m.g
        className={styles.blueprint}
        style={blueprint === "auto" ? { opacity: blueprintAuto } : undefined}
        initial={false}
        animate={blueprint === "overlay" ? { opacity: draw ? 1 : 0 } : undefined}
        transition={{ duration: duration.ui }}
      >
        {art.guides.map((d, i) => (
          <m.path
            key={`g${i}`}
            d={d}
            className={styles.guide}
            initial={false}
            animate={{ opacity: draw ? 0.55 : 0 }}
            transition={{ duration: 0.6, delay: reduced ? 0 : 0.4 }}
          />
        ))}
        {art.lines.map((d, i) => (
          <m.path
            key={`l${i}`}
            d={d}
            className={styles.line}
            initial={false}
            animate={{ pathLength: draw ? 1 : 0, opacity: draw ? 1 : 0 }}
            transition={
              reduced
                ? { duration: 0 }
                : {
                    pathLength: { duration: duration.draw, ease: ease.inOut, delay: i * 0.06 },
                    opacity: { duration: 0.2, delay: i * 0.06 },
                  }
            }
          />
        ))}
      </m.g>
    </svg>
  )
}

/* ------------------------------------------------------------------------------------------ */

type ArtDef = {
  /** Blueprint strokes, drawn in order */
  lines: string[]
  /** Dashed axes and dimension marks */
  guides: string[]
  render: (uid: string, color: string, reduced: boolean) => ReactNode
}

const AXIS = "M100 10 V290"

const watchIndices = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2
  const r1 = i % 3 === 0 ? 34 : 38
  const r2 = 42
  const f = (n: number) => n.toFixed(2)
  return `M${f(100 + Math.sin(a) * r1)} ${f(150 - Math.cos(a) * r1)} L${f(100 + Math.sin(a) * r2)} ${f(150 - Math.cos(a) * r2)}`
})

const arts: Record<ArtKind, ArtDef> = {
  bottle: {
    lines: [
      "M84 64 H116 V76 C116 88 136 92 136 108 V262 C136 272 128 278 118 278 H82 C72 278 64 272 64 262 V108 C64 92 84 88 84 76 Z",
      "M80 30 H120 Q124 30 124 34 V64 H76 V34 Q76 30 80 30 Z",
      "M88 30 C88 12 112 12 112 30",
      "M64 150 H136",
      "M64 206 H136",
    ],
    guides: [AXIS, "M150 108 H160 M155 108 V278 M150 278 H160"],
    render: (uid) => (
      <>
        <path
          d="M84 64 H116 V76 C116 88 136 92 136 108 V262 C136 272 128 278 118 278 H82 C72 278 64 272 64 262 V108 C64 92 84 88 84 76 Z"
          fill={`url(#${uid}-metal)`}
        />
        <rect x="64" y="150" width="72" height="56" fill="#000" opacity="0.07" />
        <rect x="74" y="112" width="6" height="146" rx="3" fill="#fff" opacity="0.32" />
        <path d="M88 30 C88 12 112 12 112 30" fill="none" stroke="#1a1c1f" strokeWidth="5" strokeLinecap="round" />
        <path d="M80 30 H120 Q124 30 124 34 V64 H76 V34 Q76 30 80 30 Z" fill={`url(#${uid}-dark)`} />
        <rect x="76" y="58" width="48" height="6" fill="#000" opacity="0.35" />
      </>
    ),
  },

  sport: {
    lines: [
      "M70 90 C70 80 80 74 100 74 C120 74 130 80 130 90 V150 C130 162 122 168 122 180 C122 192 130 198 130 210 V262 C130 272 122 278 112 278 H88 C78 278 70 272 70 262 V210 C70 198 78 192 78 180 C78 168 70 162 70 150 Z",
      "M76 58 H124 Q128 58 128 62 V74 H72 V62 Q72 58 76 58 Z",
      "M90 58 V46 Q90 40 100 40 Q110 40 110 46 V58",
      "M96 40 V30 H104 V40",
      "M80 172 H120 M80 180 H120 M80 188 H120",
    ],
    guides: [AXIS, "M144 74 H154 M149 74 V278 M144 278 H154"],
    render: (uid, color) => (
      <>
        <path
          d="M70 90 C70 80 80 74 100 74 C120 74 130 80 130 90 V150 C130 162 122 168 122 180 C122 192 130 198 130 210 V262 C130 272 122 278 112 278 H88 C78 278 70 272 70 262 V210 C70 198 78 192 78 180 C78 168 70 162 70 150 Z"
          fill={`url(#${uid}-metal)`}
        />
        <path d="M80 172 H120 M80 180 H120 M80 188 H120" stroke="#000" strokeOpacity="0.28" strokeWidth="2.5" strokeLinecap="round" />
        <rect x="80" y="96" width="5" height="48" rx="2.5" fill="#fff" opacity="0.35" />
        <path d="M76 58 H124 Q128 58 128 62 V74 H72 V62 Q72 58 76 58 Z" fill={`url(#${uid}-dark)`} />
        <path d="M90 58 V46 Q90 40 100 40 Q110 40 110 46 V58 Z" fill={color} />
        <rect x="96" y="30" width="8" height="10" rx="2" fill="#1a1c1f" />
      </>
    ),
  },

  sunglasses: {
    lines: [
      "M20 128 C20 120 26 116 36 116 H84 C93 116 97 122 95 132 L91 156 C89 168 81 175 69 175 H50 C36 175 26 167 24 155 Z",
      "M180 128 C180 120 174 116 164 116 H116 C107 116 103 122 105 132 L109 156 C111 168 119 175 131 175 H150 C164 175 174 167 176 155 Z",
      "M95 126 Q100 116 105 126",
      "M20 124 L6 121 M180 124 L194 121",
    ],
    guides: ["M100 90 V210", "M20 196 V204 M20 200 H180 M180 196 V204"],
    render: (uid, color) => (
      <>
        <g fill={`url(#${uid}-lens)`}>
          <path d="M20 128 C20 120 26 116 36 116 H84 C93 116 97 122 95 132 L91 156 C89 168 81 175 69 175 H50 C36 175 26 167 24 155 Z" />
          <path d="M180 128 C180 120 174 116 164 116 H116 C107 116 103 122 105 132 L109 156 C111 168 119 175 131 175 H150 C164 175 174 167 176 155 Z" />
        </g>
        <g fill="#fff" opacity="0.18">
          <path d="M34 122 L52 122 L36 168 L28 160 Z" />
          <path d="M122 122 L140 122 L124 170 L114 166 Z" />
        </g>
        <g fill="none" stroke={color} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
          <path d="M20 128 C20 120 26 116 36 116 H84 C93 116 97 122 95 132 L91 156 C89 168 81 175 69 175 H50 C36 175 26 167 24 155 Z" />
          <path d="M180 128 C180 120 174 116 164 116 H116 C107 116 103 122 105 132 L109 156 C111 168 119 175 131 175 H150 C164 175 174 167 176 155 Z" />
          <path d="M95 126 Q100 116 105 126" />
          <path d="M20 124 L6 121 M180 124 L194 121" />
        </g>
      </>
    ),
  },

  watch: {
    lines: [
      "M78 34 H122 L118 98 H82 Z",
      "M82 202 H118 L122 266 H78 Z",
      "M100 96 A54 54 0 1 1 99.99 96 Z",
      "M100 106 A44 44 0 1 1 99.99 106 Z",
      "M154 144 H162 V156 H154 Z",
      ...watchIndices,
    ],
    guides: [AXIS, "M30 96 H40 M35 96 V204 M30 204 H40"],
    render: (uid, color, reduced) => (
      <>
        <path d="M78 34 H122 L118 98 H82 Z" fill={`url(#${uid}-dark)`} />
        <path d="M82 202 H118 L122 266 H78 Z" fill={`url(#${uid}-dark)`} />
        <circle cx="100" cy="150" r="54" fill={`url(#${uid}-metal)`} />
        <rect x="154" y="144" width="8" height="12" rx="2" fill={`url(#${uid}-metal)`} />
        <circle cx="100" cy="150" r="44" fill="#121417" />
        <circle cx="100" cy="150" r="44" fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="1" />
        <g stroke="#e9e7e2" strokeWidth="2" strokeLinecap="round">
          {watchIndices.map((d, i) => (
            <path key={i} d={d} strokeWidth={i % 3 === 0 ? 3 : 1.5} />
          ))}
        </g>
        {/* 10:10 — the classic display time */}
        <g stroke="#f3f2ef" strokeLinecap="round">
          <path d="M100 150 L80 136" strokeWidth="4" />
          <path d="M100 150 L128 128" strokeWidth="3" />
        </g>
        <m.g
          // pivot at the dial centre: bbox spans y 112→160, centre at 150 → 38/48
          style={{ originX: 0.5, originY: 38 / 48 }}
          animate={reduced ? undefined : { rotate: 360 }}
          transition={{ duration: 60, ease: "linear", repeat: Infinity }}
        >
          <path d="M100 160 L100 112" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
        </m.g>
        <circle cx="100" cy="150" r="3" fill={color} />
        <path d="M70 118 A44 44 0 0 1 112 107" fill="none" stroke="#fff" strokeOpacity="0.12" strokeWidth="6" />
      </>
    ),
  },

  /* Generic product box — the fallback for new kinds of product added in the admin */
  box: {
    lines: [
      "M44 128 H132 V272 H44 Z",
      "M44 128 L74 100 H162 L132 128",
      "M132 128 L162 100 V244 L132 272",
      "M84 128 L114 100",
      "M58 222 H118 V252 H58 Z",
    ],
    guides: [AXIS, "M44 286 V294 M44 290 H162 M162 286 V294"],
    render: (uid, color) => (
      <>
        <path d="M44 128 H132 V272 H44 Z" fill={color} />
        <path d="M132 128 L162 100 V244 L132 272 Z" fill={color} />
        <path d="M132 128 L162 100 V244 L132 272 Z" fill="#000" opacity="0.28" />
        <path d="M44 128 L74 100 H162 L132 128 Z" fill={color} />
        <path d="M44 128 L74 100 H162 L132 128 Z" fill="#fff" opacity="0.22" />
        <path d="M84 128 L114 100 H124 L94 128 Z" fill="#000" opacity="0.18" />
        <rect x="58" y="222" width="60" height="30" rx="3" fill="#fff" opacity="0.85" />
        <rect x="50" y="134" width="5" height="132" rx="2.5" fill={`url(#${uid}-metal)`} opacity="0.5" />
      </>
    ),
  },
}