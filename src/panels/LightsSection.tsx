import { useState } from 'react'
import { PlacedModule, roundSize } from '../model/house'
import {
  LIGHT_MARGIN,
  LIGHT_TONES,
  MAX_LIGHT_POWER,
  MIN_LIGHT_POWER,
  RoomLight,
  lightColor,
} from '../model/lights'
import { defaultLightName } from '../model/names'
import { useHouse } from '../store'
import { ARTICLES } from '../model/articles'
import { ArticleCode, Fields, NameField } from './Field'
import { Slide } from './VinylsSection'

/** En las propiedades de una estancia: el botón para ponerle un foco. Los que tiene están en el árbol. */
export function AddLight({ room }: { room: PlacedModule }) {
  const addLight = useHouse((s) => s.addLight)
  const pick = useHouse((s) => s.pick)
  const [notice, setNotice] = useState('')

  return (
    <section>
      <h2>Añadir luz</h2>
      <div className="actions">
        <button
          onClick={() => {
            const id = addLight(room.id)
            setNotice(id ? '' : 'No cabe en esta estancia.')
            // El foco nuevo queda elegido, con sus propiedades a la vista.
            if (id) pick('modules', { selectedId: room.id, selectedLightId: id })
          }}
        >
          Foco de techo
        </button>
      </div>
      {notice && <p className="notice">{notice}</p>}
      {!room.lights?.length && (
        <p className="muted spaced">
          Sin focos, en la foto en calidad solo entra la luz de las ventanas.
        </p>
      )}
    </section>
  )
}

/** Propiedades de un foco de techo. */
export function LightProperties({ room, light }: { room: PlacedModule; light: RoomLight }) {
  const patchLight = useHouse((s) => s.patchLight)
  const removeLight = useHouse((s) => s.removeLight)
  const rename = useHouse((s) => s.rename)
  const pick = useHouse((s) => s.pick)
  const patch = (change: Partial<Omit<RoomLight, 'id'>>) => patchLight(room.id, light.id, change)

  return (
    // Mismos estilos que el apartado de vinilos.
    <section className="vinyls">
      <NameField
        value={light.name}
        fallback={defaultLightName(room, light.id)}
        onApply={(name) => rename('light', light.id, name)}
      />
      <ArticleCode codes={[{ code: ARTICLES.light }]} />
      <p>Foco de techo</p>
      <Fields title="Distancia desde">
        <Slide
          label="La izquierda (m)"
          value={light.x}
          min={LIGHT_MARGIN}
          max={room.width - LIGHT_MARGIN}
          onApply={(x) => patch({ x })}
        />
        <Slide
          label="Arriba (m)"
          value={light.y}
          min={LIGHT_MARGIN}
          max={room.depth - LIGHT_MARGIN}
          onApply={(y) => patch({ y })}
        />
      </Fields>
      <div className="actions">
        <button
          onClick={() => patch({ x: roundSize(room.width / 2), y: roundSize(room.depth / 2) })}
        >
          Centrar en la estancia
        </button>
      </div>
      <Fields title="Luz">
        <Slide
          label="Potencia (%)"
          value={light.power}
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
            className={t.id === light.tone && !light.color ? 'active' : ''}
            // Elegir un tono quita el color propio.
            onClick={() => patch({ tone: t.id, color: undefined })}
          >
            {t.name}
          </button>
        ))}
      </div>
      <h3>Color de emisión</h3>
      <div className="color-picker">
        <label className="color-custom">
          {light.color ? 'Color propio' : 'El de su tono'}
          <input
            type="color"
            value={lightColor(light)}
            onChange={(e) => patch({ color: e.target.value })}
          />
        </label>
      </div>
      <div className="actions spaced">
        <button
          onClick={() => {
            removeLight(room.id, light.id)
            pick('modules', { selectedId: room.id })
          }}
        >
          Eliminar
        </button>
      </div>
    </section>
  )
}
