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
import { PlacedModule, Side } from '../model/house'
import { useHouse } from '../store'
import MirrorsSection from './MirrorsSection'
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

/** Lo que es de la estancia entera: su suelo y el color de todas sus paredes. */
export function RoomFinishes({ room }: { room: PlacedModule }) {
  const setFloor = useHouse((s) => s.setFloor)
  const turnFloor = useHouse((s) => s.turnFloor)
  const setWallColor = useHouse((s) => s.setWallColor)
  const current = floorFinish(room.floor)

  return (
    <>
      <section>
        <h2>Suelo</h2>
        <div className="swatches">
          {FLOORS.map((f) => (
            <button
              key={f.id}
              className={f.id === current.id ? 'swatch active' : 'swatch'}
              onClick={() => setFloor(room.id, f.id)}
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
            <button onClick={() => turnFloor(room.id)}>Girar el suelo 90°</button>
          </div>
        )}
      </section>
      <section>
        <h2>Color de todas sus paredes</h2>
        <ColorPicker
          value={room.wallColor ?? DEFAULT_WALL_COLOR}
          onChange={(color) => setWallColor(room.id, color)}
        />
        <p className="muted spaced">Para pintar solo una, elige esa pared.</p>
      </section>
    </>
  )
}

/** Lo que lleva la cara de una pared que da a una estancia: color, vinilos y espejos. */
export function FaceFinishes({ room, side }: { room: PlacedModule; side: Side }) {
  const setWallColor = useHouse((s) => s.setWallColor)

  return (
    <>
      <section>
        <h2>Color de la pared {SIDE_NAMES[side]}</h2>
        <ColorPicker
          value={interiorColor(room, side)}
          onChange={(color) => setWallColor(room.id, color, side)}
        />
        {room.sideColors?.[side] && (
          <div className="actions spaced">
            <button onClick={() => setWallColor(room.id, null, side)}>
              Volver al color de la estancia
            </button>
          </div>
        )}
      </section>
      <VinylsSection key={`${room.id}:${side}`} room={room} side={side} />
      <MirrorsSection key={`espejos:${room.id}:${side}`} room={room} side={side} />
    </>
  )
}
