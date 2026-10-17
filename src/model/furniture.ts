import { PLOT } from './house'

// Mobiliario y equipamiento (el modo "Opciones"). Cada pieza es un tipo del
// catálogo colocado en el plano: su centro, en metros, y un giro en pasos de 90°.
// Con giro 0, la parte trasera del mueble (cabecero, respaldo, fondo del
// armario) mira al norte del plano.

export type FurnitureShape = 'table' | 'bed' | 'wardrobe' | 'sofa' | 'chair' | 'tv' | 'appliance' | 'hob' | 'fridge' | 'washer' | 'oven' | 'sink' | 'cabinet-table' | 'stool'

// Familias del catálogo, en el orden en que se muestran. Para añadir una
// (cocina, baño…) basta con declararla aquí y asignarla a sus piezas.
export const FAMILIES = [
  { id: 'salon', name: 'Salón' },
  { id: 'comedor', name: 'Comedor' },
  { id: 'dormitorio', name: 'Dormitorio' },
  { id: 'cocina', name: 'Cocina' },
] as const

export type FamilyId = (typeof FAMILIES)[number]['id']

export interface FurnitureType {
  id: string
  /** Código de artículo, para asociarlo a la base de costes (fuera de la web). */
  code: string
  family: FamilyId
  name: string
  shape: FurnitureShape
  width: number
  depth: number
  height: number
  /** Altura sobre el suelo a la que va colocada (una placa de cocina, sobre la encimera). */
  lift?: number
  /**
   * Modelo detallado (`.glb` en `public/modelos/`, ruta sin barra inicial), hecho
   * en Blender. Solo se usa con "Muebles detallados"; si no, las cajas de siempre.
   * Debe apoyar en el suelo, con la espalda hacia -z, y se ajusta a las medidas.
   */
  model?: string
  /**
   * Lo que se puede cambiar de color en este mueble, y entre qué colores. Lo que
   * no está aquí no se cambia. Cada parte es un material del modelo detallado
   * (por su nombre en Blender); la primera opción es la de por defecto.
   */
  parts?: FurniturePart[]
}

export interface FurniturePart {
  id: string
  name: string
  /** Nombre del material en el `.glb` (el de Blender). */
  material: string
  options: { id: string; name: string; color: string }[]
}

// Colores de tela de la prueba (el usuario, 2026-10-17); a falta de los de EuroCasa.
const AZUL = { id: 'azul', name: 'Azul', color: '#8fa3b0' }
const BLANCO = { id: 'blanco', name: 'Blanco', color: '#ece9e3' }
const ROSA = { id: 'rosa', name: 'Rosa', color: '#e2b4bd' }
const ROJO = { id: 'rojo', name: 'Rojo', color: '#a8262e' }

const SOFA_PARTS: FurniturePart[] = [
  { id: 'tapiceria', name: 'Tapicería', material: 'Tela sofá', options: [AZUL, BLANCO, ROSA] },
  { id: 'cojin-izquierdo', name: 'Cojín izquierdo', material: 'Cojín izquierdo', options: [BLANCO, AZUL, ROJO] },
  { id: 'cojin-derecho', name: 'Cojín derecho', material: 'Cojín derecho', options: [BLANCO, AZUL, ROJO] },
]

export const FURNITURE: FurnitureType[] = [
  // Los códigos son provisionales, a falta de los de EuroCasa.
  { id: 'mesa-comedor', code: 'MOB-MESA-COMEDOR', family: 'comedor', name: 'Mesa de comedor', shape: 'table', width: 1.6, depth: 0.9, height: 0.75 },
  { id: 'mesa-centro', code: 'MOB-MESA-CENTRO', family: 'salon', name: 'Mesa de centro', shape: 'table', width: 1.1, depth: 0.6, height: 0.4 },
  { id: 'television', code: 'MOB-TELEVISION', family: 'salon', name: 'Televisión', shape: 'tv', width: 1.2, depth: 0.25, height: 0.75 },
  { id: 'silla', code: 'MOB-SILLA', family: 'comedor', name: 'Silla', shape: 'chair', width: 0.45, depth: 0.45, height: 0.9 },
  { id: 'sofa', code: 'MOB-SOFA', family: 'salon', name: 'Sofá', shape: 'sofa', width: 2, depth: 0.9, height: 0.8, model: 'modelos/sofa.glb', parts: SOFA_PARTS },
  { id: 'cama-doble', code: 'MOB-CAMA-DOBLE', family: 'dormitorio', name: 'Cama doble', shape: 'bed', width: 1.6, depth: 2, height: 0.5 },
  { id: 'cama-individual', code: 'MOB-CAMA-INDIVIDUAL', family: 'dormitorio', name: 'Cama individual', shape: 'bed', width: 0.9, depth: 2, height: 0.5 },
  { id: 'mesilla', code: 'MOB-MESILLA', family: 'dormitorio', name: 'Mesilla', shape: 'table', width: 0.45, depth: 0.4, height: 0.5 },
  { id: 'armario', code: 'MOB-ARMARIO', family: 'dormitorio', name: 'Armario', shape: 'wardrobe', width: 1.8, depth: 0.6, height: 2.2 },
  { id: 'armario-medio', code: 'MOB-ARMARIO-MEDIO', family: 'dormitorio', name: 'Armario medio', shape: 'wardrobe', width: 0.9, depth: 0.6, height: 2.2 },
  { id: 'lavavajillas', code: 'MOB-LAVAVAJILLAS', family: 'cocina', name: 'Lavavajillas', shape: 'appliance', width: 0.6, depth: 0.6, height: 0.82 },
  { id: 'vitroceramica', code: 'MOB-VITROCERAMICA', family: 'cocina', name: 'Vitrocerámica 4 fuegos', shape: 'hob', width: 0.5, depth: 0.5, height: 0.02, lift: 0.9 },
  { id: 'frigorifico', code: 'MOB-FRIGORIFICO', family: 'cocina', name: 'Frigorífico', shape: 'fridge', width: 0.6, depth: 0.6, height: 2.1 },
  { id: 'frigorifico-pequeno', code: 'MOB-FRIGORIFICO-PEQUENO', family: 'cocina', name: 'Frigorífico pequeño', shape: 'fridge', width: 0.6, depth: 0.6, height: 1.8 },
  { id: 'lavavajillas-pequeno', code: 'MOB-LAVAVAJILLAS-PEQUENO', family: 'cocina', name: 'Lavavajillas pequeño', shape: 'appliance', width: 0.45, depth: 0.6, height: 0.8 },
  { id: 'armario-cocina', code: 'MOB-ARMARIO-COCINA', family: 'cocina', name: 'Armario pequeño de cocina', shape: 'wardrobe', width: 0.45, depth: 0.6, height: 0.8 },
  { id: 'lavadora', code: 'MOB-LAVADORA', family: 'cocina', name: 'Lavadora', shape: 'washer', width: 0.6, depth: 0.6, height: 0.82 },
  { id: 'lavadora-pequena', code: 'MOB-LAVADORA-PEQUENA', family: 'cocina', name: 'Lavadora pequeña', shape: 'washer', width: 0.45, depth: 0.6, height: 0.8 },
  { id: 'horno', code: 'MOB-HORNO', family: 'cocina', name: 'Horno', shape: 'oven', width: 0.6, depth: 0.6, height: 0.82 },
  // Sin profundidad: se apoya sobre la encimera, con su base a 0,9 m (ajustable con la altura).
  { id: 'fregadero', code: 'MOB-FREGADERO', family: 'cocina', name: 'Fregadero', shape: 'sink', width: 0.4, depth: 0.45, height: 0.35, lift: 0.9 },
  { id: 'taburete', code: 'MOB-TABURETE', family: 'cocina', name: 'Taburete', shape: 'stool', width: 0.35, depth: 0.35, height: 0.65 },
  { id: 'mesa-armarios', code: 'MOB-MESA-ARMARIOS', family: 'cocina', name: 'Mesa con armarios', shape: 'cabinet-table', width: 1.2, depth: 0.6, height: 0.8 },
]

export const furnitureType = (id: string) => FURNITURE.find((f) => f.id === id)

export type Rotation = 0 | 90 | 180 | 270

export interface FurnitureItem {
  id: string
  /** Nombre que le ha puesto el usuario; si falta, uno por defecto (names.ts). */
  name?: string
  typeId: string
  /** Centro de la pieza en el plano. */
  x: number
  y: number
  rotation: Rotation
  /** Estancia de la que cuelga; solo falta si no hay ninguna donde está. */
  roomId?: string
  /** Altura sobre el suelo a la que está puesta, en metros. Si falta, la de su tipo. */
  elevation?: number
  /** Colores elegidos, por parte (`FurniturePart.id` → id de la opción). Lo que falta, por defecto. */
  colors?: Record<string, string>
}

/** La opción elegida de cada parte del mueble (o la de por defecto). */
export function partChoices(item: FurnitureItem) {
  return (furnitureType(item.typeId)?.parts ?? []).map((part) => ({
    part,
    option: part.options.find((o) => o.id === item.colors?.[part.id]) ?? part.options[0],
  }))
}

/** Altura sobre el suelo de una pieza: la suya si la tiene, y si no la de su tipo. */
export const liftOf = (item: FurnitureItem) => item.elevation ?? furnitureType(item.typeId)?.lift ?? 0

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
