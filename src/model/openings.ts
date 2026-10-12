import type { Finish } from './finishes'
import { PlacedModule, Side, WALL_HEIGHT, roundSize, sideLength } from './house'

// Un hueco (puerta o ventana) se ancla a un lado de una estancia: su posición
// se mide a lo largo de ese lado desde su extremo oeste (lados n/s) o norte
// (e/w), y así se mueve con ella. En qué pared cae (exterior o compartida con
// la estancia vecina) no se guarda: se deduce en walls.ts.

export type OpeningKind = 'door' | 'window'

export interface OpeningType {
  id: string
  /** Código de artículo, para asociarlo a la base de costes (fuera de la web). */
  code: string
  kind: OpeningKind
  name: string
  width: number
  height: number
  sill: number
}

export const OPENING_CATALOG: OpeningType[] = [
  // Códigos provisionales, a falta de los de EuroCasa.
  { id: 'door', code: 'HUE-PUERTA', kind: 'door', name: 'Puerta 0,9 m', width: 0.9, height: 2.1, sill: 0 },
  { id: 'sliding', code: 'HUE-CORREDERA', kind: 'door', name: 'Corredera 2,4 m', width: 2.4, height: 2.1, sill: 0 },
  { id: 'window', code: 'HUE-VENTANA', kind: 'window', name: 'Ventana 1,2 × 1,2 m', width: 1.2, height: 1.2, sill: 0.9 },
]

/**
 * Código de artículo de un hueco puesto: depende de su clase y, en las puertas,
 * de si es abatible o corredera (por su ancho). Las medidas van aparte, en la
 * cantidad que se mide.
 */
export function openingCode(o: Pick<Opening, 'kind' | 'width'>) {
  const id = o.kind === 'window' ? 'window' : swingDoor(o) ? 'door' : 'sliding'
  return OPENING_CATALOG.find((t) => t.id === id)!.code
}

export interface Opening {
  id: string
  /** Nombre que le ha puesto el usuario; si falta, uno por defecto (names.ts). */
  name?: string
  kind: OpeningKind
  moduleId: string
  side: Side
  offset: number
  width: number
  height: number
  /** Altura del borde inferior sobre el suelo; 0 en puertas. */
  sill: number
  /**
   * Puerta abatible: hacia dónde abre. `in` (por defecto), hacia la estancia a la
   * que está anclada; `out`, hacia el otro lado de la pared.
   */
  swing?: 'in' | 'out'
  /**
   * Puerta abatible: canto de las bisagras. `start` (por defecto), el extremo
   * oeste o norte del hueco; `end`, el opuesto.
   */
  hinge?: 'start' | 'end'
  /** Puerta abatible dibujada cerrada en 3D; si no, abierta a 90° como en el plano. */
  closed?: boolean
  /** Acabado de su carpintería (cerco y hojas): un color o un material. */
  finish?: Finish
}

// Hasta este ancho una puerta es abatible; por encima, corredera.
export const MAX_SWING_DOOR = 1.2
export const swingDoor = (o: Pick<Opening, 'kind' | 'width'>) =>
  o.kind === 'door' && o.width <= MAX_SWING_DOOR

/**
 * Hacia dónde abre una puerta, atravesando su pared: 1 hacia el sur o el este,
 * -1 hacia el norte o el oeste. Su estancia queda al sur o al este de sus lados
 * norte y oeste.
 */
export const swingSign = (o: Pick<Opening, 'side' | 'swing'>) =>
  (o.side === 'n' || o.side === 'w') === (o.swing !== 'out') ? 1 : -1

export const MIN_OPENING = 0.4
// Distancia mínima de un hueco al extremo de su pared.
export const CORNER_GAP = 0.2

export const OPPOSITE: Record<Side, Side> = { n: 's', s: 'n', e: 'w', w: 'e' }

/** Borde de un lado de una estancia, en coordenadas del plano. */
export function wallLine(m: PlacedModule, side: Side) {
  const horizontal = side === 'n' || side === 's'
  return {
    horizontal,
    // Coordenada fija de la línea (y si es horizontal, x si es vertical).
    pos: side === 'n' ? m.y : side === 's' ? m.y + m.depth : side === 'w' ? m.x : m.x + m.width,
    start: horizontal ? m.x : m.y,
    length: sideLength(m, side),
  }
}

export const validOpeningSize = (o: Pick<Opening, 'width' | 'height' | 'sill'>) =>
  o.width >= MIN_OPENING && o.height >= MIN_OPENING && o.sill + o.height <= WALL_HEIGHT

/** Hueco de una estancia tras girarla 90° en sentido horario (`newWidth` = su fondo anterior). */
export function rotateOpening(o: Opening, newWidth: number): Opening {
  // En los lados este y oeste el hueco pasa a medirse desde el otro extremo, y
  // con él cambia de nombre el canto de las bisagras.
  const flipped = (side: Side): Opening => ({
    ...o,
    side,
    offset: roundSize(newWidth - o.offset - o.width),
    ...(o.kind === 'door' && { hinge: o.hinge === 'end' ? 'start' : 'end' }),
  })
  switch (o.side) {
    case 'n':
      return { ...o, side: 'e' }
    case 's':
      return { ...o, side: 'w' }
    case 'e':
      return flipped('s')
    case 'w':
      return flipped('n')
  }
}
