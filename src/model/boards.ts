// Un tablero es una primitiva: una caja anclada a la cara de una pared que da a
// una estancia. Se guarda y se mide como el espejo (mirrors.ts): en su
// estancia, por lado, con `x` desde la esquina izquierda de la cara vista desde
// dentro e `y` desde el suelo. Además tiene fondo (lo que sale de la pared) y
// un acabado propio.

import { Finish, MATERIALS } from './finishes'
import { PlacedModule, Side, WALL_HEIGHT } from './house'

export interface Board {
  id: string
  /** Nombre que le ha puesto el usuario; si falta, uno por defecto (names.ts). */
  name?: string
  x: number
  y: number
  width: number
  height: number
  /** Lo que sale de la pared hacia la estancia. */
  depth: number
  /** Color liso o material del catálogo (finishes.ts). */
  finish: Finish
}

// Color si el acabado guardado ya no está en el catálogo.
export const BOARD_FALLBACK_COLOR = '#c9a877'
// Medidas y acabado con los que se coloca uno nuevo, en metros. Inventadas.
export const DEFAULT_BOARD = {
  width: 1,
  height: 1,
  depth: 0.02,
  y: 0,
  finish: MATERIALS[0]?.id ?? BOARD_FALLBACK_COLOR,
}
/** Lo mínimo que mide un tablero en cualquiera de sus tres medidas. */
export const MIN_BOARD = 0.005

/**
 * Postura: no se guarda, se deduce de cuál de las tres medidas es el grueso (la
 * menor). `wall`: contra la pared. `edge`: de canto, de pie y saliendo de la
 * pared. `shelf`: tumbado, como una balda.
 */
export type BoardPose = 'wall' | 'edge' | 'shelf'
type Dimension = 'width' | 'height' | 'depth'
const THIN: Record<BoardPose, Dimension> = { wall: 'depth', edge: 'width', shelf: 'height' }

export const BOARD_POSES: { id: BoardPose; name: string }[] = [
  { id: 'wall', name: 'Contra la pared' },
  { id: 'edge', name: 'De canto' },
  { id: 'shelf', name: 'Balda' },
]

export function boardPose(b: Pick<Board, Dimension>): BoardPose {
  if (b.depth <= b.width && b.depth <= b.height) return 'wall'
  return b.width <= b.height ? 'edge' : 'shelf'
}

/** Hasta dónde puede salir de la pared de `side`: el fondo de la estancia visto desde ella. */
export const boardReach = (room: PlacedModule, side: Side) =>
  side === 'n' || side === 's' ? room.depth : room.width

/**
 * El tablero puesto en otra postura: el grueso cambia de medida con la que
 * ocupaba ese sitio, y lo que no quepa en una cara de `length` metros se recorta.
 */
export function posedBoard(b: Board, pose: BoardPose, length: number, reach: number): Board {
  const [from, to] = [THIN[boardPose(b)], THIN[pose]]
  const next = { ...b, [from]: b[to], [to]: b[from] }
  next.width = Math.min(next.width, length)
  next.height = Math.min(next.height, WALL_HEIGHT)
  next.depth = Math.min(next.depth, reach)
  next.x = Math.min(next.x, length - next.width)
  next.y = Math.min(next.y, WALL_HEIGHT - next.height)
  return next
}

/** Mensaje de error si el tablero no cabe en una cara de `length` metros, o ''. */
export function boardProblem(b: Omit<Board, 'id' | 'finish'>, length: number, reach: number) {
  if (Math.min(b.width, b.height, b.depth) < MIN_BOARD - 1e-6) return 'Demasiado pequeño.'
  if (b.x < 0 || b.y < 0) return 'No puede ser negativa.'
  if (b.x + b.width > length + 1e-6) return 'Se sale de la pared por un lado.'
  if (b.y + b.height > WALL_HEIGHT + 1e-6) return 'Se sale de la pared por arriba.'
  if (b.depth > reach + 1e-6) return 'Se sale de la estancia.'
  return ''
}
