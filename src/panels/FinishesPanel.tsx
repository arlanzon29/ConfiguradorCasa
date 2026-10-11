import {
  DEFAULT_WALL_COLOR,
  FLOORS,
  Finish,
  MATERIALS,
  WALL_COLORS,
  floorFinish,
  interiorColor,
  resolveFinish,
} from '../model/finishes'
import { Side, formatMeters } from '../model/house'
import { useHouse } from '../store'
import VinylsSection from './VinylsSection'

const SIDE_NAMES: Record<Side, string> = { n: 'norte', s: 'sur', e: 'este', w: 'oeste' }

interface ColorPickerProps {
  value: string
  onChange: (color: string) => void
}

/** Colores sugeridos más un selector libre. */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  return (
    <div className="color-picker">
      {WALL_COLORS.map((c) => (
        <button
          key={c.color}
          className={c.color === value ? 'color-chip active' : 'color-chip'}
          style={{ backgroundColor: c.color }}
          title={c.name}
          aria-label={c.name}
          onClick={() => onChange(c.color)}
        />
      ))}
      <label className="color-custom">
        Otro color
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  )
}

/** Un acabado: un material del catálogo o un color liso. */
export function FinishPicker({ value, onChange }: { value: Finish; onChange: (finish: Finish) => void }) {
  return (
    <>
      <div className="swatches">
        {MATERIALS.map((m) => (
          <button
            key={m.id}
            className={m.id === value ? 'swatch active' : 'swatch'}
            onClick={() => onChange(m.id)}
          >
            <span
              className="swatch-sample"
              style={{ backgroundColor: m.color, backgroundImage: `url(${m.texture})` }}
            />
            {m.name}
          </button>
        ))}
      </div>
      <ColorPicker value={resolveFinish(value, DEFAULT_WALL_COLOR).color} onChange={onChange} />
    </>
  )
}

export default function FinishesPanel() {
  const modules = useHouse((s) => s.modules)
  const selectedId = useHouse((s) => s.selectedId)
  const selectedSide = useHouse((s) => s.selectedSide)
  const setFloor = useHouse((s) => s.setFloor)
  const turnFloor = useHouse((s) => s.turnFloor)
  const setWallColor = useHouse((s) => s.setWallColor)

  const selected = modules.find((m) => m.id === selectedId)
  const current = selected && floorFinish(selected.floor)

  return (
    <>
      {selected && current ? (
        <>
          <section>
            <h2>Estancia seleccionada</h2>
            <p>
              {formatMeters(selected.width)} × {formatMeters(selected.depth)} m
            </p>
          </section>

          <section>
            <h2>Suelo</h2>
            <div className="swatches">
              {FLOORS.map((f) => (
                <button
                  key={f.id}
                  className={f.id === current.id ? 'swatch active' : 'swatch'}
                  onClick={() => setFloor(selected.id, f.id)}
                >
                  <span
                    className="swatch-sample"
                    style={{
                      backgroundColor: f.color,
                      backgroundImage: f.texture && `url(${f.texture})`,
                    }}
                  />
                  {f.name}
                </button>
              ))}
            </div>
            {current.texture && (
              <div className="actions">
                <button onClick={() => turnFloor(selected.id)}>Girar el suelo 90°</button>
              </div>
            )}
          </section>

          {selectedSide ? (
            <>
            <section>
              <h2>Color de la pared {SIDE_NAMES[selectedSide]}</h2>
              <ColorPicker
                value={interiorColor(selected, selectedSide)}
                onChange={(color) => setWallColor(selected.id, color, selectedSide)}
              />
              {selected.sideColors?.[selectedSide] && (
                <div className="actions spaced">
                  <button onClick={() => setWallColor(selected.id, null, selectedSide)}>
                    Volver al color de la estancia
                  </button>
                </div>
              )}
              <p className="muted spaced">
                Haz clic en el centro de la estancia para pintar todas sus paredes a la vez.
              </p>
            </section>
            <VinylsSection key={`${selected.id}:${selectedSide}`} room={selected} side={selectedSide} />
            </>
          ) : (
            <section>
              <h2>Color de todas sus paredes</h2>
              <ColorPicker
                value={selected.wallColor ?? DEFAULT_WALL_COLOR}
                onChange={(color) => setWallColor(selected.id, color)}
              />
              <p className="muted spaced">
                Haz clic junto a una pared, por dentro de la estancia, para pintar solo esa.
              </p>
            </section>
          )}
        </>
      ) : (
        <section>
          <h2>Estancia</h2>
          <p className="muted">Haz clic en una estancia para elegir su suelo y el color de sus paredes.</p>
        </section>
      )}
    </>
  )
}
