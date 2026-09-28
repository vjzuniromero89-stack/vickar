import { RoundedBox } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useLayoutEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import type { ArtKind } from "../../data/catalog"

/**
 * Procedural product models — built from the same five art kinds the catalogue already uses,
 * so every product (including ones added later in the admin) has a 3D stand-in in its colour.
 * Every model stands on y = 0 and is roughly 1 unit tall; `modelSize` describes its bounds.
 */

export const modelSize: Record<ArtKind, { h: number; w: number }> = {
  bottle: { h: 1.02, w: 0.34 },
  sport: { h: 0.96, w: 0.32 },
  sunglasses: { h: 0.36, w: 1.08 },
  watch: { h: 1.12, w: 0.46 },
  box: { h: 0.62, w: 0.62 },
}

/** Materials whose colour follows the selected swatch, easing between colours. */
function useSwatchMaterial(hex: string, make: () => THREE.MeshPhysicalMaterial) {
  const material = useMemo(make, []) // eslint-disable-line react-hooks/exhaustive-deps
  const target = useMemo(() => new THREE.Color(), [])
  useLayoutEffect(() => {
    target.set(hex)
    if (material.userData.ready !== true) {
      material.color.copy(target)
      material.userData.ready = true
    }
  }, [hex, material, target])
  useFrame((_, dt) => {
    material.color.lerp(target, Math.min(1, dt * 6))
  })
  useLayoutEffect(() => () => material.dispose(), [material])
  return material
}

/** Metals and glass shared by every model (created once for the page). */
export const shared = {
  steel: new THREE.MeshPhysicalMaterial({ color: "#c9ccd1", metalness: 1, roughness: 0.22, clearcoat: 0.4 }),
  darkSteel: new THREE.MeshPhysicalMaterial({ color: "#2a2d33", metalness: 0.9, roughness: 0.35 }),
  gold: new THREE.MeshPhysicalMaterial({ color: "#d9b77e", metalness: 1, roughness: 0.25, clearcoat: 0.6 }),
  crystal: new THREE.MeshPhysicalMaterial({
    color: "#dfe7ee",
    metalness: 0,
    roughness: 0.02,
    transparent: true,
    opacity: 0.18,
    clearcoat: 1,
    depthWrite: false,
  }),
  lens: new THREE.MeshPhysicalMaterial({
    color: "#231a14",
    metalness: 0.2,
    roughness: 0.04,
    transparent: true,
    opacity: 0.82,
    clearcoat: 1,
    iridescence: 0.6,
  }),
  dial: new THREE.MeshPhysicalMaterial({ color: "#0f1013", metalness: 0.3, roughness: 0.35, clearcoat: 1 }),
  lume: new THREE.MeshStandardMaterial({ color: "#f1ead8", emissive: "#f1ead8", emissiveIntensity: 0.25, roughness: 0.4 }),
}

const lathe = (profile: [number, number][], segments = 64) =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  )

function Bottle({ color }: { color: string }) {
  const paint = useSwatchMaterial(color, () => new THREE.MeshPhysicalMaterial({ metalness: 0.45, roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.2 }))
  const body = useMemo(
    () =>
      lathe([
        [0, 0],
        [0.13, 0.002],
        [0.158, 0.02],
        [0.165, 0.06],
        [0.165, 0.66],
        [0.155, 0.72],
        [0.118, 0.8],
        [0.094, 0.84],
        [0.094, 0.86],
      ]),
    [],
  )
  const band = useMemo(() => lathe([[0.166, 0.6], [0.168, 0.6], [0.168, 0.64], [0.166, 0.64]]), [])
  useLayoutEffect(() => () => [body, band].forEach((g) => g.dispose()), [body, band])
  return (
    <group>
      <mesh geometry={body} material={paint} castShadow />
      <mesh geometry={band} material={shared.steel} />
      <mesh position={[0, 0.9, 0]} material={shared.darkSteel} castShadow>
        <cylinderGeometry args={[0.1, 0.1, 0.1, 48]} />
      </mesh>
      <mesh position={[0, 0.955, 0]} material={shared.darkSteel}>
        <cylinderGeometry args={[0.088, 0.1, 0.012, 48]} />
      </mesh>
      {/* carry loop */}
      <mesh position={[0, 0.96, 0]} rotation={[0, Math.PI / 2, 0]} material={shared.darkSteel}>
        <torusGeometry args={[0.055, 0.013, 16, 48, Math.PI]} />
      </mesh>
    </group>
  )
}

function Sport({ color }: { color: string }) {
  const shell = useSwatchMaterial(color, () => new THREE.MeshPhysicalMaterial({ metalness: 0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.4 }))
  const body = useMemo(
    () =>
      lathe([
        [0, 0],
        [0.13, 0.004],
        [0.148, 0.03],
        [0.15, 0.2],
        [0.122, 0.33],
        [0.122, 0.4],
        [0.15, 0.52],
        [0.15, 0.66],
        [0.12, 0.74],
        [0.1, 0.76],
      ]),
    [],
  )
  useLayoutEffect(() => () => body.dispose(), [body])
  return (
    <group>
      <mesh geometry={body} material={shell} castShadow />
      {[0.34, 0.37, 0.4].map((y) => (
        <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]} material={shared.darkSteel}>
          <torusGeometry args={[0.125, 0.006, 8, 64]} />
        </mesh>
      ))}
      <mesh position={[0, 0.8, 0]} material={shared.darkSteel} castShadow>
        <cylinderGeometry args={[0.102, 0.104, 0.08, 48]} />
      </mesh>
      <mesh position={[0, 0.87, 0]} material={shared.darkSteel}>
        <cylinderGeometry args={[0.045, 0.07, 0.07, 32]} />
      </mesh>
      <mesh position={[0, 0.925, 0]} material={shell}>
        <cylinderGeometry args={[0.022, 0.03, 0.05, 24]} />
      </mesh>
    </group>
  )
}

function Sunglasses({ color }: { color: string }) {
  const acetate = useSwatchMaterial(color, () => new THREE.MeshPhysicalMaterial({ metalness: 0.05, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05 }))
  const rim = useMemo(() => {
    const outer = new THREE.Shape()
    outer.absarc(0, 0, 0.19, 0, Math.PI * 2, false)
    const hole = new THREE.Path()
    hole.absarc(0, 0, 0.158, 0, Math.PI * 2, true)
    outer.holes.push(hole)
    return new THREE.ExtrudeGeometry(outer, { depth: 0.035, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 48 })
  }, [])
  const lens = useMemo(() => new THREE.CircleGeometry(0.162, 48), [])
  useLayoutEffect(() => () => [rim, lens].forEach((g) => g.dispose()), [rim, lens])

  const y = 0.18
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.245, y, 0]}>
          <mesh geometry={rim} material={acetate} castShadow />
          <mesh geometry={lens} material={shared.lens} position={[0, 0, 0.02]} />
          {/* hinge + temple arm */}
          <mesh position={[side * 0.2, 0.05, -0.02]} material={shared.gold}>
            <boxGeometry args={[0.04, 0.03, 0.05]} />
          </mesh>
          <mesh position={[side * 0.215, 0.04, -0.3]} rotation={[0.06, side * -0.06, 0]} material={acetate} castShadow>
            <boxGeometry args={[0.022, 0.035, 0.56]} />
          </mesh>
        </group>
      ))}
      {/* bridge */}
      <mesh position={[0, y + 0.06, 0.015]} rotation={[0, 0, 0]} material={shared.gold}>
        <torusGeometry args={[0.06, 0.012, 12, 32, Math.PI]} />
      </mesh>
    </group>
  )
}

function Watch({ color }: { color: string }) {
  const strap = useSwatchMaterial(color, () => new THREE.MeshPhysicalMaterial({ metalness: 0.2, roughness: 0.55, sheen: 0.6, sheenRoughness: 0.5 }))
  const hour = useRef<THREE.Group>(null)
  const minute = useRef<THREE.Group>(null)
  const second = useRef<THREE.Group>(null)

  // Real time on the dial
  useFrame(() => {
    const d = new Date()
    const s = d.getSeconds() + d.getMilliseconds() / 1000
    const m = d.getMinutes() + s / 60
    const h = (d.getHours() % 12) + m / 60
    if (hour.current) hour.current.rotation.z = -(h / 12) * Math.PI * 2
    if (minute.current) minute.current.rotation.z = -(m / 60) * Math.PI * 2
    if (second.current) second.current.rotation.z = -(s / 60) * Math.PI * 2
  })

  const c = 0.56 // case centre height
  return (
    <group>
      {/* strap: gently curved segments above and below the case */}
      {[1, -1].map((dir) =>
        [0, 1, 2, 3].map((i) => (
          <mesh
            key={`${dir}-${i}`}
            position={[0, c + dir * (0.25 + i * 0.075), -i * i * 0.012]}
            rotation={[dir * i * 0.12, 0, 0]}
            material={strap}
            castShadow
          >
            <boxGeometry args={[0.2, 0.08, 0.03]} />
          </mesh>
        )),
      )}
      <group position={[0, c, 0]}>
        {/* case, bezel, crystal */}
        <mesh rotation={[Math.PI / 2, 0, 0]} material={shared.steel} castShadow>
          <cylinderGeometry args={[0.215, 0.215, 0.085, 64]} />
        </mesh>
        <mesh position={[0, 0, 0.043]} material={shared.steel}>
          <torusGeometry args={[0.2, 0.018, 16, 64]} />
        </mesh>
        <mesh position={[0, 0, 0.044]} material={shared.dial}>
          <circleGeometry args={[0.19, 64]} />
        </mesh>
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2
          const r = 0.155
          return (
            <mesh key={i} position={[Math.sin(a) * r, Math.cos(a) * r, 0.047]} rotation={[0, 0, -a]} material={i % 3 === 0 ? shared.gold : shared.lume}>
              <boxGeometry args={[i % 3 === 0 ? 0.014 : 0.008, i % 3 === 0 ? 0.04 : 0.026, 0.004]} />
            </mesh>
          )
        })}
        {/* hands pivot at the centre: each group turns, the bar inside is offset by half its length */}
        <group ref={hour} position={[0, 0, 0.05]}>
          <mesh position={[0, 0.05, 0]} material={shared.lume}>
            <boxGeometry args={[0.014, 0.1, 0.004]} />
          </mesh>
        </group>
        <group ref={minute} position={[0, 0, 0.054]}>
          <mesh position={[0, 0.075, 0]} material={shared.lume}>
            <boxGeometry args={[0.009, 0.15, 0.004]} />
          </mesh>
        </group>
        <group ref={second} position={[0, 0, 0.058]}>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[0.004, 0.17, 0.003]} />
            <meshStandardMaterial color="#ff7a45" emissive="#ff7a45" emissiveIntensity={0.6} />
          </mesh>
        </group>
        <mesh position={[0, 0, 0.06]} material={shared.gold}>
          <cylinderGeometry args={[0.012, 0.012, 0.01, 16]} />
        </mesh>
        <mesh position={[0, 0, 0.062]} material={shared.crystal}>
          <circleGeometry args={[0.2, 64]} />
        </mesh>
        {/* crown */}
        <mesh position={[0.235, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={shared.steel}>
          <cylinderGeometry args={[0.022, 0.022, 0.04, 20]} />
        </mesh>
      </group>
    </group>
  )
}

function Box({ color }: { color: string }) {
  const paper = useSwatchMaterial(color, () => new THREE.MeshPhysicalMaterial({ metalness: 0, roughness: 0.55, sheen: 0.5 }))
  return (
    <group>
      <RoundedBox args={[0.6, 0.6, 0.6]} radius={0.03} smoothness={4} position={[0, 0.3, 0]} material={paper} castShadow />
      <mesh position={[0, 0.3, 0]} material={shared.gold}>
        <boxGeometry args={[0.07, 0.605, 0.605]} />
      </mesh>
      <mesh position={[0, 0.3, 0]} material={shared.gold}>
        <boxGeometry args={[0.605, 0.605, 0.07]} />
      </mesh>
    </group>
  )
}

export function ProductModel({ kind, color }: { kind: ArtKind; color: string }) {
  switch (kind) {
    case "bottle":
      return <Bottle color={color} />
    case "sport":
      return <Sport color={color} />
    case "sunglasses":
      return <Sunglasses color={color} />
    case "watch":
      return <Watch color={color} />
    default:
      return <Box color={color} />
  }
}
