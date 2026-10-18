import { Canvas, ThreeEvent, useFrame, useLoader, useThree } from '@react-three/fiber'
import {
  DefaultXRController,
  XR,
  XROrigin,
  createXRStore,
  useXR,
} from '@react-three/xr'
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  EdgesGeometry,
  ExtrudeGeometry,
  Shape,
  Vector2,
  Float32BufferAttribute,
  MathUtils,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import {
  DEFAULT_JOINERY_FINISH,
  DEFAULT_WALL_COLOR,
  Finish,
  BASE_FLOOR,
  DEFAULT_CEILING,
  DEFAULT_GROUND,
  SLAB_COLOR,
  FloorFinish,
  floorOf,
  interiorFinish,
  interiorColor,
  resolveFinish,
} from '../model/finishes'
import {
  DEFAULT_SLAB_HEIGHT,
  PLOT,
  PlacedModule,
  SIDES,
  Shell,
  Side,
  WALL_HEIGHT,
  levelAt,
  roomLevel,
  slabOf,
  slabRect,
} from '../model/house'
import { BOARD_FALLBACK_COLOR } from '../model/boards'
import { LIGHT_SIZE, lightColor } from '../model/lights'
import { MIRROR_THICKNESS } from '../model/mirrors'
import { GABLE_THICKNESS, ProfilePoint, roofLayout } from '../model/roofs'
import {
  MECHANISM_MODULE,
  MECHANISM_THICKNESS,
  mechanismSize,
  mechanismType,
} from '../model/mechanisms'
import { VINYLS, VinylSheet, vinylPlacement, vinylSheets, vinylType } from '../model/vinyls'
import { OPPOSITE, Opening } from '../model/openings'
import { Joints, Wall, deriveWalls, openingsOf, wallAcross } from '../model/walls'
import { Shot, usePhotos } from '../photos'
import { REMOTE_URL, reloadRemote } from '../remoteHouse'
import { GLB_EVENT, GlbRequest, LENSES, PHOTO_EVENT, PHOTO_SAMPLES, cameraFlying, samePose, stopCameraFlight, useHouse } from '../store'
import Furniture3D from './Furniture3D'
import { DoorLeafAxis, JoineryMaterial, JoineryPart, joineryParts } from './joinery'
import { TeleportPoint, teleportPoints } from './teleport'
import { fileSlug, houseName } from '../model/names'
import PhotoTracer from './PhotoTracer'

/**
 * Altura del suelo de una estancia sobre el terreno: el grosor de la solera de
 * su módulo (house.ts). Sin estancia (o sin módulos, en los planos antiguos), la
 * de por defecto.
 */
type Level = (roomId?: string) => number

const levelFn = (modules: PlacedModule[], shells: Shell[]): Level => (roomId) =>
  roomLevel(shells, modules.find((m) => m.id === roomId))

/** La función de altura del suelo, al día con la casa. */
function useLevel(): Level {
  const modules = useHouse((s) => s.modules)
  const shells = useHouse((s) => s.shells)
  return useMemo(() => levelFn(modules, shells), [modules, shells])
}

/** Altura del suelo de la casa bajo un punto del mundo 3D (la parcela va centrada en el origen). */
const floorUnder = (x: number, z: number) =>
  levelAt(useHouse.getState().shells, x + PLOT.width / 2, z + PLOT.depth / 2)

// Grosor, en metros, del techo de la foto en calidad.
const CEILING = 0.1
// Lo que alumbra un foco al 100 %: lo mismo que el panel de luz provisional que
// hubo antes de los focos, para que la estancia con el suyo se vea igual. Inventado.
const LIGHT_INTENSITY = 750
// Lo que sobresale el rodapié de la pared, en metros.
const SKIRTING_DEPTH = 0.012
// La fachada aún no es configurable (dependerá del aislante y del revestimiento).
const FACADE_COLOR = DEFAULT_WALL_COLOR

// Piezas de carpintería que no llevan el acabado del hueco.
const JOINERY_MATERIALS: Record<Exclude<JoineryMaterial, 'wood'>, object> = {
  glass: { color: '#9fc6dd', transparent: true, opacity: 0.35 },
  // A medias: sin entorno que reflejar, el metal sale negro (Blender lo sube a 1).
  metal: { color: '#a3a7ab', roughness: 0.35, metalness: 0.5 },
}

interface WallPart {
  position: [number, number, number]
  size: [number, number, number]
  /**
   * Color de cada cara de la caja, en el orden de BoxGeometry: +x, -x, +y, -y, +z, -z.
   * Un par es una junta con otro trozo de la misma pared: cada mitad de la cara
   * lleva el color de la cara larga de su lado, [norte u oeste, sur o este].
   */
  faces: (string | [string, string])[]
  /** Caras con material: una lámina con textura encima de la caja. */
  skins: WallSkin[]
}

/** Lámina con textura pegada a una cara de pared que da a una estancia con material. */
interface WallSkin {
  position: [number, number, number]
  /** Giro alrededor del eje vertical, para que la lámina mire hacia fuera de la caja. */
  turn: number
  size: [number, number]
  url: string
  /** Metros reales que cubre la imagen. */
  scale: [number, number]
  /** Metros desde el origen de la textura, para que siga sin saltos de una caja a la siguiente. */
  start: [number, number]
}

// Lo que se solapan dintel y antepecho con los tramos de pared de al lado.
const JOINT_OVERLAP = 0.002
// Y lo que se meten por cada cara: si sus caras quedaran en el mismo plano que
// las de los tramos, en el solape habría dos caras iguales y Blender (y el
// trazador) pintaría una raya vertical de arriba abajo de la pared.
const JOINT_RECESS = 0.0005

// Separación de la lámina de material a su pared, como la de los vinilos en la foto.
const SKIN_GAP = 0.0005

/**
 * Cajas que forman las paredes de la casa, en coordenadas del plano (x, y → x, z):
 * cada pared se trocea alrededor de sus huecos (tramos macizos, dintel y
 * antepecho). La carpintería de los huecos va aparte (`joineryParts`).
 *
 * Cada cara larga toma el color de lo que tiene delante: la estancia a la que
 * da, o la fachada si da al exterior.
 */
function wallParts(
  modules: PlacedModule[],
  joints: Joints,
  openings: Opening[],
  facadeColor: string,
  level: Level,
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
    // Y su material, si lo tienen: solo las que dan a una estancia.
    const material = (id: string | undefined, side: Side) => {
      const finish = resolveFinish(interiorFinish(room(id), side), DEFAULT_WALL_COLOR)
      return finish.texture ? finish : undefined
    }
    const ownSkin = material(wall.moduleId, wall.side)
    const [lowSkin, highSkin] = wall.shared
      ? [ownSkin, material(wall.otherId, OPPOSITE[wall.side])]
      : wall.side === 'n' || wall.side === 'w'
        ? [undefined, ownSkin]
        : [ownSkin, undefined]

    // `grow` alarga la pieza por los extremos que no son de la pared: dintel y
    // antepecho se meten un poco en los tramos de al lado, porque si solo se
    // tocan, el dibujo deja ver una raya fina en la junta.
    const add = (start: number, end: number, bottom: number, top: number, grow = 0) => {
      if (end - start < 1e-3 || top - bottom < 1e-3) return
      // Los extremos reales de la pared asoman a la fachada en las esquinas; los
      // cantos que dan a un hueco, el canto superior y el inferior quedan neutros.
      // En una junta interior la cara se ve de canto y deja una raya: lleva los
      // colores de las caras largas para que no se note.
      const joint: [string, string] = [low, high]
      const endLow = start === wall.from ? facadeColor : joint
      const endHigh = end === wall.to ? facadeColor : joint
      const from = start > wall.from ? start - grow : start
      const to = end < wall.to ? end + grow : end
      const along = to - from
      const mid = (from + to) / 2
      const across = grow ? wall.thickness - 2 * JOINT_RECESS : wall.thickness
      const y = level(wall.moduleId) + (bottom + top) / 2
      const neutral = DEFAULT_WALL_COLOR
      const skins: WallSkin[] = []
      // `toward` es 1 en la cara sur o este de la caja y -1 en la norte u oeste.
      const skin = (finish: Omit<FloorFinish, 'id' | 'name' | 'code'> | undefined, toward: 1 | -1) => {
        if (!finish?.texture) return
        const out = axis + toward * (across / 2 + SKIN_GAP)
        // La lámina mira hacia +z sin girar; según el giro, su eje u va a favor
        // o en contra del eje de la pared, y el origen de la textura se ajusta.
        const turn = wall.horizontal ? (toward > 0 ? 0 : Math.PI) : toward > 0 ? Math.PI / 2 : -Math.PI / 2
        const forward = wall.horizontal ? toward > 0 : toward < 0
        skins.push({
          position: wall.horizontal ? [mid, y, out] : [out, y, mid],
          turn,
          size: [along, top - bottom],
          url: finish.texture,
          scale: finish.size ?? [1, 1],
          start: [forward ? from : -to, bottom],
        })
      }
      skin(lowSkin, -1)
      skin(highSkin, 1)
      parts.push(
        wall.horizontal
          ? {
              position: [mid, y, axis],
              size: [along, top - bottom, across],
              faces: [endHigh, endLow, neutral, neutral, high, low],
              skins,
            }
          : {
              position: [axis, y, mid],
              size: [across, top - bottom, along],
              faces: [high, low, neutral, neutral, endHigh, endLow],
              skins,
            },
      )
    }

    let cursor = wall.from
    for (const { opening: o, from, to } of openingsOf(wall, modules, walls, openings)) {
      add(cursor, from, 0, WALL_HEIGHT)
      add(from, to, 0, o.sill, JOINT_OVERLAP)
      add(from, to, o.sill + o.height, WALL_HEIGHT, JOINT_OVERLAP)
      cursor = to
    }
    add(cursor, wall.to, 0, WALL_HEIGHT)
  }
  return parts
}

interface SkirtingPart {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}

/**
 * Rodapiés: una tira por cada cara de pared que da a una estancia (las dos de
 * una compartida, la de dentro de una exterior), cortada en los huecos que
 * llegan hasta ella, que en la práctica son las puertas.
 */
function skirtingParts(modules: PlacedModule[], joints: Joints, openings: Opening[], level: Level) {
  const walls = deriveWalls(modules, joints)
  const parts: SkirtingPart[] = []
  for (const wall of walls) {
    const { height, color } = wall.skirting
    if (wall.open || height <= 0) continue
    const [acrossMin, acrossMax] = wallAcross(wall)
    // Centro de la tira en cada cara con estancia delante: la norte u oeste, la sur o este.
    const inner = wall.side === 'n' || wall.side === 'w'
    const faces = [
      ...(wall.shared || !inner ? [acrossMin - SKIRTING_DEPTH / 2] : []),
      ...(wall.shared || inner ? [acrossMax + SKIRTING_DEPTH / 2] : []),
    ]
    const add = (from: number, to: number) => {
      if (to - from < 1e-3) return
      const mid = (from + to) / 2
      const y = level(wall.moduleId) + height / 2
      for (const across of faces) {
        parts.push(
          wall.horizontal
            ? { position: [mid, y, across], size: [to - from, height, SKIRTING_DEPTH], color }
            : { position: [across, y, mid], size: [SKIRTING_DEPTH, height, to - from], color },
        )
      }
    }
    let cursor = wall.from
    for (const { opening: o, from, to } of openingsOf(wall, modules, walls, openings)) {
      if (o.sill >= height) continue
      add(cursor, from)
      cursor = to
    }
    add(cursor, wall.to)
  }
  return parts
}

// Velocidad de desplazamiento con WASD, en m/s: volando y a pie.
const MOVE_SPEED = 4
const WALK_SPEED = 1.5
// Altura de los ojos a pie: 1,6 m sobre el suelo de la casa.
const EYES = 1.6
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
      camera.position.y = floorUnder(camera.position.x, camera.position.z) + EYES
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

// Realidad virtual (WebXR): se entra desde el botón "Entrar en VR" y vale para las
// Quest. Sin ratones ni paneles: con los mandos se camina (stick izquierdo), se
// gira a saltos (stick derecho) y, apuntando a una puerta con el rayo, el
// gatillo la abre o la cierra. En localhost la propia librería emula unas
// Quest 3 cuando el navegador no tiene VR.
const xrStore = createXRStore({
  controller: VRController,
  hand: { rayPointer: false, grabPointer: false, touchPointer: false },
  gaze: false,
  transientPointer: false,
})
// Metros por segundo al andar con el stick en VR, y grados de cada giro a saltos.
const VR_WALK_SPEED = 2
const VR_TURN_DEGREES = 30
// Lo que hay que mover el stick para que cuente, y para que dé un giro a saltos.
const VR_STICK_DEAD_ZONE = 0.2
const VR_SNAP_TRIGGER = 0.6
// Cuánto dura el aviso de cómo salir, en milisegundos.
const VR_HINT_MS = 10000
// Lo que dura a la vista el aviso de recargar la casa ("Casa actualizada"…).
const VR_NOTICE_MS = 2500
// Hasta dónde llega el rayo del mando, en metros, y a qué velocidad gira una
// hoja de puerta al abrirla o cerrarla (radianes por segundo: 90° en medio segundo).
const VR_RAY_LENGTH = 6
const DOOR_TURN_SPEED = Math.PI
// Color del rayo y del resalte cuando se apunta a algo que se puede accionar.
const VR_ACTIVE_COLOR = '#ff9a3c'

/**
 * El mando en VR y en AR: su modelo y un rayo para apuntar a las puertas y, en
 * VR, a los puntos de salto.
 */
function VRController() {
  return (
    <DefaultXRController
      rayPointer={{
        // Naranja, como el resalte de la hoja, cuando apunta a algo que se puede accionar.
        rayModel: {
          maxLength: VR_RAY_LENGTH,
          color: (pointer) => (actionable(pointer.getIntersection()?.object) ? VR_ACTIVE_COLOR : 'white'),
          opacity: (pointer) => (actionable(pointer.getIntersection()?.object) ? 0.9 : 0.4),
        },
        cursorModel: {
          color: (pointer) => (actionable(pointer.getIntersection()?.object) ? VR_ACTIVE_COLOR : 'white'),
        },
      }}
      grabPointer={false}
    />
  )
}

/** Si la pieza, o algo de lo que cuelga, se acciona en VR o AR (`userData.vrAction`: puertas y puntos de salto). */
function actionable(object: Object3D | undefined) {
  for (let o = object; o; o = o.parent ?? undefined) if (o.userData.vrAction) return true
  return false
}

/** Un cartel de texto pintado en un lienzo, para colgarlo en la escena de la VR. */
function vrLabel(text: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 96
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(20, 24, 28, 0.85)'
  ctx.fillRect(0, 0, 640, 96)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 40px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(text, 320, 62)
  return new CanvasTexture(canvas)
}

/** Los carteles ya pintados, por texto: se pintan la primera vez que hacen falta. */
const vrLabels = new Map<string, CanvasTexture>()
function vrLabelOf(text: string) {
  let texture = vrLabels.get(text)
  if (!texture) vrLabels.set(text, (texture = vrLabel(text)))
  return texture
}

/**
 * Apuntar con el rayo del mando a algo de la VR o la AR: si hay algún rayo
 * encima, dónde da el último y los manejadores para ponerlos en su grupo. El
 * gatillo (clic del rayo) llama a `onAction`. Sin `interactive`, nada.
 */
function useAim(interactive: boolean, onAction: () => void) {
  // Los rayos que están encima, por su id.
  const [pointers, setPointers] = useState<ReadonlySet<number>>(new Set())
  const hit = useRef(new Vector3())
  useEffect(() => {
    if (!interactive) setPointers(new Set())
  }, [interactive])

  const handlers = interactive
    ? {
        userData: { vrAction: true as boolean },
        onPointerEnter: (e: ThreeEvent<PointerEvent>) => {
          hit.current.copy(e.point)
          setPointers((set) => new Set(set).add(e.pointerId))
        },
        onPointerMove: (e: ThreeEvent<PointerEvent>) => {
          hit.current.copy(e.point)
        },
        onPointerLeave: (e: ThreeEvent<PointerEvent>) =>
          setPointers((set) => {
            const next = new Set(set)
            next.delete(e.pointerId)
            return next
          }),
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          onAction()
        },
      }
    : { userData: { vrAction: false as boolean } }
  return { hovered: interactive && pointers.size > 0, hit, handlers }
}

/**
 * El cartel de lo que se apunta ("Gatillo: …"): donde da el rayo, un poco
 * hacia la cabeza y de cara a ella. Siempre del mismo tamaño a la vista,
 * también en la maqueta AR, donde va a la mitad para no tapar la casa.
 */
function AimLabel({ at, text }: { at: React.RefObject<Vector3>; text: string }) {
  const label = useRef<Mesh>(null)
  const gl = useThree((s) => s.gl)
  const tmp = useRef({ head: new Vector3(), toward: new Vector3(), scale: new Vector3() })
  useFrame(() => {
    const l = label.current
    if (!l || !l.parent) return
    const { head, toward, scale } = tmp.current
    const world = l.parent.getWorldScale(scale).x || 1
    const size = world < 0.5 ? 0.5 : 1
    gl.xr.getCamera().getWorldPosition(head)
    toward.subVectors(head, at.current).setY(0)
    if (toward.lengthSq() > 1e-6) toward.normalize().multiplyScalar(0.08 * size)
    l.position.copy(at.current).add(toward)
    l.position.y += 0.12 * size
    l.parent.worldToLocal(l.position)
    l.scale.setScalar(size / world)
    l.lookAt(head.x, l.getWorldPosition(toward).y, head.z)
  })
  return (
    <mesh ref={label} renderOrder={999} pointerEvents="none">
      <planeGeometry args={[0.36, 0.054]} />
      <meshBasicMaterial map={vrLabelOf(text)} transparent depthTest={false} />
    </mesh>
  )
}

/** A dónde quiere saltar quien está en la VR (un punto del suelo, en el mundo); lo atiende `VRRig`. */
let teleportRequest: Vector3 | null = null

// Puntos de salto en el suelo: radio del círculo y grueso de su aro.
const TELEPORT_RADIUS = 0.3
const TELEPORT_RING = 0.05

/** Un punto de salto de la VR: un círculo en el suelo; apuntándolo, el gatillo te lleva ahí. */
function TeleportMarker({ point }: { point: TeleportPoint }) {
  const group = useRef<Group>(null)
  const level = useLevel()
  const { hovered, hit, handlers } = useAim(true, () => {
    if (group.current) teleportRequest = group.current.getWorldPosition(new Vector3())
  })
  const color = hovered ? VR_ACTIVE_COLOR : '#ffffff'
  return (
    <>
      <group ref={group} position={[point.x, point.room ? level(point.room) : 0, point.y]} {...handlers}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
          <circleGeometry args={[TELEPORT_RADIUS, 32]} />
          <meshBasicMaterial color={color} transparent opacity={hovered ? 0.35 : 0.15} depthWrite={false} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.014}>
          <ringGeometry args={[TELEPORT_RADIUS - TELEPORT_RING, TELEPORT_RADIUS, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      </group>
      {hovered && <AimLabel at={hit} text="Gatillo: ir aquí" />}
    </>
  )
}

/** Un cartel pequeño, delante de los ojos y siempre encima, que dice cómo salir de la VR. */
function exitHint(title: string, lines: string[]) {
  const height = 64 + lines.length * 44
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = 'rgba(20, 24, 28, 0.82)'
  ctx.fillRect(0, 0, 640, height)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 40px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(title, 320, 52)
  ctx.font = '28px sans-serif'
  lines.forEach((line, i) => ctx.fillText(line, 320, 100 + i * 44))
  const width = 0.5
  const mesh = new Mesh(
    new PlaneGeometry(width, (width * height) / 640),
    new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthTest: false }),
  )
  mesh.position.set(0, -0.2, -0.8)
  mesh.renderOrder = 999
  return mesh
}

// Realidad aumentada con el paso de cámara de las Quest 3. La casa se ve como una
// maqueta sobre una mesa virtual translúcida, a 1:20, delante de ti. Se maneja
// como la bandeja de la prueba `sala-ar` (D:\IA\Macedonia\games\sala-ar):
//  · botón lateral (agarre) mantenido: coges la mesa desde donde está y se
//    mueve y gira con la mano, sin saltar a ella;
//  · los botones laterales de los dos mandos a la vez: la distancia entre ellos
//    agranda o reduce la maqueta, y girar las manos la gira;
//  · el gatillo no toca la mesa: es para las puertas (y lo que se pueda
//    accionar más adelante), lo decidió el usuario;
//  · stick izquierdo: la mueve en horizontal, según hacia dónde miras;
//  · stick derecho a izquierda o derecha: la gira poco a poco;
//  · A o X: cambia entre maqueta (1:20) y tamaño real (1:1).
const AR_SCALE = 1 / 20
// Lo más pequeña que puede quedar la maqueta (1:100); lo más grande, 1:1.
const AR_MIN_SCALE = 0.01
const AR_TABLE_HEIGHT = 0.75
const AR_TABLE_MARGIN = 0.06
const AR_TURN_SPEED = 1.5
// Metros por segundo que mueve la mesa el stick izquierdo.
const AR_MOVE_SPEED = 0.5

/**
 * La mesa de la maqueta: lleva dentro la casa, escalada, y se mueve y gira con
 * los mandos. Fuera de la AR no hace nada (todo queda a tamaño real y sin mover).
 */
function ARTable({
  enabled,
  size,
  children,
}: {
  enabled: boolean
  size: [number, number]
  children: React.ReactNode
}) {
  const outer = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const plate = useRef<Mesh>(null)
  const gl = useThree((s) => s.gl)
  // Está fuera de <XR>: la sesión se pregunta al renderizador en cada fotograma.
  const table = useRef({
    pos: new Vector3(),
    yaw: 0,
    scale: AR_SCALE,
    ready: false,
    // El gesto de escalar con los dos mandos: de dónde partía.
    pinch: null as null | {
      dist: number
      angle: number
      scale: number
      yaw: number
      mid: Vector3
      pos: Vector3
    },
    // La mesa cogida con una mano: dónde estaba respecto a ella al cogerla.
    grab: null as null | { hand: string; offset: Vector3; yaw: number; handYaw: number },
  })
  // Estado de los botones fotograma a fotograma, para detectar la pulsación (no la mantenida).
  const held = useRef(new Map<string, boolean>())
  const tmp = useRef({
    head: new Vector3(),
    dir: new Vector3(),
    hand: new Vector3(),
    fwd: new Vector3(),
    quat: new Quaternion(),
  })

  useEffect(() => {
    table.current.ready = false
    table.current.pinch = null
    table.current.grab = null
    held.current.clear()
  }, [enabled])

  useFrame((_, delta, frame) => {
    const o = outer.current
    const i = inner.current
    const p = plate.current
    if (!o || !i || !p) return
    const session = gl.xr.getSession()
    if (!enabled || !session || !frame) {
      o.position.set(0, 0, 0)
      o.rotation.set(0, 0, 0)
      i.scale.setScalar(1)
      p.visible = false
      return
    }
    const t = table.current
    const v = tmp.current
    const space = gl.xr.getReferenceSpace()

    // Al empezar, delante de ti, a la altura de una mesa y de cara.
    if (!t.ready) {
      // La pose real de la cabeza, del visor: la cámara de la escena aún no la tiene en el primer fotograma.
      const viewer = space ? frame.getViewerPose(space) : undefined
      if (!viewer) return
      const { position: at, orientation: q } = viewer.transform
      v.head.set(at.x, at.y, at.z)
      v.dir.set(0, 0, -1).applyQuaternion(v.quat.set(q.x, q.y, q.z, q.w))
      v.dir.y = 0
      if (v.dir.lengthSq() < 1e-4) v.dir.set(0, 0, -1)
      v.dir.normalize()
      t.pos.set(v.head.x + v.dir.x * 0.8, AR_TABLE_HEIGHT, v.head.z + v.dir.z * 0.8)
      t.yaw = Math.atan2(-v.dir.x, -v.dir.z)
      t.scale = AR_SCALE
      t.ready = true
    }

    let toggle = false
    const placing: { hand: string; pos: Vector3; fwd: Vector3 }[] = []
    for (const source of session.inputSources) {
      const pad = source.gamepad
      if (!pad || !space) continue
      const pose = frame.getPose(source.targetRaySpace, space)
      if (!pose) continue
      const { position: at, orientation: q } = pose.transform
      v.hand.set(at.x, at.y, at.z)
      v.fwd.set(0, 0, -1).applyQuaternion(v.quat.set(q.x, q.y, q.z, q.w))
      const hand = source.handedness
      // Solo el botón lateral (agarre) coge la mesa; el gatillo es para las puertas.
      const place = !!pad.buttons[1]?.pressed
      const press = !!pad.buttons[4]?.pressed
      const wasPress = held.current.get(hand + 'press') ?? false
      held.current.set(hand + 'press', press)
      if (press && !wasPress) toggle = true

      if (place) {
        placing.push({ hand, pos: v.hand.clone(), fwd: v.fwd.clone() })
        continue
      }
      const sx = pad.axes[2] ?? 0
      const sy = pad.axes[3] ?? 0
      if (hand === 'left') {
        // Stick izquierdo: es como moverte tú, sentado, según hacia dónde miras
        // (lo dijo el usuario): adelante avanzas y la maqueta se acerca; a la
        // derecha te desplazas a la derecha y la maqueta va a tu izquierda.
        if (Math.hypot(sx, sy) < 0.3) continue
        const viewer = frame.getViewerPose(space)
        if (!viewer) continue
        const q = viewer.transform.orientation
        v.dir.set(0, 0, -1).applyQuaternion(v.quat.set(q.x, q.y, q.z, q.w))
        const flat = Math.hypot(v.dir.x, v.dir.z)
        const [fx, fz] = flat > 1e-4 ? [v.dir.x / flat, v.dir.z / flat] : [0, -1]
        const step = AR_MOVE_SPEED * delta
        t.pos.x -= (-fz * sx - fx * sy) * step
        t.pos.z -= (fx * sx - fz * sy) * step
        continue
      }
      // Stick derecho: solo gira (lo pidió el usuario: agrandar es cosa de los dos
      // mandos), alrededor de donde estás tú y no del centro de la mesa (también
      // lo pidió). El sentido, al revés del primero que hubo: lo probó el usuario.
      if (Math.abs(sx) < 0.3) continue
      const viewer = frame.getViewerPose(space)
      if (!viewer) continue
      const eye = viewer.transform.position
      const angle = sx * AR_TURN_SPEED * delta
      const [dx, dz] = [t.pos.x - eye.x, t.pos.z - eye.z]
      const [c, sn] = [Math.cos(angle), Math.sin(angle)]
      t.pos.x = eye.x + dx * c + dz * sn
      t.pos.z = eye.z - dx * sn + dz * c
      t.yaw += angle
    }

    if (placing.length >= 2) {
      // Con los dos mandos: la distancia entre ellos escala la maqueta, girar las
      // manos la gira, y la mesa queda entre las dos.
      placing.sort((a, b) => a.hand.localeCompare(b.hand))
      const [a, b] = placing
      const dist = a.pos.distanceTo(b.pos)
      const angle = Math.atan2(b.pos.z - a.pos.z, b.pos.x - a.pos.x)
      const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5)
      t.grab = null
      // Al juntar las manos, la mesa no salta: se recuerda dónde estaba respecto a ellas.
      t.pinch ??= { dist, angle, scale: t.scale, yaw: t.yaw, mid, pos: t.pos.clone() }
      const g = t.pinch
      // Se escala y gira alrededor del punto entre las manos, que lleva la mesa consigo.
      const scale = g.dist > 0.02 ? Math.min(Math.max((g.scale * dist) / g.dist, AR_MIN_SCALE), 1) : t.scale
      const turn = -(angle - g.angle)
      const k = scale / g.scale
      const [dx, dz] = [(g.pos.x - g.mid.x) * k, (g.pos.z - g.mid.z) * k]
      const [c, sn] = [Math.cos(turn), Math.sin(turn)]
      t.scale = scale
      t.yaw = g.yaw + turn
      t.pos.set(mid.x + dx * c + dz * sn, Math.max(g.pos.y + mid.y - g.mid.y, 0), mid.z - dx * sn + dz * c)
    } else {
      t.pinch = null
      if (placing.length === 1) {
        // Cogida con una mano: sigue a la mano y gira con ella, sin saltar.
        const { hand, pos, fwd } = placing[0]
        const flat = Math.hypot(fwd.x, fwd.z)
        // Con el mando apuntando arriba o abajo no se sabe su giro: vale el último.
        const handYaw =
          flat > 0.2 ? Math.atan2(-fwd.x, -fwd.z) : t.grab?.hand === hand ? t.grab.handYaw : t.yaw
        if (t.grab?.hand !== hand) {
          // Dónde está la mesa respecto a la mano, en los ejes de la mano.
          const [dx, dz] = [t.pos.x - pos.x, t.pos.z - pos.z]
          const [c, sn] = [Math.cos(-handYaw), Math.sin(-handYaw)]
          t.grab = {
            hand,
            offset: new Vector3(dx * c + dz * sn, t.pos.y - pos.y, -dx * sn + dz * c),
            yaw: t.yaw - handYaw,
            handYaw,
          }
        }
        const g = t.grab
        g.handYaw = handYaw
        const [c, sn] = [Math.cos(handYaw), Math.sin(handYaw)]
        t.pos.set(
          pos.x + g.offset.x * c + g.offset.z * sn,
          Math.max(pos.y + g.offset.y, 0),
          pos.z - g.offset.x * sn + g.offset.z * c,
        )
        t.yaw = handYaw + g.yaw
      } else t.grab = null
    }
    if (toggle) t.scale = t.scale >= 0.5 ? AR_SCALE : 1

    o.position.copy(t.pos)
    o.rotation.set(0, t.yaw, 0)
    i.scale.setScalar(t.scale)
    p.visible = true
    p.scale.set(size[0] * t.scale + AR_TABLE_MARGIN * 2, 1, size[1] * t.scale + AR_TABLE_MARGIN * 2)
  })

  return (
    <group ref={outer}>
      {/* La mesa: una tabla fina y translúcida bajo la maqueta. */}
      <mesh ref={plate} visible={false} position-y={-0.01}>
        <boxGeometry args={[1, 0.02, 1]} />
        <meshStandardMaterial color="#9fd4ff" transparent opacity={0.55} />
      </mesh>
      <group ref={inner}>{children}</group>
    </group>
  )
}

/**
 * El jugador en VR: su origen (los pies) se pone donde estaba la cámara normal y
 * mirando hacia donde miraba; al salir, la cámara y el marcador del plano quedan
 * donde lo dejó. La altura de los ojos la da el propio visor.
 */
function VRRig({ ar }: { ar: boolean }) {
  const origin = useRef<Group>(null)
  const gl = useThree((s) => s.gl)
  const session = useXR((s) => s.session)
  const last = useRef<{ x: number; z: number; yaw: number } | null>(null)
  // Giro a saltos con el stick derecho: hasta soltarlo no da otro.
  const turnHeld = useRef(false)

  useEffect(() => {
    const group = origin.current
    if (!session || !group) return
    if (ar) {
      // En AR el mundo es la habitación real: el origen vuelve a cero, por si venía de una sesión de VR.
      group.position.set(0, 0, 0)
      group.rotation.set(0, 0, 0)
      return
    }
    stopCameraFlight()
    const pose = useHouse.getState().cameraPose
    const [x, z] = [pose?.position[0] ?? 0, pose?.position[2] ?? 0]
    group.position.set(x, floorUnder(x, z), z)
    group.rotation.set(0, pose?.yaw ?? 0, 0)
    last.current = null
    return () => {
      const at = last.current
      if (!at) return
      useHouse.getState().setCameraPose({ position: [at.x, floorUnder(at.x, at.z) + EYES, at.z], yaw: at.yaw, pitch: 0 })
    }
  }, [session, ar])

  // Un aviso pegado a la vista los primeros segundos: cómo salir.
  useEffect(() => {
    if (!session) return
    const camera = gl.xr.getCamera()
    const hint = ar
      ? exitHint('Pulsa B o Y para salir', [
          'Botón lateral: coger la maqueta',
          'Gatillo apuntando a una puerta: abrirla',
          'Los dos botones laterales: escalar y girar',
          'Stick izquierdo: moverla',
          'Stick derecho: girarla',
          'A o X: tamaño real',
          ...(REMOTE_URL ? ['Pulsar un stick: recargar la casa'] : []),
          __APP_VERSION__,
        ])
      : exitHint('Pulsa B o Y para salir', [
          'Stick: caminar y girar',
          'Apunta a una puerta y pulsa el gatillo',
          'Círculos del suelo: apunta y gatillo para ir',
          ...(REMOTE_URL ? ['A o X: recargar la casa'] : []),
          __APP_VERSION__,
        ])
    camera.add(hint)
    const timer = setTimeout(() => camera.remove(hint), VR_HINT_MS)
    return () => {
      clearTimeout(timer)
      camera.remove(hint)
      hint.geometry.dispose()
      ;(hint.material as MeshBasicMaterial).map?.dispose()
      hint.material.dispose()
    }
  }, [session, gl, ar])

  // Dónde está la cabeza en cada fotograma, para dejar la cámara ahí al salir.
  const head = useRef({ position: new Vector3(), direction: new Vector3() })
  const exitHeld = useRef(false)
  const reloadHeld = useRef(false)
  // Un aviso corto delante de los ojos al recargar la casa; uno nuevo quita el anterior.
  const notice = useRef<{ mesh: Mesh; timer: number } | null>(null)
  const hideNotice = () => {
    const n = notice.current
    if (!n) return
    clearTimeout(n.timer)
    n.mesh.removeFromParent()
    n.mesh.geometry.dispose()
    ;(n.mesh.material as MeshBasicMaterial).map?.dispose()
    ;(n.mesh.material as MeshBasicMaterial).dispose()
    notice.current = null
  }
  const showNotice = (text: string) => {
    hideNotice()
    const mesh = exitHint(text, [])
    gl.xr.getCamera().add(mesh)
    notice.current = { mesh, timer: window.setTimeout(hideNotice, VR_NOTICE_MS) }
  }
  useEffect(() => hideNotice, [session])
  useFrame((_, delta) => {
    if (!session) return
    // B / Y (el botón de arriba de cada mando) sale de la VR.
    const pressed = Array.from(session.inputSources).some((s) => s.gamepad?.buttons[5]?.pressed)
    if (pressed && !exitHeld.current) void session.end()
    exitHeld.current = pressed
    // Con una casa de una dirección (?url=…), recargarla sin salir: A o X en la VR;
    // en la AR, que ya usa A o X para el tamaño real, pulsar un stick.
    if (REMOTE_URL) {
      const button = ar ? 3 : 4
      const reload = Array.from(session.inputSources).some((s) => s.gamepad?.buttons[button]?.pressed)
      if (reload && !reloadHeld.current) {
        showNotice('Cargando la casa…')
        void reloadRemote().then((result) =>
          showNotice(
            result === 'updated'
              ? 'Casa actualizada'
              : result === 'same'
                ? 'No hay cambios'
                : result === 'ask'
                  ? 'Confírmalo fuera de la VR'
                  : 'No se ha podido cargar',
          ),
        )
      }
      reloadHeld.current = reload
    }
    // En AR no se toca la cámara de la vista normal: la cabeza no está en la casa.
    if (ar) {
      teleportRequest = null
      return
    }
    const camera = gl.xr.getCamera()
    camera.getWorldPosition(head.current.position)
    // Un salto pedido: los pies van al punto, y la cabeza queda encima, mirando a donde miraba.
    const o = origin.current
    if (teleportRequest && o) {
      o.position.x += teleportRequest.x - head.current.position.x
      o.position.z += teleportRequest.z - head.current.position.z
      o.position.y = teleportRequest.y
      teleportRequest = null
      camera.getWorldPosition(head.current.position)
    }
    camera.getWorldDirection(head.current.direction)
    const { position, direction } = head.current
    // Los sticks, a mano (la librería giraba alrededor del origen del espacio,
    // no de la cabeza, y te desplazaba en cada giro): el izquierdo camina hacia
    // donde miras y el derecho gira a saltos sobre ti mismo.
    // En AR no hacen esto: el mundo es la habitación real (ver `ARTable`).
    if (o) {
      const forward = Math.hypot(direction.x, direction.z)
      const [fx, fz] = forward > 1e-4 ? [direction.x / forward, direction.z / forward] : [0, -1]
      for (const source of session.inputSources) {
        const pad = source.gamepad
        if (!pad) continue
        const x = pad.axes[2] ?? 0
        const y = pad.axes[3] ?? 0
        if (source.handedness === 'left' && Math.hypot(x, y) > VR_STICK_DEAD_ZONE) {
          // Delante es el stick hacia arriba (y negativo); a la derecha, (-fz, fx).
          const step = VR_WALK_SPEED * delta
          o.position.x += (-fz * x - fx * y) * step
          o.position.z += (fx * x - fz * y) * step
        }
        if (source.handedness === 'right') {
          if (Math.abs(x) < VR_STICK_DEAD_ZONE) turnHeld.current = false
          else if (!turnHeld.current && Math.abs(x) > VR_SNAP_TRIGGER) {
            turnHeld.current = true
            // Gira el origen alrededor de la cabeza, que se queda donde estaba.
            const angle = (x > 0 ? -1 : 1) * MathUtils.degToRad(VR_TURN_DEGREES)
            const [dx, dz] = [o.position.x - position.x, o.position.z - position.z]
            const [c, sn] = [Math.cos(angle), Math.sin(angle)]
            o.position.x = position.x + dx * c + dz * sn
            o.position.z = position.z - dx * sn + dz * c
            o.rotation.y += angle
          }
        }
      }
    }
    last.current = { x: position.x, z: position.z, yaw: Math.atan2(-direction.x, -direction.z) }
  })

  return <XROrigin ref={origin} />
}

/** La cámara de ratón y teclado, que en VR se apaga: la mueve el visor. */
function DesktopControls() {
  const inXR = useXR((s) => s.session != null)
  return inXR ? null : <FirstPersonControls />
}

/**
 * Caja de pared maciza con un color por cara. Los colores van en los vértices y
 * no en seis materiales: el trazador de la foto no admite mallas multimaterial.
 */
function WallBox({ part }: { part: WallPart }) {
  const [w, h, d] = part.size
  const faces = JSON.stringify(part.faces)
  const geometry = useMemo(() => {
    const box = new BoxGeometry(w, h, d)
    // BoxGeometry tiene cuatro vértices por cara, en el mismo orden que `faces`.
    // Con cuatro componentes (RGBA), que es lo que el trazador da por hecho al mezclar mallas.
    const position = box.getAttribute('position')
    const across = w < d ? 0 : 2
    const rgba = (color: string) => [...new Color(color).toArray(), 1]
    const colors = JSON.parse(faces).flatMap((face: string | [string, string], f: number) =>
      [0, 1, 2, 3].flatMap((k) => {
        if (typeof face === 'string') return rgba(face)
        const coord = across === 0 ? position.getX(f * 4 + k) : position.getZ(f * 4 + k)
        return rgba(coord < 0 ? face[0] : face[1])
      }),
    )
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

/** Material de una cara de pared: una lámina con la textura a escala real. */
function WallSkinPlane({ skin }: { skin: WallSkin }) {
  const image = useLoader(TextureLoader, skin.url)
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const [w, h] = skin.size
  const [sx, sy] = skin.scale
  const [u, v] = skin.start
  const texture = useMemo(() => {
    const t = image.clone()
    t.wrapS = t.wrapT = RepeatWrapping
    t.colorSpace = SRGBColorSpace
    t.anisotropy = maxAnisotropy
    t.repeat.set(w / sx, h / sy)
    t.offset.set(u / sx, v / sy)
    t.needsUpdate = true
    return t
  }, [image, maxAnisotropy, w, h, sx, sy, u, v])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={skin.position} rotation-y={skin.turn} receiveShadow>
      <planeGeometry args={skin.size} />
      <meshStandardMaterial map={texture} roughness={0.7} />
    </mesh>
  )
}

/**
 * Pieza de carpintería. El cristal y la manilla son fijos; cerco y hojas llevan
 * el acabado de su hueco, que es un color liso o un material con textura.
 */
function JoineryBox({ part }: { part: JoineryPart }) {
  const level = useLevel()
  const position: [number, number, number] = [
    part.position[0],
    level(part.room) + part.position[1],
    part.position[2],
  ]
  // El nombre viaja en el GLB: Blender lo usa para saber qué pieza es.
  const name = `Carpintería ${part.role}`
  if (part.material !== 'wood') {
    return (
      <mesh name={name} position={position} receiveShadow={part.material === 'metal'}>
        <boxGeometry args={part.size} />
        <meshStandardMaterial name={name} {...JOINERY_MATERIALS[part.material]} />
      </mesh>
    )
  }
  const finish = resolveFinish(part.finish, DEFAULT_JOINERY_FINISH)
  const plain = (
    <mesh name={name} position={position} receiveShadow>
      <boxGeometry args={part.size} />
      <meshStandardMaterial name={name} color={finish.color} roughness={0.55} />
    </mesh>
  )
  if (!finish.texture) return plain
  return (
    <Suspense fallback={plain}>
      <TexturedBox name={name} position={position} size={part.size} url={finish.texture} scale={finish.size ?? [1, 1]} />
    </Suspense>
  )
}

/**
 * Hoja de una puerta abatible con sus manillas: gira sobre las bisagras hasta
 * quedar abierta o cerrada. Al cambiar `closed` gira poco a poco; durante la
 * foto en calidad va directa, para que el trazador la vea ya en su sitio.
 * En VR y AR (`interactive`) se apunta con el rayo del mando: se resalta, sale un
 * cartel con el botón que hay que pulsar y el gatillo la abre o la cierra.
 */
function DoorLeaf({
  axis,
  parts,
  animate,
  interactive,
}: {
  axis: DoorLeafAxis
  parts: JoineryPart[]
  animate: boolean
  interactive: boolean
}) {
  const group = useRef<Group>(null)
  const level = useLevel()
  const target = axis.closed ? 0 : axis.open
  const angle = useRef(target)
  const { hovered, hit, handlers } = useAim(interactive, () =>
    useHouse.getState().setDoor(axis.opening, { closed: !axis.closed }),
  )

  useLayoutEffect(() => {
    if (animate || !group.current) return
    angle.current = target
    group.current.rotation.y = target
  }, [animate, target])

  useFrame((_, delta) => {
    const g = group.current
    const left = target - angle.current
    if (!g || left === 0) return
    const step = DOOR_TURN_SPEED * delta
    angle.current = Math.abs(left) <= step ? target : angle.current + Math.sign(left) * step
    g.rotation.y = angle.current
  })

  // Resalte: las aristas de la hoja, un poco mayores que ella.
  const panel = parts.find((p) => p.role === 'Hoja')
  const edges = useMemo(() => {
    if (!panel) return null
    const [w, h, d] = panel.size
    const box = new BoxGeometry(w + 0.01, h + 0.01, d + 0.01)
    const lines = new EdgesGeometry(box)
    box.dispose()
    return lines
  }, [panel?.size[0], panel?.size[1], panel?.size[2]])
  useEffect(() => () => edges?.dispose(), [edges])

  const [px, pz] = axis.pivot
  return (
    <>
      <group ref={group} position={[px, 0, pz]} rotation-y={angle.current} {...handlers}>
        <group position={[-px, 0, -pz]}>
          {parts.map((part, i) => (
            <JoineryBox key={i} part={part} />
          ))}
          {hovered && panel && edges && (
            <lineSegments
              geometry={edges}
              pointerEvents="none"
              position={[panel.position[0], level(panel.room) + panel.position[1], panel.position[2]]}
            >
              <lineBasicMaterial color={VR_ACTIVE_COLOR} />
            </lineSegments>
          )}
        </group>
      </group>
      {hovered && (
        <AimLabel at={hit} text={axis.closed ? 'Gatillo: abrir la puerta' : 'Gatillo: cerrar la puerta'} />
      )}
    </>
  )
}

interface TexturedBoxProps {
  name?: string
  position: [number, number, number]
  size: [number, number, number]
  url: string
  /** Metros reales que cubre la imagen. */
  scale: [number, number]
}

/** Caja con una textura a escala real en sus seis caras. */
function TexturedBox({ name, position, size, url, scale }: TexturedBoxProps) {
  const image = useLoader(TextureLoader, url)
  const texture = useMemo(() => {
    const t = image.clone()
    t.wrapS = t.wrapT = RepeatWrapping
    t.colorSpace = SRGBColorSpace
    t.needsUpdate = true
    return t
  }, [image])
  useEffect(() => () => texture.dispose(), [texture])

  const [w, h, d] = size
  const [sx, sy] = scale
  const geometry = useMemo(() => {
    const box = new BoxGeometry(w, h, d)
    // Las UV de BoxGeometry van de 0 a 1 en cada cara: se pasan a metros para
    // que la textura no se estire. Caras en el orden +x, -x, +y, -y, +z, -z.
    const uv = box.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) {
      const face = Math.floor(i / 4)
      const [across, up] = face < 2 ? [d, h] : face < 4 ? [w, d] : [w, h]
      const [u, v] = [(uv.getX(i) * across) / sx, (uv.getY(i) * up) / sy]
      // La veta de la imagen va en horizontal: en las piezas más altas que
      // anchas (largueros, hoja de la puerta) se gira para que suba con ellas.
      if (up > across) uv.setXY(i, v, u)
      else uv.setXY(i, u, v)
    }
    return box
  }, [w, h, d, sx, sy])
  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <mesh name={name} position={position} geometry={geometry} receiveShadow>
      <meshStandardMaterial name={name} map={texture} roughness={0.7} />
    </mesh>
  )
}

const VINYL_TURN: Record<Side, number> = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 }

interface VinylPart {
  key: string
  url: string
  position: [number, number, number]
  turn: number
  /** Giro sobre la pared, en radianes y sentido horario. */
  spin: number
  size: [number, number]
}

/** Vinilos de todas las estancias, cada uno como un plano pegado a su cara de pared. */
function vinylParts(modules: PlacedModule[], joints: Joints, level: Level) {
  const walls = deriveWalls(modules, joints)
  const parts: VinylPart[] = []
  for (const room of modules) {
    for (const side of SIDES) {
      for (const v of room.vinyls?.[side] ?? []) {
        const type = vinylType(v.typeId)
        const place = vinylPlacement(room, side, v, walls)
        if (!type || !place) continue
        const y = level(room.id) + v.y + v.height / 2
        parts.push({
          key: v.id,
          url: type.image,
          position: place.horizontal ? [place.along, y, place.across] : [place.across, y, place.along],
          turn: VINYL_TURN[side],
          spin: ((v.rotation ?? 0) * Math.PI) / 180,
          size: [v.width, v.height],
        })
      }
    }
  }
  return parts
}

/** Un vinilo: su imagen sobre un plano sin grosor; lo transparente deja ver la pared. */
function VinylPlane({ part }: { part: VinylPart }) {
  const image = useLoader(TextureLoader, part.url)
  const maxAnisotropy = useThree((s) => s.gl.capabilities.getMaxAnisotropy())
  const texture = useMemo(() => {
    const t = image.clone()
    t.colorSpace = SRGBColorSpace
    t.anisotropy = maxAnisotropy
    t.needsUpdate = true
    return t
  }, [image, maxAnisotropy])
  useEffect(() => () => texture.dispose(), [texture])

  return (
    <mesh position={part.position} rotation={[0, part.turn, -part.spin]} receiveShadow>
      <planeGeometry args={part.size} />
      <meshStandardMaterial map={texture} transparent roughness={0.9} />
    </mesh>
  )
}

interface MirrorPart {
  key: string
  /** El cuerpo: la caja fina que cuelga de la pared. */
  body: { position: [number, number, number]; size: [number, number, number] }
  /** La superficie que refleja: un plano aparte, sobre la cara de delante del cuerpo. */
  surface: { position: [number, number, number]; turn: number; size: [number, number] }
}

// Lo que la superficie reflectante se separa del cuerpo, para que no parpadee con su cara.
const MIRROR_GAP = 0.001
const MIRROR_BODY_COLOR = '#3a3d40'

/**
 * Espejos de todas las estancias. Cada uno son dos piezas: el cuerpo, que es
 * geometría, y la superficie reflectante, que va aparte como un acabado suyo.
 */
function mirrorParts(modules: PlacedModule[], joints: Joints, level: Level) {
  const walls = deriveWalls(modules, joints)
  const parts: MirrorPart[] = []
  for (const room of modules) {
    for (const side of SIDES) {
      for (const v of room.mirrors?.[side] ?? []) {
        const body = vinylPlacement(room, side, v, walls, MIRROR_THICKNESS / 2)
        const front = vinylPlacement(room, side, v, walls, MIRROR_THICKNESS + MIRROR_GAP)
        if (!body || !front) continue
        const y = level(room.id) + v.y + v.height / 2
        parts.push({
          key: v.id,
          body: body.horizontal
            ? { position: [body.along, y, body.across], size: [v.width, v.height, MIRROR_THICKNESS] }
            : { position: [body.across, y, body.along], size: [MIRROR_THICKNESS, v.height, v.width] },
          surface: {
            position: front.horizontal ? [front.along, y, front.across] : [front.across, y, front.along],
            turn: VINYL_TURN[side],
            size: [v.width, v.height],
          },
        })
      }
    }
  }
  return parts
}

/**
 * Un espejo. En la foto en calidad la superficie refleja de verdad (metal
 * pulido); en la vista normal no hay reflejos y queda como un panel plateado.
 */
function MirrorPiece({ part, photo }: { part: MirrorPart; photo: boolean }) {
  return (
    <>
      <mesh position={part.body.position} castShadow receiveShadow>
        <boxGeometry args={part.body.size} />
        <meshStandardMaterial color={MIRROR_BODY_COLOR} roughness={0.6} />
      </mesh>
      <mesh position={part.surface.position} rotation-y={part.surface.turn}>
        <planeGeometry args={part.surface.size} />
        {photo ? (
          <meshStandardMaterial color="#ffffff" metalness={1} roughness={0} />
        ) : (
          <meshStandardMaterial color="#e3eaee" roughness={0.2} />
        )}
      </mesh>
    </>
  )
}

interface BoardPart {
  key: string
  position: [number, number, number]
  size: [number, number, number]
  finish: Finish
}

/** Tableros de todas las estancias, cada uno como una caja pegada a su cara de pared. */
function boardParts(modules: PlacedModule[], joints: Joints, level: Level) {
  const walls = deriveWalls(modules, joints)
  const parts: BoardPart[] = []
  for (const room of modules) {
    for (const side of SIDES) {
      for (const v of room.boards?.[side] ?? []) {
        const place = vinylPlacement(room, side, v, walls, v.depth / 2)
        if (!place) continue
        const y = level(room.id) + v.y + v.height / 2
        parts.push({
          key: v.id,
          position: place.horizontal ? [place.along, y, place.across] : [place.across, y, place.along],
          size: place.horizontal ? [v.width, v.height, v.depth] : [v.depth, v.height, v.width],
          finish: v.finish,
        })
      }
    }
  }
  return parts
}

/** Un tablero, con su color liso o la textura de su material. */
function BoardBox({ part }: { part: BoardPart }) {
  const finish = resolveFinish(part.finish, BOARD_FALLBACK_COLOR)
  const plain = (
    <mesh position={part.position} castShadow receiveShadow>
      <boxGeometry args={part.size} />
      <meshStandardMaterial color={finish.color} roughness={0.55} />
    </mesh>
  )
  if (!finish.texture) return plain
  return (
    <Suspense fallback={plain}>
      <TexturedBox position={part.position} size={part.size} url={finish.texture} scale={finish.size ?? [1, 1]} />
    </Suspense>
  )
}

interface MechanismBox {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}

const MECHANISM_PLATE_COLOR = '#f2f1ec'
const MECHANISM_DETAIL_COLOR = '#dcdad2'
const MECHANISM_HOLE_COLOR = '#2b2b2b'

/**
 * Interruptores y enchufes de todas las estancias. Cada uno es una placa fina
 * pegada a su cara de pared y, encima, el detalle de cada módulo suyo: un
 * pulsador en el interruptor y dos agujeros en el enchufe.
 */
function mechanismParts(modules: PlacedModule[], joints: Joints, level: Level) {
  const walls = deriveWalls(modules, joints)
  const parts: { key: string; boxes: MechanismBox[] }[] = []
  for (const room of modules) {
    for (const side of SIDES) {
      for (const v of room.mechanisms?.[side] ?? []) {
        const type = mechanismType(v.typeId)
        if (!type) continue
        const { width, height } = mechanismSize(type)
        const boxes: MechanismBox[] = []
        // Una caja de `w` × `h` con su esquina izquierda en `x` (desde la de la placa) y a `depth` de la pared.
        const add = (dx: number, y: number, w: number, h: number, thick: number, depth: number, color: string) => {
          const place = vinylPlacement(room, side, { x: v.x + dx, width: w }, walls, depth)
          if (!place) return
          const cy = level(room.id) + v.y + y + h / 2
          boxes.push({
            position: place.horizontal ? [place.along, cy, place.across] : [place.across, cy, place.along],
            size: place.horizontal ? [w, h, thick] : [thick, h, w],
            color,
          })
        }
        add(0, 0, width, height, MECHANISM_THICKNESS, MECHANISM_THICKNESS / 2, MECHANISM_PLATE_COLOR)
        for (let i = 0; i < type.modules; i++) {
          const left = i * MECHANISM_MODULE
          const front = MECHANISM_THICKNESS + 0.001
          if (type.kind === 'switch') {
            add(left + (MECHANISM_MODULE - 0.05) / 2, 0.015, 0.05, 0.05, 0.004, front, MECHANISM_DETAIL_COLOR)
          } else {
            add(left + (MECHANISM_MODULE - 0.056) / 2, 0.012, 0.056, 0.056, 0.003, front - 0.0005, MECHANISM_DETAIL_COLOR)
            for (const hole of [-0.013, 0.013]) {
              add(left + MECHANISM_MODULE / 2 + hole - 0.004, 0.033, 0.008, 0.014, 0.004, front + 0.0005, MECHANISM_HOLE_COLOR)
            }
          }
        }
        parts.push({ key: v.id, boxes })
      }
    }
  }
  return parts
}

/** Un interruptor o enchufe: su placa y su detalle, como cajas lisas. */
function MechanismPiece({ part }: { part: { boxes: MechanismBox[] } }) {
  return (
    <>
      {part.boxes.map((b, i) => (
        <mesh key={i} position={b.position} castShadow receiveShadow>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={b.color} roughness={0.5} />
        </mesh>
      ))}
    </>
  )
}

// Píxeles por metro de la lámina de vinilos de la foto, y su lado máximo en píxeles.
const SHEET_DENSITY = 500
const SHEET_MAX = 2048
// Casi a ras de la pared: en el trazado no hay parpadeo entre superficies juntas, y
// con más separación se veía una línea de sombra en el borde de la lámina.
const SHEET_GAP = 0.0005

/**
 * Los vinilos de una cara de pared para la foto en calidad: una sola lámina
 * opaca, pintada del color de la pared con los vinilos encima, que sustituye a
 * la pared en ese recuadro. El trazador no ilumina igual la pared que se ve a
 * través de la parte transparente de un plano, y con un plano por vinilo
 * quedaba un recuadro alrededor de cada uno. Solo se deja transparente donde la
 * pared tiene un hueco, para que un vinilo pueda ir sobre una ventana.
 */
function VinylSheetPlane({ sheet, walls }: { sheet: VinylSheet; walls: Wall[] }) {
  const { box, holes, vinyls, room, side } = sheet
  const level = useLevel()
  const types = vinyls.map((v) => vinylType(v.typeId))
  const images = useLoader(
    TextureLoader,
    types.map((t) => t?.image ?? VINYLS[0].image),
  )
  const [width, height] = [box.x1 - box.x0, box.y1 - box.y0]
  const color = interiorColor(room, side)

  const texture = useMemo(() => {
    const scale = Math.min(SHEET_DENSITY, SHEET_MAX / width, SHEET_MAX / height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(width * scale)
    canvas.height = Math.ceil(height * scale)
    const ctx = canvas.getContext('2d')!
    // Se pinta el lienzo entero, en píxeles: su tamaño se redondea hacia arriba y
    // un último píxel a medio cubrir dejaba una línea oscura en el borde.
    ctx.fillStyle = color
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // De metros sobre la cara (y hacia arriba) a píxeles del lienzo (y hacia abajo).
    ctx.setTransform(canvas.width / width, 0, 0, -canvas.height / height, 0, 0)
    ctx.translate(-box.x0, -box.y1)
    for (const hole of holes) ctx.clearRect(hole.x0, hole.y0, hole.x1 - hole.x0, hole.y1 - hole.y0)
    vinyls.forEach((v, i) => {
      if (!types[i]) return
      ctx.save()
      ctx.translate(v.x + v.width / 2, v.y + v.height / 2)
      // Con la y hacia arriba el giro positivo es antihorario: el del vinilo es horario.
      ctx.rotate((-(v.rotation ?? 0) * Math.PI) / 180)
      // La imagen se dibuja con su y hacia abajo.
      ctx.scale(1, -1)
      ctx.drawImage(images[i].image as CanvasImageSource, -v.width / 2, -v.height / 2, v.width, v.height)
      ctx.restore()
    })
    const t = new CanvasTexture(canvas)
    t.colorSpace = SRGBColorSpace
    return t
  }, [sheet, images, color])
  useEffect(() => () => texture.dispose(), [texture])

  // La lámina se coloca como un vinilo más, del tamaño de su recuadro.
  const place = vinylPlacement(
    room,
    side,
    { x: box.x0, width },
    walls,
    SHEET_GAP,
  )
  if (!place) return null
  const y = level(room.id) + (box.y0 + box.y1) / 2
  return (
    <mesh
      position={place.horizontal ? [place.along, y, place.across] : [place.across, y, place.along]}
      rotation-y={VINYL_TURN[side]}
    >
      <planeGeometry args={[width, height]} />
      {/* Mismo material que la pared, para que no se note dónde acaba la lámina. */}
      <meshStandardMaterial map={texture} alphaTest={holes.length > 0 ? 0.5 : 0} />
    </mesh>
  )
}

/** Techo de una estancia, solo durante la foto: una losa con su acabado. */
function Ceiling({ room, level }: { room: PlacedModule; level: number }) {
  const finish = resolveFinish(room.ceiling, DEFAULT_CEILING)
  const position: [number, number, number] = [0, level + WALL_HEIGHT + CEILING / 2, 0]
  const size: [number, number, number] = [room.width, CEILING, room.depth]
  const plain = (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={finish.color} />
    </mesh>
  )
  if (!finish.texture) return plain
  return (
    <Suspense fallback={plain}>
      <TexturedBox position={position} size={size} url={finish.texture} scale={finish.size ?? [1, 1]} />
    </Suspense>
  )
}

// Suelo sin acabado de la estancia elegida.
const SELECTED_FLOOR_COLOR = '#b9cdb4'

/**
 * Suelo de una estancia: una lámina sobre la solera, a la altura `level`, con
 * la textura a escala real. Sin acabado, el color base; elegida, resaltado.
 */
function Floor({ room, level, selected }: { room: PlacedModule; level: number; selected: boolean }) {
  const finish = resolveFinish(floorOf(room), selected ? SELECTED_FLOOR_COLOR : BASE_FLOOR.color)
  return (
    // El nombre viaja en el GLB: Blender pone el techo sobre los suelos.
    <mesh name="Suelo" rotation-x={-Math.PI / 2} position-y={level + 0.003} receiveShadow>
      <planeGeometry args={[room.width, room.depth]} />
      {finish.texture ? (
        <FloorTexture room={room} url={finish.texture} size={finish.size ?? [1, 1]} />
      ) : (
        <meshStandardMaterial color={finish.color} />
      )}
    </mesh>
  )
}

/** Terreno de toda la parcela, con su acabado (césped si no tiene). */
function Ground({ finish }: { finish?: Finish }) {
  const { color, texture, size } = resolveFinish(finish, DEFAULT_GROUND)
  const plain = <meshStandardMaterial color={color} />
  return (
    <mesh name="Terreno" rotation-x={-Math.PI / 2} position={[PLOT.width / 2, 0, PLOT.depth / 2]} receiveShadow>
      <planeGeometry args={[PLOT.width, PLOT.depth]} />
      {texture ? (
        <Suspense fallback={plain}>
          <FloorTexture room={PLOT} url={texture} size={size ?? [1, 1]} />
        </Suspense>
      ) : (
        plain
      )}
    </mesh>
  )
}

// Tejado y hastiales, colores fijos de momento (no se elige su acabado).
const ROOF_COLOR = '#5b5f66'
/** Cara de abajo del tejado, la que se ve desde dentro (lo pidió el usuario). */
const ROOF_UNDER_COLOR = '#ffffff'

/**
 * Una sección (u, h) del tejado extruida a lo largo de su eje, desde `from`
 * hasta `to` del plano, a la altura `base`. Con el eje en x, la sección se
 * dibuja en espejo y se gira 90°, para que `u` caiga en la z del plano. Con
 * `under`, las caras que miran hacia abajo llevan ese color; va por vértice,
 * como en las paredes, porque el trazador de la foto no admite varios
 * materiales en una malla.
 */
function RoofPrism({
  name,
  profile,
  axis,
  from,
  to,
  base,
  color,
  under = color,
}: {
  name: string
  profile: ProfilePoint[]
  axis: 'x' | 'y'
  from: number
  to: number
  base: number
  color: string
  under?: string
}) {
  const geometry = useMemo(() => {
    const shape = new Shape(profile.map(([u, h]) => new Vector2(axis === 'x' ? -u : u, h)))
    const g = new ExtrudeGeometry(shape, { depth: to - from, bevelEnabled: false })
    // Girar alrededor del eje vertical no cambia qué cara mira hacia abajo.
    const normals = g.getAttribute('normal')
    const top = [...new Color(color).toArray(), 1]
    const bottom = [...new Color(under).toArray(), 1]
    const colors: number[] = []
    for (let i = 0; i < normals.count; i += 3) {
      const down = normals.getY(i) + normals.getY(i + 1) + normals.getY(i + 2) < -0.03
      for (let k = 0; k < 3; k++) colors.push(...(down ? bottom : top))
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 4))
    return g
  }, [profile, axis, from, to, color, under])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh
      name={name}
      geometry={geometry}
      position={axis === 'x' ? [from, base, 0] : [0, base, from]}
      rotation-y={axis === 'x' ? Math.PI / 2 : 0}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial vertexColors roughness={0.8} />
    </mesh>
  )
}

/**
 * Tejado de un módulo, a un agua o a dos aguas, apoyado en lo alto de las
 * paredes, con los hastiales que cierran los extremos y, a un agua, la pared
 * alta subida hasta él.
 */
function RoofOf({ shell }: { shell: Shell }) {
  const layout = useMemo(() => roofLayout(shell), [shell])
  const base = slabOf(shell).height + WALL_HEIGHT
  const [a, b] = layout.along
  const o = layout.overhang
  return (
    <group>
      <RoofPrism name="Tejado" profile={layout.roof} axis={layout.axis} from={a - o} to={b + o} base={base} color={ROOF_COLOR} under={ROOF_UNDER_COLOR} />
      <RoofPrism name="Hastial" profile={layout.gable} axis={layout.axis} from={a} to={a + GABLE_THICKNESS} base={base} color={FACADE_COLOR} />
      <RoofPrism name="Hastial" profile={layout.gable} axis={layout.axis} from={b - GABLE_THICKNESS} to={b} base={base} color={FACADE_COLOR} />
      {layout.strip && (
        <RoofPrism name="Hastial" profile={layout.strip} axis={layout.axis} from={a} to={b} base={base} color={FACADE_COLOR} />
      )}
    </group>
  )
}

/**
 * Solera de un módulo: una losa de hormigón del grosor de la solera, que
 * sobresale del módulo por los cuatro lados.
 */
function Slab({ shell }: { shell: Shell }) {
  const r = slabRect(shell)
  const { height } = slabOf(shell)
  return (
    <mesh name="Solera" position={[r.x + r.width / 2, height / 2, r.y + r.depth / 2]} castShadow receiveShadow>
      <boxGeometry args={[r.width, height, r.depth]} />
      <meshStandardMaterial color={SLAB_COLOR} roughness={0.9} />
    </mesh>
  )
}

interface FloorTextureProps {
  room: Pick<PlacedModule, 'width' | 'depth' | 'floorTurned'>
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

/**
 * Descarga la casa como `.glb` para llevarla a Blender. Exporta lo que cuelga del
 * grupo "casa" tal como está dibujado (metros, plano (x, y) como (x, z), esquina de la
 * parcela en el origen). Los focos van como discos emisivos: la luz la pone Blender.
 */
function GlbExport({ onDone }: { onDone: (message: string) => void }) {
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const run = async ({ sendTo, done }: GlbRequest) => {
      const house = scene.getObjectByName('casa')
      if (!house) {
        done?.({ ok: false, error: 'No hay casa que exportar.' })
        return onDone('No hay casa que exportar.')
      }
      try {
        const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js')
        const glb = await new GLTFExporter().parseAsync(house.children, { binary: true })
        if (sendTo) {
          // Directo a quien lo espera (Blender), sin pantalla de descarga. El
          // cuerpo sin tipo evita la consulta previa de CORS en lo posible.
          const bytes = (glb as ArrayBuffer).byteLength
          try {
            const res = await fetch(sendTo, { method: 'POST', body: new Blob([glb as ArrayBuffer]) })
            if (!res.ok) throw new Error(`respuesta ${res.status}`)
            done?.({ ok: true, bytes })
            return onDone('GLB enviado')
          } catch (e) {
            done?.({ ok: false, error: `No se pudo enviar a ${sendTo}: ${e instanceof Error ? e.message : e}` })
            return onDone('No se pudo enviar el GLB')
          }
        }
        const link = document.createElement('a')
        link.href = URL.createObjectURL(new Blob([glb as ArrayBuffer], { type: 'model/gltf-binary' }))
        const named = fileSlug(houseName(useHouse.getState().houseName)) || 'casa'
        link.download = `configuradorcasa-${named}-${new Date().toISOString().slice(0, 10)}.glb`
        link.click()
        setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
        done?.({ ok: true, bytes: (glb as ArrayBuffer).byteLength })
        onDone('GLB descargado')
      } catch (e) {
        done?.({ ok: false, error: `No se pudo exportar: ${e instanceof Error ? e.message : e}` })
        onDone(`No se pudo exportar: ${e instanceof Error ? e.message : e}`)
      }
    }
    const listener = (e: Event) => void run((e as CustomEvent<GlbRequest>).detail ?? {})
    window.addEventListener(GLB_EVENT, listener)
    return () => window.removeEventListener(GLB_EVENT, listener)
  }, [scene, onDone])
  return null
}

export default function View3D() {
  const modules = useHouse((s) => s.modules)
  const shells = useHouse((s) => s.shells)
  const ground = useHouse((s) => s.ground)
  const level = useLevel()
  const selectedId = useHouse((s) => s.selectedId)
  const openings = useHouse((s) => s.openings)
  const joints = useHouse((s) => s.joints)
  const furniture = useHouse((s) => s.furniture)
  const selectedFurnitureId = useHouse((s) => s.selectedFurnitureId)
  // Realidad aumentada: de qué manera se entró y si hay una sesión en marcha.
  const [xrMode, setXrMode] = useState<'vr' | 'ar'>('vr')
  const xrSession = useSyncExternalStore(
    (listener) => xrStore.subscribe(listener),
    () => xrStore.getState().session,
  )
  const ar = xrSession != null && xrMode === 'ar'
  // Lo que ocupa la casa en la parcela: su centro y sus medidas, para la maqueta.
  // Con las soleras, que sobresalen de los módulos.
  const footprint = useMemo(() => {
    const rects = [...modules, ...shells.map(slabRect)]
    if (rects.length === 0) return { cx: PLOT.width / 2, cy: PLOT.depth / 2, w: 1, d: 1 }
    const x0 = Math.min(...rects.map((m) => m.x))
    const y0 = Math.min(...rects.map((m) => m.y))
    const x1 = Math.max(...rects.map((m) => m.x + m.width))
    const y1 = Math.max(...rects.map((m) => m.y + m.depth))
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, d: y1 - y0 }
  }, [modules, shells])
  const parts = useMemo(
    () => wallParts(modules, joints, openings, FACADE_COLOR, level),
    [modules, joints, openings, level],
  )
  const skirtings = useMemo(
    () => skirtingParts(modules, joints, openings, level),
    [modules, joints, openings, level],
  )
  const vinyls = useMemo(() => vinylParts(modules, joints, level), [modules, joints, level])
  const mirrors = useMemo(() => mirrorParts(modules, joints, level), [modules, joints, level])
  const boards = useMemo(() => boardParts(modules, joints, level), [modules, joints, level])
  const mechanisms = useMemo(() => mechanismParts(modules, joints, level), [modules, joints, level])
  const walls = useMemo(() => deriveWalls(modules, joints), [modules, joints])
  const vinylSheetList = useMemo(
    () => vinylSheets(modules, walls, openings),
    [modules, walls, openings],
  )
  const joinery = useMemo(
    () => joineryParts(modules, joints, openings),
    [modules, joints, openings],
  )
  // Las hojas de las puertas abatibles van aparte, cada una con sus piezas: giran.
  const doorLeaves = useMemo(() => {
    const leaves = new Map<string, { axis: DoorLeafAxis; parts: JoineryPart[] }>()
    for (const part of joinery) {
      if (!part.leaf) continue
      const leaf = leaves.get(part.leaf.opening) ?? { axis: part.leaf, parts: [] }
      leaf.parts.push(part)
      leaves.set(part.leaf.opening, leaf)
    }
    return [...leaves.values()]
  }, [joinery])
  // En VR y en la maqueta AR las puertas se abren y cierran apuntándolas; en
  // VR, además, se salta a los puntos del suelo.
  const xrDoors = xrSession != null
  const vrJumps = xrSession != null && xrMode === 'vr'
  const jumps = useMemo(
    () => (vrJumps ? teleportPoints(modules, joints, openings, furniture) : []),
    [vrJumps, modules, joints, openings, furniture],
  )

  // Foto en calidad: trazado de rayos sobre esta misma escena, con un
  // techo que solo existe mientras dura la foto. La luz la dan los focos de cada
  // estancia, el sol y el cielo.
  const cameraFov = useHouse((s) => s.cameraFov)
  const setCameraFov = useHouse((s) => s.setCameraFov)
  const detailedFurniture = useHouse((s) => s.detailedFurniture)
  const setDetailedFurniture = useHouse((s) => s.setDetailedFurniture)
  const showRoofs = useHouse((s) => s.showRoofs)
  const setShowRoofs = useHouse((s) => s.setShowRoofs)
  const photoSamples = useHouse((s) => s.photoSamples)
  const setPhotoSamples = useHouse((s) => s.setPhotoSamples)
  const [photo, setPhoto] = useState(false)
  // Filtro de ruido: se elige con la foto ya terminada, y se guarda la que se esté viendo.
  const [filter, setFilter] = useState(false)
  const [samples, setSamples] = useState(0)
  // Hasta la primera muestra no se ve avance (la primera vez tarda bastante): se avisa.
  const [waiting, setWaiting] = useState(false)
  const saveRequest = useRef(false)
  // Aviso breve de que la foto ya está en Fotos, al volver a la vista normal.
  const [saved, setSaved] = useState('')
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(''), 4000)
    return () => clearTimeout(timer)
  }, [saved])
  const startPhoto = () => {
    setSamples(0)
    setSaved('')
    setWaiting(true)
    setFilter(false)
    setPhoto(true)
  }
  // La foto pedida desde fuera de la interfaz (`hacerFoto` en api.ts) empieza igual que con el botón.
  useEffect(() => {
    window.addEventListener(PHOTO_EVENT, startPhoto)
    return () => window.removeEventListener(PHOTO_EVENT, startPhoto)
  }, [])
  // Repetir una foto (panel Fotos): la cámara ya va hacia su sitio y se traza sola
  // hasta el final; entonces se pregunta si sustituye a la anterior. Si se
  // cancela, se vuelve a la vista normal.
  const retakeId = usePhotos((s) => s.retakeId)
  // Con la cámara en el sitio y el objetivo de una foto guardada se ofrece repetirla
  // desde aquí: vale también en la ventana de la vista 3D sola, que recibe la pose
  // cuando en la otra se pasa a esa foto.
  const photos = usePhotos((s) => s.photos)
  const cameraPose = useHouse((s) => s.cameraPose)
  const hereIndex = photos.findIndex(
    (p) =>
      p.fov === cameraFov &&
      !!cameraPose &&
      Math.abs(Math.sin((p.pose.yaw - cameraPose.yaw) / 2)) < 1e-4 &&
      Math.abs(p.pose.pitch - cameraPose.pitch) < 1e-4 &&
      p.pose.position.every((v, i) => Math.abs(v - cameraPose.position[i]) < 1e-3),
  )
  const retaking = useRef(false)
  useEffect(() => {
    if (retakeId) {
      startPhoto()
      // La que se guardó filtrada sale filtrada de entrada; se puede cambiar al terminar.
      setFilter(!!usePhotos.getState().photos.find((p) => p.id === retakeId)?.filtered)
    } else if (retaking.current) setPhoto(false)
    retaking.current = retakeId !== null
  }, [retakeId])
  const onProgress = (done: number) => {
    setSamples(done)
    if (done > 0) setWaiting(false)
  }
  // Guardada la foto se vuelve a la vista normal: el trazado no tiene por qué seguir.
  const onSave = async (image: Blob, shot: Shot) => {
    const photos = usePhotos.getState()
    if (photos.retakeId) await photos.replace(photos.retakeId, image, shot)
    else await photos.add(image, shot)
    setPhoto(false)
    setSaved(photos.retakeId ? 'Foto repetida' : 'Foto guardada en Fotos')
  }

  return (
    <div className="view3d-wrap">
      <div className="photo-bar">
        {photo ? (
          <>
            <span>
              {waiting
                ? 'Preparando la foto…'
                : samples < photoSamples
                ? `${retakeId ? 'Repitiendo la foto' : 'Foto'}: ${samples} / ${photoSamples} muestras`
                : 'Foto terminada'}
            </span>
            <button disabled={waiting} onClick={() => (saveRequest.current = true)}>
              Guardar foto
            </button>
            <button
              onClick={() => {
                usePhotos.getState().cancelRetake()
                setPhoto(false)
              }}
            >
              {retakeId ? 'Cancelar' : 'Volver'}
            </button>
          </>
        ) : (
          <>
            <button onClick={startPhoto}>Foto en calidad</button>
            <button
              title="Ver la casa con unas gafas de realidad virtual (Quest)"
              onClick={() => {
                setXrMode('vr')
                xrStore.enterVR().then(
                  (session) => {
                    if (!session) setSaved('Este navegador no permite VR: ábrelo en el de las Quest.')
                  },
                  () => setSaved('No se ha podido entrar en VR.'),
                )
              }}
            >
              Entrar en VR
            </button>
            <button
              title="Ver la casa como una maqueta sobre tu mesa, con el paso de cámara de las Quest 3"
              onClick={() => {
                setXrMode('ar')
                xrStore.enterAR().then(
                  (session) => {
                    if (!session) setSaved('Este navegador no permite AR: ábrelo en el de las Quest 3.')
                  },
                  () => setSaved('No se ha podido entrar en AR.'),
                )
              }}
            >
              Maqueta AR
            </button>
            <button
              title="Descarga la casa como archivo .glb para abrirla en Blender"
              onClick={() => window.dispatchEvent(new Event(GLB_EVENT))}
            >
              Descargar GLB
            </button>
            {hereIndex >= 0 && (
              <>
                <button
                  title="Abre la foto guardada desde este sitio"
                  onClick={() => usePhotos.getState().open(photos[hereIndex].id)}
                >
                  Ver foto {hereIndex + 1}
                </button>
                <button
                  title="Vuelve a sacarla desde aquí, con el tamaño de esta vista, y sustituye a la anterior"
                  onClick={() => usePhotos.getState().retake(photos[hereIndex].id)}
                >
                  Repetir foto {hereIndex + 1}
                </button>
              </>
            )}
          </>
        )}
        {saved && <span>{saved}</span>}
        <div className="lens-toggle" title="Tejado de los módulos: quítalo para mirar la casa por dentro desde arriba">
          <button className={showRoofs ? 'active' : ''} onClick={() => setShowRoofs(true)}>
            Con tejado
          </button>
          <button className={showRoofs ? '' : 'active'} onClick={() => setShowRoofs(false)}>
            Sin tejado
          </button>
        </div>
        <div
          className="lens-toggle"
          title="Muebles: sencillos (cajas, más ligeros) o detallados (los que tienen modelo hecho en Blender)"
        >
          <button className={detailedFurniture ? '' : 'active'} onClick={() => setDetailedFurniture(false)}>
            Sencillos
          </button>
          <button className={detailedFurniture ? 'active' : ''} onClick={() => setDetailedFurniture(true)}>
            Detallados
          </button>
        </div>
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
        <div
          className="lens-toggle"
          title="Muestras de la foto en calidad: con más, menos grano y más espera"
        >
          {PHOTO_SAMPLES.map((n) => (
            <button
              key={n}
              className={photoSamples === n ? 'active' : ''}
              onClick={() => setPhotoSamples(n)}
            >
              {n}
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
      {/* Terminada la foto se pregunta si se guarda o, al repetir una, si sustituye a la anterior. */}
      {photo && !waiting && samples >= photoSamples && (
        <div className="photo-wait photo-ask">
          <strong>{retakeId ? '¿Sustituir la foto anterior?' : '¿Guardar la foto?'}</strong>
          <div
            className="lens-toggle"
            title="El filtro quita el grano. Se guarda la que se esté viendo"
          >
            <button className={filter ? '' : 'active'} onClick={() => setFilter(false)}>
              Sin filtro
            </button>
            <button className={filter ? 'active' : ''} onClick={() => setFilter(true)}>
              Con filtro
            </button>
          </div>
          <div className="actions">
            <button onClick={() => (saveRequest.current = true)}>
              {retakeId ? 'Sustituir la foto' : 'Guardar en Fotos'}
            </button>
            <button
              onClick={() => {
                usePhotos.getState().cancelRetake()
                setPhoto(false)
              }}
            >
              {retakeId ? 'No sustituir' : 'No guardar'}
            </button>
          </div>
        </div>
      )}
    <Canvas shadows camera={{ position: [20, 22, 34], fov: 45 }}>
      {/* En AR no hay fondo: se ve la habitación real. */}
      {!ar && <color attach="background" args={['#e6edf1']} />}
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[14, 26, 10]}
        intensity={1.8}
        castShadow={!ar}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-22}
        shadow-camera-right={22}
        shadow-camera-top={22}
        shadow-camera-bottom={-22}
      />

      {/* El plano (x, y) pasa a ser el suelo (x, z), con la parcela centrada en el origen. */}
      {/* En AR la casa va sobre su mesa, centrada en ella y sin el césped de la parcela. */}
      <ARTable enabled={ar} size={[footprint.w, footprint.d]}>
      <group
        name="casa"
        position={ar ? [-footprint.cx, 0, -footprint.cy] : [-PLOT.width / 2, 0, -PLOT.depth / 2]}
        // En VR y AR, todo lo de la casa para el rayo del mando: así no se coge una
        // puerta que esté detrás de una pared.
        pointerEvents={xrDoors ? 'auto' : undefined}
      >
        {!ar && <Ground finish={ground} />}

        {/* Cada módulo se apoya en su solera; también uno sin estancias. */}
        {shells.map((sh) => (
          <Slab key={sh.id} shell={sh} />
        ))}
        {/* Tejado de cada módulo; el botón "Sin tejado" lo quita para mirar por dentro. */}
        {showRoofs && shells.map((sh) => <RoofOf key={sh.id} shell={sh} />)}

        {modules.map((m) => (
          <group key={m.id} position={[m.x + m.width / 2, 0, m.y + m.depth / 2]}>
            {/* Estancia sin módulo (planos antiguos): la losa de antes, bajo ella sola. */}
            {!shells.some((sh) => sh.id === m.shellId) && (
              <mesh position-y={DEFAULT_SLAB_HEIGHT / 2} castShadow receiveShadow>
                <boxGeometry args={[m.width, DEFAULT_SLAB_HEIGHT, m.depth]} />
                <meshStandardMaterial color={SLAB_COLOR} roughness={0.9} />
              </mesh>
            )}
            {photo && !m.noCeiling && <Ceiling room={m} level={level(m.id)} />}
            {/* Focos del techo: la pieza se ve siempre; alumbran solo en la foto. */}
            {(m.lights ?? []).map((l) => (
              <group
                key={l.id}
                position={[l.x - m.width / 2, level(m.id) + WALL_HEIGHT, l.y - m.depth / 2]}
              >
                <mesh position-y={-0.005}>
                  <cylinderGeometry args={[LIGHT_SIZE / 2, LIGHT_SIZE / 2, 0.01, 24]} />
                  <meshStandardMaterial color="#ffffff" emissive={lightColor(l)} />
                </mesh>
                {photo && (
                  <rectAreaLight
                    position-y={-0.015}
                    rotation-x={-Math.PI / 2}
                    width={LIGHT_SIZE}
                    height={LIGHT_SIZE}
                    color={lightColor(l)}
                    intensity={(LIGHT_INTENSITY * l.power) / 100}
                  />
                )}
              </group>
            ))}
            <Suspense fallback={null}>
              <Floor room={m} level={level(m.id)} selected={m.id === selectedId && !photo} />
            </Suspense>
          </group>
        ))}

        {furniture.map((item) => (
          <Furniture3D
            key={item.id}
            item={item}
            floorY={item.roomId ? level(item.roomId) : levelAt(shells, item.x, item.y)}
            selected={item.id === selectedFurnitureId && !photo}
          />
        ))}

        {/* Sin techo. Las paredes son de la casa, no de cada estancia. */}
        {parts.map((part, i) => (
          <WallBox key={i} part={part} />
        ))}
        {/* Paredes con material: la textura va en una lámina sobre la cara. */}
        {parts.flatMap((part, i) =>
          part.skins.map((skin, j) => (
            <Suspense key={`${i}:${j}`} fallback={null}>
              <WallSkinPlane skin={skin} />
            </Suspense>
          )),
        )}
        {/* Carpintería de puertas y ventanas: cercos, hojas, cristales y manillas. */}
        {joinery.map((part, i) => !part.leaf && <JoineryBox key={i} part={part} />)}
        {doorLeaves.map(({ axis, parts }) => (
          <DoorLeaf
            key={axis.opening}
            axis={axis}
            parts={parts}
            animate={!photo}
            interactive={xrDoors}
          />
        ))}
        {/* Puntos de salto de la VR. */}
        {jumps.map((point) => (
          <TeleportMarker key={point.key} point={point} />
        ))}
        {/* Vinilos: un plano por cada uno; en la foto, una lámina por cara de pared. */}
        {photo
          ? vinylSheetList.map((sheet) => (
              <Suspense key={sheet.key} fallback={null}>
                <VinylSheetPlane sheet={sheet} walls={walls} />
              </Suspense>
            ))
          : vinyls.map((part) => (
              <Suspense key={part.key} fallback={null}>
                <VinylPlane part={part} />
              </Suspense>
            ))}
        {mirrors.map((part) => (
          <MirrorPiece key={part.key} part={part} photo={photo} />
        ))}
        {boards.map((part) => (
          <BoardBox key={part.key} part={part} />
        ))}
        {mechanisms.map((part) => (
          <MechanismPiece key={part.key} part={part} />
        ))}
        {skirtings.map((part, i) => (
          <mesh key={i} position={part.position} receiveShadow>
            <boxGeometry args={part.size} />
            <meshStandardMaterial color={part.color} roughness={0.6} />
          </mesh>
        ))}
      </group>
      </ARTable>

      <GlbExport onDone={setSaved} />

      <XR store={xrStore}>
        <VRRig ar={ar} />
        <DesktopControls />
      </XR>
      {photo && (
        <PhotoTracer
          // Al repetir se empieza de cero aunque ya hubiera una foto terminada a la vista.
          key={retakeId ?? 'libre'}
          revision={[modules, shells, showRoofs, parts, skirtings, joinery, furniture, vinyls, mirrors, boards, mechanisms]}
          goal={photoSamples}
          filter={filter}
          onProgress={onProgress}
          saveRequest={saveRequest}
          onSave={(image, shot) => void onSave(image, shot)}
        />
      )}
    </Canvas>
    </div>
  )
}
