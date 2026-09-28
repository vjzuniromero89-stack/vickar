import { AnimatePresence, m, useReducedMotion } from "motion/react"
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { Icon } from "../../components/ui/Icon"
import { formatPrice, type Product } from "../../data/catalog"
import { useMediaQuery } from "../../hooks/useMediaQuery"
import { duration, ease, transition } from "../../motion/tokens"
import { useBag } from "../../state/BagContext"
import { useCatalog } from "../../state/CatalogContext"
import { useRouter } from "../../state/RouterContext"
import { Hero } from "../Hero"
import { createRig, INTRO_SECONDS, introCaptions } from "./rig"
import styles from "./Showroom.module.css"

// three.js is only downloaded by browsers that can show the boutique
const Scene = lazy(() => import("./Scene"))

function supportsWebGL() {
  try {
    const c = document.createElement("canvas")
    return Boolean(c.getContext("webgl2") || c.getContext("webgl"))
  } catch {
    return false
  }
}

/**
 * The home hero: a glass boutique in 3D.
 * Opens like a film (camera enters through the glass doors, the lights come on, the featured
 * piece descends onto a floating turntable), then hands control to the visitor.
 * Falls back to the classic scroll hero without WebGL or without products.
 */
export function Showroom() {
  const { status, published } = useCatalog()
  const [webgl] = useState(supportsWebGL)
  if (!webgl || (status !== "loading" && published.length === 0)) return <Hero />
  return <Boutique products={published} catalogReady={status !== "loading"} />
}

type Phase = "loading" | "intro" | "ready"

function Boutique({ products, catalogReady }: { products: Product[]; catalogReady: boolean }) {
  const reduced = Boolean(useReducedMotion())
  const compact = useMediaQuery("(max-width: 767px)")
  const { categoryLabel } = useCatalog()
  const { add, open: openBag } = useBag()
  const { toProduct } = useRouter()

  const section = useRef<HTMLElement>(null)
  const rig = useMemo(() => createRig(reduced), [reduced])
  const [phase, setPhase] = useState<Phase>("loading")
  const [introPlaying, setIntroPlaying] = useState(!reduced)
  const [introKey, setIntroKey] = useState(0)
  const [caption, setCaption] = useState(-1)
  const [active, setActive] = useState(true)
  const [turned, setTurned] = useState(false)
  const [paused, setPaused] = useState(reduced)
  const [added, setAdded] = useState(false)
  const [announcement, setAnnouncement] = useState("")
  const [listOpen, setListOpen] = useState(false)
  const listButton = useRef<HTMLButtonElement>(null)
  const browse = useRef<HTMLElement>(null)

  // Close the pieces list on an outside click
  useEffect(() => {
    if (!listOpen) return
    const onDown = (e: PointerEvent) => {
      if (!browse.current?.contains(e.target as Node)) setListOpen(false)
    }
    document.addEventListener("pointerdown", onDown)
    return () => document.removeEventListener("pointerdown", onDown)
  }, [listOpen])

  const featured = products.find((p) => p.badge === "Bestseller") ?? products[0]
  const [selectedId, setSelectedId] = useState(featured?.id ?? "")
  const selected = products.find((p) => p.id === selectedId) ?? featured
  const [colors, setColors] = useState<Record<string, string>>({})
  const colorOf = (p: Product) => colors[p.id] ?? p.swatches[0]?.hex ?? ""

  useEffect(() => {
    if (!products.some((p) => p.id === selectedId) && featured) setSelectedId(featured.id)
  }, [products, selectedId, featured])

  // Only render frames while the boutique is on screen
  useEffect(() => {
    const el = section.current
    if (!el) return
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0.02 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  /* ---------- entrance ---------- */

  const timers = useRef<number[]>([])
  const clearCaptions = useCallback(() => {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    setCaption(-1)
  }, [])
  useEffect(() => clearCaptions, [clearCaptions])

  const startIntro = useCallback(() => {
    if (reduced) {
      setPhase("ready")
      return
    }
    clearCaptions()
    setPhase("intro")
    introCaptions.forEach((c, i) => {
      timers.current.push(window.setTimeout(() => setCaption(i), c.at * 1000))
      timers.current.push(window.setTimeout(() => setCaption((cur) => (cur === i ? -1 : cur)), c.until * 1000))
    })
  }, [reduced, clearCaptions])

  const endIntro = useCallback(() => {
    clearCaptions()
    setIntroPlaying(false)
    setPhase("ready")
  }, [clearCaptions])

  const skip = useCallback(() => {
    clearCaptions()
    setIntroPlaying(false) // the scene fast-forwards, then calls endIntro
  }, [clearCaptions])

  const replay = () => {
    rig.reset = true
    setIntroPlaying(true)
    setIntroKey((k) => k + 1)
    startIntro()
  }

  // Esc skips the entrance
  useEffect(() => {
    if (phase !== "intro") return
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && skip()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [phase, skip])

  /* ---------- stage ---------- */

  const select = useCallback(
    (id: string) => {
      if (id === selectedId) return
      setSelectedId(id)
      setAdded(false)
      rig.reset = true
      const p = products.find((x) => x.id === id)
      if (p) setAnnouncement(`${p.name} is now on the stage.`)
    },
    [selectedId, products, rig],
  )

  const nudge = (yaw: number, pitch: number) => {
    rig.yaw += yaw
    rig.pitch += pitch
    setTurned(true)
  }
  const togglePause = () => {
    rig.paused = !paused
    setPaused(!paused)
  }
  const onStageKeys = (e: KeyboardEvent) => {
    const map: Record<string, [number, number]> = { ArrowLeft: [-0.35, 0], ArrowRight: [0.35, 0], ArrowUp: [0, -0.35], ArrowDown: [0, 0.35] }
    const move = map[e.key]
    if (move) {
      e.preventDefault()
      nudge(...move)
    } else if (e.key.toLowerCase() === "r") {
      rig.reset = true
    }
  }

  const soldOut = selected?.stock === 0
  const onAdd = () => {
    if (!selected || soldOut) return
    add(selected.id, colorOf(selected))
    setAdded(true)
    window.setTimeout(() => setAdded(false), 2200)
  }

  const ready = phase === "ready"
  const letterbox = phase !== "ready"

  return (
    <section ref={section} className={styles.stage} aria-labelledby="showroom-title" data-phase={phase}>
      {catalogReady && (
        <Suspense fallback={null}>
          <Scene
            products={products}
            selectedId={selected?.id ?? ""}
            colors={colors}
            onSelect={select}
            rig={rig}
            introPlaying={introPlaying}
            introKey={introKey}
            onIntroStart={startIntro}
            onIntroEnd={endIntro}
            onFirstTurn={() => setTurned(true)}
            reduced={reduced}
            active={active}
            compact={compact}
          />
        </Suspense>
      )}

      <div className={styles.vignette} aria-hidden="true" />

      {/* Poster while three.js and the catalogue load */}
      <AnimatePresence>
        {phase === "loading" && (
          <m.div className={styles.poster} exit={{ opacity: 0, transition: { duration: 0.6 } }} aria-hidden="true">
            <span className={`t-label ${styles.gold}`}>VICKAR / Maison</span>
            <span className={styles.posterLine} />
          </m.div>
        )}
      </AnimatePresence>

      {/* Film letterbox: present during the entrance, retracts when the visitor takes over */}
      <m.div
        className={`${styles.bar} ${styles.barTop}`}
        aria-hidden="true"
        initial={false}
        animate={{ scaleY: letterbox ? 1 : 0 }}
        transition={{ duration: 0.9, ease: ease.inOut }}
      />
      <m.div
        className={`${styles.bar} ${styles.barBottom}`}
        aria-hidden="true"
        initial={false}
        animate={{ scaleY: letterbox ? 1 : 0 }}
        transition={{ duration: 0.9, ease: ease.inOut }}
      />

      {/* Entrance HUD */}
      <AnimatePresence>
        {phase === "intro" && (
          <m.div className={styles.hud} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: transition.exit }}>
            <Timecode />
            <AnimatePresence mode="wait">
              {caption >= 0 && (
                <m.div
                  key={caption}
                  className={styles.caption}
                  initial={{ opacity: 0, y: 14, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -8, filter: "blur(6px)", transition: { duration: 0.45, ease: ease.exit } }}
                  transition={{ duration: 1.1, ease: ease.out }}
                >
                  <span className={`t-label ${styles.gold}`}>{introCaptions[caption].label}</span>
                  <p className={styles.captionLine}>{introCaptions[caption].line}</p>
                </m.div>
              )}
            </AnimatePresence>
            <button type="button" className={styles.skip} onClick={skip}>
              <span>Skip intro</span>
              <span className={styles.skipTrack} aria-hidden="true">
                {introPlaying && (
                  <m.span
                    className={styles.skipFill}
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: INTRO_SECONDS, ease: "linear" }}
                  />
                )}
              </span>
              <kbd className={styles.kbd}>Esc</kbd>
            </button>
          </m.div>
        )}
      </AnimatePresence>

      {/* The shop floor: visible and focusable once the entrance ends */}
      <div className={styles.ui} inert={!ready} data-ready={ready || undefined}>
        <m.header
          className={styles.title}
          initial={false}
          animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ ...transition.reveal, delay: ready ? 0.15 : 0 }}
        >
          <span className={`t-label ${styles.gold}`}>00 / The glass house</span>
          <h1 id="showroom-title" className={styles.h1}>
            Everything. <em className="t-serif">One store.</em>
          </h1>
          {!reduced && (
            <button type="button" className={styles.replay} onClick={replay}>
              Replay the entrance
            </button>
          )}
        </m.header>

        {compact ? (
          // Phone: the shelves are off-screen, so the pieces are a swipeable row of chips
          <m.nav
            className={styles.index}
            aria-label="Pieces on the shelves"
            initial={false}
            animate={{ opacity: ready ? 1 : 0 }}
            transition={{ ...transition.reveal, delay: ready ? 0.3 : 0 }}
          >
            <PieceList products={products} selectedId={selected?.id} onSelect={select} />
          </m.nav>
        ) : (
          // Desktop: the shelves are the browser; the full list is one click away
          <m.nav
            ref={browse}
            className={styles.browse}
            aria-label="Pieces on the shelves"
            initial={false}
            animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            transition={{ ...transition.reveal, delay: ready ? 0.45 : 0 }}
            onKeyDown={(e) => {
              if (e.key === "Escape" && listOpen) {
                setListOpen(false)
                listButton.current?.focus()
              }
            }}
          >
            <AnimatePresence>
              {listOpen && (
                <m.div
                  id="showroom-pieces"
                  className={styles.index}
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 6, transition: transition.exit }}
                  transition={{ duration: duration.ui, ease: ease.out }}
                >
                  <span className={`t-label t-soft ${styles.indexLabel}`}>On the shelves</span>
                  <PieceList
                    products={products}
                    selectedId={selected?.id}
                    onSelect={(id) => {
                      select(id)
                      setListOpen(false)
                      listButton.current?.focus()
                    }}
                  />
                </m.div>
              )}
            </AnimatePresence>
            <button
              ref={listButton}
              type="button"
              className={styles.browseBtn}
              aria-expanded={listOpen}
              aria-controls="showroom-pieces"
              onClick={() => setListOpen((o) => !o)}
            >
              <Icon name="grid" size={16} />
              All pieces
              <span className={styles.browseCount}>{products.length}</span>
            </button>
          </m.nav>
        )}

        {selected && (
          <m.div
            className={styles.card}
            initial={false}
            animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
            transition={{ ...transition.reveal, delay: ready ? 0.35 : 0 }}
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <m.div
                key={selected.id}
                className={styles.cardBody}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: transition.exit }}
                transition={{ duration: duration.ui * 1.6, ease: ease.out }}
              >
                <div className={styles.cardHead}>
                  <span className={`t-label ${styles.gold}`}>
                    {categoryLabel(selected.category)}
                    {selected.badge ? ` · ${selected.badge}` : ""}
                  </span>
                  <h2 className={styles.name}>{selected.name}</h2>
                  <p className={styles.price}>
                    {formatPrice(selected.price)}
                    {selected.compareAt ? <s className="t-soft">{formatPrice(selected.compareAt)}</s> : null}
                  </p>
                </div>
                <p className={`t-small t-soft ${styles.blurb}`}>{selected.blurb}</p>

                {selected.swatches.length > 0 && (
                  <fieldset className={styles.swatches}>
                    <legend className="t-small">
                      Colour: <span className="t-soft">{selected.swatches.find((s) => s.hex === colorOf(selected))?.name}</span>
                    </legend>
                    <div className={styles.swatchRow}>
                      {selected.swatches.map((s) => (
                        <button
                          key={s.hex}
                          type="button"
                          className={styles.swatch}
                          aria-label={s.name}
                          aria-pressed={colorOf(selected) === s.hex}
                          onClick={() => setColors((c) => ({ ...c, [selected.id]: s.hex }))}
                        >
                          <span style={{ background: s.hex }} />
                        </button>
                      ))}
                    </div>
                  </fieldset>
                )}

                <div className={styles.actions}>
                  <button type="button" className="btn btn--primary" onClick={added ? openBag : onAdd} disabled={soldOut}>
                    {soldOut ? "Sold out" : added ? "Added — view bag" : "Add to bag"}
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => toProduct(selected.id)}>
                    Details
                    <Icon name="arrow" size={16} />
                  </button>
                </div>
              </m.div>
            </AnimatePresence>
          </m.div>
        )}

        <m.div
          className={styles.controls}
          initial={false}
          animate={ready ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ ...transition.reveal, delay: ready ? 0.5 : 0 }}
        >
          <AnimatePresence>
            {!turned && (
              <m.p className={styles.hint} exit={{ opacity: 0, transition: transition.exit }}>
                <m.span
                  className={styles.hintIcon}
                  animate={reduced ? undefined : { rotate: [0, -12, 12, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: ease.inOut }}
                >
                  <Icon name="orbit" size={18} />
                </m.span>
                {compact ? "Swipe sideways on the piece to turn it" : "Drag the piece to turn it any way"}
              </m.p>
            )}
          </AnimatePresence>
          <div className={styles.pad} role="group" aria-label="Turn the piece (arrow keys also work)" onKeyDown={onStageKeys}>
            <button type="button" className={styles.padBtn} onClick={() => nudge(-0.35, 0)} aria-label="Turn left">
              <span className={styles.flip}>
                <Icon name="chevron" size={18} />
              </span>
            </button>
            <button type="button" className={styles.padBtn} onClick={() => nudge(0, -0.35)} aria-label="Tilt up">
              <span className={styles.up}>
                <Icon name="chevron" size={18} />
              </span>
            </button>
            <button type="button" className={styles.padBtn} onClick={() => nudge(0, 0.35)} aria-label="Tilt down">
              <span className={styles.down}>
                <Icon name="chevron" size={18} />
              </span>
            </button>
            <button type="button" className={styles.padBtn} onClick={() => nudge(0.35, 0)} aria-label="Turn right">
              <Icon name="chevron" size={18} />
            </button>
            <span className={styles.padDivider} aria-hidden="true" />
            <button type="button" className={styles.padBtn} onClick={() => (rig.reset = true)} aria-label="Front view">
              <Icon name="reset" size={18} />
            </button>
            {!reduced && (
              <button type="button" className={styles.padBtn} onClick={togglePause} aria-label="Turntable spin" aria-pressed={!paused}>
                <Icon name={paused ? "play" : "pause"} size={18} />
              </button>
            )}
          </div>
        </m.div>

        {!compact && (
          <m.a
            href="#shop"
            className={styles.scrollCue}
            initial={false}
            animate={{ opacity: ready ? 1 : 0 }}
            transition={{ ...transition.reveal, delay: ready ? 0.8 : 0 }}
          >
            <span className="t-label">The full collection</span>
            <span className={styles.scrollLine} aria-hidden="true" />
          </m.a>
        )}
      </div>

      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>
    </section>
  )
}

function PieceList({ products, selectedId, onSelect }: { products: Product[]; selectedId?: string; onSelect: (id: string) => void }) {
  return (
    <ul>
      {products.map((p, i) => (
        <li key={p.id}>
          <button type="button" className={styles.indexItem} aria-pressed={p.id === selectedId} onClick={() => onSelect(p.id)}>
            <span className={styles.indexNum}>{String(i + 1).padStart(2, "0")}</span>
            <span className={styles.indexName}>{p.name}</span>
            <span className={styles.indexPrice}>{formatPrice(p.price)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Film-style timecode (HH:MM:SS:FF at 24 fps) while the entrance plays. */
function Timecode() {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const start = performance.now()
    let raf = 0
    const tick = () => {
      const s = (performance.now() - start) / 1000
      const ff = Math.floor((s % 1) * 24)
      const pad = (n: number) => String(n).padStart(2, "0")
      if (ref.current) ref.current.textContent = `00:00:${pad(Math.floor(s))}:${pad(ff)}`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <div className={styles.timecode} aria-hidden="true">
      <span className={styles.rec} />
      <span className="t-label">Maison · Take 01</span>
      <span ref={ref} className="t-label">
        00:00:00:00
      </span>
    </div>
  )
}
