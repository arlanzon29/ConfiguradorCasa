import {
  BASE_FLOOR,
  DEFAULT_CEILING,
  DEFAULT_WALL_COLOR,
  Finish,
  MATERIALS,
  WALL_COLORS,
  floorOf,
  interiorFinish,
  resolveFinish,
} from '../model/finishes'
import { PlacedModule, Side } from '../model/house'
import { useHouse } from '../store'
import MirrorsSection from './MirrorsSection'
import MechanismsSection from './MechanismsSection'
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

/** Lo que es de la estancia entera: su suelo y el acabado de todas sus paredes. */
export function RoomFinishes({ room }: { room: PlacedModule }) {
  const setFloor = useHouse((s) => s.setFloor)
  const turnFloor = useHouse((s) => s.turnFloor)
  const setWallColor = useHouse((s) => s.setWallColor)
  const setCeiling = useHouse((s) => s.setCeiling)
  const floor = floorOf(room)

  return (
    <>
      <section>
        <h2>Suelo</h2>
        <FinishPicker value={floor ?? BASE_FLOOR.color} onChange={(f) => setFloor(room.id, f)} />
        <div className="actions spaced">
          {floor && resolveFinish(floor, BASE_FLOOR.color).texture && (
            <button onClick={() => turnFloor(room.id)}>Girar el suelo 90°</button>
          )}
          {floor && <button onClick={() => setFloor(room.id, BASE_FLOOR.id)}>Quitar el acabado</button>}
        </div>
      </section>
      <section>
        <h2>Techo</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={!room.noCeiling}
            onChange={(e) => setCeiling(room.id, { noCeiling: !e.target.checked })}
          />
          Con techo en la foto en calidad
        </label>
        {!room.noCeiling && (
          <FinishPicker
            value={room.ceiling ?? DEFAULT_CEILING}
            onChange={(f) => setCeiling(room.id, { ceiling: f })}
          />
        )}
        <p className="muted spaced">En la vista 3D normal no hay techo, para ver desde arriba.</p>
      </section>
      <section>
        <h2>Acabado de todas sus paredes</h2>
        <FinishPicker
          value={room.wallColor ?? DEFAULT_WALL_COLOR}
          onChange={(color) => setWallColor(room.id, color)}
        />
        <p className="muted spaced">Para pintar solo una, elige esa pared.</p>
      </section>
    </>
  )
}

/** Lo que lleva la cara de una pared que da a una estancia: acabado, vinilos y espejos. */
export function FaceFinishes({ room, side }: { room: PlacedModule; side: Side }) {
  const setWallColor = useHouse((s) => s.setWallColor)

  return (
    <>
      <section>
        <h2>Acabado de la pared {SIDE_NAMES[side]}</h2>
        <FinishPicker
          value={interiorFinish(room, side)}
          onChange={(color) => setWallColor(room.id, color, side)}
        />
        {room.sideColors?.[side] && (
          <div className="actions spaced">
            <button onClick={() => setWallColor(room.id, null, side)}>
              Volver al acabado de la estancia
            </button>
          </div>
        )}
      </section>
      <VinylsSection key={`${room.id}:${side}`} room={room} side={side} />
      <MirrorsSection key={`espejos:${room.id}:${side}`} room={room} side={side} />
      <MechanismsSection key={`mecanismos:${room.id}:${side}`} room={room} side={side} />
    </>
  )
}
