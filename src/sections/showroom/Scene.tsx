import { ContactShadows, Environment, Html, Lightformer, MeshReflectorMaterial, PerformanceMonitor, Sparkles } from "@react-three/drei"
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from "react"
import * as THREE from "three"
import { formatPrice, type Product } from "../../data/catalog"
import { modelSize, ProductModel, shared } from "./models"
import { INTRO_SECONDS, type StageRig } from "./rig"
import styles from "./Showroom.module.css"

/* =============================================================================================
 * VICKAR glass boutique — one R3F scene.
 *  · Entrance: a fixed camera path (outside → through the glass doors → around the stage),
 *    while the lights come on row by row and the featured piece descends onto the turntable.
 *  · Shelves: every published product sits on a lit glass shelf. Clicking one flies it along an
 *    arc to the floating stage; the previous piece flies back to its place.
 *  · Stage: the visitor drags the piece to turn it any way (with inertia); it idles into a slow
 *    spin. Buttons/keys in the DOM overlay drive the same rig for keyboard and touch users.
 * ===========================================================================================*/

export type SceneProps = {
  products: Product[]
  selectedId: string
  colors: Record<string, string>
  onSelect: (id: string) => void
  rig: StageRig
  /** false = skip/fast-forward the entrance. */
  introPlaying: boolean
  /** Changing it restarts the entrance from the first frame. */
  introKey: number
  onIntroStart: () => void
  onIntroEnd: () => void
  onFirstTurn: () => void
  reduced: boolean
  active: boolean
  compact: boolean
}

type Intro = { t: number; p: number; ended: boolean }

type Stage = {
  quat: THREE.Quaternion
  vel: { x: number; y: number }
  dragging: boolean
  lastInteract: number
}

/* ---------- math helpers ---------- */

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
const Y = new THREE.Vector3(0, 1, 0)
const X = new THREE.Vector3(1, 0, 0)
const tmpQ = new THREE.Quaternion()
const HOME_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06, -0.38, 0))

/* ---------- layout ---------- */

const STAGE_Y = 1.8
const ROWS = [2.38, 1.58, 0.78] // shelf tops, top → bottom
const SLOT_X = [-0.38, 0.38]
const UNITS = [
  { position: new THREE.Vector3(-3.95, 0, -0.7), rotY: 0.6 },
  { position: new THREE.Vector3(3.95, 0, -0.7), rotY: -0.6 },
]

type Slot = { position: THREE.Vector3; quat: THREE.Quaternion; row: number }

/** 12 shelf places: left unit top → bottom, then right unit. */
function buildSlots(): Slot[] {
  const slots: Slot[] = []
  for (const unit of UNITS) {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, unit.rotY)
    ROWS.forEach((y, row) =>
      SLOT_X.forEach((x) => {
        const local = new THREE.Vector3(x, y, 0.02).applyQuaternion(q)
        slots.push({ position: local.add(unit.position), quat: q.clone(), row })
      }),
    )
  }
  return slots
}

/* ---------- textures ---------- */

function gradientTexture(stops: [number, string][], radial = false) {
  const c = document.createElement("canvas")
  c.width = c.height = 128
  const ctx = c.getContext("2d")!
  const g = radial ? ctx.createRadialGradient(64, 64, 0, 64, 64, 64) : ctx.createLinearGradient(0, 0, 0, 128)
  stops.forEach(([o, col]) => g.addColorStop(o, col))
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** Everything that "switches on" during the entrance, driven from one place. */
function useLights() {
  return useMemo(() => {
    const led = (color: string) => new THREE.MeshStandardMaterial({ color: "#000", emissive: color, emissiveIntensity: 0, toneMapped: false })
    const wash = gradientTexture([
      [0, "rgba(0,0,0,0)"],
      [1, "rgba(255,255,255,1)"],
    ])
    const glow = gradientTexture(
      [
        [0, "rgba(255,255,255,1)"],
        [0.35, "rgba(255,255,255,0.35)"],
        [1, "rgba(255,255,255,0)"],
      ],
      true,
    )
    const additive = (color: string, map: THREE.Texture) =>
      new THREE.MeshBasicMaterial({ color, alphaMap: map, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false })
    return {
      rows: ROWS.map(() => led("#ffd9ae")),
      washes: ROWS.map(() => additive("#ffb46e", wash)),
      ceiling: led("#fff1dd"),
      halo: led("#e8c48a"),
      ember: led("#ff7a45"),
      beam: additive("#ffd2a1", wash),
      portalGlow: additive("#ff8a4c", glow),
    }
  }, [])
}
type Lights = ReturnType<typeof useLights>

/* =============================================================================================
 * Root
 * ===========================================================================================*/

export default function Scene(props: SceneProps) {
  const [dpr, setDpr] = useState(() => Math.min(window.devicePixelRatio || 1, props.compact ? 1.5 : 1.75))
  return (
    <Canvas
      className={styles.canvas}
      frameloop={props.active ? "always" : "never"}
      dpr={dpr}
      shadows
      camera={{ position: [0, 5.2, 19], fov: 40, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      // Vertical swipes keep scrolling the page on touch; horizontal drags turn the piece
      style={{ touchAction: "pan-y" }}
      onCreated={({ gl }) => {
        gl.domElement.setAttribute("role", "img")
        gl.domElement.setAttribute("aria-label", "VICKAR glass boutique: products on glass shelves around a floating turntable stage")
        props.onIntroStart()
      }}
    >
      <PerformanceMonitor onDecline={() => setDpr(1)} />
      <World {...props} />
    </Canvas>
  )
}

function World(props: SceneProps) {
  const { products, selectedId, colors, onSelect, rig, reduced, compact } = props
  const intro = useRef<Intro>({ t: reduced ? INTRO_SECONDS : 0, p: reduced ? 1 : 0, ended: reduced })
  const stage = useRef<Stage>({ quat: HOME_QUAT.clone(), vel: { x: 0, y: 0 }, dragging: false, lastInteract: -10 })
  const lights = useLights()
  const slots = useMemo(buildSlots, [])
  const scene = useThree((s) => s.scene)
  const key = useRef<THREE.SpotLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  const shelfLights = useRef<THREE.PointLight[]>([])

  // Replay
  useEffect(() => {
    if (props.introKey === 0 || reduced) return
    intro.current = { t: 0, p: 0, ended: false }
  }, [props.introKey, reduced])

  useLayoutEffect(() => {
    if (key.current) key.current.target.position.set(0, STAGE_Y - 0.3, 0)
  }, [])

  // Entrance director: time → progress → light levels
  useFrame((_, rawDt) => {
    // Real elapsed time (not frame count): the film stays in sync with the DOM captions on any device
    const dt = Math.min(rawDt, 1)
    const i = intro.current
    if (i.t < INTRO_SECONDS) {
      i.t = Math.min(INTRO_SECONDS, i.t + dt * (props.introPlaying ? 1 : 7)) // skip = fast-forward
      i.p = i.t / INTRO_SECONDS
    }
    if (!i.ended && i.p >= 1) {
      i.ended = true
      props.onIntroEnd()
    }
    const p = i.p
    scene.environmentIntensity = 0.12 + 0.88 * smooth(0.12, 0.55, p)
    if (ambient.current) ambient.current.intensity = 0.05 + 0.25 * smooth(0.1, 0.5, p)
    lights.rows.forEach((m, r) => (m.emissiveIntensity = 4 * smooth(0.2 + r * 0.07, 0.27 + r * 0.07, p)))
    lights.washes.forEach((m, r) => (m.opacity = 0.3 * smooth(0.2 + r * 0.07, 0.3 + r * 0.07, p)))
    shelfLights.current.forEach((l) => l && (l.intensity = 9 * smooth(0.2, 0.42, p)))
    lights.ceiling.emissiveIntensity = 2.2 * smooth(0.14, 0.3, p)
    lights.halo.emissiveIntensity = 2.6 * smooth(0.42, 0.56, p)
    lights.ember.emissiveIntensity = 2.4 * smooth(0.46, 0.62, p)
    lights.portalGlow.opacity = 0.22 * smooth(0.3, 0.6, p)
    lights.beam.opacity = 0.26 * smooth(0.55, 0.72, p)
    if (key.current) key.current.intensity = 55 * smooth(0.5, 0.64, p)
  })

  const colorOf = (p: Product) => colors[p.id] ?? p.swatches[0]?.hex ?? "#c9ccd1"

  return (
    <>
      <color attach="background" args={["#060608"]} />
      <fog attach="fog" args={["#060608", 12, 32]} />
      <CameraRig intro={intro} stage={stage} reduced={reduced} compact={compact} />

      <ambientLight ref={ambient} intensity={0.05} color="#ffe9d6" />
      <spotLight
        ref={key}
        position={[0, 4.5, 1.1]}
        angle={0.42}
        penumbra={0.9}
        decay={2}
        distance={9}
        intensity={0}
        color="#fff4e6"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />
      {UNITS.map((u, idx) => (
        <pointLight
          key={idx}
          ref={(l) => {
            if (l) shelfLights.current[idx] = l
          }}
          position={[u.position.x * 0.72, 2.2, u.position.z + 1.1]}
          color="#ffd6a8"
          intensity={0}
          distance={4.2}
          decay={2}
        />
      ))}
      <pointLight position={[0, 0.35, 0]} color="#ff7a45" intensity={2.2} distance={3} decay={2} />

      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#fff3e2" position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[7, 7, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#ffe1c2" position={[-6, 2, 0]} rotation-y={Math.PI / 2} scale={[12, 3, 1]} />
        <Lightformer form="rect" intensity={1.1} color="#ffe1c2" position={[6, 2, 0]} rotation-y={-Math.PI / 2} scale={[12, 3, 1]} />
        <Lightformer form="ring" intensity={1.6} color="#ff8a4c" position={[0, 1.5, -6]} scale={4} />
        <Lightformer form="rect" intensity={0.6} color="#ffffff" position={[0, 2, 9]} scale={[10, 4, 1]} />
      </Environment>

      <Room lights={lights} intro={intro} compact={compact} />
      {UNITS.map((u, idx) => (
        <ShelfUnit key={idx} position={u.position} rotY={u.rotY} lights={lights} />
      ))}
      <Decor slots={slots.slice(products.length)} />
      <Pedestal lights={lights} reduced={reduced} />
      <DragTarget stage={stage} rig={rig} reduced={reduced} onFirstTurn={props.onFirstTurn} />

      {products.map((p, i) => (
        <Piece
          key={p.id}
          product={p}
          slot={slots[i]}
          selected={p.id === selectedId}
          color={colorOf(p)}
          onSelect={onSelect}
          intro={intro}
          stage={stage}
          reduced={reduced}
        />
      ))}

      <ContactShadows position={[0, 0.6, 0]} scale={2.6} blur={2.6} opacity={0.55} far={1.4} resolution={256} color="#000" />
      {!reduced && <Sparkles count={compact ? 24 : 48} scale={[3.2, 2.6, 3.2]} position={[0, 1.8, 0]} size={2.2} speed={0.25} opacity={0.55} color="#f0cf96" />}
    </>
  )
}

/* =============================================================================================
 * Camera: entrance path, then a calm home view with subtle pointer parallax
 * ===========================================================================================*/

function CameraRig({ intro, stage, reduced, compact }: { intro: MutableRefObject<Intro>; stage: MutableRefObject<Stage>; reduced: boolean; compact: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const aspect = size.width / Math.max(1, size.height)

  // Wide screens frame both shelving walls; portrait screens frame the stage, shelves at the edges
  const home = useMemo(() => {
    const halfWidth = aspect >= 1.2 ? 4.6 : 1.85
    const dist = THREE.MathUtils.clamp(halfWidth / (Math.tan(THREE.MathUtils.degToRad(20)) * aspect), 6.6, 11.5)
    const lookY = aspect < 1 ? 0.62 : compact ? 1.0 : 1.18
    return { pos: new THREE.Vector3(0, 1.8 + (dist - 7) * 0.08, dist), look: new THREE.Vector3(0, lookY, 0) }
  }, [aspect, compact])

  const path = useMemo(
    () => ({
      pos: new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 5.2, 19),
        new THREE.Vector3(-1.2, 2.6, 12.6),
        new THREE.Vector3(0.3, 1.9, 8.4),
        new THREE.Vector3(2.9, 1.5, 4.3),
        new THREE.Vector3(1.4, 1.7, 5.6),
        home.pos,
      ]),
      look: new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 2.4, 0),
        new THREE.Vector3(0, 1.7, 0),
        new THREE.Vector3(0, 1.5, 0),
        new THREE.Vector3(0, 1.5, 0),
        new THREE.Vector3(0, 1.35, 0),
        home.look,
      ]),
    }),
    [home],
  )

  const pos = useMemo(() => new THREE.Vector3(), [])
  const look = useMemo(() => new THREE.Vector3(), [])
  const parallax = useMemo(() => new THREE.Vector2(), [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const e = easeInOut(clamp01(intro.current.p / 0.93))
    path.pos.getPoint(e, pos)
    path.look.getPoint(e, look)
    if (!reduced && intro.current.p >= 1 && !stage.current.dragging) {
      parallax.x = THREE.MathUtils.damp(parallax.x, state.pointer.x, 2.5, dt)
      parallax.y = THREE.MathUtils.damp(parallax.y, state.pointer.y, 2.5, dt)
    }
    pos.x += parallax.x * 0.35
    pos.y += parallax.y * 0.12
    camera.position.copy(pos)
    camera.lookAt(look)
  })
  return null
}

/* =============================================================================================
 * Architecture
 * ===========================================================================================*/

function Room({ lights, intro, compact }: { lights: Lights; intro: MutableRefObject<Intro>; compact: boolean }) {
  const doorL = useRef<THREE.Group>(null)
  const doorR = useRef<THREE.Group>(null)
  const glass = useMemo(
    () => new THREE.MeshPhysicalMaterial({ color: "#bcd3dc", metalness: 0, roughness: 0.04, transparent: true, opacity: 0.1, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }),
    [],
  )
  const wall = useMemo(() => new THREE.MeshStandardMaterial({ color: "#0d0d10", roughness: 0.6, metalness: 0.2 }), [])
  const flute = useMemo(() => new THREE.MeshStandardMaterial({ color: "#141418", roughness: 0.35, metalness: 0.5 }), [])

  useFrame(() => {
    const open = smooth(0.1, 0.36, intro.current.p)
    if (doorL.current) doorL.current.position.x = -0.86 - open * 1.72
    if (doorR.current) doorR.current.position.x = 0.86 + open * 1.72
  })

  return (
    <group>
      {/* polished stone floor */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <MeshReflectorMaterial
          blur={[320, 90]}
          resolution={compact ? 256 : 512}
          mixBlur={1}
          mixStrength={14}
          roughness={0.9}
          depthScale={1.1}
          minDepthThreshold={0.35}
          maxDepthThreshold={1.4}
          color="#0c0c0f"
          metalness={0.55}
          mirror={0}
        />
      </mesh>

      {/* back wall: fluted panels, with a glowing portal framing the stage */}
      <mesh position={[0, 2.4, -5.2]} material={wall}>
        <planeGeometry args={[14, 4.8]} />
      </mesh>
      {Array.from({ length: 34 }, (_, i) => (
        <mesh key={i} position={[-6.6 + i * 0.4, 2.3, -5.12]} material={flute}>
          <boxGeometry args={[0.2, 4.6, 0.12]} />
        </mesh>
      ))}
      <mesh position={[0, 2.05, -5.0]} material={lights.portalGlow}>
        <planeGeometry args={[7.5, 7.5]} />
      </mesh>
      <mesh position={[0, 2.05, -5.0]} material={lights.halo}>
        <torusGeometry args={[2.25, 0.022, 16, 128]} />
      </mesh>
      <mesh position={[0, 2.05, -5.02]} material={shared.gold}>
        <torusGeometry args={[2.36, 0.012, 12, 128]} />
      </mesh>

      {/* ceiling with light strips and a halo cove over the stage */}
      <mesh position={[0, 4.6, 1.5]} rotation-x={Math.PI / 2} material={wall}>
        <planeGeometry args={[14, 14]} />
      </mesh>
      {[-3.2, 3.2].map((x) => (
        <mesh key={x} position={[x, 4.56, 1.5]} material={lights.ceiling}>
          <boxGeometry args={[0.05, 0.02, 11]} />
        </mesh>
      ))}
      <mesh position={[0, 4.55, 0]} rotation-x={Math.PI / 2} material={lights.halo}>
        <torusGeometry args={[1.35, 0.02, 12, 96]} />
      </mesh>

      {/* glass side walls with champagne mullions */}
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 6.6, 0, 1.5]}>
          <mesh position={[0, 2.3, 0]} rotation-y={Math.PI / 2} material={glass}>
            <planeGeometry args={[13, 4.6]} />
          </mesh>
          {Array.from({ length: 9 }, (_, i) => (
            <mesh key={i} position={[0, 2.3, -6.5 + i * 1.62]} material={shared.gold}>
              <boxGeometry args={[0.03, 4.6, 0.03]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* façade: glass front with sliding doors the camera passes through */}
      <group position={[0, 0, 8.8]}>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 4.3, 2.3, 0]} material={glass}>
              <planeGeometry args={[4.6, 4.6]} />
            </mesh>
            <mesh position={[side * 1.95, 2.3, 0]} material={shared.gold}>
              <boxGeometry args={[0.06, 4.6, 0.06]} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 4.6, 0]} material={shared.gold}>
          <boxGeometry args={[13.2, 0.06, 0.08]} />
        </mesh>
        <mesh position={[0, 3.45, 0]} material={shared.gold}>
          <boxGeometry args={[3.9, 0.04, 0.06]} />
        </mesh>
        {[doorL, doorR].map((ref, i) => (
          <group key={i} ref={ref} position={[i === 0 ? -0.86 : 0.86, 0, 0.1]}>
            <mesh position={[0, 1.72, 0]} material={glass}>
              <planeGeometry args={[1.7, 3.4]} />
            </mesh>
            <mesh position={[0, 1.72, 0]} material={shared.gold}>
              <boxGeometry args={[0.03, 1.2, 0.05]} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  )
}

function ShelfUnit({ position, rotY, lights }: { position: THREE.Vector3; rotY: number; lights: Lights }) {
  const mats = useMemo(
    () => ({
      back: new THREE.MeshPhysicalMaterial({ color: "#111115", metalness: 0.35, roughness: 0.18, clearcoat: 1 }),
      stone: new THREE.MeshPhysicalMaterial({ color: "#17171b", metalness: 0.1, roughness: 0.3, clearcoat: 0.8 }),
      shelf: new THREE.MeshPhysicalMaterial({ color: "#d4e6ec", metalness: 0, roughness: 0.03, transparent: true, opacity: 0.26, clearcoat: 1, depthWrite: false }),
    }),
    [],
  )
  return (
    <group position={position} rotation-y={rotY}>
      <mesh position={[0, 1.62, -0.24]} material={mats.back} receiveShadow>
        <boxGeometry args={[1.72, 3.24, 0.04]} />
      </mesh>
      <mesh position={[0, 0.16, 0]} material={mats.stone} receiveShadow>
        <boxGeometry args={[1.84, 0.32, 0.54]} />
      </mesh>
      <mesh position={[0, 3.25, 0]} material={shared.gold}>
        <boxGeometry args={[1.84, 0.03, 0.54]} />
      </mesh>
      {[-0.88, 0.88].flatMap((x) =>
        [-0.22, 0.22].map((z) => (
          <mesh key={`${x}${z}`} position={[x, 1.72, z]} material={shared.gold}>
            <cylinderGeometry args={[0.012, 0.012, 3.1, 12]} />
          </mesh>
        )),
      )}
      {ROWS.map((y, r) => (
        <group key={y}>
          <mesh position={[0, y - 0.0125, 0]} material={mats.shelf}>
            <boxGeometry args={[1.74, 0.025, 0.46]} />
          </mesh>
          <mesh position={[0, y - 0.004, 0.232]} material={shared.gold}>
            <boxGeometry args={[1.74, 0.008, 0.006]} />
          </mesh>
          {/* LED under the shelf lip + the warm wash it throws on the back panel */}
          <mesh position={[0, y - 0.035, 0.2]} material={lights.rows[r]}>
            <boxGeometry args={[1.62, 0.008, 0.016]} />
          </mesh>
          <mesh position={[0, y + 0.3, -0.215]} material={lights.washes[r]}>
            <planeGeometry args={[1.62, 0.62]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Quiet objets on the shelf places no product uses. */
function Decor({ slots }: { slots: Slot[] }) {
  const stone = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#2a2724", roughness: 0.4, clearcoat: 0.6 }), [])
  return (
    <>
      {slots.map((s, i) => (
        <group key={i} position={s.position} quaternion={s.quat}>
          {i % 3 === 0 ? (
            <mesh position={[0, 0.1, 0]} material={shared.gold} castShadow>
              <sphereGeometry args={[0.1, 32, 32]} />
            </mesh>
          ) : i % 3 === 1 ? (
            <mesh position={[0, 0.16, 0]} material={stone} castShadow>
              <cylinderGeometry args={[0.07, 0.1, 0.32, 32]} />
            </mesh>
          ) : (
            <mesh position={[0, 0.09, 0]} rotation-y={0.5} material={shared.crystal}>
              <boxGeometry args={[0.18, 0.18, 0.18]} />
            </mesh>
          )}
        </group>
      ))}
    </>
  )
}

/* =============================================================================================
 * The stage: turntable + levitation beam
 * ===========================================================================================*/

function Pedestal({ lights, reduced }: { lights: Lights; reduced: boolean }) {
  const top = useRef<THREE.Group>(null)
  const mats = useMemo(
    () => ({
      stone: new THREE.MeshPhysicalMaterial({ color: "#131316", metalness: 0.2, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }),
      disc: new THREE.MeshPhysicalMaterial({ color: "#1b1b20", metalness: 0.6, roughness: 0.12, clearcoat: 1 }),
    }),
    [],
  )
  const ticks = useMemo(() => {
    const geo = new THREE.BoxGeometry(0.008, 0.004, 0.08)
    const mesh = new THREE.InstancedMesh(geo, shared.gold, 72)
    const o = new THREE.Object3D()
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2
      o.position.set(Math.sin(a) * 0.86, 0.03, Math.cos(a) * 0.86)
      o.rotation.set(0, a, 0)
      o.updateMatrix()
      mesh.setMatrixAt(i, o.matrix)
    }
    return mesh
  }, [])

  useFrame((_, dt) => {
    if (top.current && !reduced) top.current.rotation.y += Math.min(dt, 0.05) * 0.22
  })

  return (
    <group>
      {/* floor glow ring */}
      <mesh position={[0, 0.012, 0]} rotation-x={-Math.PI / 2} material={lights.ember}>
        <ringGeometry args={[1.2, 1.215, 128]} />
      </mesh>
      <mesh position={[0, 0.27, 0]} material={mats.stone} castShadow receiveShadow>
        <cylinderGeometry args={[1.02, 1.12, 0.54, 96]} />
      </mesh>
      <mesh position={[0, 0.54, 0]} rotation-x={Math.PI / 2} material={shared.gold}>
        <torusGeometry args={[1.02, 0.018, 16, 128]} />
      </mesh>
      <mesh position={[0, 0.5, 0]} rotation-x={Math.PI / 2} material={lights.ember}>
        <torusGeometry args={[1.035, 0.006, 8, 128]} />
      </mesh>
      {/* turning top */}
      <group ref={top} position={[0, 0.56, 0]}>
        <mesh material={mats.disc} receiveShadow>
          <cylinderGeometry args={[0.95, 0.95, 0.04, 96]} />
        </mesh>
        <primitive object={ticks} />
        <mesh position={[0, 0.024, 0]} rotation-x={-Math.PI / 2} material={lights.halo}>
          <ringGeometry args={[0.62, 0.628, 96]} />
        </mesh>
      </group>
      {/* levitation beam */}
      <mesh position={[0, 1.02, 0]} material={lights.beam}>
        <cylinderGeometry args={[0.36, 0.7, 0.88, 64, 1, true]} />
      </mesh>
    </group>
  )
}

/** Invisible sphere around the floating piece — a generous target for dragging it around. */
function DragTarget({ stage, rig, reduced, onFirstTurn }: { stage: MutableRefObject<Stage>; rig: StageRig; reduced: boolean; onFirstTurn: () => void }) {
  const gl = useThree((s) => s.gl)
  const last = useRef({ x: 0, y: 0, t: 0, moved: false })
  const clock = useThree((s) => s.clock)

  const turn = (yaw: number, pitch: number) => {
    const s = stage.current
    s.quat.premultiply(tmpQ.setFromAxisAngle(Y, yaw))
    s.quat.premultiply(tmpQ.setFromAxisAngle(X, pitch))
    s.quat.normalize()
  }

  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    stage.current.dragging = true
    stage.current.vel.x = stage.current.vel.y = 0
    rig.reset = false
    last.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }
    gl.domElement.style.cursor = "grabbing"
  }
  const move = (e: ThreeEvent<PointerEvent>) => {
    const s = stage.current
    if (!s.dragging) return
    const now = performance.now()
    const dx = e.clientX - last.current.x
    const dy = e.clientY - last.current.y
    const step = Math.max((now - last.current.t) / 1000, 1 / 240)
    const k = 0.009
    turn(dx * k, dy * k)
    s.vel.y = THREE.MathUtils.clamp((dx * k) / step, -14, 14)
    s.vel.x = THREE.MathUtils.clamp((dy * k) / step, -14, 14)
    s.lastInteract = clock.elapsedTime
    if (!last.current.moved && Math.hypot(dx, dy) > 2) {
      last.current.moved = true
      onFirstTurn()
    }
    last.current = { ...last.current, x: e.clientX, y: e.clientY, t: now }
  }
  const up = (e: ThreeEvent<PointerEvent>) => {
    ;(e.target as Element).releasePointerCapture?.(e.pointerId)
    stage.current.dragging = false
    // A pause before release means "hold it here", not "throw it"
    if (performance.now() - last.current.t > 80) stage.current.vel.x = stage.current.vel.y = 0
    gl.domElement.style.cursor = "grab"
  }

  // Inertia, keyboard/button impulses, reset, and the idle spin
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const s = stage.current
    if (rig.yaw || rig.pitch) {
      s.vel.y += rig.yaw * 7
      s.vel.x += rig.pitch * 7
      rig.yaw = rig.pitch = 0
      s.lastInteract = state.clock.elapsedTime
    }
    if (rig.reset) {
      s.vel.x = s.vel.y = 0
      s.quat.slerp(HOME_QUAT, 1 - Math.exp(-dt * 7))
      if (s.quat.angleTo(HOME_QUAT) < 0.002) rig.reset = false
      s.lastInteract = state.clock.elapsedTime
      return
    }
    if (s.dragging) return
    s.vel.x *= Math.exp(-dt * 3.2)
    s.vel.y *= Math.exp(-dt * 3.2)
    const idle = state.clock.elapsedTime - s.lastInteract
    const spin = rig.paused || reduced ? 0 : 0.42 * smooth(3.5, 5.5, idle)
    turn((s.vel.y + spin) * dt, s.vel.x * dt)
  })

  return (
    <mesh
      position={[0, STAGE_Y, 0]}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onPointerOver={() => (gl.domElement.style.cursor = stage.current.dragging ? "grabbing" : "grab")}
      onPointerOut={() => !stage.current.dragging && (gl.domElement.style.cursor = "auto")}
    >
      <sphereGeometry args={[0.95, 24, 24]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
    </mesh>
  )
}

/* =============================================================================================
 * A product: lives on its shelf, flies to the stage when selected
 * ===========================================================================================*/

function Piece({
  product,
  slot,
  selected,
  color,
  onSelect,
  intro,
  stage,
  reduced,
}: {
  product: Product
  slot: Slot | undefined
  selected: boolean
  color: string
  onSelect: (id: string) => void
  intro: MutableRefObject<Intro>
  stage: MutableRefObject<Stage>
  reduced: boolean
}) {
  const outer = useRef<THREE.Group>(null)
  const turn = useRef<THREE.Group>(null)
  const scaler = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)
  const [hovered, setHovered] = useState(false)
  const travel = useRef(selected ? 1 : 0)
  const hoverScale = useRef(1)
  const size = modelSize[product.art] ?? modelSize.box

  const shelfScale = Math.min(0.58 / size.h, 0.66 / size.w)
  const stageScale = Math.min(1.5 / size.h, 1.7 / size.w)
  // Products beyond the 12 shelf places wait above the room and descend from there
  const home = useMemo(() => {
    const pos = slot ? slot.position.clone() : new THREE.Vector3(0, 7, -2)
    pos.y += (size.h * shelfScale) / 2
    return { pos, quat: slot?.quat ?? new THREE.Quaternion() }
  }, [slot, size.h, shelfScale])

  const v = useMemo(() => ({ stagePos: new THREE.Vector3(), ctrl: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3(), q: new THREE.Quaternion() }), [])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const target = selected ? 1 : 0
    const speed = reduced ? 4 : 1 / 1.15
    travel.current += Math.sign(target - travel.current) * Math.min(Math.abs(target - travel.current), dt * speed)
    const e = easeInOut(travel.current)
    const p = intro.current.p

    // Stage position: gentle float; during the entrance the featured piece descends and materialises
    const bob = reduced ? 0 : Math.sin(state.clock.elapsedTime * 1.3) * 0.05
    const descend = (1 - smooth(0.52, 0.86, p)) * 2.6
    v.stagePos.set(0, STAGE_Y + bob + descend, 0)

    // Quadratic arc shelf → stage (lifted and pulled towards the viewer)
    v.ctrl.copy(home.pos).add(v.stagePos).multiplyScalar(0.5)
    v.ctrl.y += 1.1
    v.ctrl.z += 0.9
    v.a.copy(home.pos).lerp(v.ctrl, e)
    v.b.copy(v.ctrl).lerp(v.stagePos, e)
    outer.current!.position.copy(v.a.lerp(v.b, e))

    // Orientation: shelf facing → the visitor's stage orientation (plus a flourish while flying)
    v.q.copy(home.quat).slerp(stage.current.quat, e)
    if (e > 0 && e < 1) v.q.multiply(tmpQ.setFromAxisAngle(Y, Math.sin(e * Math.PI) * 1.4 * (selected ? 1 : -1)))
    turn.current!.quaternion.copy(v.q)

    hoverScale.current = THREE.MathUtils.damp(hoverScale.current, hovered && !selected ? 1.1 : 1, 10, dt)
    const materialise = selected && !reduced ? 0.35 + 0.65 * smooth(0.5, 0.8, p) : 1
    const s = THREE.MathUtils.lerp(shelfScale, stageScale, e) * hoverScale.current * materialise
    scaler.current!.scale.setScalar(s)
  })

  const tooltipY = (size.h * shelfScale) / 2 + 0.22
  return (
    <group ref={outer} position={home.pos}>
      <group
        ref={turn}
        onClick={(e) => {
          e.stopPropagation()
          if (!selected) onSelect(product.id)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          if (selected) return
          setHovered(true)
          gl.domElement.style.cursor = "pointer"
        }}
        onPointerOut={() => {
          setHovered(false)
          if (!selected) gl.domElement.style.cursor = "auto"
        }}
      >
        <group ref={scaler}>
          <group position={[0, -size.h / 2, 0]}>
            <ProductModel kind={product.art} color={color} />
          </group>
        </group>
      </group>
      {hovered && !selected && (
        <Html center position={[0, tooltipY, 0]} zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
          <div className={styles.tip}>
            <span className={styles.tipName}>{product.name}</span>
            <span className={styles.tipMeta}>{formatPrice(product.price)} · Place on the stage</span>
          </div>
        </Html>
      )}
    </group>
  )
}
