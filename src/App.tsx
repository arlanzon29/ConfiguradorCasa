import { Suspense, lazy, useEffect, useState } from 'react'
import { redo, undo } from './history'
import Editor2D from './editor/Editor2D'
import HouseTree from './panels/HouseTree'
import PhotoViewer from './panels/PhotoViewer'
import PlanFileButtons from './panels/PlanFileButtons'
import PropertiesPanel from './panels/PropertiesPanel'
import RemoteHouseBar from './panels/RemoteHouseBar'
import { usePhotos } from './photos'
import { REMOTE_URL } from './remoteHouse'
import { PLAN_LAYERS, useHouse } from './store'

// Three.js pesa bastante: solo se descarga al abrir la vista 3D.
const View3D = lazy(() => import('./viewer/View3D'))

// Con ?vista=3d la página muestra solo la vista 3D, para tenerla en otra ventana
// mientras se edita el plano; el estado se sincroniza entre ventanas (store.ts).
const STANDALONE_3D = new URLSearchParams(location.search).get('vista') === '3d'

// Los dos paneles laterales se pueden plegar; queda una tira con el botón para
// volver a sacarlos. Se recuerda en este navegador, fuera del plano.
const PANELS_KEY = 'eurocasa-paneles'
const PANEL_WIDTH = '280px'
const PANEL_HIDDEN = '32px'

function readHiddenPanels(): { left: boolean; right: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}')
    return { left: saved.left === true, right: saved.right === true }
  } catch {
    return { left: false, right: false }
  }
}

export default function App() {
  const walkMode = useHouse((s) => s.walkMode)
  const setWalkMode = useHouse((s) => s.setWalkMode)
  const planLayers = useHouse((s) => s.planLayers)
  const setPlanLayer = useHouse((s) => s.setPlanLayer)
  // Con una casa de una dirección (?url=…) se abre en la vista 3D: es para verla, sobre todo en las Quest.
  const [view, setView] = useState<'2d' | '3d' | 'split'>(REMOTE_URL ? '3d' : '2d')
  const [hidden, setHidden] = useState(readHiddenPanels)

  // Repetir una foto necesita la vista 3D a la vista: es ella la que la traza.
  const retakeId = usePhotos((s) => s.retakeId)
  useEffect(() => {
    if (retakeId) setView((v) => (v === '2d' ? 'split' : v))
  }, [retakeId])
  const showPlanOnly = () => {
    usePhotos.getState().cancelRetake()
    setView('2d')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Al escribir medidas, R y Retroceso no deben girar ni borrar nada.
      if (e.target instanceof HTMLInputElement) return
      // Ctrl+Z deshace; Ctrl+Y o Ctrl+Mayús+Z rehace.
      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase()
        if (key === 'z') {
          e.preventDefault()
          if (e.shiftKey) redo()
          else undo()
          return
        }
        if (key === 'y') {
          e.preventDefault()
          redo()
          return
        }
      }
      const s = useHouse.getState()
      if (e.key === 'Escape') s.setTool(null)
      // La estancia solo se gira y borra si es ella lo elegido, no una pared suya.
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
        <div className="view-toggle">
          <RemoteHouseBar />
          {walkButton}
        </div>
        <Suspense fallback={<p className="muted">Cargando vista 3D…</p>}>
          <View3D />
        </Suspense>
        <PhotoViewer />
      </div>
    )
  }

  // El panel derecho está siempre, aunque no haya nada elegido: si apareciera al
  // hacer clic, el plano cambiaría de tamaño a mitad de un arrastre.
  const togglePanel = (side: 'left' | 'right') => {
    const next = { ...hidden, [side]: !hidden[side] }
    setHidden(next)
    localStorage.setItem(PANELS_KEY, JSON.stringify(next))
  }
  const columns = [
    hidden.left ? PANEL_HIDDEN : PANEL_WIDTH,
    '1fr',
    hidden.right ? PANEL_HIDDEN : PANEL_WIDTH,
  ].join(' ')

  return (
    <div className="app" style={{ gridTemplateColumns: columns }}>
      {hidden.left ? (
        <aside className="sidebar collapsed">
          <button
            className="panel-toggle"
            title="Mostrar el panel"
            aria-label="Mostrar el panel izquierdo"
            onClick={() => togglePanel('left')}
          >
            ›
          </button>
        </aside>
      ) : (
        <aside className="sidebar">
          <div className="panel-head">
            <h1>Configurador EuroCasa</h1>
            <button
              className="panel-toggle"
              title="Ocultar el panel"
              aria-label="Ocultar el panel izquierdo"
              onClick={() => togglePanel('left')}
            >
              ‹
            </button>
          </div>
          <p className="app-version">{__APP_VERSION__}</p>
          <PlanFileButtons />
          <HouseTree />
        </aside>
      )}
      <PhotoViewer />

      <main className="canvas">
        <div className="view-toggle">
          <button className={view === '2d' ? 'active' : ''} onClick={showPlanOnly}>
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
          <RemoteHouseBar />
          {view !== '2d' && walkButton}
          {view !== '3d' && (
            <div className="plan-layers">
              <span className="muted">Ver en el plano:</span>
              {PLAN_LAYERS.map((layer) => (
                <button
                  key={layer.id}
                  className={planLayers[layer.id] ? 'active' : ''}
                  aria-pressed={planLayers[layer.id]}
                  title={planLayers[layer.id] ? 'Quitar del plano' : 'Mostrar en el plano'}
                  onClick={() => setPlanLayer(layer.id, !planLayers[layer.id])}
                >
                  {layer.name}
                </button>
              ))}
            </div>
          )}
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
      <PropertiesPanel hidden={hidden.right} onToggle={() => togglePanel('right')} />
    </div>
  )
}
