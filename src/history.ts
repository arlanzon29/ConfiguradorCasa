import { create } from 'zustand'
import { historyGate, useHouse } from './store'

// Deshacer y rehacer los cambios del plano (Ctrl+Z, Ctrl+Y). Se mira el estado
// de la casa, no cada acción: cuando cambian las listas del plano, la copia
// anterior pasa a la pila de "deshacer". Cambios seguidos (un arrastre, una
// casa montada por funciones) cuentan como un solo paso.
//
// Cubre la casa: su nombre, el terreno, estancias, módulos, huecos, paredes compartidas y muebles. No
// cubre las fotos (viven aparte, en IndexedDB), la cámara ni las opciones de vista.

interface Snapshot {
  houseName: ReturnType<typeof useHouse.getState>['houseName']
  ground: ReturnType<typeof useHouse.getState>['ground']
  modules: ReturnType<typeof useHouse.getState>['modules']
  shells: ReturnType<typeof useHouse.getState>['shells']
  openings: ReturnType<typeof useHouse.getState>['openings']
  joints: ReturnType<typeof useHouse.getState>['joints']
  furniture: ReturnType<typeof useHouse.getState>['furniture']
}

const snapshotOf = (s: ReturnType<typeof useHouse.getState>): Snapshot => ({
  houseName: s.houseName,
  ground: s.ground,
  modules: s.modules,
  shells: s.shells,
  openings: s.openings,
  joints: s.joints,
  furniture: s.furniture,
})

const same = (a: Snapshot, b: Snapshot) =>
  a.houseName === b.houseName &&
  a.ground === b.ground &&
  a.modules === b.modules &&
  a.shells === b.shells &&
  a.openings === b.openings &&
  a.joints === b.joints &&
  a.furniture === b.furniture

/** Máximo de pasos que se recuerdan. */
const LIMIT = 100
/** Cambios con menos de esto entre sí (en ms) forman un solo paso. */
const BURST_MS = 500

let current = snapshotOf(useHouse.getState())
let past: Snapshot[] = []
let future: Snapshot[] = []
let lastChange = 0
let applying = false

/** Cuántos pasos hay para deshacer y rehacer, para los botones. */
export const useHistory = create<{ undos: number; redos: number }>(() => ({ undos: 0, redos: 0 }))
const publish = () => useHistory.setState({ undos: past.length, redos: future.length })

useHouse.subscribe((state) => {
  if (applying) return
  const next = snapshotOf(state)
  if (same(next, current)) return
  // Lo que escribe otra ventana no es un paso de esta: solo se pone al día.
  if (historyGate.external) {
    current = next
    return
  }
  const now = Date.now()
  // Un arrastre sigue siendo un solo paso aunque el ratón se pare un momento.
  const dragging = state.dragOpenings !== null
  if (!(now - lastChange < BURST_MS || dragging) || past.length === 0) {
    past.push(current)
    if (past.length > LIMIT) past.shift()
    future = []
  }
  lastChange = now
  current = next
  publish()
})

/** Quita de la selección lo que ya no existe tras volver a otro estado. */
function tidySelection() {
  const s = useHouse.getState()
  useHouse.setState({
    selectedId: s.modules.some((m) => m.id === s.selectedId) ? s.selectedId : null,
    selectedShellId: s.shells.some((x) => x.id === s.selectedShellId) ? s.selectedShellId : null,
    selectedOpeningId: s.openings.some((o) => o.id === s.selectedOpeningId) ? s.selectedOpeningId : null,
    selectedFurnitureId: s.furniture.some((f) => f.id === s.selectedFurnitureId)
      ? s.selectedFurnitureId
      : null,
    selectedWall: null,
    selectedLightId: null,
    selectedPiece: null,
  })
}

function apply(snapshot: Snapshot) {
  applying = true
  useHouse.setState({ ...snapshot, dragOpenings: null })
  current = snapshot
  tidySelection()
  applying = false
  lastChange = 0
  publish()
}

/** Vuelve al estado anterior. False si no hay nada que deshacer. */
export function undo() {
  const previous = past.pop()
  if (!previous) return false
  future.push(current)
  apply(previous)
  return true
}

/** Repite lo último deshecho. False si no hay nada que rehacer. */
export function redo() {
  const next = future.pop()
  if (!next) return false
  past.push(current)
  apply(next)
  return true
}
