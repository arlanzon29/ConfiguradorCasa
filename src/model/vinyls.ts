import { PlacedModule, Side, WALL_HEIGHT, roundSize, sideLength } from './house'
import { OPPOSITE, wallLine } from './openings'
import { Wall } from './walls'

// Un vinilo es una imagen con fondo transparente pegada a la cara de una pared
// que da a una estancia. No tiene grosor: es un acabado, no una pieza. Se
// guarda en su estancia, por lado, y se mide mirando la pared desde dentro:
// `x` desde la esquina izquierda de la cara vista e `y` desde el suelo, las dos
// hasta la esquina inferior izquierda de la imagen. Así, al girar la estancia
// basta con cambiarlo de lado.

export interface Vinyl {
  id: string
  /** Imagen: `id` de VINYLS. */
  typeId: string
  x: number
  y: number
  width: number
  height: number
}

export interface VinylType {
  id: string
  name: string
  /** Ruta de la imagen (con fondo transparente), relativa a public/. */
  image: string
  /** Medidas con las que se coloca, en metros; dan también su proporción. */
  width: number
  height: number
}

// Dibujos de prueba, hechos para el configurador. Para añadir uno: la imagen en
// public/texturas/vinilos/ y una línea aquí.
export const VINYLS: VinylType[] = [
  { id: 'nube', name: 'Nube', image: '/texturas/vinilos/nube.svg', width: 0.8, height: 0.5 },
  { id: 'luna', name: 'Luna', image: '/texturas/vinilos/luna.svg', width: 0.6, height: 0.6 },
  { id: 'estrellas', name: 'Estrellas', image: '/texturas/vinilos/estrellas.svg', width: 1, height: 0.6 },
  { id: 'globo', name: 'Globo', image: '/texturas/vinilos/globo.svg', width: 0.6, height: 0.9 },
  { id: 'arcoiris', name: 'Arcoíris', image: '/texturas/vinilos/arcoiris.svg', width: 1, height: 0.6 },
  { id: 'montanas', name: 'Montañas', image: '/texturas/vinilos/montanas.svg', width: 2, height: 0.8 },
]

export const vinylType = (id: string) => VINYLS.find((t) => t.id === id)

export const MIN_VINYL = 0.05
// Lo que se separa de la pared para no confundirse con ella al dibujar.
const GAP = 0.003

/** Lado que queda a la izquierda al mirar la pared de `side` desde dentro. */
const LEFT: Record<Side, Side> = { n: 'w', e: 'n', s: 'e', w: 's' }

/**
 * Lo que la pared del lado `side` entra en la estancia (todo su grosor si es
 * exterior, la mitad si es compartida). Con `along`, solo el tramo que pasa por
 * esa coordenada del plano, y null si ahí no hay pared.
 */
function inset(room: PlacedModule, side: Side, walls: Wall[], along?: number) {
  const depths = walls
    .filter(
      (w) =>
        !w.open &&
        ((w.moduleId === room.id && w.side === side) ||
          (w.otherId === room.id && w.side === OPPOSITE[side])) &&
        (along === undefined || (along >= w.from && along <= w.to)),
    )
    .map((w) => (w.shared ? w.thickness / 2 : w.thickness))
  if (along !== undefined && depths.length === 0) return null
  return Math.max(0, ...depths)
}

/** Cara de pared que se ve desde dentro: dónde empieza por la izquierda y cuánto mide. */
export function wallFace(room: PlacedModule, side: Side, walls: Wall[]) {
  const left = inset(room, LEFT[side], walls) ?? 0
  const right = inset(room, OPPOSITE[LEFT[side]], walls) ?? 0
  return { left, length: roundSize(sideLength(room, side) - left - right) }
}

/** Mensaje de error si el vinilo no cabe en una cara de `length` metros, o ''. */
export function vinylProblem(v: Pick<Vinyl, 'x' | 'y' | 'width' | 'height'>, length: number) {
  if (v.width < MIN_VINYL || v.height < MIN_VINYL) return 'Demasiado pequeño.'
  if (v.x < 0 || v.y < 0) return 'No puede ser negativa.'
  if (v.x + v.width > length + 1e-6) return 'Se sale de la pared por un lado.'
  if (v.y + v.height > WALL_HEIGHT + 1e-6) return 'Se sale de la pared por arriba.'
  return ''
}

/**
 * Dónde va un vinilo, en coordenadas del plano: su centro a lo largo de la
 * pared y la coordenada de la cara donde se pega. Null si ahí no hay pared.
 */
export function vinylPlacement(room: PlacedModule, side: Side, v: Vinyl, walls: Wall[]) {
  const line = wallLine(room, side)
  const { left } = wallFace(room, side, walls)
  // En los lados norte y este la izquierda es el inicio de la línea; en los otros, el final.
  const along =
    side === 'n' || side === 'e'
      ? line.start + left + v.x + v.width / 2
      : line.start + line.length - left - v.x - v.width / 2
  const depth = inset(room, side, walls, along)
  if (depth === null) return null
  const inward = side === 'n' || side === 'w' ? 1 : -1
  return { horizontal: line.horizontal, along, across: line.pos + inward * (depth + GAP) }
}
