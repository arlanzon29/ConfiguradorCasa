import { useMemo, useState } from 'react'
import { PlacedModule, Side, WALL_HEIGHT } from '../model/house'
import { Mirror } from '../model/mirrors'
import { MIN_VINYL, wallFace } from '../model/vinyls'
import { deriveWalls } from '../model/walls'
import { useHouse } from '../store'
import { Fields } from './Field'
import { Slide } from './VinylsSection'

/** Espejos de una pared: el botón para colgar uno y las medidas del elegido. */
export default function MirrorsSection({ room, side }: { room: PlacedModule; side: Side }) {
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const addMirror = useHouse((s) => s.addMirror)
  const patchMirror = useHouse((s) => s.patchMirror)
  const removeMirror = useHouse((s) => s.removeMirror)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const length = useMemo(
    () => wallFace(room, side, deriveWalls(modules, joints)).length,
    [room, side, modules, joints],
  )
  const list = room.mirrors?.[side] ?? []
  const chosen = list.find((v) => v.id === chosenId)
  const patch = (change: Partial<Omit<Mirror, 'id'>>) =>
    chosen ? patchMirror(room.id, side, chosen.id, change) : ''

  return (
    // Mismos estilos que el apartado de vinilos.
    <section className="vinyls">
      <h2>Espejos de esta pared</h2>
      <div className="actions">
        <button
          onClick={() => {
            const id = addMirror(room.id, side)
            setNotice(id ? '' : 'No cabe en esta pared.')
            if (id) setChosenId(id)
          }}
        >
          Añadir espejo
        </button>
      </div>
      {notice && <p className="notice">{notice}</p>}

      {list.length > 0 && (
        <div className="vinyl-list">
          {list.map((v, i) => (
            <button
              key={v.id}
              className={v.id === chosenId ? 'active' : ''}
              onClick={() => setChosenId(v.id)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {chosen ? (
        <>
          <Fields title="Distancia desde">
            <Slide
              label="La izquierda (m)"
              value={chosen.x}
              min={0}
              max={length - chosen.width}
              onApply={(x) => patch({ x })}
            />
            <Slide
              label="El suelo (m)"
              value={chosen.y}
              min={0}
              max={WALL_HEIGHT - chosen.height}
              onApply={(y) => patch({ y })}
            />
          </Fields>
          <Fields title="Medidas">
            <Slide
              label="Ancho (m)"
              value={chosen.width}
              min={MIN_VINYL}
              max={length - chosen.x}
              onApply={(width) => patch({ width })}
            />
            <Slide
              label="Alto (m)"
              value={chosen.height}
              min={MIN_VINYL}
              max={WALL_HEIGHT - chosen.y}
              onApply={(height) => patch({ height })}
            />
          </Fields>
          <div className="actions spaced">
            <button onClick={() => removeMirror(room.id, side, chosen.id)}>Eliminar</button>
          </div>
        </>
      ) : (
        <p className="muted spaced">
          El reflejo de verdad solo sale en la foto en calidad; en la vista 3D es un panel plateado.
        </p>
      )}
    </section>
  )
}
