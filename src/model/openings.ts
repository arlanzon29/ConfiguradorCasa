import { PlacedModule, Side, WALL_HEIGHT, roundSize, sideLength } from './house'

// Un hueco (puerta o ventana) se ancla a un lado de una estancia: su posición
// se mide a lo largo de ese lado desde su extremo oeste (lados n/s) o norte
// (e/w), y así se mueve con ella. En qué pared cae (exterior o compartida con
// la estancia vecina) no se guarda: se deduce en walls.ts.

export type OpeningKind = 'door' | 'window'

export interface OpeningType {
  id: string
  kind: OpeningKind
  name: string
  width: number
  height: number
  sill: number
}

export const OPENING_CATALOG: OpeningType[] = [
  { id: 'door', kind: 'door', name: 'Puerta 0,9 m', width: 0.9, height: 2.1, sill: 0 },
  { id: 'sliding', kind: 'door', name: 'Corredera 2,4 m', width: 2.4, height: 2.1, sill: 0 },
  { id: 'window', kind: 'window', name: 'Ventana 1,2 × 1,2 m', width: 1.2, height: 1.2, sill: 0.9 },
]

export interface Opening {
  id: string
  kind: OpeningKind
  moduleId: string
  side: Side
  offset: number
  width: number
  height: number
  /** Altura del borde inferior sobre el suelo; 0 en puertas. */
  sill: number
}

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
  switch (o.side) {
    case 'n':
      return { ...o, side: 'e' }
    case 's':
      return { ...o, side: 'w' }
    case 'e':
      return { ...o, side: 's', offset: roundSize(newWidth - o.offset - o.width) }
    case 'w':
      return { ...o, side: 'n', offset: roundSize(newWidth - o.offset - o.width) }
  }
}
