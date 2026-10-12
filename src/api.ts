// Funciones para manejar la casa sin pasar por la interfaz: las llama Claude
// desde la página (`window.eurocasa`). Es una prueba del uso "comercial desde
// Claude": pocas funciones, con parámetros en el idioma del comercial, que
// devuelven lo creado o el motivo por el que no se ha podido.

import { PlacedModule, Shell, Side, fits, roundSize, validSize } from './model/house'
import { roomName, shellName } from './model/names'
import { OPPOSITE, wallLine } from './model/openings'
import { deriveWalls } from './model/walls'
import { usePhotos } from './photos'
import { useHouse } from './store'

type Fallo = { error: string }

const state = () => useHouse.getState()

/** Busca por nombre (sin distinguir mayúsculas) o por id. */
const findShell = (ref?: string) => {
  const { shells } = state()
  if (!ref) return shells[0]
  const key = ref.trim().toLowerCase()
  return shells.find((s) => s.id === ref || shellName(shells, s).toLowerCase() === key)
}
const findRoom = (ref: string) => {
  const { modules } = state()
  const key = ref.trim().toLowerCase()
  return modules.find((m) => m.id === ref || roomName(modules, m.id).toLowerCase() === key)
}

/** Una estancia tal como se cuenta: posición desde la esquina de su módulo. */
function describeRoom(m: PlacedModule, shell?: Shell) {
  const { modules } = state()
  return {
    id: m.id,
    nombre: roomName(modules, m.id),
    x: roundSize(m.x - (shell?.x ?? 0)),
    y: roundSize(m.y - (shell?.y ?? 0)),
    ancho: m.width,
    fondo: m.depth,
  }
}

/** La casa en forma de árbol: módulos y, dentro, sus estancias. */
function casa() {
  const { shells, modules } = state()
  return {
    modulos: shells.map((s) => ({
      id: s.id,
      nombre: shellName(shells, s),
      x: s.x,
      y: s.y,
      ancho: s.width,
      fondo: s.depth,
      estancias: modules.filter((m) => m.shellId === s.id).map((m) => describeRoom(m, s)),
    })),
    estanciasSueltas: modules.filter((m) => !m.shellId).map((m) => describeRoom(m)),
  }
}

/** Borra el plano y sus fotos y deja un módulo vacío del tamaño máximo. */
function nuevoPlano() {
  usePhotos.getState().replaceAll([])
  state().newPlan()
  return casa()
}

/** Cambia las medidas de un módulo (por defecto, el primero). */
function medirModulo(p: { modulo?: string; ancho: number; fondo: number }) {
  const shell = findShell(p.modulo)
  if (!shell) return { error: `No hay ningún módulo "${p.modulo ?? ''}".` } as Fallo
  const error = state().resizeShell(shell.id, p.ancho, p.fondo)
  return error ? ({ error } as Fallo) : casa()
}

/**
 * Crea una estancia. Con `x` e `y` (desde la esquina de su módulo) va a ese
 * sitio; sin ellos, al primer hueco libre de la casa.
 */
function crearEstancia(p: {
  nombre?: string
  ancho: number
  fondo: number
  x?: number
  y?: number
  modulo?: string
}) {
  if (!validSize(p.ancho, p.fondo)) return { error: 'Medidas no válidas para una estancia.' } as Fallo
  const shell = findShell(p.modulo)
  if (p.modulo && !shell) return { error: `No hay ningún módulo "${p.modulo}".` } as Fallo
  const placed = p.x !== undefined && p.y !== undefined
  if (placed) {
    const { modules, shells } = state()
    const spot = {
      x: (shell?.x ?? 0) + p.x!,
      y: (shell?.y ?? 0) + p.y!,
      width: p.ancho,
      depth: p.fondo,
    }
    if (!fits(spot, modules, shells)) {
      return { error: 'Ahí no cabe: se sale de su módulo o pisa otra estancia.' } as Fallo
    }
  }
  if (!state().addModule(p.ancho, p.fondo)) return { error: 'No queda sitio para esa estancia.' } as Fallo
  const id = state().selectedId!
  if (placed) {
    state().resizeModule(id, p.ancho, p.fondo, (shell?.x ?? 0) + p.x!, (shell?.y ?? 0) + p.y!)
  }
  if (p.nombre) state().rename('room', id, p.nombre)
  const room = state().modules.find((m) => m.id === id)!
  return describeRoom(room, state().shells.find((s) => s.id === room.shellId))
}

/** Quita una estancia, por nombre o id. */
function eliminarEstancia(p: { estancia: string }) {
  const room = findRoom(p.estancia)
  if (!room) return { error: `No hay ninguna estancia "${p.estancia}".` } as Fallo
  state().removeModule(room.id)
  return casa()
}

const TIPOS = { puerta: 'door', corredera: 'sliding', ventana: 'window' } as const
const LADOS: Record<string, Side> = { norte: 'n', sur: 's', este: 'e', oeste: 'w' }

/**
 * Pone una puerta, una corredera o una ventana en la pared de un lado de una
 * estancia. Con `con`, en el tramo que comparte con esa otra estancia. Con
 * `posicion` (metros desde el extremo oeste o norte del lado hasta el centro
 * del hueco) va ahí; sin ella, centrado en el tramo más largo.
 */
function ponerHueco(p: {
  tipo: keyof typeof TIPOS
  estancia: string
  lado: string
  con?: string
  posicion?: number
}) {
  const room = findRoom(p.estancia)
  if (!room) return { error: `No hay ninguna estancia "${p.estancia}".` } as Fallo
  const side = LADOS[p.lado]
  if (!side || !TIPOS[p.tipo]) return { error: 'Tipo o lado desconocido.' } as Fallo
  const other = p.con ? findRoom(p.con) : undefined
  if (p.con && !other) return { error: `No hay ninguna estancia "${p.con}".` } as Fallo

  const { modules, joints } = state()
  const line = wallLine(room, side)
  const at = p.posicion === undefined ? undefined : line.start + p.posicion
  // Los tramos de ese lado: los que salen de la estancia y los de la vecina que dan a ella.
  const wall = deriveWalls(modules, joints)
    .filter(
      (w) =>
        ((w.moduleId === room.id && w.side === side) ||
          (w.otherId === room.id && w.side === OPPOSITE[side])) &&
        (!other || w.moduleId === other.id || w.otherId === other.id) &&
        (at === undefined || (at >= w.from && at <= w.to)),
    )
    .sort((a, b) => b.to - b.from - (a.to - a.from))[0]
  if (!wall) return { error: 'No hay pared ahí.' } as Fallo
  if (!state().addOpening(TIPOS[p.tipo], wall.key, at ?? (wall.from + wall.to) / 2)) {
    return { error: 'No cabe en esa pared, o pisa otro hueco.' } as Fallo
  }
  const made = state().openings.find((o) => o.id === state().selectedOpeningId)!
  // El hueco se ancla a la estancia de la que sale la pared, que puede ser la vecina.
  const anchor = wallLine(modules.find((m) => m.id === made.moduleId)!, made.side)
  return {
    id: made.id,
    tipo: p.tipo,
    pared: wall.shared ? `${roomName(modules, wall.moduleId)} | ${roomName(modules, wall.otherId!)}` : 'exterior',
    desde: roundSize(anchor.start + made.offset - line.start),
    ancho: made.width,
  }
}

const eurocasa = { casa, nuevoPlano, medirModulo, crearEstancia, eliminarEstancia, ponerHueco }

declare global {
  interface Window {
    eurocasa: typeof eurocasa
  }
}

window.eurocasa = eurocasa
