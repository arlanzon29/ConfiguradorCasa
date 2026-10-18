import type { Finish } from '../model/finishes'
import { PlacedModule, WALL_HEIGHT } from '../model/house'
import { Opening, swingDoor, swingSign } from '../model/openings'
import { Joints, deriveWalls, openingsOf, wallAcross } from '../model/walls'

// Carpintería de puertas y ventanas: no se guarda, se deduce de cada hueco y de
// la pared en la que cae. Medidas en metros, inventadas a falta de las reales.

// Jamba de la puerta: grueso del cerco y ancho y saliente del tapajuntas.
const JAMB = 0.03
const CASING = 0.07
const CASING_DEPTH = 0.015
// Hoja de la puerta: grosor y holgura con el cerco y con el suelo.
const LEAF = 0.04
const LEAF_GAP = 0.003
const LEAF_FLOOR_GAP = 0.008
const HANDLE_HEIGHT = 1
// Ventanas y correderas: cerco fijo, perfil de cada hoja y cristal.
const FRAME = 0.05
const FRAME_DEPTH = 0.07
const SASH = 0.045
const SASH_DEPTH = 0.05
const GLASS = 0.02
// Ancho aproximado de una hoja de ventana: de él sale cuántas lleva.
const SASH_WIDTH = 0.7

// Junquillo: el listón que sujeta el cristal por cada cara de la hoja.
const BEAD = 0.015
// Manilla de ventana (cremona) y escudo de la de puerta.
const WINDOW_HANDLE = 0.12
const ROSE = 0.05

export type JoineryMaterial = 'wood' | 'glass' | 'metal'

/**
 * Qué pieza es. Va como nombre de la malla ("Carpintería <rol>") en la escena y
 * en el GLB, para que Blender sepa qué es cada cosa (cristal de verdad, etc.).
 */
export type JoineryRole = 'Cerco' | 'Tapajuntas' | 'Hoja' | 'Perfil' | 'Junquillo' | 'Cristal' | 'Manilla'

export interface JoineryPart {
  /** Centro de la caja: x y z del plano, con la altura medida desde el suelo. */
  position: [number, number, number]
  /** Estancia de la que sale la pared del hueco: de ella se toma la altura del suelo. */
  room: string
  size: [number, number, number]
  material: JoineryMaterial
  role: JoineryRole
  /** Acabado elegido para el hueco; solo cuenta en las piezas `wood`. */
  finish?: Finish
  /**
   * Solo en la hoja de una puerta abatible y sus manillas: la pieza va en la
   * postura cerrada y gira sobre el eje de las bisagras.
   */
  leaf?: DoorLeafAxis
}

/** El eje de giro de una hoja de puerta y cuánto gira para quedar abierta. */
export interface DoorLeafAxis {
  /** El hueco al que pertenece. */
  opening: string
  /** Dónde está el eje en el plano (x, y del plano). */
  pivot: [number, number]
  /** Giro en radianes alrededor del eje vertical (el `rotation.y` de three) con la puerta abierta. */
  open: number
  closed: boolean
}

/** Cercos, hojas, cristales y manillas de todos los huecos de la casa. */
export function joineryParts(modules: PlacedModule[], joints: Joints, openings: Opening[]) {
  const walls = deriveWalls(modules, joints)
  const parts: JoineryPart[] = []
  for (const wall of walls) {
    if (wall.open) continue
    const [acrossMin, acrossMax] = wallAcross(wall)
    const axis = (acrossMin + acrossMax) / 2
    // Acabado del hueco que se está montando, y eje de la hoja si es una puerta.
    let finish: Finish | undefined
    let leafAxis: DoorLeafAxis | undefined

    // Caja dada por sus extremos a lo largo de la pared, a través de ella y en altura.
    const box = (
      along: [number, number],
      across: [number, number],
      y: [number, number],
      material: JoineryMaterial = 'wood',
      role: JoineryRole = 'Cerco',
    ) => {
      const [a0, a1] = along[0] < along[1] ? along : [along[1], along[0]]
      const [c0, c1] = across[0] < across[1] ? across : [across[1], across[0]]
      if (a1 - a0 < 1e-4 || c1 - c0 < 1e-4 || y[1] - y[0] < 1e-4) return
      const [a, c, h] = [(a0 + a1) / 2, (c0 + c1) / 2, (y[0] + y[1]) / 2]
      parts.push(
        wall.horizontal
          ? { position: [a, h, c], size: [a1 - a0, y[1] - y[0], c1 - c0], room: wall.moduleId, material, role, finish, leaf: leafAxis }
          : { position: [c, h, a], size: [c1 - c0, y[1] - y[0], a1 - a0], room: wall.moduleId, material, role, finish, leaf: leafAxis },
      )
    }

    /**
     * Hoja acristalada: cuatro perfiles, el cristal y un junquillo alrededor del
     * cristal por cada cara, centrada en `center` a través de la pared.
     */
    const sash = (from: number, to: number, bottom: number, top: number, center: number) => {
      const across: [number, number] = [center - SASH_DEPTH / 2, center + SASH_DEPTH / 2]
      box([from, from + SASH], across, [bottom, top], 'wood', 'Perfil')
      box([to - SASH, to], across, [bottom, top], 'wood', 'Perfil')
      box([from + SASH, to - SASH], across, [bottom, bottom + SASH], 'wood', 'Perfil')
      box([from + SASH, to - SASH], across, [top - SASH, top], 'wood', 'Perfil')
      const [g0, g1] = [from + SASH, to - SASH]
      const [h0, h1] = [bottom + SASH, top - SASH]
      box([g0, g1], [center - GLASS / 2, center + GLASS / 2], [h0, h1], 'glass', 'Cristal')
      // Junquillos: listones en el borde del cristal, entre él y la cara de la hoja.
      for (const face of [
        [center - SASH_DEPTH / 2, center - GLASS / 2],
        [center + GLASS / 2, center + SASH_DEPTH / 2],
      ] as [number, number][]) {
        box([g0, g0 + BEAD], face, [h0, h1], 'wood', 'Junquillo')
        box([g1 - BEAD, g1], face, [h0, h1], 'wood', 'Junquillo')
        box([g0 + BEAD, g1 - BEAD], face, [h0, h0 + BEAD], 'wood', 'Junquillo')
        box([g0 + BEAD, g1 - BEAD], face, [h1 - BEAD, h1], 'wood', 'Junquillo')
      }
    }
    // Cara de la pared que da a la estancia del hueco (la de dentro).
    const inside = (o: Opening) => (o.side === 'n' || o.side === 'w' ? acrossMax : acrossMin)

    for (const { opening: o, from, to } of openingsOf(wall, modules, walls, openings)) {
      finish = o.finish
      const top = o.sill + o.height
      const thick: [number, number] = [acrossMin, acrossMax]

      if (swingDoor(o)) {
        // Cerco: dos largueros y el cabecero, de cara a cara de la pared.
        box([from, from + JAMB], thick, [0, top])
        box([to - JAMB, to], thick, [0, top])
        box([from + JAMB, to - JAMB], thick, [top - JAMB, top])
        // Tapajuntas por las dos caras, tapando la unión del cerco con la pared.
        const casingTop = Math.min(top + CASING, WALL_HEIGHT)
        for (const face of [
          [acrossMin - CASING_DEPTH, acrossMin],
          [acrossMax, acrossMax + CASING_DEPTH],
        ] as [number, number][]) {
          box([from - CASING, from + JAMB], face, [0, casingTop], 'wood', 'Tapajuntas')
          box([to - JAMB, to + CASING], face, [0, casingTop], 'wood', 'Tapajuntas')
          box([from + JAMB, to - JAMB], face, [top - JAMB, casingTop], 'wood', 'Tapajuntas')
        }

        // Hoja: enrasada con la cara hacia la que abre y girando sobre el canto
        // de las bisagras. `u` recorre la hoja desde ese canto y `v` su grosor.
        // Se monta cerrada; abierta es la misma hoja girada 90° sobre el eje
        // (`leafAxis`), que la vista 3D anima.
        const dir = swingSign(o)
        const face = dir > 0 ? acrossMax : acrossMin
        const turn = o.hinge === 'end' ? -1 : 1
        const pivot = o.hinge === 'end' ? to - JAMB - LEAF_GAP : from + JAMB + LEAF_GAP
        const width = to - from - 2 * (JAMB + LEAF_GAP)
        // Abrir lleva (u, -v) a (v, u) en ejes de la pared, multiplicados por
        // `turn` y `dir`; en three, con x y z del plano, eso es este giro.
        const quarter = (turn * dir * Math.PI) / 2
        leafAxis = {
          opening: o.id,
          pivot: wall.horizontal ? [pivot, face] : [face, pivot],
          open: wall.horizontal ? -quarter : quarter,
          closed: !!o.closed,
        }
        const leaf = (
          u: [number, number],
          v: [number, number],
          y: [number, number],
          material: JoineryMaterial = 'wood',
          role: JoineryRole = 'Hoja',
        ) =>
          box(
            [pivot + turn * u[0], pivot + turn * u[1]],
            [face - dir * v[0], face - dir * v[1]],
            y,
            material,
            role,
          )
        leaf([0, width], [0, LEAF], [LEAF_FLOOR_GAP, top - JAMB - LEAF_GAP])
        // Manilla por las dos caras: escudo cuadrado, vástago y palanca.
        for (const [near, far] of [
          [0, -0.045],
          [LEAF, LEAF + 0.045],
        ]) {
          const out = far < near ? -1 : 1
          const lever: [number, number] = near === 0 ? [far, far + 0.015] : [far - 0.015, far]
          const hy: [number, number] = [HANDLE_HEIGHT - 0.01, HANDLE_HEIGHT + 0.01]
          const cx = width - 0.065
          leaf([cx - ROSE / 2, cx + ROSE / 2], [near, near + out * 0.006], [HANDLE_HEIGHT - ROSE / 2, HANDLE_HEIGHT + ROSE / 2], 'metal', 'Manilla')
          leaf([width - 0.075, width - 0.055], [near, far], hy, 'metal', 'Manilla')
          leaf([width - 0.18, width - 0.055], lever, hy, 'metal', 'Manilla')
        }
        leafAxis = undefined
        continue
      }

      // Ventana o corredera: cerco fijo (sin travesaño inferior en la corredera,
      // que llega al suelo) y hojas acristaladas.
      const depth = Math.min(FRAME_DEPTH, wall.thickness)
      // El de la corredera coge todo el grueso de la pared: lleva dos carriles.
      const frame: [number, number] =
        o.kind === 'door' ? thick : [axis - depth / 2, axis + depth / 2]
      const bottom = o.kind === 'window' ? o.sill + FRAME : 0
      box([from, from + FRAME], frame, [o.sill, top])
      box([to - FRAME, to], frame, [o.sill, top])
      box([from + FRAME, to - FRAME], frame, [top - FRAME, top])
      if (o.kind === 'window') box([from + FRAME, to - FRAME], frame, [o.sill, bottom])
      const [inFrom, inTo] = [from + FRAME, to - FRAME]

      if (o.kind === 'door') {
        // Dos hojas en carriles distintos, que se solapan en el centro.
        const mid = (inFrom + inTo) / 2
        sash(inFrom, mid + SASH / 2, 0, top - FRAME, axis - SASH_DEPTH / 2)
        sash(mid - SASH / 2, inTo, 0, top - FRAME, axis + SASH_DEPTH / 2)
      } else {
        const count = Math.max(1, Math.round(o.width / SASH_WIDTH))
        const each = (inTo - inFrom) / count
        for (let i = 0; i < count; i++)
          sash(inFrom + i * each, inFrom + (i + 1) * each, bottom, top - FRAME, axis)
        // Manilla (cremona) por dentro, en el perfil de cierre de la primera hoja,
        // a media altura.
        const off = inside(o) > axis ? 1 : -1
        const face = axis + off * (SASH_DEPTH / 2)
        const hx = inFrom + each - SASH / 2
        const hy = (bottom + top - FRAME) / 2
        box([hx - 0.015, hx + 0.015], [face, face + off * 0.01], [hy - 0.03, hy + 0.03], 'metal', 'Manilla')
        box([hx - 0.008, hx + 0.008], [face + off * 0.01, face + off * 0.03], [hy - WINDOW_HANDLE, hy + 0.01], 'metal', 'Manilla')
      }
    }
  }
  return parts
}
