import { FurnitureItem } from './furniture'
import { PlacedModule, SIDES, Shell } from './house'
import { Opening } from './openings'
import { Joints } from './walls'
import type { Shot } from '../photos'

// Formato del archivo de plano que se guarda y se carga a mano. El guardado
// automático en el navegador es aparte (store.ts); esto sirve para copias de
// seguridad y para pasar un plano a otro navegador u ordenador.

// Desde la versión 2 el archivo tiene la forma del árbol de la casa: cada módulo
// lleva dentro sus estancias (`rooms`) y cada estancia sus huecos (`openings`) y
// sus muebles (`furniture`). Fuera quedan las estancias sin módulo, los muebles
// sin estancia y los ajustes de las paredes compartidas, que son de dos
// estancias. La versión 1, con cuatro listas planas, se sigue leyendo.

const APP = 'eurocasa-configurador'
const VERSION = 2

export interface Plan {
  /** El nombre de la casa; sin él, la casa se llama "Casa". En el archivo, `name`. */
  houseName?: string
  /** Acabado del terreno de la parcela; sin él, césped. */
  ground?: string
  modules: PlacedModule[]
  shells: Shell[]
  openings: Opening[]
  joints: Joints
  furniture: FurnitureItem[]
}

/** Una foto en calidad dentro del archivo: sus datos y la imagen como `data:` URL. */
export interface PlanPhoto extends Shot {
  id: string
  takenAt: number
  retakenAt?: number
  data: string
}

export function serializePlan(
  { houseName, ground, modules, shells, openings, joints, furniture }: Plan,
  photos: PlanPhoto[] = [],
) {
  // Dentro de su padre, la referencia a él sobra: se quita al guardar y se repone al leer.
  const room = ({ shellId: _shell, ...m }: PlacedModule) => ({
    ...m,
    openings: openings.filter((o) => o.moduleId === m.id).map(({ moduleId: _room, ...o }) => o),
    furniture: furniture.filter((x) => x.roomId === m.id).map(({ roomId: _room, ...x }) => x),
  })
  const known = (id?: string) => shells.some((sh) => sh.id === id)
  return JSON.stringify(
    {
      app: APP,
      version: VERSION,
      name: houseName,
      ground,
      shells: shells.map((sh) => ({
        ...sh,
        rooms: modules.filter((m) => m.shellId === sh.id).map(room),
      })),
      rooms: modules.filter((m) => !known(m.shellId)).map(room),
      furniture: furniture.filter((x) => !modules.some((m) => m.id === x.roomId)),
      joints,
      photos,
    },
    null,
    2,
  )
}

/** Un archivo de la versión 2, deshecho en las listas planas con las que trabaja la aplicación. */
function flatten(data: Record<string, unknown>) {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(isRecord) : [])
  const modules: unknown[] = []
  const openings: unknown[] = []
  const furniture: unknown[] = list(data.furniture)
  const rooms = (from: unknown, shellId?: unknown) => {
    for (const { openings: holes, furniture: items, ...m } of list(from)) {
      modules.push(shellId === undefined ? m : { ...m, shellId })
      openings.push(...list(holes).map((o) => ({ ...o, moduleId: m.id })))
      furniture.push(...list(items).map((x) => ({ ...x, roomId: m.id })))
    }
  }
  const shells = list(data.shells).map(({ rooms: inside, ...sh }) => {
    rooms(inside, sh.id)
    return sh
  })
  rooms(data.rooms)
  return { ...data, modules, shells, openings, furniture }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const numbers = (v: Record<string, unknown>, keys: string[]) =>
  keys.every((k) => typeof v[k] === 'number' && Number.isFinite(v[k]))

const isPhoto = (p: unknown): p is PlanPhoto =>
  isRecord(p) &&
  typeof p.id === 'string' &&
  typeof p.data === 'string' &&
  p.data.startsWith('data:image/') &&
  numbers(p, ['takenAt', 'fov', 'width', 'height']) &&
  isRecord(p.pose) &&
  numbers(p.pose, ['yaw', 'pitch']) &&
  Array.isArray(p.pose.position) &&
  p.pose.position.length === 3 &&
  p.pose.position.every((v) => typeof v === 'number' && Number.isFinite(v))

/**
 * Fotos de un archivo de plano ya leído con `parsePlan`. Los planos anteriores
 * a las fotos no traen ninguna, y una foto estropeada se descarta sin invalidar
 * el plano.
 */
export function parsePhotos(text: string): PlanPhoto[] {
  const data: unknown = JSON.parse(text)
  const photos = isRecord(data) ? data.photos : null
  return Array.isArray(photos) ? photos.filter(isPhoto) : []
}

/** Lee un archivo de plano. Devuelve null si no es uno válido de esta aplicación. */
export function parsePlan(text: string): Plan | null {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(data) || data.app !== APP) return null
  if (data.version === VERSION) data = flatten(data)
  else if (data.version !== 1) return null
  if (!isRecord(data)) return null
  const { modules, openings, joints } = data
  if (!Array.isArray(modules) || !Array.isArray(openings) || !isRecord(joints)) return null

  const validModules = modules.every(
    (m) =>
      isRecord(m) &&
      typeof m.id === 'string' &&
      numbers(m, ['x', 'y', 'width', 'depth']) &&
      (m.width as number) > 0 &&
      (m.depth as number) > 0,
  )
  const validOpenings = openings.every(
    (o) =>
      isRecord(o) &&
      typeof o.id === 'string' &&
      typeof o.moduleId === 'string' &&
      (o.kind === 'door' || o.kind === 'window') &&
      SIDES.includes(o.side as never) &&
      numbers(o, ['offset', 'width', 'height', 'sill']),
  )
  // Los planos guardados antes de existir el mobiliario no traen esta lista.
  const furniture = data.furniture ?? []
  const validFurniture =
    Array.isArray(furniture) &&
    furniture.every(
      (f) =>
        isRecord(f) &&
        typeof f.id === 'string' &&
        typeof f.typeId === 'string' &&
        numbers(f, ['x', 'y']) &&
        [0, 90, 180, 270].includes(f.rotation as number),
    )
  // Tampoco traen módulos de fábrica los planos anteriores a ese límite.
  const shells = data.shells ?? []
  const validShells =
    Array.isArray(shells) &&
    shells.every(
      (s) => isRecord(s) && typeof s.id === 'string' && numbers(s, ['x', 'y', 'width', 'depth']),
    )
  if (!validModules || !validOpenings || !validFurniture || !validShells) return null
  // Los planos de antes del nombre de la casa no lo traen.
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : undefined
  return {
    houseName: name,
    // Los planos de antes del terreno no lo traen: césped.
    ground: typeof data.ground === 'string' ? data.ground : undefined,
    modules: modules as PlacedModule[],
    shells: shells as Shell[],
    openings: openings as Opening[],
    joints: joints as Joints,
    furniture: furniture as FurnitureItem[],
  }
}
