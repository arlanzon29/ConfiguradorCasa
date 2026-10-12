// Funciones para manejar la casa sin pasar por la interfaz: las llama Claude
// desde la página (`window.eurocasa`). Es una prueba del uso "comercial desde
// Claude": pocas funciones, con parámetros en el idioma del comercial, que
// devuelven lo creado o el motivo por el que no se ha podido.

import { PlacedModule, Shell, fits, roundSize, validSize } from './model/house'
import { roomName, shellName } from './model/names'
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

const eurocasa = { casa, nuevoPlano, medirModulo, crearEstancia, eliminarEstancia }

declare global {
  interface Window {
    eurocasa: typeof eurocasa
  }
}

window.eurocasa = eurocasa
