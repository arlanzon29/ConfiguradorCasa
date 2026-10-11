import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  PerspectiveCamera,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
} from 'three'
import {
  DEFAULT_JOINERY_FINISH,
  DEFAULT_WALL_COLOR,
  floorFinish,
  interiorColor,
  resolveFinish,
} from '../model/finishes'
import { PLOT, PlacedModule, SIDES, Side, WALL_HEIGHT } from '../model/house'
import { MIRROR_THICKNESS } from '../model/mirrors'
import { VINYLS, VinylSheet, vinylPlacement, vinylSheets, vinylType } from '../model/vinyls'
import { OPPOSITE, Opening } from '../model/openings'
import { Joints, Wall, deriveWalls, openingsOf, wallAcross } from '../model/walls'
import { Shot, usePhotos } from '../photos'
import { LENSES, PHOTO_SAMPLES, cameraFlying, samePose, stopCameraFlight, useHouse } from '../store'
import Furniture3D from './Furniture3D'
import { JoineryMaterial, JoineryPart, joineryParts } from './joinery'
import PhotoTracer from './PhotoTracer'

// Grosor de la losa, en metros.
const SLAB = 0.2
// Techo y panel de luz provisionales de la foto en calidad: grosor y lado, en metros.
const CEILING = 0.1
const CEILING_LIGHT = 0.6
// Lo que sobresale el rodapié de la pared, en metros.
const SKIRTING_DEPTH = 0.012
// La fachada aún no es configurable (dependerá del aislante y del revestimiento).
const FACADE_COLOR = DEFAULT_WALL_COLOR

// Piezas de carpintería que no llevan el acabado del hueco.
const JOINERY_MATERIALS: Record<Exclude<JoineryMaterial, 'wood'>, object> = {
  glass: { color: '#9fc6dd', transparent: true, opacity: 0.35 },
  metal: { color: '#8d9196', roughness: 0.35, metalness: 0.8 },
}

interface WallPart {
  position: [number, number, number]
  size: [number, number, number]
  /** Color de cada cara de la caja, en el orden de BoxGeometry: +x, -x, +y, -y, +z, -z. */
  faces: string[]
}

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

    const add = (from: number, to: number, bottom: number, top: number) => {
      if (to - from < 1e-3 || top - bottom < 1e-3) return
      const along = to - from
      const mid = (from + to) / 2
      const across = wall.thickness
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
              faces: [endHigh, endLow, neutral, neutral, high, low],
            }
          : {
              position: [axis, y, mid],
              size: [across, top - bottom, along],
              faces: [high, low, neutral, neutral, endHigh, endLow],
            },
      )
    }

    let cursor = wall.from
    for (const { opening: o, from, to } of openingsOf(wall, modules, walls, openings)) {
      add(cursor, from, 0, WALL_HEIGHT)
      add(from, to, 0, o.sill)
      add(from, to, o.sill + o.height, WALL_HEIGHT)
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
function skirtingParts(modules: PlacedModule[], joints: Joints, openings: Opening[]) {
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
      const y = SLAB + height / 2
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

/**
 * Pieza de carpintería. El cristal y la manilla son fijos; cerco y hojas llevan
 * el acabado de su hueco, que es un color liso o un material con textura.
 */
function JoineryBox({ part }: { part: JoineryPart }) {
  const position: [number, number, number] = [
    part.position[0],
    SLAB + part.position[1],
    part.position[2],
  ]
  if (part.material !== 'wood') {
    return (
      <mesh position={position} receiveShadow={part.material === 'metal'}>
        <boxGeometry args={part.size} />
        <meshStandardMaterial {...JOINERY_MATERIALS[part.material]} />
      </mesh>
    )
  }
  const finish = resolveFinish(part.finish, DEFAULT_JOINERY_FINISH)
  const plain = (
    <mesh position={position} receiveShadow>
      <boxGeometry args={part.size} />
      <meshStandardMaterial color={finish.color} roughness={0.55} />
    </mesh>
  )
  if (!finish.texture) return plain
  return (
    <Suspense fallback={plain}>
      <TexturedBox position={position} size={part.size} url={finish.texture} scale={finish.size ?? [1, 1]} />
    </Suspense>
  )
}

interface TexturedBoxProps {
  position: [number, number, number]
  size: [number, number, number]
  url: string
  /** Metros reales que cubre la imagen. */
  scale: [number, number]
}

/** Caja con una textura a escala real en sus seis caras. */
function TexturedBox({ position, size, url, scale }: TexturedBoxProps) {
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
    <mesh position={position} geometry={geometry} receiveShadow>
      <meshStandardMaterial map={texture} roughness={0.7} />
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
function vinylParts(modules: PlacedModule[], joints: Joints) {
  const walls = deriveWalls(modules, joints)
  const parts: VinylPart[] = []
  for (const room of modules) {
    for (const side of SIDES) {
      for (const v of room.vinyls?.[side] ?? []) {
        const type = vinylType(v.typeId)
        const place = vinylPlacement(room, side, v, walls)
        if (!type || !place) continue
        const y = SLAB + v.y + v.height / 2
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
function mirrorParts(modules: PlacedModule[], joints: Joints) {
  const walls = deriveWalls(modules, joints)
  const parts: MirrorPart[] = []
  for (const room of modules) {
    for (const side of SIDES) {
      for (const v of room.mirrors?.[side] ?? []) {
        const body = vinylPlacement(room, side, v, walls, MIRROR_THICKNESS / 2)
        const front = vinylPlacement(room, side, v, walls, MIRROR_THICKNESS + MIRROR_GAP)
        if (!body || !front) continue
        const y = SLAB + v.y + v.height / 2
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
  const y = SLAB + (box.y0 + box.y1) / 2
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
  const skirtings = useMemo(
    () => skirtingParts(modules, joints, openings),
    [modules, joints, openings],
  )
  const vinyls = useMemo(() => vinylParts(modules, joints), [modules, joints])
  const mirrors = useMemo(() => mirrorParts(modules, joints), [modules, joints])
  const walls = useMemo(() => deriveWalls(modules, joints), [modules, joints])
  const vinylSheetList = useMemo(
    () => vinylSheets(modules, walls, openings),
    [modules, walls, openings],
  )
  const joinery = useMemo(
    () => joineryParts(modules, joints, openings),
    [modules, joints, openings],
  )

  // Foto en calidad: trazado de rayos sobre esta misma escena, con un
  // techo y una luz de techo por estancia que solo existen mientras dura la foto.
  const cameraFov = useHouse((s) => s.cameraFov)
  const setCameraFov = useHouse((s) => s.setCameraFov)
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
  // Repetir una foto (panel Fotos): la cámara ya va hacia su sitio; se traza sola
  // hasta el final y sustituye a la anterior. Si se cancela, se vuelve a la vista normal.
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
      // La que se guardó filtrada se repite filtrada.
      setFilter(!!usePhotos.getState().photos.find((p) => p.id === retakeId)?.filtered)
    } else if (retaking.current) setPhoto(false)
    retaking.current = retakeId !== null
  }, [retakeId])
  const onProgress = (done: number) => {
    setSamples(done)
    if (done > 0) setWaiting(false)
    if (done >= useHouse.getState().photoSamples && usePhotos.getState().retakeId) {
      saveRequest.current = true
    }
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
            {hereIndex >= 0 && (
              <button
                title="Vuelve a sacarla desde aquí, con el tamaño de esta vista, y sustituye a la anterior"
                onClick={() => usePhotos.getState().retake(photos[hereIndex].id)}
              >
                Repetir foto {hereIndex + 1}
              </button>
            )}
          </>
        )}
        {saved && <span>{saved}</span>}
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
      {/* Terminada la foto se pregunta si se guarda. Al repetir una no: sustituye sola. */}
      {photo && !waiting && !retakeId && samples >= photoSamples && (
        <div className="photo-wait photo-ask">
          <strong>¿Guardar la foto?</strong>
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
              Guardar en Fotos
            </button>
            <button onClick={() => setPhoto(false)}>No guardar</button>
          </div>
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
        {parts.map((part, i) => (
          <WallBox key={i} part={part} />
        ))}
        {/* Carpintería de puertas y ventanas: cercos, hojas, cristales y manillas. */}
        {joinery.map((part, i) => (
          <JoineryBox key={i} part={part} />
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
        {skirtings.map((part, i) => (
          <mesh key={i} position={part.position} receiveShadow>
            <boxGeometry args={part.size} />
            <meshStandardMaterial color={part.color} roughness={0.6} />
          </mesh>
        ))}
      </group>

      <FirstPersonControls />
      {photo && (
        <PhotoTracer
          // Al repetir se empieza de cero aunque ya hubiera una foto terminada a la vista.
          key={retakeId ?? 'libre'}
          revision={[modules, parts, skirtings, joinery, furniture, vinyls, mirrors]}
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
