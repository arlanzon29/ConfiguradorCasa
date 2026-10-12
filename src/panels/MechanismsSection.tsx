import { useMemo, useState } from 'react'
import { PlacedModule, Side, WALL_HEIGHT } from '../model/house'
import { MECHANISMS, Mechanism, mechanismSize, mechanismType } from '../model/mechanisms'
import { wallFace } from '../model/vinyls'
import { deriveWalls } from '../model/walls'
import { useHouse } from '../store'
import { defaultPieceName } from '../model/names'
import { ArticleCode, Fields, NameField } from './Field'
import { Slide } from './VinylsSection'

/** Interruptores y enchufes de una pared: el catálogo para poner uno y la posición del elegido. */
export default function MechanismsSection({
  room,
  side,
  chosenId,
}: {
  room: PlacedModule
  side: Side
  chosenId?: string
}) {
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const addMechanism = useHouse((s) => s.addMechanism)
  const patchMechanism = useHouse((s) => s.patchMechanism)
  const removeMechanism = useHouse((s) => s.removeMechanism)
  const pick = useHouse((s) => s.pick)
  // La pieza elegida está en el estado: el árbol la marca y Propiedades enseña solo lo suyo.
  const setChosenId = (id: string) =>
    pick('walls', {
      selectedWall: useHouse.getState().selectedWall,
      selectedPiece: { kind: 'mechanism', roomId: room.id, side, id },
    })
  const [notice, setNotice] = useState('')

  const length = useMemo(
    () => wallFace(room, side, deriveWalls(modules, joints)).length,
    [room, side, modules, joints],
  )
  const chosen = (room.mechanisms?.[side] ?? []).find((v) => v.id === chosenId)
  const type = chosen && mechanismType(chosen.typeId)
  const size = type && mechanismSize(type)
  const patch = (change: Partial<Omit<Mechanism, 'id'>>) =>
    chosen ? patchMechanism(room.id, side, chosen.id, change) : ''

  return (
    // Mismos estilos que el apartado de vinilos.
    <section className="vinyls">
      {!chosenId && (
        <>
          <h2>Añadir interruptor o enchufe</h2>
          <div className="actions">
            {MECHANISMS.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  const id = addMechanism(room.id, side, t.id)
                  setNotice(id ? '' : 'No cabe en esta pared.')
                  if (id) setChosenId(id)
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
          {notice && <p className="notice">{notice}</p>}
        </>
      )}

      {chosen && type && size && (
        <>
          <NameField
            value={chosen.name}
            fallback={defaultPieceName(room, 'mechanism', side, chosen.id)}
            onApply={(name) => patch({ name: name || undefined })}
          />
          <ArticleCode codes={[{ code: type.code }]} />
          <p>{type.name}</p>
          <Fields title="Distancia desde">
            <Slide
              label="La izquierda (m)"
              value={chosen.x}
              min={0}
              max={length - size.width}
              onApply={(x) => patch({ x })}
            />
            <Slide
              label="El suelo (m)"
              value={chosen.y}
              min={0}
              max={WALL_HEIGHT - size.height}
              onApply={(y) => patch({ y })}
            />
          </Fields>
          <div className="actions spaced">
            <button onClick={() => removeMechanism(room.id, side, chosen.id)}>Eliminar</button>
          </div>
          <p className="muted spaced">
            Solo se ven: no encienden nada. La posición es la de su esquina inferior izquierda,
            mirando la pared desde dentro. Interruptor a 1,1 m del suelo y enchufe a 0,3 m
            (de centro).
          </p>
        </>
      )}
    </section>
  )
}
