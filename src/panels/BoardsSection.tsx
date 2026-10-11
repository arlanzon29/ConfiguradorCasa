import { useMemo, useState } from 'react'
import { BOARD_POSES, Board, MIN_BOARD, boardPose, boardReach } from '../model/boards'
import { PlacedModule, Side, WALL_HEIGHT } from '../model/house'
import { wallFace } from '../model/vinyls'
import { deriveWalls } from '../model/walls'
import { useHouse } from '../store'
import { defaultPieceName } from '../model/names'
import { Fields, NameField } from './Field'
import { FinishPicker } from './FinishesPanel'
import { Slide } from './VinylsSection'

/** Tableros de una pared: el botón para colocar uno y los datos del elegido. */
export function BoardsSection({ room, side, chosenId }: { room: PlacedModule; side: Side; chosenId?: string }) {
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const addBoard = useHouse((s) => s.addBoard)
  const patchBoard = useHouse((s) => s.patchBoard)
  const removeBoard = useHouse((s) => s.removeBoard)
  const pick = useHouse((s) => s.pick)
  // La pieza elegida está en el estado: el árbol la marca y Propiedades enseña solo lo suyo.
  const setChosenId = (id: string) =>
    pick('walls', {
      selectedWall: useHouse.getState().selectedWall,
      selectedPiece: { kind: 'board', roomId: room.id, side, id },
    })
  const [notice, setNotice] = useState('')

  const length = useMemo(
    () => wallFace(room, side, deriveWalls(modules, joints)).length,
    [room, side, modules, joints],
  )
  const list = room.boards?.[side] ?? []
  const chosen = list.find((v) => v.id === chosenId)
  const patch = (change: Partial<Omit<Board, 'id'>>) =>
    chosen ? patchBoard(room.id, side, chosen.id, change) : ''

  return (
    // Mismos estilos que el apartado de vinilos.
    <section className="vinyls">
      {!chosenId && (
        <>
      <h2>Añadir tablero</h2>
      <div className="actions">
        <button
          onClick={() => {
            const id = addBoard(room.id, side)
            setNotice(id ? '' : 'No cabe en esta pared.')
            if (id) setChosenId(id)
          }}
        >
          Tablero
        </button>
      </div>
      {notice && <p className="notice">{notice}</p>}
        </>
      )}

      {chosen && (
        <>
          <NameField
            value={chosen.name}
            fallback={defaultPieceName(room, 'board', side, chosen.id)}
            onApply={(name) => patch({ name: name || undefined })}
          />
          <p>Tablero</p>
          <h3>Postura</h3>
          <div className="actions">
            {BOARD_POSES.map((p) => (
              <button
                key={p.id}
                className={p.id === boardPose(chosen) ? 'active' : ''}
                onClick={() => setNotice(patchBoard(room.id, side, chosen.id, {}, p.id))}
              >
                {p.name}
              </button>
            ))}
          </div>
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
              min={MIN_BOARD}
              max={length - chosen.x}
              step={0.005}
              onApply={(width) => patch({ width })}
            />
            <Slide
              label="Alto (m)"
              value={chosen.height}
              min={MIN_BOARD}
              max={WALL_HEIGHT - chosen.y}
              step={0.005}
              onApply={(height) => patch({ height })}
            />
            <Slide
              label="Fondo (m)"
              value={chosen.depth}
              min={MIN_BOARD}
              max={boardReach(room, side)}
              step={0.005}
              onApply={(depth) => patch({ depth })}
            />
          </Fields>
          <h3>Acabado</h3>
          <FinishPicker value={chosen.finish} onChange={(finish) => patch({ finish })} />
          <div className="actions spaced">
            <button onClick={() => removeBoard(room.id, side, chosen.id)}>Eliminar</button>
          </div>
        </>
      )}
    </section>
  )
}
