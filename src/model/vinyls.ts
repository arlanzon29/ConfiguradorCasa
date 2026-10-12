import { PlacedModule, Side, WALL_HEIGHT, roundSize, sideLength } from './house'
import { OPPOSITE, Opening, wallLine } from './openings'
import { Wall, openingSpan } from './walls'

// Un vinilo es una imagen con fondo transparente pegada a la cara de una pared
// que da a una estancia. No tiene grosor: es un acabado, no una pieza. Se
// guarda en su estancia, por lado, y se mide mirando la pared desde dentro:
// `x` desde la esquina izquierda de la cara vista e `y` desde el suelo, las dos
// hasta la esquina inferior izquierda de la imagen. Así, al girar la estancia
// basta con cambiarlo de lado.

export interface Vinyl {
  id: string
  /** Nombre que le ha puesto el usuario; si falta, uno por defecto (names.ts). */
  name?: string
  /** Imagen: `id` de VINYLS. */
  typeId: string
  x: number
  y: number
  width: number
  height: number
  /** Giro en grados alrededor de su centro, en sentido horario visto desde dentro. */
  rotation?: number
}

export interface VinylType {
  id: string
  /** Código de artículo, para asociarlo a la base de costes (fuera de la web). */
  code: string
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
  { id: 'nube', code: 'VIN-NUBE', name: 'Nube', image: 'texturas/vinilos/nube.svg', width: 0.8, height: 0.5 },
  { id: 'luna', code: 'VIN-LUNA', name: 'Luna', image: 'texturas/vinilos/luna.svg', width: 0.6, height: 0.6 },
  { id: 'estrellas', code: 'VIN-ESTRELLAS', name: 'Estrellas', image: 'texturas/vinilos/estrellas.svg', width: 1, height: 0.6 },
  { id: 'globo', code: 'VIN-GLOBO', name: 'Globo', image: 'texturas/vinilos/globo.svg', width: 0.6, height: 0.9 },
  { id: 'arcoiris', code: 'VIN-ARCOIRIS', name: 'Arcoíris', image: 'texturas/vinilos/arcoiris.svg', width: 1, height: 0.6 },
  { id: 'montanas', code: 'VIN-MONTANAS', name: 'Montañas', image: 'texturas/vinilos/montanas.svg', width: 2, height: 0.8 },
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
export function vinylPlacement(
  room: PlacedModule,
  side: Side,
  v: Pick<Vinyl, 'x' | 'width'>,
  walls: Wall[],
  gap = GAP,
) {
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
  return { horizontal: line.horizontal, along, across: line.pos + inward * (depth + gap) }
}

/** Rectángulo sobre una cara de pared: x desde su esquina izquierda, y desde el suelo. */
export interface FaceBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Todos los vinilos de una cara de pared, para pintarlos juntos en una sola lámina. */
export interface VinylSheet {
  key: string
  room: PlacedModule
  side: Side
  /** Lo que ocupa la lámina: el recuadro que abarca sus vinilos, sin salirse de la cara. */
  box: FaceBox
  vinyls: Vinyl[]
  /** Huecos de la pared que caen dentro de la lámina: ahí no hay pared que pintar. */
  holes: FaceBox[]
}

/**
 * Láminas de vinilos, una por cara de pared que tenga alguno. La foto en
 * calidad las usa en vez de un plano por vinilo (`VinylSheetPlane` en View3D).
 */
export function vinylSheets(modules: PlacedModule[], walls: Wall[], openings: Opening[]) {
  const sheets: VinylSheet[] = []
  for (const room of modules) {
    for (const side of Object.keys(LEFT) as Side[]) {
      const vinyls = room.vinyls?.[side] ?? []
      if (vinyls.length === 0) continue
      const face = wallFace(room, side, walls)
      const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
      for (const v of vinyls) {
        // Media anchura y media altura del recuadro que abarca el vinilo ya girado.
        const turn = ((v.rotation ?? 0) * Math.PI) / 180
        const [c, s] = [Math.abs(Math.cos(turn)), Math.abs(Math.sin(turn))]
        const halfX = (v.width * c + v.height * s) / 2
        const halfY = (v.width * s + v.height * c) / 2
        box.x0 = Math.min(box.x0, v.x + v.width / 2 - halfX)
        box.x1 = Math.max(box.x1, v.x + v.width / 2 + halfX)
        box.y0 = Math.min(box.y0, v.y + v.height / 2 - halfY)
        box.y1 = Math.max(box.y1, v.y + v.height / 2 + halfY)
      }
      box.x0 = Math.max(box.x0, 0)
      box.y0 = Math.max(box.y0, 0)
      box.x1 = Math.min(box.x1, face.length)
      box.y1 = Math.min(box.y1, WALL_HEIGHT)
      if (box.x1 - box.x0 < 1e-3 || box.y1 - box.y0 < 1e-3) continue

      const line = wallLine(room, side)
      const end = line.start + line.length - face.left
      const holes: FaceBox[] = []
      for (const o of openings) {
        const span = openingSpan(o, modules)
        if (!span || span.line.horizontal !== line.horizontal) continue
        if (Math.abs(span.line.pos - line.pos) > 1e-6) continue
        // Del plano a la cara: desde su esquina izquierda, que en sur y oeste es el final de la línea.
        const [a, b] =
          side === 'n' || side === 'e'
            ? [span.from - line.start - face.left, span.to - line.start - face.left]
            : [end - span.to, end - span.from]
        if (b <= box.x0 || a >= box.x1 || o.sill >= box.y1 || o.sill + o.height <= box.y0) continue
        holes.push({ x0: a, x1: b, y0: o.sill, y1: o.sill + o.height })
      }
      sheets.push({ key: `${room.id}:${side}`, room, side, box, vinyls, holes })
    }
  }
  return sheets
}
