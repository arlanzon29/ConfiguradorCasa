import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry,
  Color,
  Float32BufferAttribute,
  PerspectiveCamera,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import { DEFAULT_WALL_COLOR, floorFinish, interiorColor } from '../model/finishes'
import { PLOT, PlacedModule, WALL_HEIGHT } from '../model/house'
import { OPPOSITE, Opening } from '../model/openings'
import { Joints, deriveWalls, openingsOf, wallAcross } from '../model/walls'
import { Shot, usePhotos } from '../photos'
import { LENSES, cameraFlying, samePose, stopCameraFlight, useHouse } from '../store'
import Furniture3D from './Furniture3D'
import PhotoTracer, { PHOTO_SAMPLES } from './PhotoTracer'

// Grosor de la losa, en metros.
const SLAB = 0.2
// Techo y panel de luz provisionales de la foto en calidad: grosor y lado, en metros.
const CEILING = 0.1
const CEILING_LIGHT = 0.6
const GLASS_THICKNESS = 0.03
// La fachada aún no es configurable (dependerá del aislante y del revestimiento).
const FACADE_COLOR = DEFAULT_WALL_COLOR

interface WallPart {
  position: [number, number, number]
  size: [number, number, number]
  glass: boolean
  /** Color de cada cara de la caja, en el orden de BoxGeometry: +x, -x, +y, -y, +z, -z. */
  faces: string[]
}

/**
 * Cajas que forman las paredes de la casa, en coordenadas del plano (x, y → x, z):
 * cada pared se trocea alrededor de sus huecos (tramos macizos, dintel y
 * antepecho), y las ventanas llevan además un cristal.
 *
 * Cada cara larga toma el color de lo que tiene delante: la estancia a la que
 * da, o la fachada si da al exterior.
 */
function wallParts(
  modules: PlacedModule[],
  joints: Joints,
  openings: Opening[],
  facadeColor: string,
) {
  const walls = deriveWalls(modules, joints)
  const room = (id?: string) => modules.find((m) => m.id === id)
  const parts: WallPart[] = []
  for (const wall of walls) {
    if (wall.open) continue
    const [acrossMin, acrossMax] = wallAcross(wall)
    const axis = (acrossMin + acrossMax) / 2

    // Caras largas: `low` mira al norte u oeste, `high` al sur o este.
    // En una compartida, la otra estancia la ve por su lado opuesto.
    const own = interiorColor(room(wall.moduleId), wall.side)
    const [low, high] = wall.shared
      ? [own, interiorColor(room(wall.otherId), OPPOSITE[wall.side])]
      : wall.side === 'n' || wall.side === 'w'
        ? [facadeColor, own]
        : [own, facadeColor]

    const add = (from: number, to: number, bottom: number, top: number, glass = false) => {
      if (to - from < 1e-3 || top - bottom < 1e-3) return
      const along = to - from
      const mid = (from + to) / 2
      const across = glass ? GLASS_THICKNESS : wall.thickness
      const y = SLAB + (bottom + top) / 2
      // Los extremos reales de la pared asoman a la fachada en las esquinas; los
      // cantos que dan a un hueco, el canto superior y el inferior quedan neutros.
      const endLow = from === wall.from ? facadeColor : DEFAULT_WALL_COLOR
      const endHigh = to === wall.to ? facadeColor : DEFAULT_WALL_COLOR
      const neutral = DEFAULT_WALL_COLOR
      parts.push(
        wall.horizontal
          ? {
              position: [mid, y, axis],
              size: [along, top - bottom, across],
              glass,
              faces: [endHigh, endLow, neutral, neutral, high, low],
            }
          : {
              position: [axis, y, mid],
              size: [across, top - bottom, along],
              glass,
              faces: [high, low, neutral, neutral, endHigh, endLow],
            },
      )
    }

    let cursor = wall.from
    for (const { opening: o, from, to } of openingsOf(wall, modules, walls, openings)) {
      add(cursor, from, 0, WALL_HEIGHT)
      add(from, to, 0, o.sill)
      add(from, to, o.sill + o.height, WALL_HEIGHT)
      if (o.kind === 'window') add(from, to, o.sill, o.sill + o.height, true)
      cursor = to
    }
    add(cursor, wall.to, 0, WALL_HEIGHT)
  }
  return parts
}

// Velocidad de desplazamiento con WASD, en m/s: volando y a pie.
const MOVE_SPEED = 10
const WALK_SPEED = 4
// Altura de los ojos a pie: 1,6 m sobre la losa.
const EYE_HEIGHT = SLAB + 1.6
const MIN_CAMERA_HEIGHT = 0.5
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD']

// Radianes de giro por píxel arrastrado.
const LOOK_SPEED = 0.004
const MAX_PITCH = Math.PI / 2 - 0.05
// Metros que avanza la cámara por cada paso de rueda.
const WHEEL_STEP = 1.5

/**
 * Cámara en primera persona: arrastrar con el ratón solo gira la vista sin
 * mover la cámara; WASD (y la rueda) la desplazan hacia donde mira.
 */
function FirstPersonControls() {
  const camera = useThree((s) => s.camera)
  const dom = useThree((s) => s.gl.domElement)
  const pressed = useRef(new Set<string>())
  // A pie: la cámara queda a la altura de los ojos y solo se desplaza en horizontal.
  const walk = useHouse((s) => s.walkMode)
  const walkRef = useRef(walk)
  walkRef.current = walk
  const wasWalking = useRef(walk)

  /** Dirección de avance: la de la mirada, aplanada sobre el suelo si se va a pie. */
  const forwardVector = () => {
    const forward = camera.getWorldDirection(new Vector3())
    return walkRef.current ? forward.setY(0).normalize() : forward
  }

  useEffect(() => {
    // Con orden YXZ, rotation.y es el giro horizontal y rotation.x la inclinación.
    camera.rotation.order = 'YXZ'
    // Se retoma la cámara donde se dejó; el plano 2D la dibuja a partir de esta misma pose.
    const saved = useHouse.getState().cameraPose
    if (saved) {
      camera.position.set(...saved.position)
      camera.rotation.set(saved.pitch, saved.yaw, 0)
    } else {
      camera.lookAt(0, 1, 0)
    }
    const save = () => {
      // Mientras la cámara vuela hacia una foto manda el vuelo: guardar aquí lo cortaría.
      if (cameraFlying()) return
      useHouse.getState().setCameraPose({
        position: camera.position.toArray() as [number, number, number],
        yaw: camera.rotation.y,
        pitch: camera.rotation.x,
      })
    }
    save()

    // La cámara también puede cambiar desde fuera: al arrastrarla en el plano 2D,
    // quizá en otra ventana. Solo se sigue si la pose guardada cambia de valor.
    const unsubscribe = useHouse.subscribe((state, prev) => {
      const pose = state.cameraPose
      if (!pose || samePose(pose, prev.cameraPose)) return
      camera.position.set(...pose.position)
      camera.rotation.set(pose.pitch, pose.yaw, 0)
    })

    let dragging = false
    const pointerDown = (e: PointerEvent) => {
      stopCameraFlight()
      dragging = true
      dom.setPointerCapture(e.pointerId)
    }
    const pointerMove = (e: PointerEvent) => {
      if (!dragging) return
      camera.rotation.y -= e.movementX * LOOK_SPEED
      camera.rotation.x = Math.min(
        Math.max(camera.rotation.x - e.movementY * LOOK_SPEED, -MAX_PITCH),
        MAX_PITCH,
      )
    }
    const pointerUp = () => {
      dragging = false
      save()
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      stopCameraFlight()
      camera.position.addScaledVector(forwardVector(), -Math.sign(e.deltaY) * WHEEL_STEP)
      camera.position.y = Math.max(camera.position.y, MIN_CAMERA_HEIGHT)
      save()
    }
    // Soltar una tecla de movimiento también cuenta como "la cámara ha cambiado".
    window.addEventListener('keyup', save)
    dom.addEventListener('pointerdown', pointerDown)
    dom.addEventListener('pointermove', pointerMove)
    dom.addEventListener('pointerup', pointerUp)
    dom.addEventListener('pointercancel', pointerUp)
    dom.addEventListener('wheel', wheel, { passive: false })
    return () => {
      unsubscribe()
      save()
      window.removeEventListener('keyup', save)
      dom.removeEventListener('pointerdown', pointerDown)
      dom.removeEventListener('pointermove', pointerMove)
      dom.removeEventListener('pointerup', pointerUp)
      dom.removeEventListener('pointercancel', pointerUp)
      dom.removeEventListener('wheel', wheel)
    }
  }, [camera, dom])

  // El objetivo elegido (campo de visión) se aplica a la cámara al cambiar.
  const fov = useHouse((s) => s.cameraFov)
  useEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    camera.fov = fov
    camera.updateProjectionMatrix()
  }, [fov, camera])

  // Al pasar a pie se baja la cámara a la altura de los ojos y se nivela la mirada.
  // Solo al cambiar de modo: al reabrir la vista ya a pie se respeta la pose guardada.
  useEffect(() => {
    if (walk && !wasWalking.current) {
      camera.position.y = EYE_HEIGHT
      camera.rotation.x = 0
      useHouse.getState().setCameraPose({
        position: camera.position.toArray() as [number, number, number],
        yaw: camera.rotation.y,
        pitch: 0,
      })
    }
    wasWalking.current = walk
  }, [walk, camera])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (!MOVE_KEYS.includes(e.code)) return
      stopCameraFlight()
      pressed.current.add(e.code)
    }
    const up = (e: KeyboardEvent) => pressed.current.delete(e.code)
    const clear = () => pressed.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useFrame((_, delta) => {
    const keys = pressed.current
    if (keys.size === 0) return
    // W/S siguen la dirección de la cámara (con su inclinación si se vuela); A/D, su lateral.
    const forward = forwardVector()
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
    const move = new Vector3()
      .addScaledVector(forward, Number(keys.has('KeyW')) - Number(keys.has('KeyS')))
      .addScaledVector(right, Number(keys.has('KeyD')) - Number(keys.has('KeyA')))
    if (move.lengthSq() === 0) return
    move.normalize().multiplyScalar((walkRef.current ? WALK_SPEED : MOVE_SPEED) * delta)
    // Sin atravesar el suelo: al llegar abajo se sigue avanzando en horizontal.
    if (camera.position.y + move.y < MIN_CAMERA_HEIGHT) move.y = MIN_CAMERA_HEIGHT - camera.position.y
    camera.position.add(move)
  })

  return null
}

/**
 * Caja de pared maciza con un color por cara. Los colores van en los vértices y
 * no en seis materiales: el trazador de la foto no admite mallas multimaterial.
 */
function WallBox({ part }: { part: WallPart }) {
  const [w, h, d] = part.size
  const faces = part.faces.join()
  const geometry = useMemo(() => {
    const box = new BoxGeometry(w, h, d)
    // BoxGeometry tiene cuatro vértices por cara, en el mismo orden que `faces`.
    // Con cuatro componentes (RGBA), que es lo que el trazador da por hecho al mezclar mallas.
    const colors = faces.split(',').flatMap((face) => {
      const rgba = [...new Color(face).toArray(), 1]
      return [...rgba, ...rgba, ...rgba, ...rgba]
    })
    box.setAttribute('color', new Float32BufferAttribute(colors, 4))
    return box
  }, [w, h, d, faces])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    // Las paredes no proyectan sombra: oscurecían demasiado el interior.
    <mesh position={part.position} geometry={geometry} receiveShadow>
      <meshStandardMaterial vertexColors />
    </mesh>
  )
}

/** Acabado del suelo de una estancia: una lámina sobre la losa, con la textura a escala real. */
function Floor({ room }: { room: PlacedModule }) {
  const finish = floorFinish(room.floor)
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={SLAB + 0.003} receiveShadow>
      <planeGeometry args={[room.width, room.depth]} />
      {finish.texture ? (
        <FloorTexture room={room} url={finish.texture} size={finish.size ?? [1, 1]} />
      ) : (
        <meshStandardMaterial color={finish.color} />
      )}
    </mesh>
  )
}

interface FloorTextureProps {
  room: PlacedModule
  url: string
  size: [number, number]
}

function FloorTexture({ room, url, size }: FloorTextureProps) {
  const image = useLoader(TextureLoader, url)
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  // Cada estancia necesita su propia copia: la repetición depende de su tamaño.
  const texture = useMemo(() => {
    const t = image.clone()
    t.wrapS = t.wrapT = RepeatWrapping
    t.colorSpace = SRGBColorSpace
    // Sin esto el suelo se emborrona al mirarlo en rasante, que es lo normal a pie.
    t.anisotropy = maxAnisotropy
    const [sx, sy] = room.floorTurned ? [size[1], size[0]] : size
    t.repeat.set(room.width / sx, room.depth / sy)
    t.rotation = room.floorTurned ? Math.PI / 2 : 0
    t.needsUpdate = true
    return t
  }, [image, maxAnisotropy, room.width, room.depth, room.floorTurned, size])
  useEffect(() => () => texture.dispose(), [texture])

  return <meshStandardMaterial map={texture} roughness={0.8} />
}

export default function View3D() {
  const modules = useHouse((s) => s.modules)
  const selectedId = useHouse((s) => s.selectedId)
  const openings = useHouse((s) => s.openings)
  const joints = useHouse((s) => s.joints)
  const furniture = useHouse((s) => s.furniture)
  const selectedFurnitureId = useHouse((s) => s.selectedFurnitureId)
  const parts = useMemo(
    () => wallParts(modules, joints, openings, FACADE_COLOR),
    [modules, joints, openings],
  )

  // Foto en calidad: trazado de rayos sobre esta misma escena, con un
  // techo y una luz de techo por estancia que solo existen mientras dura la foto.
  const cameraFov = useHouse((s) => s.cameraFov)
  const setCameraFov = useHouse((s) => s.setCameraFov)
  const [photo, setPhoto] = useState(false)
  const [samples, setSamples] = useState(0)
  // Hasta la primera muestra no se ve avance (la primera vez tarda bastante): se avisa.
  const [waiting, setWaiting] = useState(false)
  const saveRequest = useRef(false)
  // Aviso breve de que la foto ya está en Fotos, al volver a la vista normal.
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 4000)
    return () => clearTimeout(timer)
  }, [saved])
  const addPhoto = usePhotos((s) => s.add)
  const onProgress = (done: number) => {
    setSamples(done)
    if (done > 0) setWaiting(false)
  }
  // Guardada la foto se vuelve a la vista normal: el trazado no tiene por qué seguir.
  const onSave = async (image: Blob, shot: Shot) => {
    await addPhoto(image, shot)
    setPhoto(false)
    setSaved(true)
  }

  return (
    <div className="view3d-wrap">
      <div className="photo-bar">
        {photo ? (
          <>
            <span>
              {waiting
                ? 'Preparando la foto…'
                : samples < PHOTO_SAMPLES
                ? `Foto: ${samples} / ${PHOTO_SAMPLES} muestras`
                : 'Foto terminada'}
            </span>
            <button disabled={waiting} onClick={() => (saveRequest.current = true)}>
              Guardar foto
            </button>
            <button onClick={() => setPhoto(false)}>Volver</button>
          </>
        ) : (
          <button
            onClick={() => {
              setSamples(0)
              setSaved(false)
              setWaiting(true)
              setPhoto(true)
            }}
          >
            Foto en calidad
          </button>
        )}
        {saved && <span>Foto guardada en Fotos</span>}
        <div className="lens-toggle" title="Objetivo: cuánto abarca la cámara">
          {LENSES.map((lens) => (
            <button
              key={lens.fov}
              className={cameraFov === lens.fov ? 'active' : ''}
              onClick={() => setCameraFov(lens.fov)}
            >
              {lens.name}
            </button>
          ))}
        </div>
      </div>
      {photo && waiting && (
        <div className="photo-wait">
          <strong>Generando la foto…</strong>
          <span>La primera vez puede tardar alrededor de un minuto.</span>
        </div>
      )}
    <Canvas shadows camera={{ position: [20, 22, 34], fov: 45 }}>
      <color attach="background" args={['#e6edf1']} />
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[14, 26, 10]}
        intensity={1.8}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
      />

      {/* El plano (x, y) pasa a ser el suelo (x, z), con la parcela centrada en el origen. */}
      <group position={[-PLOT.width / 2, 0, -PLOT.depth / 2]}>
        <mesh
          rotation-x={-Math.PI / 2}
          position={[PLOT.width / 2, 0, PLOT.depth / 2]}
          receiveShadow
        >
          <planeGeometry args={[PLOT.width, PLOT.depth]} />
          <meshStandardMaterial color="#b7c7a3" />
        </mesh>

        {modules.map((m) => (
          <group key={m.id} position={[m.x + m.width / 2, 0, m.y + m.depth / 2]}>
            <mesh position-y={SLAB / 2} castShadow receiveShadow>
              <boxGeometry args={[m.width, SLAB, m.depth]} />
              <meshStandardMaterial
                color={m.id === selectedId && !photo ? '#b9cdb4' : '#c9b79a'}
              />
            </mesh>
            {photo && (
              <>
                <mesh position-y={SLAB + WALL_HEIGHT + CEILING / 2}>
                  <boxGeometry args={[m.width, CEILING, m.depth]} />
                  <meshStandardMaterial color="#ffffff" />
                </mesh>
                {/* Panel de luz mirando hacia abajo, pegado al techo. */}
                <rectAreaLight
                  position-y={SLAB + WALL_HEIGHT - 0.02}
                  rotation-x={-Math.PI / 2}
                  width={CEILING_LIGHT}
                  height={CEILING_LIGHT}
                  intensity={30}
                />
              </>
            )}
            {m.floor && m.floor !== 'base' && (
              <Suspense fallback={null}>
                <Floor room={m} />
              </Suspense>
            )}
          </group>
        ))}

        {furniture.map((item) => (
          <Furniture3D
            key={item.id}
            item={item}
            floorY={SLAB}
            selected={item.id === selectedFurnitureId && !photo}
          />
        ))}

        {/* Sin techo. Las paredes son de la casa, no de cada estancia. */}
        {parts.map((part, i) =>
          part.glass ? (
            <mesh key={i} position={part.position}>
              <boxGeometry args={part.size} />
              <meshStandardMaterial color="#9fc6dd" transparent opacity={0.35} />
            </mesh>
          ) : (
            <WallBox key={i} part={part} />
          ),
        )}
      </group>

      <FirstPersonControls />
      {photo && (
        <PhotoTracer
          revision={[modules, parts, furniture]}
          onProgress={onProgress}
          saveRequest={saveRequest}
          onSave={(image, shot) => void onSave(image, shot)}
        />
      )}
    </Canvas>
    </div>
  )
}
