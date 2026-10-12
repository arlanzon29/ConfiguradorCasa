import { useMemo, useState } from 'react'
import { PlacedModule, Side, WALL_HEIGHT } from '../model/house'
import { Mirror } from '../model/mirrors'
import { MIN_VINYL, wallFace } from '../model/vinyls'
import { deriveWalls } from '../model/walls'
import { useHouse } from '../store'
import { defaultPieceName } from '../model/names'
import { ARTICLES } from '../model/articles'
import { ArticleCode, Fields, NameField } from './Field'
import { Slide } from './VinylsSection'

/** Espejos de una pared: el botón para colgar uno y las medidas del elegido. */
export default function MirrorsSection({ room, side, chosenId }: { room: PlacedModule; side: Side; chosenId?: string }) {
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const addMirror = useHouse((s) => s.addMirror)
  const patchMirror = useHouse((s) => s.patchMirror)
  const removeMirror = useHouse((s) => s.removeMirror)
  const pick = useHouse((s) => s.pick)
  // La pieza elegida está en el estado: el árbol la marca y Propiedades enseña solo lo suyo.
  const setChosenId = (id: string) =>
    pick('walls', {
      selectedWall: useHouse.getState().selectedWall,
      selectedPiece: { kind: 'mirror', roomId: room.id, side, id },
    })
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
      {!chosenId && (
        <>
      <h2>Añadir espejo</h2>
      <div className="actions">
        <button
          onClick={() => {
            const id = addMirror(room.id, side)
            setNotice(id ? '' : 'No cabe en esta pared.')
            if (id) setChosenId(id)
          }}
        >
          Espejo
        </button>
      </div>
      {notice && <p className="notice">{notice}</p>}
        </>
      )}

      {chosen && (
        <>
          <NameField
            value={chosen.name}
            fallback={defaultPieceName(room, 'mirror', side, chosen.id)}
            onApply={(name) => patch({ name: name || undefined })}
          />
          <ArticleCode codes={[{ code: ARTICLES.mirror }]} />
          <p>Espejo</p>
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
          <p className="muted spaced">
            El reflejo de verdad solo sale en la foto en calidad; en la vista 3D es un panel
            plateado.
          </p>
        </>
      )}
    </section>
  )
}
