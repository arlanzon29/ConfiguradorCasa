// Catálogo de acabados. Para añadir un suelo: deja la imagen (repetible, ~1024 px)
// en public/texturas/suelos/ y añade aquí una línea con la medida real que cubre.

import type { PlacedModule, Side } from './house'

export interface FloorFinish {
  id: string
  /** Código de artículo, para asociarlo a la base de costes (fuera de la web). */
  code: string
  name: string
  /** Color de la muestra del panel, y del suelo en 3D si no hay textura. El plano 2D no lo usa. */
  color: string
  /** Ruta de la imagen, relativa a public/. */
  texture?: string
  /** Metros reales que cubre la imagen: [ancho, alto]. */
  size?: [number, number]
}

export const FLOORS: FloorFinish[] = [
  // Códigos provisionales, a falta de los de la empresa.
  { id: 'base', code: 'ACA-SIN-ACABADO', name: 'Sin acabado', color: '#c9b79a' },
  {
    id: 'pino',
    code: 'ACA-MAT-PINO',
    name: 'Madera de pino',
    color: '#a9834f',
    texture: 'texturas/suelos/madera-pino.jpg',
    size: [2, 2],
  },
  {
    id: 'gris-perla',
    code: 'ACA-MAT-GRIS-PERLA',
    name: 'Granito gris perla',
    color: '#b9b7b0',
    texture: 'texturas/suelos/gris-perla.jpg',
    size: [1.3, 0.69],
  },
]

export const DEFAULT_WALL_COLOR = '#f2efe8'

/** Colores de pared sugeridos; además se puede elegir cualquier otro. */
export const WALL_COLORS: { name: string; code: string; color: string }[] = [
  { name: 'Blanco roto', code: 'ACA-COL-BLANCO-ROTO', color: DEFAULT_WALL_COLOR },
  { name: 'Blanco', code: 'ACA-COL-BLANCO', color: '#ffffff' },
  { name: 'Gris perla', code: 'ACA-COL-GRIS-PERLA', color: '#d9d9d6' },
  { name: 'Arena', code: 'ACA-COL-ARENA', color: '#e3d5bd' },
  { name: 'Salvia', code: 'ACA-COL-SALVIA', color: '#c5d1bd' },
  { name: 'Azul grisáceo', code: 'ACA-COL-AZUL-GRISACEO', color: '#b9c7d3' },
  { name: 'Terracota', code: 'ACA-COL-TERRACOTA', color: '#c98b6b' },
  { name: 'Antracita', code: 'ACA-COL-ANTRACITA', color: '#4a4f55' },
]

/** Un color que no es de la paleta, elegido a mano. */
export const FREE_COLOR_CODE = 'ACA-COL-LIBRE'

/**
 * Código de artículo de un acabado: el del material si lo es, el del color de
 * la paleta si coincide, o el del color libre.
 */
export function finishCode(finish: Finish | undefined, fallback: Finish): string {
  const value = (finish ?? fallback).toLowerCase()
  if (!value.startsWith('#')) return FLOORS.find((f) => f.id === value)?.code ?? FREE_COLOR_CODE
  return WALL_COLORS.find((c) => c.color.toLowerCase() === value)?.code ?? FREE_COLOR_CODE
}

/** Acabado (color o material) de la pared del lado `side` de una estancia, vista desde dentro. */
export const interiorFinish = (room: PlacedModule | undefined, side: Side): Finish =>
  room?.sideColors?.[side] ?? room?.wallColor ?? DEFAULT_WALL_COLOR

/** Color de esa misma cara: el liso, o el de muestra de su material. */
export const interiorColor = (room: PlacedModule | undefined, side: Side) =>
  resolveFinish(interiorFinish(room, side), DEFAULT_WALL_COLOR).color

/**
 * Acabado de una superficie: un color liso (`#rrggbb`) o un material del
 * catálogo (su `id`). Es el mismo concepto para carpintería, suelos y paredes
 * (`PlacedModule.floor`, `wallColor` y `sideColors` guardan un acabado).
 */
export type Finish = string

/** Materiales del catálogo: los acabados que llevan textura. */
export const MATERIALS = FLOORS.filter((f) => f.texture)

// Puertas y ventanas, mientras no se elija otro.
export const DEFAULT_JOINERY_FINISH: Finish = '#f3f1ec'

/** Color y, si es un material, textura de un acabado. Uno desconocido cae en `fallback`. */
export function resolveFinish(finish: Finish | undefined, fallback: Finish): Omit<FloorFinish, 'id' | 'name' | 'code'> {
  const value = finish ?? fallback
  if (value.startsWith('#')) return { color: value }
  return MATERIALS.find((m) => m.id === value) ?? { color: fallback }
}

/** Techo, mientras no se elija otro. */
export const DEFAULT_CEILING: Finish = '#ffffff'

/** Terreno de la parcela si no se elige otro: el verde de césped de siempre. */
export const DEFAULT_GROUND: Finish = '#b7c7a3'

/** Color de la solera de los módulos (hormigón; no se elige). Inventado. */
export const SLAB_COLOR = '#b9b5ad'

/** Suelo sin acabado: la losa vista. */
export const BASE_FLOOR = FLOORS[0]

/** Acabado del suelo de una estancia, o nada si no lo tiene ("base" es el de antes sin acabado). */
export const floorOf = (room: PlacedModule): Finish | undefined =>
  room.floor && room.floor !== BASE_FLOOR.id ? room.floor : undefined
