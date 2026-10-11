// Una luz de estancia es un foco empotrado en el techo. Se guarda en su
// estancia (`PlacedModule.lights`), con `x` desde el borde oeste e `y` desde el
// borde norte de la estancia, así que se mueve con ella. Solo alumbra en la foto
// en calidad; en la vista normal se ve la pieza.

import type { PlacedModule } from './house'

export type LightTone = 'warm' | 'neutral' | 'cool'

export interface RoomLight {
  id: string
  /** Nombre que le ha puesto el usuario; si falta, uno por defecto (names.ts). */
  name?: string
  x: number
  y: number
  /** Potencia en tanto por ciento de la normal. */
  power: number
  tone: LightTone
  /** Color de emisión propio (`#rrggbb`); si falta, el de su tono. */
  color?: string
}

export const LIGHT_TONES: { id: LightTone; name: string; color: string }[] = [
  { id: 'warm', name: 'Cálida', color: '#ffd9a8' },
  { id: 'neutral', name: 'Neutra', color: '#fff3e0' },
  { id: 'cool', name: 'Fría', color: '#e4eeff' },
]

/** Color con el que alumbra: el suyo si lo tiene, o el de su tono. */
export const lightColor = (l: Pick<RoomLight, 'tone' | 'color'>) =>
  l.color ?? LIGHT_TONES.find((t) => t.id === l.tone)?.color ?? LIGHT_TONES[1].color

// Valores inventados: lado del foco en metros, lo que se separa de los bordes
// de la estancia, y los límites de la potencia.
export const LIGHT_SIZE = 0.12
export const LIGHT_MARGIN = 0.2
export const MIN_LIGHT_POWER = 10
export const MAX_LIGHT_POWER = 300
export const DEFAULT_LIGHT = { power: 100, tone: 'neutral' as LightTone }

/** El foco con el que nace una estancia: en el centro de su techo. */
export const firstLight = (room: Pick<PlacedModule, 'width' | 'depth'>): RoomLight => ({
  id: crypto.randomUUID(),
  x: Math.round(room.width * 50) / 100,
  y: Math.round(room.depth * 50) / 100,
  ...DEFAULT_LIGHT,
})

/** Mensaje de error si la luz no cabe en el techo de la estancia, o ''. */
export function lightProblem(l: Omit<RoomLight, 'id'>, room: PlacedModule) {
  if (l.power < MIN_LIGHT_POWER || l.power > MAX_LIGHT_POWER)
    return `La potencia va de ${MIN_LIGHT_POWER} a ${MAX_LIGHT_POWER} %.`
  const out = (v: number, size: number) => v < LIGHT_MARGIN - 1e-6 || v > size - LIGHT_MARGIN + 1e-6
  if (out(l.x, room.width) || out(l.y, room.depth)) return 'Se sale de la estancia.'
  return ''
}

/** Las luces de una estancia de fondo `depth` tras girarla 90° en sentido horario. */
export const turnLights = (lights: RoomLight[] | undefined, depth: number) =>
  lights?.map((l) => ({ ...l, x: Math.round((depth - l.y) * 100) / 100, y: l.x }))
