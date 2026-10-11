// Todas las medidas están en metros. Cada rectángulo del plano es una estancia
// (en el código, "module" por razones históricas) y guarda posición y tamaño
// reales, no celdas de rejilla: la rejilla es solo una ayuda del editor.

import type { Board } from './boards'
import type { RoomLight } from './lights'
import type { Mirror } from './mirrors'
import type { Vinyl } from './vinyls'

// Paso de la rejilla: 20 cm. Un módulo de 13 × 4,20 m son 65 × 21 cuadros exactos.
export const GRID = 0.2
// Caben dos módulos en línea (2 × 13 de ancho) y en L: uno horizontal (4,20)
// con otro vertical (13) debajo.
export const PLOT = { width: 28, depth: 20 }

export interface ModuleType {
  id: string
  name: string
  width: number
  depth: number
}

export const CATALOG: ModuleType[] = [
  { id: 'm3x3', name: 'Estancia 3 × 3', width: 3, depth: 3 },
  { id: 'm3x6', name: 'Estancia 3 × 6', width: 3, depth: 6 },
  { id: 'm3x9', name: 'Estancia 3 × 9', width: 3, depth: 9 },
]

/** Lados de un módulo según el plano: norte arriba, oeste a la izquierda. */
export type Side = 'n' | 's' | 'e' | 'w'
export const SIDES: Side[] = ['n', 's', 'e', 'w']

export const WALL_HEIGHT = 2.7
export const DEFAULT_WALL_THICKNESS = 0.15
export const MIN_WALL_THICKNESS = 0.05
export const MAX_WALL_THICKNESS = 0.5

/** Rodapié de una pared; lo que falte usa los valores por defecto. */
export interface Skirting {
  /** Alto en metros; 0 es sin rodapié. */
  height?: number
  color?: string
}

export const DEFAULT_SKIRTING_HEIGHT = 0.07
export const DEFAULT_SKIRTING_COLOR = '#ffffff'
export const MAX_SKIRTING_HEIGHT = 0.3

export const skirtingOf = (s?: Skirting) => ({
  height: s?.height ?? DEFAULT_SKIRTING_HEIGHT,
  color: s?.color ?? DEFAULT_SKIRTING_COLOR,
})

export interface PlacedModule {
  id: string
  /** Nombre que le ha puesto el usuario; si falta, uno por defecto (names.ts). */
  name?: string
  typeId: string
  x: number
  y: number
  width: number
  depth: number
  /** Módulo de fábrica del que cuelga; falta en los planos sin módulos. */
  shellId?: string
  /** Acabado del suelo (id de FLOORS en finishes.ts). */
  floor?: string
  /** Suelo girado 90°, para elegir la dirección de las lamas. */
  floorTurned?: boolean
  /** Color de las caras de pared que dan a esta estancia. */
  wallColor?: string
  /** Color propio de la pared de un lado, por dentro; si falta, vale wallColor. */
  sideColors?: Partial<Record<Side, string>>
  /** Vinilos pegados a la pared de cada lado, por dentro (vinyls.ts). */
  vinyls?: Partial<Record<Side, Vinyl[]>>
  /** Espejos colgados de la pared de cada lado, por dentro (mirrors.ts). */
  mirrors?: Partial<Record<Side, Mirror[]>>
  /** Tableros anclados a la pared de cada lado, por dentro (boards.ts). */
  boards?: Partial<Record<Side, Board[]>>
  /** Focos del techo (lights.ts). */
  lights?: RoomLight[]
  // Los tres siguientes solo afectan a los tramos exteriores de cada lado; las
  // paredes compartidas con otra estancia tienen sus propios ajustes (walls.ts).
  /** Nombre puesto a la pared exterior de un lado. */
  wallNames?: Partial<Record<Side, string>>
  /** Rodapié por lado, en la cara de dentro. */
  skirting?: Partial<Record<Side, Skirting>>
  /** Grosor de pared por lado; los que falten usan DEFAULT_WALL_THICKNESS. */
  walls?: Partial<Record<Side, number>>
  /** Lados sin pared exterior. */
  open?: Partial<Record<Side, boolean>>
}

export const validWallThickness = (t: number) =>
  t >= MIN_WALL_THICKNESS && t <= MAX_WALL_THICKNESS

export const wallThickness = (m: PlacedModule, side: Side) =>
  m.walls?.[side] ?? DEFAULT_WALL_THICKNESS

export const sideLength = (m: Pick<PlacedModule, 'width' | 'depth'>, side: Side) =>
  side === 'n' || side === 's' ? m.width : m.depth

export type Rect = Pick<PlacedModule, 'x' | 'y' | 'width' | 'depth'>

export const snap = (v: number) => roundSize(Math.round(v / GRID) * GRID)

export const clampToPlot = (r: Rect): Rect => ({
  ...r,
  x: Math.min(Math.max(r.x, 0), PLOT.width - r.width),
  y: Math.min(Math.max(r.y, 0), PLOT.depth - r.depth),
})

const insidePlot = (r: Rect) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= PLOT.width && r.y + r.depth <= PLOT.depth

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth

// --- Módulos de fábrica -----------------------------------------------------
// La casa se fabrica en módulos transportables: cada uno mide como máximo
// 13 × 4,20 m (en cualquiera de las dos orientaciones) y una casa puede tener
// hasta dos, unidos por un lado o en L. Las estancias se dibujan dentro de un
// módulo y no pueden salirse de él.

export const SHELL_MAX_LONG = 13
export const SHELL_MAX_SHORT = 4.2
export const MAX_SHELLS = 2

export interface Shell {
  id: string
  /** Nombre que le ha puesto el usuario; si falta, uno por defecto (names.ts). */
  name?: string
  x: number
  y: number
  width: number
  depth: number
}

export const validShellSize = (width: number, depth: number) =>
  Math.min(width, depth) >= MIN_SIZE &&
  Math.max(width, depth) <= SHELL_MAX_LONG &&
  Math.min(width, depth) <= SHELL_MAX_SHORT

const EPS = 1e-6

export const contains = (outer: Rect, r: Rect) =>
  r.x >= outer.x - EPS &&
  r.y >= outer.y - EPS &&
  r.x + r.width <= outer.x + outer.width + EPS &&
  r.y + r.depth <= outer.y + outer.depth + EPS

/** Lleva `r` dentro de `outer` moviéndolo lo mínimo (se supone que cabe). */
export const clampInto = (outer: Rect, r: Rect): Rect => ({
  ...r,
  x: Math.min(Math.max(r.x, outer.x), outer.x + outer.width - r.width),
  y: Math.min(Math.max(r.y, outer.y), outer.y + outer.depth - r.depth),
})

/** ¿Cabe el módulo `shell` en la parcela sin pisar a los demás? */
export const shellFits = (shell: Rect, others: Rect[]) =>
  insidePlot(shell) && !others.some((o) => overlaps(shell, o))

/**
 * ¿Cabe `r` sin solaparse con `others`? Si la casa tiene módulos, además
 * debe quedar entero dentro de uno; sin módulos (planos antiguos) vale toda la parcela.
 */
export const fits = (r: Rect, others: Rect[], shells: Rect[] = []) =>
  insidePlot(r) &&
  !others.some((o) => overlaps(r, o)) &&
  (shells.length === 0 || shells.some((s) => contains(s, r)))

export function findFreeSpot(width: number, depth: number, modules: Rect[], shells: Rect[] = []) {
  // Dentro de cada módulo se busca desde su esquina, que puede no caer en la rejilla.
  const areas = shells.length ? shells : [{ x: 0, y: 0, width: PLOT.width, depth: PLOT.depth }]
  for (const area of areas) {
    // Se cuenta en pasos enteros y se redondea: sumar 0,2 una y otra vez acumula error.
    for (let j = 0; area.y + j * GRID + depth <= area.y + area.depth + EPS; j++) {
      for (let i = 0; area.x + i * GRID + width <= area.x + area.width + EPS; i++) {
        const spot = { x: roundSize(area.x + i * GRID), y: roundSize(area.y + j * GRID) }
        if (fits({ ...spot, width, depth }, modules, shells)) return spot
      }
    }
  }
  return null
}

export const MIN_SIZE = 1

/** Los tamaños libres se redondean al centímetro. */
export const roundSize = (v: number) => Math.round(v * 100) / 100

export const validSize = (width: number, depth: number) =>
  width >= MIN_SIZE && depth >= MIN_SIZE && width <= PLOT.width && depth <= PLOT.depth

export const formatMeters = (v: number) => String(roundSize(v)).replace('.', ',')

export const totalArea = (modules: Rect[]) =>
  roundSize(modules.reduce((sum, m) => sum + m.width * m.depth, 0))
