import { useMemo, useState } from 'react'
import { BOARD_POSES, Board, MIN_BOARD, boardPose, boardReach } from '../model/boards'
import { PlacedModule, Side, WALL_HEIGHT } from '../model/house'
import { wallFace } from '../model/vinyls'
import { deriveWalls } from '../model/walls'
import { useHouse } from '../store'
import { Fields } from './Field'
import { FinishPicker } from './FinishesPanel'
import { Slide } from './VinylsSection'

const SIDE_NAMES: Record<Side, string> = { n: 'norte', s: 'sur', e: 'este', w: 'oeste' }

/** Tableros de una pared: el botón para colocar uno y los datos del elegido. */
export function BoardsSection({ room, side }: { room: PlacedModule; side: Side }) {
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const addBoard = useHouse((s) => s.addBoard)
  const patchBoard = useHouse((s) => s.patchBoard)
  const removeBoard = useHouse((s) => s.removeBoard)
  const [chosenId, setChosenId] = useState<string | null>(null)
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
      <h2>Tableros de la pared {SIDE_NAMES[side]}</h2>
      <div className="actions">
        <button
          onClick={() => {
            const id = addBoard(room.id, side)
            setNotice(id ? '' : 'No cabe en esta pared.')
            if (id) setChosenId(id)
          }}
        >
          Añadir tablero
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

      {chosen && (
        <>
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
