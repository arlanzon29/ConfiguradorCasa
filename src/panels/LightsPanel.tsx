import { useState } from 'react'
import { PlacedModule } from '../model/house'
import {
  LIGHT_MARGIN,
  LIGHT_TONES,
  MAX_LIGHT_POWER,
  MIN_LIGHT_POWER,
  RoomLight,
} from '../model/lights'
import { useHouse } from '../store'
import { Fields } from './Field'
import { Slide } from './VinylsSection'

/** Focos del techo de una estancia: el botón para poner uno y los datos del elegido. */
function LightsSection({ room }: { room: PlacedModule }) {
  const addLight = useHouse((s) => s.addLight)
  const patchLight = useHouse((s) => s.patchLight)
  const removeLight = useHouse((s) => s.removeLight)
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const list = room.lights ?? []
  const chosen = list.find((l) => l.id === chosenId)
  const patch = (change: Partial<Omit<RoomLight, 'id'>>) =>
    chosen ? patchLight(room.id, chosen.id, change) : ''

  return (
    // Mismos estilos que el apartado de vinilos.
    <section className="vinyls">
      <h2>Luces de la estancia</h2>
      <div className="actions">
        <button
          onClick={() => {
            const id = addLight(room.id)
            setNotice(id ? '' : 'No cabe en esta estancia.')
            if (id) setChosenId(id)
          }}
        >
          Añadir foco de techo
        </button>
      </div>
      {notice && <p className="notice">{notice}</p>}
      {list.length === 0 && (
        <p className="muted">
          Sin focos, la foto en calidad usa una luz provisional en el centro del techo.
        </p>
      )}

      {list.length > 0 && (
        <div className="vinyl-list">
          {list.map((l, i) => (
            <button
              key={l.id}
              className={l.id === chosenId ? 'active' : ''}
              onClick={() => setChosenId(l.id)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {chosen && (
        <>
          <Fields title="Distancia desde">
            <Slide
              label="La izquierda (m)"
              value={chosen.x}
              min={LIGHT_MARGIN}
              max={room.width - LIGHT_MARGIN}
              onApply={(x) => patch({ x })}
            />
            <Slide
              label="Arriba (m)"
              value={chosen.y}
              min={LIGHT_MARGIN}
              max={room.depth - LIGHT_MARGIN}
              onApply={(y) => patch({ y })}
            />
          </Fields>
          <Fields title="Luz">
            <Slide
              label="Potencia (%)"
              value={chosen.power}
              min={MIN_LIGHT_POWER}
              max={MAX_LIGHT_POWER}
              step={10}
              onApply={(power) => patch({ power })}
            />
          </Fields>
          <h3>Tono</h3>
          <div className="actions">
            {LIGHT_TONES.map((t) => (
              <button
                key={t.id}
                className={t.id === chosen.tone ? 'active' : ''}
                onClick={() => patch({ tone: t.id })}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className="actions spaced">
            <button onClick={() => removeLight(room.id, chosen.id)}>Eliminar</button>
          </div>
        </>
      )}
    </section>
  )
}

export default function LightsPanel() {
  const modules = useHouse((s) => s.modules)
  const selectedId = useHouse((s) => s.selectedId)
  const selected = modules.find((m) => m.id === selectedId)

  if (selected) return <LightsSection key={selected.id} room={selected} />
  return (
    <section>
      <h2>Luces</h2>
      <p className="muted">Haz clic en una estancia para poner focos en su techo.</p>
    </section>
  )
}
