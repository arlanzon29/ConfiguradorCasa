// Nombre de cada cosa de la casa: el que le ha puesto el usuario (`name`) o, si
// no tiene, uno por defecto según lo que es y su sitio en la lista.

import { FurnitureItem, furnitureType } from './furniture'
import { PlacedModule, Shell, Side } from './house'
import { RoomLight } from './lights'
import { Mechanism, mechanismType } from './mechanisms'
import { Opening } from './openings'
import { Vinyl, vinylType } from './vinyls'
import { Wall } from './walls'

/** El nombre de la casa: el puesto por el usuario o, si no tiene, "Casa". */
export const DEFAULT_HOUSE_NAME = 'Casa'
export const houseName = (name?: string) => name ?? DEFAULT_HOUSE_NAME

/** Un nombre hecho apto para un archivo: minúsculas sin acentos y guiones ("Casa García" → "casa-garcia"). */
export const fileSlug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const SIDE_NAMES: Record<Side, string> = { n: 'norte', s: 'sur', e: 'este', w: 'oeste' }

export const defaultShellName = (shells: Shell[], id: string) =>
  `Módulo ${shells.findIndex((s) => s.id === id) + 1}`
export const shellName = (shells: Shell[], shell: Shell) =>
  shell.name ?? defaultShellName(shells, shell.id)

export const defaultRoomName = (modules: PlacedModule[], id: string) =>
  `Estancia ${modules.findIndex((m) => m.id === id) + 1}`
/** Vale también con solo el id, para nombrar la otra estancia de una pared compartida. */
export const roomName = (modules: PlacedModule[], id: string) =>
  modules.find((m) => m.id === id)?.name ?? defaultRoomName(modules, id)

export const defaultWallName = (wall: Wall) => `Pared ${SIDE_NAMES[wall.side]}`
export const wallName = (wall: Wall) => wall.name ?? defaultWallName(wall)

export const defaultLightName = (room: PlacedModule, id: string) =>
  `Foco ${(room.lights ?? []).findIndex((l) => l.id === id) + 1}`
export const lightName = (room: PlacedModule, light: RoomLight) =>
  light.name ?? defaultLightName(room, light.id)

export const defaultFurnitureName = (item: FurnitureItem) =>
  furnitureType(item.typeId)?.name ?? 'Mueble'
export const furnitureName = (item: FurnitureItem) => item.name ?? defaultFurnitureName(item)

/** Piezas colgadas de una cara de pared. */
export type PieceKind = 'vinyl' | 'mirror' | 'board' | 'mechanism'
const PIECE_LISTS = {
  vinyl: 'vinyls',
  mirror: 'mirrors',
  board: 'boards',
  mechanism: 'mechanisms',
} as const

/** Las piezas de esa clase en la cara de `side` de una estancia. */
export const piecesOf = (room: PlacedModule, kind: PieceKind, side: Side) =>
  (room[PIECE_LISTS[kind]]?.[side] ?? []) as { id: string; name?: string }[]

export function defaultPieceName(room: PlacedModule, kind: PieceKind, side: Side, id: string) {
  const list = piecesOf(room, kind, side)
  const piece = list.find((p) => p.id === id)
  if (kind === 'vinyl') return vinylType((piece as Vinyl | undefined)?.typeId ?? '')?.name ?? 'Vinilo'
  if (kind === 'mechanism') {
    // Numerado entre los de su mismo tipo: "Enchufe 1", "Enchufe 2", "Interruptor 1".
    const typeId = (piece as Mechanism | undefined)?.typeId ?? ''
    const same = (list as Mechanism[]).filter((p) => p.typeId === typeId)
    return `${mechanismType(typeId)?.name ?? 'Mecanismo'} ${same.findIndex((p) => p.id === id) + 1}`
  }
  return `${kind === 'mirror' ? 'Espejo' : 'Tablero'} ${list.findIndex((p) => p.id === id) + 1}`
}
export const pieceName = (room: PlacedModule, kind: PieceKind, side: Side, id: string) =>
  piecesOf(room, kind, side).find((p) => p.id === id)?.name ??
  defaultPieceName(room, kind, side, id)

export const defaultOpeningName = (o: Opening) => (o.kind === 'door' ? 'Puerta' : 'Ventana')
export const openingName = (o: Opening) => o.name ?? defaultOpeningName(o)
