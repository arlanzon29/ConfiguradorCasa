import { PLOT, PlacedModule } from '../model/house'
import { FurnitureItem, furnitureType } from '../model/furniture'
import { Opening } from '../model/openings'
import { Joints, deriveWalls, openingsOf, wallAcross } from '../model/walls'

// Puntos de salto de la VR: no se guardan, salen de la casa. Uno por estancia,
// lo más cerca de su centro que no pise un mueble, y uno a cada lado de cada
// puerta (abatible o corredera). Medidas en metros, mías.

// Cuánto se separa el punto de la cara de la pared, a cada lado de la puerta.
const DOOR_STEP = 0.6
// Margen del punto de la estancia con sus bordes, holgura con los muebles y
// paso de la búsqueda de un sitio libre.
const ROOM_MARGIN = 0.5
const FURNITURE_GAP = 0.3
const SEARCH_STEP = 0.1

export interface TeleportPoint {
  key: string
  /** Sitio en el plano. */
  x: number
  y: number
  /** Dentro de una estancia (sobre el suelo de la casa) o fuera (sobre el césped). */
  inside: boolean
}

export function teleportPoints(
  modules: PlacedModule[],
  joints: Joints,
  openings: Opening[],
  furniture: FurnitureItem[],
): TeleportPoint[] {
  // Lo que ocupa cada mueble, con su holgura.
  const boxes = furniture.flatMap((item) => {
    const type = furnitureType(item.typeId)
    if (!type) return []
    const turned = item.rotation === 90 || item.rotation === 270
    const hw = (turned ? type.depth : type.width) / 2 + FURNITURE_GAP
    const hd = (turned ? type.width : type.depth) / 2 + FURNITURE_GAP
    return [{ x0: item.x - hw, x1: item.x + hw, y0: item.y - hd, y1: item.y + hd }]
  })
  const free = (x: number, y: number) => !boxes.some((b) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)
  const room = (x: number, y: number) =>
    modules.find((m) => x > m.x && x < m.x + m.width && y > m.y && y < m.y + m.depth)

  const points: TeleportPoint[] = []
  for (const m of modules) {
    const [cx, cy] = [m.x + m.width / 2, m.y + m.depth / 2]
    const [rx, ry] = [Math.max(m.width / 2 - ROOM_MARGIN, 0), Math.max(m.depth / 2 - ROOM_MARGIN, 0)]
    let best: [number, number] | null = null
    let bestDist = Infinity
    for (let dx = -rx; dx <= rx + 1e-6; dx += SEARCH_STEP) {
      for (let dy = -ry; dy <= ry + 1e-6; dy += SEARCH_STEP) {
        const dist = dx * dx + dy * dy
        if (dist < bestDist && free(cx + dx, cy + dy)) {
          best = [cx + dx, cy + dy]
          bestDist = dist
        }
      }
    }
    if (best) points.push({ key: `room:${m.id}`, x: best[0], y: best[1], inside: true })
  }

  const walls = deriveWalls(modules, joints)
  for (const wall of walls) {
    if (wall.open) continue
    const [a0, a1] = wallAcross(wall)
    for (const { opening, from, to } of openingsOf(wall, modules, walls, openings)) {
      if (opening.kind !== 'door') continue
      const along = (from + to) / 2
      for (const [side, across] of [
        ['a', a0 - DOOR_STEP],
        ['b', a1 + DOOR_STEP],
      ] as const) {
        const [x, y] = wall.horizontal ? [along, across] : [across, along]
        if (x < 0 || y < 0 || x > PLOT.width || y > PLOT.depth || !free(x, y)) continue
        points.push({ key: `door:${opening.id}:${side}`, x, y, inside: !!room(x, y) })
      }
    }
  }
  return points
}
