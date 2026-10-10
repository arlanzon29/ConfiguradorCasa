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

export type JoineryMaterial = 'wood' | 'glass' | 'metal'

export interface JoineryPart {
  /** Centro de la caja: x y z del plano, con la altura medida desde el suelo. */
  position: [number, number, number]
  size: [number, number, number]
  material: JoineryMaterial
  /** Acabado elegido para el hueco; solo cuenta en las piezas `wood`. */
  finish?: Finish
}

/** Cercos, hojas, cristales y manillas de todos los huecos de la casa. */
export function joineryParts(modules: PlacedModule[], joints: Joints, openings: Opening[]) {
  const walls = deriveWalls(modules, joints)
  const parts: JoineryPart[] = []
  for (const wall of walls) {
    if (wall.open) continue
    const [acrossMin, acrossMax] = wallAcross(wall)
    const axis = (acrossMin + acrossMax) / 2
    // Acabado del hueco que se está montando.
    let finish: Finish | undefined

    // Caja dada por sus extremos a lo largo de la pared, a través de ella y en altura.
    const box = (
      along: [number, number],
      across: [number, number],
      y: [number, number],
      material: JoineryMaterial = 'wood',
    ) => {
      const [a0, a1] = along[0] < along[1] ? along : [along[1], along[0]]
      const [c0, c1] = across[0] < across[1] ? across : [across[1], across[0]]
      if (a1 - a0 < 1e-4 || c1 - c0 < 1e-4 || y[1] - y[0] < 1e-4) return
      const [a, c, h] = [(a0 + a1) / 2, (c0 + c1) / 2, (y[0] + y[1]) / 2]
      parts.push(
        wall.horizontal
          ? { position: [a, h, c], size: [a1 - a0, y[1] - y[0], c1 - c0], material, finish }
          : { position: [c, h, a], size: [c1 - c0, y[1] - y[0], a1 - a0], material, finish },
      )
    }

    /** Hoja acristalada: cuatro perfiles y el cristal, centrada en `center` a través de la pared. */
    const sash = (from: number, to: number, bottom: number, top: number, center: number) => {
      const across: [number, number] = [center - SASH_DEPTH / 2, center + SASH_DEPTH / 2]
      box([from, from + SASH], across, [bottom, top])
      box([to - SASH, to], across, [bottom, top])
      box([from + SASH, to - SASH], across, [bottom, bottom + SASH])
      box([from + SASH, to - SASH], across, [top - SASH, top])
      box(
        [from + SASH, to - SASH],
        [center - GLASS / 2, center + GLASS / 2],
        [bottom + SASH, top - SASH],
        'glass',
      )
    }

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
          box([from - CASING, from + JAMB], face, [0, casingTop])
          box([to - JAMB, to + CASING], face, [0, casingTop])
          box([from + JAMB, to - JAMB], face, [top - JAMB, casingTop])
        }

        // Hoja: enrasada con la cara hacia la que abre y girando sobre el canto
        // de las bisagras. `u` recorre la hoja desde ese canto y `v` su grosor;
        // abierta a 90° los dos ejes se cruzan.
        const dir = swingSign(o)
        const face = dir > 0 ? acrossMax : acrossMin
        const turn = o.hinge === 'end' ? -1 : 1
        const pivot = o.hinge === 'end' ? to - JAMB - LEAF_GAP : from + JAMB + LEAF_GAP
        const width = to - from - 2 * (JAMB + LEAF_GAP)
        const leaf = (
          u: [number, number],
          v: [number, number],
          y: [number, number],
          material: JoineryMaterial = 'wood',
        ) =>
          o.closed
            ? box(
                [pivot + turn * u[0], pivot + turn * u[1]],
                [face - dir * v[0], face - dir * v[1]],
                y,
                material,
              )
            : box(
                [pivot + turn * v[0], pivot + turn * v[1]],
                [face + dir * u[0], face + dir * u[1]],
                y,
                material,
              )
        leaf([0, width], [0, LEAF], [LEAF_FLOOR_GAP, top - JAMB - LEAF_GAP])
        // Manilla por las dos caras: el vástago y la palanca.
        for (const [near, far] of [
          [0, -0.045],
          [LEAF, LEAF + 0.045],
        ]) {
          const lever: [number, number] = near === 0 ? [far, far + 0.015] : [far - 0.015, far]
          leaf([width - 0.075, width - 0.055], [near, far], [HANDLE_HEIGHT - 0.01, HANDLE_HEIGHT + 0.01], 'metal')
          leaf([width - 0.18, width - 0.055], lever, [HANDLE_HEIGHT - 0.01, HANDLE_HEIGHT + 0.01], 'metal')
        }
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
      }
    }
  }
  return parts
}
