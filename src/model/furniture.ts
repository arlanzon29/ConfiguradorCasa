import { PLOT } from './house'

// Mobiliario y equipamiento (el modo "Opciones"). Cada pieza es un tipo del
// catálogo colocado en el plano: su centro, en metros, y un giro en pasos de 90°.
// Con giro 0, la parte trasera del mueble (cabecero, respaldo, fondo del
// armario) mira al norte del plano.

export type FurnitureShape = 'table' | 'bed' | 'wardrobe' | 'sofa' | 'chair'

// Familias del catálogo, en el orden en que se muestran. Para añadir una
// (cocina, baño…) basta con declararla aquí y asignarla a sus piezas.
export const FAMILIES = [
  { id: 'salon', name: 'Salón' },
  { id: 'comedor', name: 'Comedor' },
  { id: 'dormitorio', name: 'Dormitorio' },
] as const

export type FamilyId = (typeof FAMILIES)[number]['id']

export interface FurnitureType {
  id: string
  family: FamilyId
  name: string
  shape: FurnitureShape
  width: number
  depth: number
  height: number
}

export const FURNITURE: FurnitureType[] = [
  { id: 'mesa-comedor', family: 'comedor', name: 'Mesa de comedor', shape: 'table', width: 1.6, depth: 0.9, height: 0.75 },
  { id: 'mesa-centro', family: 'salon', name: 'Mesa de centro', shape: 'table', width: 1.1, depth: 0.6, height: 0.4 },
  { id: 'silla', family: 'comedor', name: 'Silla', shape: 'chair', width: 0.45, depth: 0.45, height: 0.9 },
  { id: 'sofa', family: 'salon', name: 'Sofá', shape: 'sofa', width: 2, depth: 0.9, height: 0.8 },
  { id: 'cama-doble', family: 'dormitorio', name: 'Cama doble', shape: 'bed', width: 1.6, depth: 2, height: 0.5 },
  { id: 'cama-individual', family: 'dormitorio', name: 'Cama individual', shape: 'bed', width: 0.9, depth: 2, height: 0.5 },
  { id: 'mesilla', family: 'dormitorio', name: 'Mesilla', shape: 'table', width: 0.45, depth: 0.4, height: 0.5 },
  { id: 'armario', family: 'dormitorio', name: 'Armario', shape: 'wardrobe', width: 1.8, depth: 0.6, height: 2.2 },
]

export const furnitureType = (id: string) => FURNITURE.find((f) => f.id === id)

export type Rotation = 0 | 90 | 180 | 270

export interface FurnitureItem {
  id: string
  typeId: string
  /** Centro de la pieza en el plano. */
  x: number
  y: number
  rotation: Rotation
  /** Estancia de la que cuelga; solo falta si no hay ninguna donde está. */
  roomId?: string
}

// Los muebles se colocan en pasos de 5 cm.
export const snapFurniture = (v: number) => Math.round(v * 20) / 20

/** Mantiene la pieza entera dentro de la parcela, teniendo en cuenta su giro. */
export function clampFurniture(item: FurnitureItem): FurnitureItem {
  const type = furnitureType(item.typeId)
  if (!type) return item
  const turned = item.rotation === 90 || item.rotation === 270
  const halfW = (turned ? type.depth : type.width) / 2
  const halfD = (turned ? type.width : type.depth) / 2
  return {
    ...item,
    x: Math.min(Math.max(item.x, halfW), PLOT.width - halfW),
    y: Math.min(Math.max(item.y, halfD), PLOT.depth - halfD),
  }
}
