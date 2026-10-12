import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  FurnitureItem,
  Rotation,
  clampFurniture,
  furnitureType,
} from './model/furniture'
import {
  MAX_SHELLS,
  PLOT,
  PlacedModule,
  SHELL_MAX_LONG,
  SHELL_MAX_SHORT,
  Shell,
  Side,
  Skirting,
  WALL_HEIGHT,
  clampInto,
  clampToPlot,
  contains,
  findFreeSpot,
  fits,
  formatMeters,
  roundSize,
  shellFits,
  validShellSize,
  wallThickness,
} from './model/house'
import {
  OPENING_CATALOG,
  Opening,
  rotateOpening,
  validOpeningSize,
  wallLine,
} from './model/openings'
import { Plan } from './model/planFile'
import type { PieceKind } from './model/names'
import {
  DEFAULT_LIGHT,
  LIGHT_MARGIN,
  RoomLight,
  firstLight,
  lightProblem,
  turnLights,
} from './model/lights'
import { Board, BoardPose, DEFAULT_BOARD, boardProblem, boardReach, posedBoard } from './model/boards'
import { DEFAULT_MIRROR, Mirror } from './model/mirrors'
import { Vinyl, vinylProblem, vinylType, wallFace } from './model/vinyls'
import { JointSettings, Joints, Wall, deriveWalls, fitOpening, pairKey, refitOpenings, wallOf } from './model/walls'

/** Cámara de la vista 3D, en coordenadas de la escena (metros, parcela centrada en el origen). */
export interface CameraPose {
  position: [number, number, number]
  /** Giro horizontal en radianes; 0 mira hacia -z (arriba en el plano). */
  yaw: number
  pitch: number
}

export const samePose = (a: CameraPose | null, b: CameraPose | null) =>
  a === b ||
  (!!a &&
    !!b &&
    a.yaw === b.yaw &&
    a.pitch === b.pitch &&
    a.position.every((v, i) => v === b.position[i]))

// Vuelo de la cámara hacia una pose (`flyCamera`): duración y fotograma pendiente.
const FLIGHT_MS = 1200
let flight = 0

export const cameraFlying = () => flight !== 0

/** Corta el vuelo de la cámara donde esté: en cuanto el usuario la mueve a mano. */
export function stopCameraFlight() {
  cancelAnimationFrame(flight)
  flight = 0
}

/**
 * Objetivos de la cámara 3D. Las estancias son pequeñas: con el normal, desde
 * dentro solo se ve una esquina; los angulares abarcan más a costa de deformar
 * los bordes.
 */
/**
 * Muestras por píxel entre las que se elige para la foto en calidad: con más,
 * menos grano y más espera.
 */
export const PHOTO_SAMPLES = [50, 100, 200]

/** Lo que el usuario puede quitar de la vista en el plano 2D. */
export const PLAN_LAYERS = [
  { id: 'furniture', name: 'Mobiliario' },
  { id: 'camera', name: 'Cámara' },
  { id: 'grid', name: 'Rejilla' },
] as const
export type PlanLayer = (typeof PLAN_LAYERS)[number]['id']
const ALL_PLAN_LAYERS: Record<PlanLayer, boolean> = { furniture: true, camera: true, grid: true }

export const LENSES = [
  { name: 'Normal', fov: 45 },
  { name: 'Angular', fov: 60 },
  { name: 'Gran angular', fov: 75 },
]

/**
 * Modo del editor: decide qué se selecciona en el plano y qué muestran el panel
 * izquierdo (lo que se añade) y el derecho (los datos de lo seleccionado).
 */
// Qué clase de cosa se está tocando. No hay pestañas: lo decide lo que se elige en
// el árbol de la casa o en el plano (`pick`).
export type Mode = 'shells' | 'modules' | 'walls' | 'options' | 'photos'

type Selection = Pick<
  HouseState,
  | 'selectedId'
  | 'selectedWall'
  | 'selectedOpeningId'
  | 'selectedSide'
  | 'selectedLightId'
  | 'selectedPiece'
  | 'selectedFurnitureId'
  | 'selectedShellId'
>

interface HouseState {
  /** Estancias: los rectángulos del plano. Las paredes se deducen de sus bordes (walls.ts). */
  modules: PlacedModule[]
  /**
   * Módulos de fábrica: el contorno de la casa. Si hay alguno, las estancias
   * tienen que caber dentro de uno de ellos. Los planos anteriores a este
   * límite no tienen ninguno y siguen sin restricción.
   */
  shells: Shell[]
  selectedShellId: string | null
  selectShell: (id: string | null) => void
  /** Añade un módulo vacío del tamaño máximo. False si ya están todos o no cabe. */
  addShell: (vertical: boolean) => boolean
  moveShell: (id: string, x: number, y: number) => void
  /** Devuelve un mensaje de error, o '' si se ha aplicado. */
  resizeShell: (id: string, width: number, depth: number) => string
  /** Gira el módulo 90° con sus estancias. Devuelve un mensaje de error, o ''. */
  rotateShell: (id: string) => string
  removeShell: (id: string) => void
  /** Borra todo y empieza con un módulo del tamaño máximo. */
  newPlan: () => void
  openings: Opening[]
  /** Ajustes de las paredes compartidas entre dos estancias. */
  joints: Joints
  mode: Mode
  setMode: (mode: Mode) => void
  /** Elige algo del árbol o del plano: pasa a su modo y deja solo eso seleccionado. */
  pick: (mode: Mode, selection?: Partial<Selection>) => void
  /** null hasta que se abre la vista 3D por primera vez. */
  cameraPose: CameraPose | null
  setCameraPose: (pose: CameraPose) => void
  /** Lleva la cámara hasta `pose` moviéndola desde donde está, en vez de saltar. */
  flyCamera: (pose: CameraPose) => void
  /** Vista 3D a pie (altura de ojos, sin volar) en lugar de vuelo libre. */
  walkMode: boolean
  setWalkMode: (walk: boolean) => void
  /** Campo de visión vertical de la cámara 3D, en grados (uno de los de LENSES). */
  cameraFov: number
  setCameraFov: (fov: number) => void
  /** Muestras con las que se da por terminada una foto en calidad (una de PHOTO_SAMPLES). */
  photoSamples: number
  setPhotoSamples: (samples: number) => void
  /** Qué se dibuja en el plano 2D, a elegir por el usuario (PLAN_LAYERS). */
  planLayers: Record<PlanLayer, boolean>
  setPlanLayer: (layer: PlanLayer, on: boolean) => void

  // Selección: como mucho una de las tres está activa.
  selectedId: string | null
  /** Clave de una pared deducida (Wall.key). */
  selectedWall: string | null
  selectedOpeningId: string | null
  /** Lado de la estancia seleccionada sobre el que se actúa (modo acabados). */
  selectedSide: Side | null
  select: (id: string | null, side?: Side | null) => void
  selectWall: (key: string | null) => void
  selectOpening: (id: string | null) => void
  selectedFurnitureId: string | null
  /** Foco elegido, dentro de la estancia seleccionada. */
  selectedLightId: string | null
  /** Vinilo, espejo o tablero elegido, en una cara de la pared seleccionada. */
  selectedPiece: { kind: PieceKind; roomId: string; side: Side; id: string } | null
  selectFurniture: (id: string | null) => void

  /**
   * Huecos tal como estaban al empezar a arrastrar una estancia. Mientras dura
   * el arrastre se reencajan siempre desde aquí, para que pasar junto a otra
   * estancia no los desplace ni los elimine de forma definitiva.
   */
  dragOpenings: Opening[] | null
  beginDrag: () => void
  endDrag: () => void

  /** Devuelve false si no queda sitio en la parcela. */
  addModule: (width: number, depth: number, typeId?: string) => boolean
  /** Devuelve false si con ese tamaño se sale de la parcela o pisa otra estancia. */
  resizeModule: (id: string, width: number, depth: number, x?: number, y?: number) => boolean
  moveModule: (id: string, x: number, y: number) => void
  rotateModule: (id: string) => void
  removeModule: (id: string) => void
  clear: () => void
  /** Sustituye el plano entero por el de un archivo. */
  loadPlan: (plan: Plan) => void

  /** Pone nombre a una cosa de la casa; vacío, vuelve al nombre por defecto. De una pared, `id` es su clave. */
  rename: (
    kind: 'shell' | 'room' | 'wall' | 'opening' | 'furniture' | 'light',
    id: string,
    name: string,
  ) => void
  setFloor: (id: string, floor: string) => void
  turnFloor: (id: string) => void
  /** Cambia el acabado del techo de una estancia o si lleva techo en la foto. */
  setCeiling: (id: string, patch: { ceiling?: string; noCeiling?: boolean }) => void
  /** Color de las paredes de una estancia por dentro. */
  /**
   * Con `side`, pinta solo la pared de ese lado (o le quita su color propio si
   * `color` es null); sin él, pinta todas y borra los colores propios.
   */
  setWallColor: (id: string, color: string | null, side?: Side) => void
  /** Pega un vinilo del catálogo en la pared de ese lado, centrado. Devuelve su id, o null si no cabe. */
  addVinyl: (roomId: string, side: Side, typeId: string) => string | null
  /** Cambia posición o medidas de un vinilo. Devuelve un mensaje de error, o ''. */
  patchVinyl: (roomId: string, side: Side, id: string, patch: Partial<Omit<Vinyl, 'id'>>) => string
  removeVinyl: (roomId: string, side: Side, id: string) => void
  /** Cuelga un espejo en la pared de ese lado, centrado. Devuelve su id, o null si no cabe. */
  addMirror: (roomId: string, side: Side) => string | null
  /** Cambia posición o medidas de un espejo. Devuelve un mensaje de error, o ''. */
  patchMirror: (roomId: string, side: Side, id: string, patch: Partial<Omit<Mirror, 'id'>>) => string
  removeMirror: (roomId: string, side: Side, id: string) => void
  /** Coloca un tablero en la pared de ese lado, centrado. Devuelve su id, o null si no cabe. */
  addBoard: (roomId: string, side: Side) => string | null
  /**
   * Cambia posición, medidas o acabado de un tablero y, con `pose`, lo pone en
   * esa postura. Devuelve un mensaje de error, o ''.
   */
  patchBoard: (
    roomId: string,
    side: Side,
    id: string,
    patch: Partial<Omit<Board, 'id'>>,
    pose?: BoardPose,
  ) => string
  removeBoard: (roomId: string, side: Side, id: string) => void
  /** Pone un foco en el techo de la estancia, hacia el centro. Devuelve su id, o null si no cabe. */
  addLight: (roomId: string) => string | null
  /** Cambia posición, potencia o tono de un foco. Devuelve un mensaje de error, o ''. */
  patchLight: (roomId: string, id: string, patch: Partial<Omit<RoomLight, 'id'>>) => string
  removeLight: (roomId: string, id: string) => void

  setWallThickness: (key: string, thickness: number) => void
  setWallOpen: (key: string, open: boolean) => void
  /** Cambia el alto o el color del rodapié de una pared; lo que no venga se queda como está. */
  setWallSkirting: (key: string, skirting: Skirting) => void

  /** Mobiliario colocado en el plano (modo opciones). */
  furniture: FurnitureItem[]
  /** Coloca una pieza del catálogo centrada en (x, y). */
  addFurniture: (typeId: string, x: number, y: number) => void
  moveFurniture: (id: string, x: number, y: number) => void
  /** Lleva la pieza a (x, y) tal cual, sin imán: para medidas escritas a mano. */
  placeFurniture: (id: string, x: number, y: number) => void
  /** Gira la pieza 90° en sentido horario. */
  rotateFurniture: (id: string) => void
  removeFurniture: (id: string) => void
  /**
   * Arrima la pieza a la pared más próxima de su estancia, de espaldas a ella.
   * False si la pieza no está dentro de ninguna estancia.
   */
  snapFurnitureToWall: (id: string) => boolean
  /** Si los muebles se imantan a las paredes al arrastrarlos. */
  furnitureMagnet: boolean
  setFurnitureMagnet: (on: boolean) => void

  /**
   * Elemento del catálogo pendiente de colocar con un clic en el plano: un tipo
   * de hueco en modo paredes, un mueble en modo opciones.
   */
  tool: string | null
  setTool: (tool: string | null) => void
  /** Coloca un hueco centrado en `center` (coordenada del plano a lo largo de la pared). */
  addOpening: (typeId: string, wallKey: string, center: number) => boolean
  /** Lleva el inicio del hueco a `from` (coordenada del plano a lo largo de su pared). */
  moveOpening: (id: string, from: number) => void
  resizeOpening: (id: string, width: number, height: number) => boolean
  /** Altura del borde inferior sobre el suelo. False si con ella se sale de la pared. */
  setOpeningSill: (id: string, sill: number) => boolean
  /** Hacia dónde abre una puerta, en qué canto gira y si se ve cerrada en 3D. */
  setDoor: (id: string, patch: Pick<Opening, 'swing' | 'hinge' | 'closed'>) => void
  /** Acabado de la carpintería de un hueco (color o material); con `null`, de todos. */
  setOpeningFinish: (id: string | null, finish: string) => void
  /** Centra el hueco a lo largo de su pared. False si ahí pisa otro hueco. */
  centerOpening: (id: string) => boolean
  removeOpening: (id: string) => void
}

/** ¿Está el centro del mueble dentro de la estancia? */
const inside = (m: PlacedModule, f: Pick<FurnitureItem, 'x' | 'y'>) =>
  f.x >= m.x && f.x <= m.x + m.width && f.y >= m.y && f.y <= m.y + m.depth

// De quién es cada cosa se guarda, no se deduce cada vez: la estancia apunta a
// su módulo (`shellId`) y el mueble a su estancia (`roomId`). La geometría solo
// se consulta para ponerlo al día cuando algo se mueve o al abrir un plano de antes.

/** Las estancias, cada una con su módulo: el que tenía si la sigue conteniendo, o el que la contenga. */
const withShells = (modules: PlacedModule[], shells: Shell[]) =>
  modules.map((m) => {
    const shell =
      shells.find((sh) => sh.id === m.shellId && contains(sh, m)) ??
      shells.find((sh) => contains(sh, m))
    return shell?.id === m.shellId ? m : { ...m, shellId: shell?.id }
  })

/** El mueble con el centro llevado dentro de la estancia, si se había salido. */
const intoRoom = (f: FurnitureItem, room: PlacedModule): FurnitureItem => ({
  ...f,
  x: Math.min(Math.max(f.x, room.x), room.x + room.width),
  y: Math.min(Math.max(f.y, room.y), room.y + room.depth),
  roomId: room.id,
})

/**
 * El mueble en su estancia: sigue en la suya mientras su centro esté dentro,
 * pasa a otra si se lleva hasta ella y, si se saca de todas, vuelve al borde
 * de la que tenía. Sin estancia propia ni ninguna debajo, queda suelto.
 */
function housed(f: FurnitureItem, modules: PlacedModule[]): FurnitureItem {
  const own = modules.find((m) => m.id === f.roomId)
  if (own && inside(own, f)) return f
  const room = modules.find((m) => inside(m, f))
  if (room) return { ...f, roomId: room.id }
  return own ? intoRoom(f, own) : { ...f, roomId: undefined }
}

/** Un plano recién leído, con cada cosa apuntando a su padre. */
const withParents = <T extends { modules: PlacedModule[]; shells: Shell[]; furniture: FurnitureItem[] }>(
  plan: T,
) => {
  // Las estancias de antes de los focos (sin lista de luces) reciben el suyo; la
  // que se quedó sin ninguno porque se los quitaron (lista vacía) sigue a oscuras.
  const modules = withShells(plan.modules, plan.shells).map((m) =>
    m.lights ? m : { ...m, lights: [firstLight(m)] },
  )
  return { modules, furniture: plan.furniture.map((f) => housed(f, modules)) }
}

// Distancia (m) a la que un mueble arrastrado se imanta a una pared.
const MAGNET = 0.3

/**
 * Coordenada de la cara interior de la pared del lado `side` de `room`, a la
 * altura `along` de ese lado; null si en ese tramo no hay pared.
 */
function interiorFace(room: PlacedModule, side: Side, along: number, walls: Wall[]) {
  const line = wallLine(room, side)
  const wall = walls.find(
    (w) =>
      (w.moduleId === room.id || w.otherId === room.id) &&
      w.horizontal === line.horizontal &&
      Math.abs(w.pos - line.pos) < 1e-6 &&
      along >= w.from &&
      along <= w.to,
  )
  if (!wall || wall.open) return null
  // La pared entra en la estancia todo su grosor si es exterior, la mitad si es compartida.
  const inset = wall.shared ? wall.thickness / 2 : wall.thickness
  return side === 'n' || side === 'w' ? line.pos + inset : line.pos - inset
}

/**
 * Imanta un mueble a las paredes de su estancia: si un borde queda a menos de
 * MAGNET de la cara interior de una pared (o ya metido en ella), se pega a ras.
 */
function magnetize(item: FurnitureItem, modules: PlacedModule[], joints: Joints): FurnitureItem {
  const type = furnitureType(item.typeId)
  const room = modules.find((m) => m.id === item.roomId)
  if (!type || !room) return item
  const walls = deriveWalls(modules, joints)
  const turned = item.rotation === 90 || item.rotation === 270
  const halfX = (turned ? type.depth : type.width) / 2
  const halfY = (turned ? type.width : type.depth) / 2

  const pull = (center: number, half: number, low: number | null, high: number | null) => {
    if (low !== null && center - half - low <= MAGNET) return low + half
    if (high !== null && high - (center + half) <= MAGNET) return high - half
    return center
  }
  const x = pull(
    item.x,
    halfX,
    interiorFace(room, 'w', item.y, walls),
    interiorFace(room, 'e', item.y, walls),
  )
  const y = pull(
    item.y,
    halfY,
    interiorFace(room, 'n', item.x, walls),
    interiorFace(room, 's', item.x, walls),
  )
  return { ...item, x: roundSize(x), y: roundSize(y) }
}

/**
 * Sitio de un mueble: media medida en cada eje según su giro y los cuatro
 * límites entre los que se mueve, que son las caras interiores de las paredes
 * de su estancia o, si no está en ninguna, los bordes de la parcela.
 */
export function furnitureBox(item: FurnitureItem, modules: PlacedModule[], joints: Joints) {
  const type = furnitureType(item.typeId)
  if (!type) return null
  const turned = item.rotation === 90 || item.rotation === 270
  const room = modules.find((m) => m.id === item.roomId)
  const walls = room ? deriveWalls(modules, joints) : []
  const face = (side: Side, along: number, edge: number) =>
    room ? (interiorFace(room, side, along, walls) ?? wallLine(room, side).pos) : edge
  return {
    inRoom: !!room,
    halfX: (turned ? type.depth : type.width) / 2,
    halfY: (turned ? type.width : type.depth) / 2,
    west: face('w', item.y, 0),
    east: face('e', item.y, PLOT.width),
    north: face('n', item.x, 0),
    south: face('s', item.x, PLOT.depth),
  }
}

const NO_SELECTION: Selection = {
  selectedId: null,
  selectedWall: null,
  selectedOpeningId: null,
  selectedSide: null,
  selectedLightId: null,
  selectedPiece: null,
  selectedFurnitureId: null,
  selectedShellId: null,
}

export const useHouse = create<HouseState>()(
  persist(
    (set, get) => {
      /** Aplica un cambio de estancias y reencaja los huecos en las paredes resultantes. */
      const setModules = (modules: PlacedModule[], openings?: Opening[]) => {
        const s = get()
        modules = withShells(modules, s.shells)
        set({
          modules,
          openings: refitOpenings(modules, s.joints, openings ?? s.dragOpenings ?? s.openings),
        })
      }

      /** Cambia la lista de vinilos de un lado de una estancia. */
      const setVinyls = (roomId: string, side: Side, change: (list: Vinyl[]) => Vinyl[]) =>
        set((s) => ({
          modules: s.modules.map((m) =>
            m.id === roomId
              ? { ...m, vinyls: { ...m.vinyls, [side]: change(m.vinyls?.[side] ?? []) } }
              : m,
          ),
        }))

      /** Cambia la lista de espejos de un lado de una estancia. */
      const setMirrors = (roomId: string, side: Side, change: (list: Mirror[]) => Mirror[]) =>
        set((s) => ({
          modules: s.modules.map((m) =>
            m.id === roomId
              ? { ...m, mirrors: { ...m.mirrors, [side]: change(m.mirrors?.[side] ?? []) } }
              : m,
          ),
        }))

      /** Cambia la lista de tableros de un lado de una estancia. */
      const setBoards = (roomId: string, side: Side, change: (list: Board[]) => Board[]) =>
        set((s) => ({
          modules: s.modules.map((m) =>
            m.id === roomId
              ? { ...m, boards: { ...m.boards, [side]: change(m.boards?.[side] ?? []) } }
              : m,
          ),
        }))

      /** Cambia la lista de focos de una estancia. */
      const setLights = (roomId: string, change: (list: RoomLight[]) => RoomLight[]) =>
        set((s) => ({
          modules: s.modules.map((m) =>
            m.id === roomId ? { ...m, lights: change(m.lights ?? []) } : m,
          ),
        }))

      /** Cambia un ajuste de la pared `key`: de su pareja si es compartida, de su lado si es exterior. */
      const patchWall = (key: string, thickness?: number, open?: boolean, skirting?: Skirting) => {
        const { modules, joints } = get()
        const wall = deriveWalls(modules, joints).find((w) => w.key === key)
        if (!wall) return
        const patch = (current?: JointSettings) => ({
          ...current,
          ...(thickness !== undefined && { thickness }),
          ...(open !== undefined && { open }),
          ...(skirting && { skirting: { ...current?.skirting, ...skirting } }),
        })
        if (wall.shared) {
          const pair = pairKey(wall.moduleId, wall.otherId!)
          set({ joints: { ...joints, [pair]: patch(joints[pair]) } })
          return
        }
        const { side } = wall
        set({
          modules: modules.map((m) =>
            m.id !== wall.moduleId
              ? m
              : {
                  ...m,
                  ...(thickness !== undefined && { walls: { ...m.walls, [side]: thickness } }),
                  ...(open !== undefined && { open: { ...m.open, [side]: open } }),
                  ...(skirting && {
                    skirting: { ...m.skirting, [side]: { ...m.skirting?.[side], ...skirting } },
                  }),
                },
          ),
        })
      }

      return {
        modules: [],
        openings: [],
        joints: {},
        mode: 'modules',
        cameraPose: null,
        walkMode: false,
        tool: null,
        dragOpenings: null,
        ...NO_SELECTION,

        setMode: (mode) => set({ mode, tool: null, ...NO_SELECTION }),
        pick: (mode, selection) => set({ mode, tool: null, ...NO_SELECTION, ...selection }),
        rename: (kind, id, text) => {
          const name = text.trim() || undefined
          const named = <T extends { id: string }>(list: T[]) =>
            list.map((x) => (x.id === id ? { ...x, name } : x))
          const s = get()
          if (kind === 'shell') set({ shells: named(s.shells) })
          else if (kind === 'room') set({ modules: named(s.modules) })
          else if (kind === 'opening') set({ openings: named(s.openings) })
          else if (kind === 'furniture') set({ furniture: named(s.furniture) })
          else if (kind === 'light')
            set({ modules: s.modules.map((m) => (m.lights ? { ...m, lights: named(m.lights) } : m)) })
          else {
            // El nombre de una pared va donde su grosor: en su pareja o en el lado de su estancia.
            const wall = deriveWalls(s.modules, s.joints).find((w) => w.key === id)
            if (!wall) return
            if (wall.shared) {
              const pair = pairKey(wall.moduleId, wall.otherId!)
              set({ joints: { ...s.joints, [pair]: { ...s.joints[pair], name } } })
            } else
              set({
                modules: s.modules.map((m) =>
                  m.id === wall.moduleId
                    ? { ...m, wallNames: { ...m.wallNames, [wall.side]: name } }
                    : m,
                ),
              })
          }
        },
        setCameraPose: (cameraPose) => {
          stopCameraFlight()
          set({ cameraPose })
        },
        flyCamera: (target) => {
          stopCameraFlight()
          const from = get().cameraPose
          // Sin punto de partida, o con la pestaña oculta (no hay fotogramas), va directa.
          if (!from || document.hidden) return set({ cameraPose: target })
          const start = performance.now()
          // El giro va por el camino corto, sin dar la vuelta entera.
          const turn = Math.atan2(Math.sin(target.yaw - from.yaw), Math.cos(target.yaw - from.yaw))
          const frame = (now: number) => {
            const t = Math.min((now - start) / FLIGHT_MS, 1)
            if (t === 1) {
              flight = 0
              return set({ cameraPose: target })
            }
            // Arranque y llegada suaves.
            const k = t * t * (3 - 2 * t)
            const mix = (a: number, b: number) => a + (b - a) * k
            set({
              cameraPose: {
                position: [
                  mix(from.position[0], target.position[0]),
                  mix(from.position[1], target.position[1]),
                  mix(from.position[2], target.position[2]),
                ],
                yaw: from.yaw + turn * k,
                pitch: mix(from.pitch, target.pitch),
              },
            })
            flight = requestAnimationFrame(frame)
          }
          flight = requestAnimationFrame(frame)
        },
        setWalkMode: (walkMode) => set({ walkMode }),
        cameraFov: LENSES[0].fov,
        setCameraFov: (cameraFov) => set({ cameraFov }),
        photoSamples: PHOTO_SAMPLES[PHOTO_SAMPLES.length - 1],
        setPhotoSamples: (photoSamples) => set({ photoSamples }),
        planLayers: ALL_PLAN_LAYERS,
        setPlanLayer: (layer, on) => set((s) => ({ planLayers: { ...s.planLayers, [layer]: on } })),

        select: (id, side = null) => set({ ...NO_SELECTION, selectedId: id, selectedSide: side }),
        selectWall: (key) => set({ ...NO_SELECTION, selectedWall: key }),
        selectOpening: (id) => set({ ...NO_SELECTION, selectedOpeningId: id }),
        selectFurniture: (id) => set({ ...NO_SELECTION, selectedFurnitureId: id }),
        selectShell: (id) => set({ ...NO_SELECTION, selectedShellId: id }),

        shells: [],

        addShell: (vertical) => {
          const { shells } = get()
          if (shells.length >= MAX_SHELLS) return false
          const width = vertical ? SHELL_MAX_SHORT : SHELL_MAX_LONG
          const depth = vertical ? SHELL_MAX_LONG : SHELL_MAX_SHORT
          // Primero se intenta pegado a un módulo existente; si no cabe, en cualquier hueco.
          const beside = shells.flatMap((o) => [
            { x: o.x, y: o.y + o.depth },
            { x: o.x + o.width, y: o.y },
            { x: o.x, y: o.y - depth },
            { x: o.x - width, y: o.y },
          ])
          // El primer módulo arranca en el origen de la parcela (0, 0).
          const origin = { x: 0, y: 0 }
          // Los candidatos pegados se deslizan lo justo para caber en la parcela:
          // así un módulo vertical junto a uno horizontal queda formando una L.
          const spot =
            [...beside, origin]
              .map((c) => clampToPlot({ ...c, width, depth }))
              .find((c) => shellFits(c, shells)) ??
            findFreeSpot(width, depth, shells)
          if (!spot) return false
          // El módulo nace vacío: las estancias se añaden después, en su modo.
          const shell = { id: crypto.randomUUID(), ...spot, width, depth }
          set({ shells: [...shells, shell], ...NO_SELECTION, selectedShellId: shell.id, mode: 'shells' })
          return true
        },

        moveShell: (id, x, y) => {
          const { shells, modules } = get()
          const current = shells.find((s) => s.id === id)
          if (!current) return
          const moved = { ...current, ...clampToPlot({ ...current, x, y }) }
          if (!shellFits(moved, shells.filter((s) => s.id !== id))) return
          const dx = moved.x - current.x
          const dy = moved.y - current.y
          if (dx === 0 && dy === 0) return
          // El módulo se lleva consigo sus estancias y los muebles que hay en ellas.
          const rooms = modules.filter((m) => m.shellId === id)
          set((s) => ({
            shells: shells.map((sh) => (sh.id === id ? moved : sh)),
            furniture: s.furniture.map((f) =>
              rooms.some((m) => m.id === f.roomId)
                ? { ...f, x: roundSize(f.x + dx), y: roundSize(f.y + dy) }
                : f,
            ),
          }))
          setModules(
            modules.map((m) =>
              rooms.includes(m) ? { ...m, x: roundSize(m.x + dx), y: roundSize(m.y + dy) } : m,
            ),
          )
        },

        resizeShell: (id, width, depth) => {
          const { shells, modules } = get()
          const current = shells.find((s) => s.id === id)
          if (!current) return ''
          if (!validShellSize(width, depth)) {
            return `Un módulo mide como máximo ${formatMeters(SHELL_MAX_LONG)} × ${formatMeters(SHELL_MAX_SHORT)} m.`
          }
          const resized = { ...current, width, depth }
          if (!shellFits(resized, shells.filter((s) => s.id !== id))) {
            return 'Con esas medidas se sale de la parcela o pisa el otro módulo.'
          }
          if (modules.some((m) => m.shellId === id && !contains(resized, m))) {
            return 'Hay estancias que no cabrían; encógelas primero.'
          }
          set({ shells: shells.map((s) => (s.id === id ? resized : s)) })
          return ''
        },

        // Giro de 90° en sentido horario, con todo lo que hay dentro: cada estancia
        // cambia de sitio y de proporciones, y sus lados pasan n→e→s→w→n.
        rotateShell: (id) => {
          const { shells, modules, openings, furniture } = get()
          const current = shells.find((s) => s.id === id)
          if (!current) return ''
          const rotated = {
            ...current,
            ...clampToPlot({ ...current, width: current.depth, depth: current.width }),
          }
          if (!shellFits(rotated, shells.filter((s) => s.id !== id))) {
            return 'Girado pisaría el otro módulo; sepáralos antes.'
          }
          // Un punto (px, py) medido desde la esquina del módulo pasa a (fondo - py, px).
          const turnPoint = (px: number, py: number) => ({
            x: roundSize(rotated.x + current.depth - (py - current.y)),
            y: roundSize(rotated.y + (px - current.x)),
          })
          const turnSides = <T,>(sides?: Partial<Record<Side, T>>) =>
            sides && { e: sides.n, s: sides.e, w: sides.s, n: sides.w }
          const rooms = modules.filter((m) => m.shellId === id)
          const turnedRooms = modules.map((m) =>
            !rooms.includes(m)
              ? m
              : {
                  ...m,
                  // La esquina superior izquierda nueva sale de la inferior izquierda antigua.
                  ...turnPoint(m.x, m.y + m.depth),
                  width: m.depth,
                  depth: m.width,
                  walls: turnSides(m.walls),
                  wallNames: turnSides(m.wallNames),
                  open: turnSides(m.open),
                  skirting: turnSides(m.skirting),
                  sideColors: turnSides(m.sideColors),
                  vinyls: turnSides(m.vinyls),
                  mirrors: turnSides(m.mirrors),
                  boards: turnSides(m.boards),
                  lights: turnLights(m.lights, m.depth),
                  floorTurned: !m.floorTurned,
                },
          )
          set({
            shells: shells.map((s) => (s.id === id ? rotated : s)),
            furniture: furniture.map((f) =>
              rooms.some((m) => m.id === f.roomId)
                ? { ...f, ...turnPoint(f.x, f.y), rotation: ((f.rotation + 90) % 360) as Rotation }
                : f,
            ),
          })
          setModules(
            turnedRooms,
            openings.map((o) => {
              const room = rooms.find((m) => m.id === o.moduleId)
              return room ? rotateOpening(o, room.depth) : o
            }),
          )
          return ''
        },

        removeShell: (id) => {
          const { shells, modules, openings } = get()
          const removed = shells.find((s) => s.id === id)
          if (!removed) return
          const gone = modules.filter((m) => m.shellId === id)
          set((s) => ({
            shells: shells.filter((sh) => sh.id !== id),
            furniture: s.furniture.filter((f) => !gone.some((m) => m.id === f.roomId)),
            ...NO_SELECTION,
          }))
          setModules(
            modules.filter((m) => !gone.includes(m)),
            openings.filter((o) => !gone.some((m) => m.id === o.moduleId)),
          )
        },

        newPlan: () => {
          get().clear()
          get().addShell(false)
          // Se abre en el modo de módulos, que es por donde se empieza una casa.
          set({ mode: 'shells', ...NO_SELECTION })
        },

        beginDrag: () => set({ dragOpenings: get().openings }),
        endDrag: () => set({ dragOpenings: null }),

        addModule: (width, depth, typeId = 'custom') => {
          const { modules } = get()
          const { shells } = get()
          // Si no cabe tal cual, se prueba girada: un módulo de fábrica es estrecho.
          const placed = [
            { width, depth },
            { width: depth, depth: width },
          ]
            .map((size) => ({ ...size, spot: findFreeSpot(size.width, size.depth, modules, shells) }))
            .find((c) => c.spot)
          if (!placed?.spot) return false
          const id = crypto.randomUUID()
          setModules([
            ...modules,
            {
              id,
              typeId,
              ...placed.spot,
              width: placed.width,
              depth: placed.depth,
              // Toda estancia nace con un foco en el centro del techo.
              lights: [firstLight(placed)],
            },
          ])
          set({ ...NO_SELECTION, selectedId: id, mode: 'modules' })
          return true
        },

        resizeModule: (id, width, depth, x, y) => {
          const { modules } = get()
          const current = modules.find((m) => m.id === id)
          if (!current) return false
          const resized = {
            ...current,
            width,
            depth,
            x: x ?? current.x,
            y: y ?? current.y,
            typeId: 'custom',
          }
          const others = modules.filter((m) => m.id !== id)
          if (!fits(resized, others, get().shells)) return false
          setModules(modules.map((m) => (m.id === id ? resized : m)))
          // Sus muebles se quedan donde estaban, salvo el que quedaría fuera.
          set((s) => ({
            furniture: s.furniture.map((f) =>
              f.roomId === id && !inside(resized, f) ? intoRoom(f, resized) : f,
            ),
          }))
          return true
        },

        moveModule: (id, x, y) => {
          const { modules } = get()
          const current = modules.find((m) => m.id === id)
          if (!current) return
          const { shells } = get()
          const target = { ...current, x, y }
          // Dentro de un módulo: el que contiene el centro de destino si la estancia
          // cabe en él (así se puede pasar de un módulo a otro), o si no el suyo.
          const cx = x + current.width / 2
          const cy = y + current.depth / 2
          const shell =
            shells.find(
              (s) =>
                cx >= s.x &&
                cx <= s.x + s.width &&
                cy >= s.y &&
                cy <= s.y + s.depth &&
                s.width >= current.width - 1e-6 &&
                s.depth >= current.depth - 1e-6,
            ) ?? shells.find((s) => s.id === current.shellId)
          const moved = { ...current, ...(shell ? clampInto(shell, target) : clampToPlot(target)) }
          const others = modules.filter((m) => m.id !== id)
          if (!fits(moved, others, shells)) return
          setModules(modules.map((m) => (m.id === id ? moved : m)))
          // Los muebles que están dentro de la estancia se mueven con ella.
          const dx = moved.x - current.x
          const dy = moved.y - current.y
          set((s) => ({
            furniture: s.furniture.map((f) =>
              f.roomId === id ? { ...f, x: roundSize(f.x + dx), y: roundSize(f.y + dy) } : f,
            ),
          }))
        },

        // Giro de 90° en sentido horario: n→e→s→w→n, también para grosores, lados abiertos y huecos.
        rotateModule: (id) => {
          const { modules, openings } = get()
          const current = modules.find((m) => m.id === id)
          if (!current) return
          const turn = <T,>(sides?: Partial<Record<Side, T>>) =>
            sides && { e: sides.n, s: sides.e, w: sides.s, n: sides.w }
          const rotated = {
            ...current,
            ...clampToPlot({ ...current, width: current.depth, depth: current.width }),
            walls: turn(current.walls),
            wallNames: turn(current.wallNames),
            open: turn(current.open),
            skirting: turn(current.skirting),
            sideColors: turn(current.sideColors),
            vinyls: turn(current.vinyls),
            mirrors: turn(current.mirrors),
            boards: turn(current.boards),
            lights: turnLights(current.lights, current.depth),
          }
          const others = modules.filter((m) => m.id !== id)
          if (!fits(rotated, others, get().shells)) return
          setModules(
            modules.map((m) => (m.id === id ? rotated : m)),
            openings.map((o) => (o.moduleId === id ? rotateOpening(o, rotated.width) : o)),
          )
          // Sus muebles giran con ella: (px, py) desde su esquina pasa a (fondo - py, px).
          set((s) => ({
            furniture: s.furniture.map((f) =>
              f.roomId === id
                ? {
                    ...f,
                    x: roundSize(rotated.x + current.depth - (f.y - current.y)),
                    y: roundSize(rotated.y + (f.x - current.x)),
                    rotation: ((f.rotation + 90) % 360) as Rotation,
                  }
                : f,
            ),
          }))
        },

        removeModule: (id) => {
          const { modules, openings } = get()
          setModules(
            modules.filter((m) => m.id !== id),
            openings.filter((o) => o.moduleId !== id),
          )
          const removed = modules.find((m) => m.id === id)
          set((s) => ({
            furniture: removed ? s.furniture.filter((f) => f.roomId !== id) : s.furniture,
            ...NO_SELECTION,
          }))
        },

        clear: () =>
          set({
            modules: [],
            shells: [],
            openings: [],
            joints: {},
            furniture: [],
            tool: null,
            ...NO_SELECTION,
          }),

        loadPlan: ({ modules, shells, openings, joints, furniture }) =>
          set({
            ...withParents({ modules, shells, furniture }),
            shells,
            joints,
            openings: refitOpenings(modules, joints, openings),
            tool: null,
            ...NO_SELECTION,
          }),

        furniture: [],
        furnitureMagnet: true,
        setFurnitureMagnet: (furnitureMagnet) => set({ furnitureMagnet }),

        addFurniture: (typeId, x, y) => {
          if (!furnitureType(typeId)) return
          const id = crypto.randomUUID()
          const item = housed(clampFurniture({ id, typeId, x, y, rotation: 0 }), get().modules)
          // Un mueble va en una estancia: fuera de todas no se coloca.
          if (!item.roomId) return
          set((s) => ({
            furniture: [...s.furniture, item],
            tool: null,
            ...NO_SELECTION,
            selectedFurnitureId: id,
            mode: 'options',
          }))
        },

        moveFurniture: (id, x, y) =>
          set((s) => ({
            furniture: s.furniture.map((f) => {
              if (f.id !== id) return f
              const moved = housed(clampFurniture({ ...f, x, y }), s.modules)
              return s.furnitureMagnet ? magnetize(moved, s.modules, s.joints) : moved
            }),
          })),

        placeFurniture: (id, x, y) =>
          set((s) => ({
            furniture: s.furniture.map((f) =>
              f.id === id
                ? housed(clampFurniture({ ...f, x: roundSize(x), y: roundSize(y) }), s.modules)
                : f,
            ),
          })),

        rotateFurniture: (id) =>
          set((s) => ({
            furniture: s.furniture.map((f) =>
              f.id === id
                ? clampFurniture({ ...f, rotation: ((f.rotation + 90) % 360) as Rotation })
                : f,
            ),
          })),

        snapFurnitureToWall: (id) => {
          const { modules, joints, furniture } = get()
          const item = furniture.find((f) => f.id === id)
          const type = item && furnitureType(item.typeId)
          const room = item && modules.find((m) => m.id === item.roomId)
          if (!item || !type || !room) return false

          const distances: [Side, number][] = [
            ['n', item.y - room.y],
            ['s', room.y + room.depth - item.y],
            ['w', item.x - room.x],
            ['e', room.x + room.width - item.x],
          ]
          const [side] = distances.reduce((a, b) => (b[1] < a[1] ? b : a))
          const horizontal = side === 'n' || side === 's'
          const line = wallLine(room, side)

          const along = horizontal ? item.x : item.y
          const face = interiorFace(room, side, along, deriveWalls(modules, joints)) ?? line.pos

          // De espaldas a la pared: con giro 0 la parte trasera mira al norte.
          const rotation = ({ n: 0, e: 90, s: 180, w: 270 } as const)[side]
          const across = side === 'n' || side === 'w' ? face + type.depth / 2 : face - type.depth / 2
          // A lo largo de la pared se queda donde estaba, sin meterse en las dos
          // paredes de los extremos (se descuenta su grosor exterior, que es el mayor).
          const half = type.width / 2
          const min = line.start + wallThickness(room, horizontal ? 'w' : 'n') + half
          const max = line.start + line.length - wallThickness(room, horizontal ? 'e' : 's') - half
          const slide = Math.min(Math.max(along, min), Math.max(min, max))
          const snapped = {
            ...item,
            rotation,
            x: roundSize(horizontal ? slide : across),
            y: roundSize(horizontal ? across : slide),
          }
          set({ furniture: furniture.map((f) => (f.id === id ? snapped : f)) })
          return true
        },

        removeFurniture: (id) =>
          set((s) => ({
            furniture: s.furniture.filter((f) => f.id !== id),
            selectedFurnitureId: null,
          })),

        setFloor: (id, floor) =>
          set((s) => ({ modules: s.modules.map((m) => (m.id === id ? { ...m, floor } : m)) })),
        turnFloor: (id) =>
          set((s) => ({
            modules: s.modules.map((m) =>
              m.id === id ? { ...m, floorTurned: !m.floorTurned } : m,
            ),
          })),

        setCeiling: (id, patch) =>
          set((s) => ({ modules: s.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),

        setWallColor: (id, color, side) =>
          set((s) => ({
            modules: s.modules.map((m) => {
              if (m.id !== id) return m
              if (!side) return { ...m, wallColor: color ?? undefined, sideColors: undefined }
              return { ...m, sideColors: { ...m.sideColors, [side]: color ?? undefined } }
            }),
          })),
        addVinyl: (roomId, side, typeId) => {
          const { modules, joints } = get()
          const room = modules.find((m) => m.id === roomId)
          const type = vinylType(typeId)
          if (!room || !type) return null
          const { length } = wallFace(room, side, deriveWalls(modules, joints))
          // Si la imagen es más grande que la pared, se encoge guardando la proporción.
          const scale = Math.min(1, length / type.width, WALL_HEIGHT / type.height)
          const width = roundSize(type.width * scale)
          const height = roundSize(type.height * scale)
          const vinyl: Vinyl = {
            id: crypto.randomUUID(),
            typeId,
            x: roundSize(Math.max(0, (length - width) / 2)),
            // Centrado a 1,3 m del suelo, si cabe.
            y: roundSize(Math.min(Math.max(0, 1.3 - height / 2), WALL_HEIGHT - height)),
            width,
            height,
          }
          if (vinylProblem(vinyl, length)) return null
          setVinyls(roomId, side, (list) => [...list, vinyl])
          return vinyl.id
        },
        patchVinyl: (roomId, side, id, patch) => {
          const { modules, joints } = get()
          const room = modules.find((m) => m.id === roomId)
          const current = room?.vinyls?.[side]?.find((v) => v.id === id)
          if (!room || !current) return 'Ese vinilo ya no existe.'
          const next = { ...current, ...patch }
          const problem = vinylProblem(next, wallFace(room, side, deriveWalls(modules, joints)).length)
          if (problem) return problem
          setVinyls(roomId, side, (list) => list.map((v) => (v.id === id ? next : v)))
          return ''
        },
        removeVinyl: (roomId, side, id) =>
          setVinyls(roomId, side, (list) => list.filter((v) => v.id !== id)),
        addMirror: (roomId, side) => {
          const { modules, joints } = get()
          const room = modules.find((m) => m.id === roomId)
          if (!room) return null
          const { length } = wallFace(room, side, deriveWalls(modules, joints))
          const width = roundSize(Math.min(DEFAULT_MIRROR.width, length))
          const mirror: Mirror = {
            id: crypto.randomUUID(),
            x: roundSize(Math.max(0, (length - width) / 2)),
            y: DEFAULT_MIRROR.y,
            width,
            height: DEFAULT_MIRROR.height,
          }
          if (vinylProblem(mirror, length)) return null
          setMirrors(roomId, side, (list) => [...list, mirror])
          return mirror.id
        },
        patchMirror: (roomId, side, id, patch) => {
          const { modules, joints } = get()
          const room = modules.find((m) => m.id === roomId)
          const current = room?.mirrors?.[side]?.find((v) => v.id === id)
          if (!room || !current) return 'Ese espejo ya no existe.'
          const next = { ...current, ...patch }
          const problem = vinylProblem(next, wallFace(room, side, deriveWalls(modules, joints)).length)
          if (problem) return problem
          setMirrors(roomId, side, (list) => list.map((v) => (v.id === id ? next : v)))
          return ''
        },
        removeMirror: (roomId, side, id) =>
          setMirrors(roomId, side, (list) => list.filter((v) => v.id !== id)),
        addBoard: (roomId, side) => {
          const { modules, joints } = get()
          const room = modules.find((m) => m.id === roomId)
          if (!room) return null
          const { length } = wallFace(room, side, deriveWalls(modules, joints))
          const width = roundSize(Math.min(DEFAULT_BOARD.width, length))
          const board: Board = {
            id: crypto.randomUUID(),
            x: roundSize(Math.max(0, (length - width) / 2)),
            y: DEFAULT_BOARD.y,
            width,
            height: DEFAULT_BOARD.height,
            depth: DEFAULT_BOARD.depth,
            finish: DEFAULT_BOARD.finish,
          }
          if (boardProblem(board, length, boardReach(room, side))) return null
          setBoards(roomId, side, (list) => [...list, board])
          return board.id
        },
        patchBoard: (roomId, side, id, patch, pose) => {
          const { modules, joints } = get()
          const room = modules.find((m) => m.id === roomId)
          const current = room?.boards?.[side]?.find((v) => v.id === id)
          if (!room || !current) return 'Ese tablero ya no existe.'
          const { length } = wallFace(room, side, deriveWalls(modules, joints))
          const reach = boardReach(room, side)
          const next = pose
            ? posedBoard({ ...current, ...patch }, pose, length, reach)
            : { ...current, ...patch }
          const problem = boardProblem(next, length, reach)
          if (problem) return problem
          setBoards(roomId, side, (list) => list.map((v) => (v.id === id ? next : v)))
          return ''
        },
        removeBoard: (roomId, side, id) =>
          setBoards(roomId, side, (list) => list.filter((v) => v.id !== id)),
        addLight: (roomId) => {
          const room = get().modules.find((m) => m.id === roomId)
          if (!room) return null
          const list = room.lights ?? []
          const light: RoomLight = {
            id: crypto.randomUUID(),
            x: roundSize(room.width / 2),
            y: roundSize(room.depth / 2),
            ...DEFAULT_LIGHT,
          }
          // Para que no caiga encima de otro, se corre hacia la derecha mientras quepa.
          const taken = () =>
            list.some((l) => Math.abs(l.x - light.x) < 0.05 && Math.abs(l.y - light.y) < 0.05)
          while (taken() && light.x + 0.4 <= room.width - LIGHT_MARGIN) light.x = roundSize(light.x + 0.4)
          if (lightProblem(light, room)) return null
          setLights(roomId, (all) => [...all, light])
          return light.id
        },
        patchLight: (roomId, id, patch) => {
          const room = get().modules.find((m) => m.id === roomId)
          const current = room?.lights?.find((l) => l.id === id)
          if (!room || !current) return 'Esa luz ya no existe.'
          const next = { ...current, ...patch }
          const problem = lightProblem(next, room)
          if (problem) return problem
          setLights(roomId, (list) => list.map((l) => (l.id === id ? next : l)))
          return ''
        },
        removeLight: (roomId, id) => setLights(roomId, (list) => list.filter((l) => l.id !== id)),

        setWallThickness: (key, thickness) => patchWall(key, thickness),
        setWallOpen: (key, open) => patchWall(key, undefined, open),
        setWallSkirting: (key, skirting) => patchWall(key, undefined, undefined, skirting),

        setTool: (tool) => set({ tool }),

        addOpening: (typeId, wallKey, center) => {
          const { modules, joints, openings } = get()
          const type = OPENING_CATALOG.find((t) => t.id === typeId)
          const walls = deriveWalls(modules, joints)
          const wall = walls.find((w) => w.key === wallKey)
          const module = wall && modules.find((m) => m.id === wall.moduleId)
          if (!type || !wall || !module || wall.open) return false
          const { kind, width, height, sill } = type
          const id = crypto.randomUUID()
          const offset = center - width / 2 - wallLine(module, wall.side).start
          const opening = fitOpening(
            { id, kind, moduleId: module.id, side: wall.side, offset, width, height, sill },
            modules,
            walls,
            openings,
          )
          if (!opening) return false
          set({ openings: [...openings, opening], tool: null, ...NO_SELECTION, selectedOpeningId: id, mode: 'walls' })
          return true
        },

        moveOpening: (id, from) => {
          const { modules, joints, openings } = get()
          const current = openings.find((o) => o.id === id)
          const module = current && modules.find((m) => m.id === current.moduleId)
          if (!current || !module) return
          const offset = from - wallLine(module, current.side).start
          const moved = fitOpening(
            { ...current, offset },
            modules,
            deriveWalls(modules, joints),
            openings,
          )
          if (moved) set({ openings: openings.map((o) => (o.id === id ? moved : o)) })
        },

        resizeOpening: (id, width, height) => {
          const { modules, joints, openings } = get()
          const current = openings.find((o) => o.id === id)
          if (!current) return false
          const candidate = { ...current, width, height }
          if (!validOpeningSize(candidate)) return false
          const resized = fitOpening(candidate, modules, deriveWalls(modules, joints), openings)
          if (!resized) return false
          set({ openings: openings.map((o) => (o.id === id ? resized : o)) })
          return true
        },

        setOpeningSill: (id, sill) => {
          const { openings } = get()
          const current = openings.find((o) => o.id === id)
          if (!current || sill < 0 || !validOpeningSize({ ...current, sill })) return false
          set({ openings: openings.map((o) => (o.id === id ? { ...o, sill } : o)) })
          return true
        },

        setDoor: (id, patch) =>
          set((s) => ({ openings: s.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),

        setOpeningFinish: (id, finish) =>
          set((s) => ({
            openings: s.openings.map((o) => (id === null || o.id === id ? { ...o, finish } : o)),
          })),

        centerOpening: (id) => {
          const { modules, joints, openings } = get()
          const current = openings.find((o) => o.id === id)
          const module = current && modules.find((m) => m.id === current.moduleId)
          if (!current || !module) return false
          const walls = deriveWalls(modules, joints)
          const wall = wallOf(current, modules, walls)
          if (!wall) return false
          const from = (wall.from + wall.to - current.width) / 2
          const offset = from - wallLine(module, current.side).start
          const centered = fitOpening({ ...current, offset }, modules, walls, openings)
          if (!centered) return false
          set({ openings: openings.map((o) => (o.id === id ? centered : o)) })
          return true
        },

        removeOpening: (id) =>
          set((s) => ({ openings: s.openings.filter((o) => o.id !== id), selectedOpeningId: null })),
      }
    },
    {
      name: 'eurocasa-house',
      // Lo guardado antes de que cada cosa apuntara a su padre se completa al leerlo.
      merge: (saved, current) => {
        const state = { ...current, ...(saved as Partial<HouseState>) }
        // Una capa añadida después de guardar sale a la vista.
        state.planLayers = { ...ALL_PLAN_LAYERS, ...state.planLayers }
        return { ...state, ...withParents(state) }
      },
      partialize: (s) => ({
        modules: s.modules,
        shells: s.shells,
        openings: s.openings,
        joints: s.joints,
        furniture: s.furniture,
        furnitureMagnet: s.furnitureMagnet,
        cameraPose: s.cameraPose,
        walkMode: s.walkMode,
        cameraFov: s.cameraFov,
        photoSamples: s.photoSamples,
        planLayers: s.planLayers,
      }),
    },
  ),
)

// Sincronización entre ventanas (p. ej. la vista 3D abierta aparte): cuando otra
// pestaña guarda el estado, esta lo vuelve a leer. El evento `storage` no se
// dispara en la pestaña que escribe, así que no hay bucle.
window.addEventListener('storage', (e) => {
  if (e.key === useHouse.persist.getOptions().name) useHouse.persist.rehydrate()
})
