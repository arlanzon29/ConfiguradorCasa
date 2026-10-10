import { FurnitureItem } from './furniture'
import { PlacedModule, SIDES, Shell } from './house'
import { Opening } from './openings'
import { Joints } from './walls'
import type { Shot } from '../photos'

// Formato del archivo de plano que se guarda y se carga a mano. El guardado
// automático en el navegador es aparte (store.ts); esto sirve para copias de
// seguridad y para pasar un plano a otro navegador u ordenador.

const APP = 'eurocasa-configurador'
const VERSION = 1

export interface Plan {
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
  data: string
}

export const serializePlan = (
  { modules, shells, openings, joints, furniture }: Plan,
  photos: PlanPhoto[] = [],
) =>
  JSON.stringify(
    { app: APP, version: VERSION, modules, shells, openings, joints, furniture, photos },
    null,
    2,
  )

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
  if (!isRecord(data) || data.app !== APP || data.version !== VERSION) return null
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
  return {
    modules: modules as PlacedModule[],
    shells: shells as Shell[],
    openings: openings as Opening[],
    joints: joints as Joints,
    furniture: furniture as FurnitureItem[],
  }
}
