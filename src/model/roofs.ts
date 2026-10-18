// Tejado de cada módulo de fábrica (lo pidió el usuario): a un agua o a dos
// aguas, lo que sube, hacia dónde va la pendiente y el alero. Se guarda en el
// módulo (`Shell.roof`); lo que falte vale lo de por defecto.
//
// Medidas: todo en metros y por encima de lo alto de las paredes
// (WALL_HEIGHT). La pendiente se mide por dentro: el tejado se apoya en el
// canto de dentro de la pared baja (o de las dos, a dos aguas) y "lo que sube"
// es cuánto está más alta su cara de abajo en la cumbrera, o en el canto de
// dentro de la pared alta si es a un agua.

import { DEFAULT_WALL_THICKNESS, type Shell, type Side } from './house'

/** `one`: a un agua; `two`: a dos aguas. */
export type RoofType = 'one' | 'two'

export interface Roof {
  type?: RoofType
  /** Lo que sube el tejado por encima de las paredes, en metros. */
  rise?: number
  /** Lo que sobresale de las paredes por todos los lados, en metros. */
  overhang?: number
  /** A un agua: hacia qué lado cae (el lado bajo). */
  side?: Side
  /** A dos aguas: la cumbrera va a lo largo del módulo o a lo ancho. */
  ridge?: 'long' | 'short'
}

// Valores inventados, salvo el alero, que aceptó el usuario.
export const DEFAULT_ROOF_TYPE: RoofType = 'two'
export const DEFAULT_ROOF_RISE = 1
export const DEFAULT_ROOF_OVERHANG = 0.3
export const MIN_ROOF_RISE = 0.1
export const MAX_ROOF_RISE = 3
export const MAX_ROOF_OVERHANG = 1.5
/** Grueso del tejado, medido en vertical. */
export const ROOF_THICKNESS = 0.15
/** Grueso de los hastiales: el de la pared exterior por defecto. */
export const GABLE_THICKNESS = DEFAULT_WALL_THICKNESS

/** Lado largo del módulo como eje del plano ('x' si es más ancho que hondo). */
const longAxis = (shell: Pick<Shell, 'width' | 'depth'>) => (shell.width >= shell.depth ? 'x' : 'y')

/** El tejado de un módulo con todo resuelto. A un agua cae, si no se dice, hacia un lado largo. */
export const roofOf = (shell: Pick<Shell, 'roof' | 'width' | 'depth'>): Required<Roof> => ({
  type: shell.roof?.type ?? DEFAULT_ROOF_TYPE,
  rise: shell.roof?.rise ?? DEFAULT_ROOF_RISE,
  overhang: shell.roof?.overhang ?? DEFAULT_ROOF_OVERHANG,
  side: shell.roof?.side ?? (longAxis(shell) === 'x' ? 's' : 'e'),
  ridge: shell.roof?.ridge ?? 'long',
})

/** Un punto de un perfil: `u` a lo ancho del tejado (coordenada del plano), `h` sobre las paredes. */
export type ProfilePoint = [u: number, h: number]

export interface RoofLayout {
  /** Eje del plano a lo largo del cual corre la cumbrera (o el canto alto, a un agua). */
  axis: 'x' | 'y'
  /** Tramo del módulo a lo largo de ese eje, sin alero. */
  along: [number, number]
  overhang: number
  /** Sección del tejado (perpendicular a `axis`), que se extruye a lo largo. */
  roof: ProfilePoint[]
  /** Hastial: lo que cierra cada extremo entre las paredes y el tejado. */
  gable: ProfilePoint[]
  /** A un agua, la pared alta sube hasta el tejado: su sección, a todo lo largo. */
  strip: ProfilePoint[] | null
  /** Línea de la cumbrera (dos aguas) o del canto alto (un agua), en `u`. */
  top: number
}

/**
 * Cómo se monta el tejado de un módulo. Las secciones van en (u, h): `u` es la
 * coordenada del plano perpendicular a `axis` y `h` la altura sobre lo alto de
 * las paredes. Hastiales y pared alta suben hasta la mitad del grueso del
 * tejado, para que no quede rendija.
 */
export function roofLayout(shell: Shell): RoofLayout {
  const r = roofOf(shell)
  const long = longAxis(shell)
  const axis: 'x' | 'y' =
    r.type === 'two'
      ? r.ridge === 'long'
        ? long
        : long === 'x'
          ? 'y'
          : 'x'
      : r.side === 'n' || r.side === 's'
        ? 'x'
        : 'y'
  const along: [number, number] =
    axis === 'x' ? [shell.x, shell.x + shell.width] : [shell.y, shell.y + shell.depth]
  const [a0, a1] = axis === 'x' ? [shell.y, shell.y + shell.depth] : [shell.x, shell.x + shell.width]
  const t = GABLE_THICKNESS
  const o = r.overhang
  const T = ROOF_THICKNESS
  const lid = (pts: ProfilePoint[]): ProfilePoint[] => [...pts, ...[...pts].reverse().map(([u, h]): ProfilePoint => [u, h + T])]

  if (r.type === 'two') {
    const mid = (a0 + a1) / 2
    // Cara de abajo: 0 en el canto de dentro de cada pared, `rise` en la cumbrera.
    const slope = r.rise / Math.max(mid - a0 - t, 0.01)
    const under = (u: number) => slope * (Math.min(u - a0, a1 - u) - t)
    return {
      axis,
      along,
      overhang: o,
      roof: lid([
        [a0 - o, under(a0 - o)],
        [mid, under(mid)],
        [a1 + o, under(a1 + o)],
      ]),
      gable: [
        [a0 + t, 0],
        [a1 - t, 0],
        [mid, r.rise + T / 2],
      ],
      strip: null,
      top: mid,
    }
  }

  // A un agua: el lado bajo es el que dice `side` (norte y oeste, los de `a0`).
  const lowAtStart = r.side === 'n' || r.side === 'w'
  const low = lowAtStart ? a0 : a1
  const high = lowAtStart ? a1 : a0
  const dir = lowAtStart ? 1 : -1
  const slope = r.rise / Math.max(a1 - a0 - 2 * t, 0.01)
  const under = (u: number) => slope * ((u - low) * dir - t)
  const lowEdge = low - dir * o
  const highEdge = high + dir * o
  const lowInner = low + dir * t
  const highInner = high - dir * t
  return {
    axis,
    along,
    overhang: o,
    roof: lid([
      [lowEdge, under(lowEdge)],
      [highEdge, under(highEdge)],
    ]),
    gable: [
      [lowInner, 0],
      [high, 0],
      [high, under(high) + T / 2],
      [lowInner, T / 2],
    ],
    strip: [
      [highInner, 0],
      [high, 0],
      [high, under(high) + T / 2],
      [highInner, under(highInner) + T / 2],
    ],
    top: high,
  }
}
