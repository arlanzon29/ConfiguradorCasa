import { PlacedModule, SIDES, Side, Skirting, roundSize, skirtingOf, wallThickness } from './house'
import { CORNER_GAP, OPPOSITE, Opening, wallLine } from './openings'

// Las paredes no se guardan: se deducen de los bordes de las estancias. Cada
// lado se parte en tramos según lo que tenga enfrente:
//  - tramo exterior: no toca a otra estancia; usa el grosor y el estado
//    (con o sin pared) de ese lado de su estancia.
//  - tramo compartido: toca a otra estancia y es UNA sola pared de las dos,
//    centrada en la línea de unión; sus ajustes se guardan por pareja.

export const DEFAULT_JOINT_THICKNESS = 0.1

export interface JointSettings {
  name?: string
  thickness?: number
  open?: boolean
  /** El mismo rodapié en las dos caras. */
  skirting?: Skirting
}

/** Ajustes de las paredes compartidas, por pareja de estancias (ver pairKey). */
export type Joints = Record<string, JointSettings>

// Dos rectángulos que no se solapan solo pueden tocarse a lo largo de una
// línea, así que la pareja identifica la pared compartida.
export const pairKey = (a: string, b: string) => [a, b].sort().join('|')

export interface Wall {
  key: string
  /** Nombre puesto por el usuario, si lo tiene. */
  name?: string
  shared: boolean
  /** Estancia y lado de los que sale el tramo; en una compartida, la del norte u oeste. */
  moduleId: string
  side: Side
  /** La otra estancia de una pared compartida. */
  otherId?: string
  horizontal: boolean
  /** Coordenada fija de la línea (y si es horizontal, x si es vertical). */
  pos: number
  from: number
  to: number
  thickness: number
  /** Sin pared: el tramo queda diáfano. */
  open: boolean
  skirting: Required<Skirting>
}

const EPS = 1e-6
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max)

export function deriveWalls(modules: PlacedModule[], joints: Joints): Wall[] {
  const walls: Wall[] = []
  for (const m of modules) {
    for (const side of SIDES) {
      const line = wallLine(m, side)
      const end = line.start + line.length
      const touching: { from: number; to: number; other: PlacedModule }[] = []
      for (const other of modules) {
        if (other === m) continue
        const facing = wallLine(other, OPPOSITE[side])
        if (Math.abs(facing.pos - line.pos) > EPS) continue
        const from = Math.max(facing.start, line.start)
        const to = Math.min(facing.start + facing.length, end)
        if (to - from > EPS) touching.push({ from, to, other })
      }
      touching.sort((a, b) => a.from - b.from)

      const base = { moduleId: m.id, side, horizontal: line.horizontal, pos: line.pos }
      let exteriors = 0
      const exterior = (from: number, to: number) => {
        if (to - from < EPS) return
        walls.push({
          ...base,
          key: `ext:${m.id}:${side}:${exteriors++}`,
          name: m.wallNames?.[side],
          shared: false,
          from,
          to,
          thickness: wallThickness(m, side),
          open: !!m.open?.[side],
          skirting: skirtingOf(m.skirting?.[side]),
        })
      }
      let cursor = line.start
      for (const t of touching) {
        exterior(cursor, t.from)
        // Cada pared compartida se emite una sola vez, desde la estancia que la tiene al sur o al este.
        if (side === 's' || side === 'e') {
          const pair = pairKey(m.id, t.other.id)
          walls.push({
            ...base,
            key: `joint:${pair}`,
            name: joints[pair]?.name,
            shared: true,
            otherId: t.other.id,
            from: t.from,
            to: t.to,
            thickness: joints[pair]?.thickness ?? DEFAULT_JOINT_THICKNESS,
            open: !!joints[pair]?.open,
            skirting: skirtingOf(joints[pair]?.skirting),
          })
        }
        cursor = t.to
      }
      exterior(cursor, end)
    }
  }
  return walls
}

/** Franja que ocupa el grosor de la pared, perpendicular a su línea: [mín, máx]. */
export function wallAcross(w: Wall): [number, number] {
  if (w.shared) return [w.pos - w.thickness / 2, w.pos + w.thickness / 2]
  return w.side === 'n' || w.side === 'w'
    ? [w.pos, w.pos + w.thickness]
    : [w.pos - w.thickness, w.pos]
}

/** Tramo absoluto que ocupa un hueco sobre la línea de su lado. */
export function openingSpan(o: Opening, modules: PlacedModule[]) {
  const module = modules.find((m) => m.id === o.moduleId)
  if (!module) return null
  const line = wallLine(module, o.side)
  const from = line.start + o.offset
  return { line, from, to: from + o.width }
}

/** Pared en la que cae un hueco: la de su línea que contiene su centro. */
export function wallOf(o: Opening, modules: PlacedModule[], walls: Wall[]) {
  const span = openingSpan(o, modules)
  if (!span) return undefined
  const { line } = span
  // Un hueco arrastrado más allá del lado sigue contando en su último tramo.
  const center = clamp((span.from + span.to) / 2, line.start, line.start + line.length)
  return walls.find(
    (w) =>
      (w.moduleId === o.moduleId || w.otherId === o.moduleId) &&
      w.horizontal === line.horizontal &&
      Math.abs(w.pos - line.pos) < EPS &&
      center >= w.from - EPS &&
      center <= w.to + EPS,
  )
}

/** Huecos de una pared con su tramo absoluto, ordenados a lo largo de ella. */
export function openingsOf(wall: Wall, modules: PlacedModule[], walls: Wall[], openings: Opening[]) {
  return openings
    .filter((o) => wallOf(o, modules, walls)?.key === wall.key)
    .map((o) => {
      const span = openingSpan(o, modules)!
      return { opening: o, from: span.from, to: span.to }
    })
    .sort((a, b) => a.from - b.from)
}

/**
 * Encaja `o` en la pared donde cae: lo acerca al tramo válido entre sus
 * extremos y devuelve null si no cabe o pisa otro hueco de esa pared.
 */
export function fitOpening(
  o: Opening,
  modules: PlacedModule[],
  walls: Wall[],
  others: Opening[],
): Opening | null {
  const span = openingSpan(o, modules)
  const wall = wallOf(o, modules, walls)
  if (!span || !wall) return null
  if (o.width > wall.to - wall.from - 2 * CORNER_GAP + EPS) return null
  const from = clamp(span.from, wall.from + CORNER_GAP, wall.to - CORNER_GAP - o.width)
  const clash = openingsOf(wall, modules, walls, others).some(
    (x) => x.opening.id !== o.id && from < x.to - EPS && x.from < from + o.width - EPS,
  )
  return clash ? null : { ...o, offset: roundSize(from - span.line.start) }
}

/** Reencaja todos los huecos tras cambiar las estancias; los que ya no caben se pierden. */
export function refitOpenings(modules: PlacedModule[], joints: Joints, openings: Opening[]) {
  const walls = deriveWalls(modules, joints)
  const result: Opening[] = []
  for (const o of openings) {
    const fitted = fitOpening(o, modules, walls, result)
    if (fitted) result.push(fitted)
  }
  return result
}

/** Pared más cercana al punto (px, py) del plano, a `maxDist` metros como mucho. */
export function nearestWall(px: number, py: number, walls: Wall[], maxDist: number) {
  let best: { wall: Wall; along: number; dist: number } | null = null
  for (const wall of walls) {
    const along = wall.horizontal ? px : py
    const across = Math.abs((wall.horizontal ? py : px) - wall.pos)
    const beyond = Math.max(0, wall.from - along, along - wall.to)
    const dist = Math.hypot(across, beyond)
    if (dist <= maxDist && (!best || dist < best.dist)) best = { wall, along, dist }
  }
  return best
}
