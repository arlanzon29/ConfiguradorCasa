// Catálogo de acabados. Para añadir un suelo: deja la imagen (repetible, ~1024 px)
// en public/texturas/suelos/ y añade aquí una línea con la medida real que cubre.

import type { PlacedModule, Side } from './house'

export interface FloorFinish {
  id: string
  name: string
  /** Color de la muestra del panel, y del suelo en 3D si no hay textura. El plano 2D no lo usa. */
  color: string
  /** Ruta de la imagen, relativa a public/. */
  texture?: string
  /** Metros reales que cubre la imagen: [ancho, alto]. */
  size?: [number, number]
}

export const FLOORS: FloorFinish[] = [
  { id: 'base', name: 'Sin acabado', color: '#c9b79a' },
  {
    id: 'pino',
    name: 'Madera de pino',
    color: '#a9834f',
    texture: '/texturas/suelos/madera-pino.jpg',
    size: [2, 2],
  },
]

export const DEFAULT_WALL_COLOR = '#f2efe8'

/** Colores de pared sugeridos; además se puede elegir cualquier otro. */
export const WALL_COLORS: { name: string; color: string }[] = [
  { name: 'Blanco roto', color: DEFAULT_WALL_COLOR },
  { name: 'Blanco', color: '#ffffff' },
  { name: 'Gris perla', color: '#d9d9d6' },
  { name: 'Arena', color: '#e3d5bd' },
  { name: 'Salvia', color: '#c5d1bd' },
  { name: 'Azul grisáceo', color: '#b9c7d3' },
  { name: 'Terracota', color: '#c98b6b' },
  { name: 'Antracita', color: '#4a4f55' },
]

/** Color de la pared del lado `side` de una estancia, vista desde dentro. */
export const interiorColor = (room: PlacedModule | undefined, side: Side) =>
  room?.sideColors?.[side] ?? room?.wallColor ?? DEFAULT_WALL_COLOR

export const floorFinish = (id?: string) => FLOORS.find((f) => f.id === id) ?? FLOORS[0]
