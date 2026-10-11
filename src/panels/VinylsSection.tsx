import { useState } from 'react'
import { PlacedModule, Side, roundSize } from '../model/house'
import { VINYLS, vinylType } from '../model/vinyls'
import { useHouse } from '../store'
import { Field, Fields } from './Field'

/** Vinilos de una pared: el catálogo para pegar uno y las medidas del elegido. */
export default function VinylsSection({ room, side }: { room: PlacedModule; side: Side }) {
  const addVinyl = useHouse((s) => s.addVinyl)
  const patchVinyl = useHouse((s) => s.patchVinyl)
  const removeVinyl = useHouse((s) => s.removeVinyl)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const list = room.vinyls?.[side] ?? []
  const chosen = list.find((v) => v.id === chosenId)
  const type = chosen && vinylType(chosen.typeId)
  const patch = (change: Parameters<typeof patchVinyl>[3]) =>
    chosen ? patchVinyl(room.id, side, chosen.id, change) : ''

  return (
    <section className="vinyls">
      <h2>Vinilos de esta pared</h2>
      <div className="vinyl-catalog">
        {VINYLS.map((t) => (
          <button
            key={t.id}
            title={`Pegar: ${t.name}`}
            onClick={() => {
              const id = addVinyl(room.id, side, t.id)
              setNotice(id ? '' : 'No cabe en esta pared.')
              if (id) setChosenId(id)
            }}
          >
            <img src={t.image} alt="" />
            {t.name}
          </button>
        ))}
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
              <img src={vinylType(v.typeId)?.image} alt="" />
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {chosen ? (
        <>
          <Fields title="Distancia desde">
            <Field label="La izquierda (m)" value={chosen.x} onApply={(x) => patch({ x })} />
            <Field label="El suelo (m)" value={chosen.y} onApply={(y) => patch({ y })} />
          </Fields>
          <Fields title="Medidas">
            <Field label="Ancho (m)" value={chosen.width} onApply={(width) => patch({ width })} />
            <Field label="Alto (m)" value={chosen.height} onApply={(height) => patch({ height })} />
          </Fields>
          <div className="actions spaced">
            {type && (
              <button
                title="Ajusta el alto al ancho para que la imagen no se deforme"
                onClick={() =>
                  setNotice(patch({ height: roundSize((chosen.width * type.height) / type.width) }))
                }
              >
                Proporción original
              </button>
            )}
            <button onClick={() => removeVinyl(room.id, side, chosen.id)}>Eliminar</button>
          </div>
          <p className="muted spaced">
            La posición se mide mirando la pared desde dentro, hasta la esquina inferior izquierda
            del vinilo.
          </p>
        </>
      ) : (
        <p className="muted spaced">
          Pulsa un dibujo para pegarlo en esta pared. Puedes poner varios.
        </p>
      )}
    </section>
  )
}
