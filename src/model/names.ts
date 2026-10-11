// Nombre de cada cosa de la casa: el que le ha puesto el usuario (`name`) o, si
// no tiene, uno por defecto según lo que es y su sitio en la lista.

import { FurnitureItem, furnitureType } from './furniture'
import { PlacedModule, Shell, Side } from './house'
import { RoomLight } from './lights'
import { Opening } from './openings'
import { Wall } from './walls'

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

export const defaultOpeningName = (o: Opening) => (o.kind === 'door' ? 'Puerta' : 'Ventana')
export const openingName = (o: Opening) => o.name ?? defaultOpeningName(o)
