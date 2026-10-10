import { Suspense, lazy, useEffect, useState } from 'react'
import Editor2D from './editor/Editor2D'
import FinishesPanel from './panels/FinishesPanel'
import ModulesPanel from './panels/ModulesPanel'
import OptionsPanel from './panels/OptionsPanel'
import PhotoViewer from './panels/PhotoViewer'
import PhotosPanel from './panels/PhotosPanel'
import PlanFileButtons from './panels/PlanFileButtons'
import ShellsPanel from './panels/ShellsPanel'
import WallsPanel from './panels/WallsPanel'
import { Mode, useHouse } from './store'

// Three.js pesa bastante: solo se descarga al abrir la vista 3D.
const View3D = lazy(() => import('./viewer/View3D'))

// Con ?vista=3d la página muestra solo la vista 3D, para tenerla en otra ventana
// mientras se edita el plano; el estado se sincroniza entre ventanas (store.ts).
const STANDALONE_3D = new URLSearchParams(location.search).get('vista') === '3d'

const MODES: { id: Mode; name: string }[] = [
  { id: 'shells', name: 'Módulos' },
  { id: 'modules', name: 'Estancias' },
  { id: 'walls', name: 'Paredes' },
  { id: 'finishes', name: 'Acabados' },
  { id: 'options', name: 'Opciones' },
  { id: 'photos', name: 'Fotos' },
]

export default function App() {
  const mode = useHouse((s) => s.mode)
  const setMode = useHouse((s) => s.setMode)
  const walkMode = useHouse((s) => s.walkMode)
  const setWalkMode = useHouse((s) => s.setWalkMode)
  const [view, setView] = useState<'2d' | '3d' | 'split'>('2d')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Al escribir medidas, R y Retroceso no deben girar ni borrar nada.
      if (e.target instanceof HTMLInputElement) return
      const s = useHouse.getState()
      if (e.key === 'Escape') s.setTool(null)
      // Las estancias solo se giran y borran en su modo, no al elegirles acabados.
      const room = s.mode === 'modules' ? s.selectedId : null
      const turn = e.key === 'r' || e.key === 'R'
      if (turn && room) s.rotateModule(room)
      if (turn && s.selectedShellId) s.rotateShell(s.selectedShellId)
      if (turn && s.selectedFurnitureId) s.rotateFurniture(s.selectedFurnitureId)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selectedShellId) s.removeShell(s.selectedShellId)
        else if (s.selectedFurnitureId) s.removeFurniture(s.selectedFurnitureId)
        else if (s.selectedOpeningId) s.removeOpening(s.selectedOpeningId)
        else if (room) s.removeModule(room)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const walkButton = (
    <button
      className={walkMode ? 'walk-toggle active' : 'walk-toggle'}
      onClick={() => setWalkMode(!walkMode)}
    >
      {walkMode ? 'A pie: activado' : 'Bajar a pie'}
    </button>
  )

  if (STANDALONE_3D) {
    return (
      <div className="standalone">
        <div className="view-toggle">{walkButton}</div>
        <Suspense fallback={<p className="muted">Cargando vista 3D…</p>}>
          <View3D />
        </Suspense>
      </div>
    )
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>Configurador EuroCasa</h1>
        <PlanFileButtons />

        <div className="mode-tabs">
          {MODES.map((m) => (
            <button
              key={m.id}
              className={mode === m.id ? 'active' : ''}
              onClick={() => setMode(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>

        {mode === 'shells' && <ShellsPanel />}
        {mode === 'modules' && <ModulesPanel />}
        {mode === 'walls' && <WallsPanel />}
        {mode === 'finishes' && <FinishesPanel />}
        {mode === 'options' && <OptionsPanel />}
        {mode === 'photos' && <PhotosPanel />}
      </aside>
      <PhotoViewer />

      <main className="canvas">
        <div className="view-toggle">
          <button className={view === '2d' ? 'active' : ''} onClick={() => setView('2d')}>
            Plano 2D
          </button>
          <button className={view === '3d' ? 'active' : ''} onClick={() => setView('3d')}>
            Vista 3D
          </button>
          <button className={view === 'split' ? 'active' : ''} onClick={() => setView('split')}>
            Plano + 3D
          </button>
          <button onClick={() => window.open('?vista=3d', 'eurocasa-3d', 'popup,width=1100,height=750')}>
            3D en otra ventana
          </button>
          {view !== '2d' && walkButton}
        </div>
        <div className={view === 'split' ? 'view split' : 'view'}>
          {view !== '3d' && <Editor2D />}
          {view !== '2d' && (
            <div className="view-3d">
              <Suspense fallback={<p className="muted">Cargando vista 3D…</p>}>
                <View3D />
              </Suspense>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
