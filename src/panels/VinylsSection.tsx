import { useMemo, useState } from 'react'
import { PlacedModule, Side, WALL_HEIGHT, roundSize } from '../model/house'
import { MIN_VINYL, VINYLS, Vinyl, vinylType, wallFace } from '../model/vinyls'
import { deriveWalls } from '../model/walls'
import { useHouse } from '../store'
import { defaultPieceName } from '../model/names'
import { Field, Fields, NameField } from './Field'

interface SlideProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  /** Devuelve un mensaje de error, o '' si se ha aplicado. */
  onApply: (value: number) => string
}

/** Una medida con su casilla para escribirla y, al lado, una barra para moverla. */
export function Slide({ label, value, min, max, step = 0.01, onApply }: SlideProps) {
  return (
    <>
      <Field label={label} value={value} onApply={onApply} />
      <input
        className="slide"
        type="range"
        aria-label={label}
        min={min}
        max={Math.max(min, roundSize(max))}
        step={step}
        value={value}
        onChange={(e) => onApply(Number(e.target.value))}
      />
    </>
  )
}

/** Vinilos de una pared: el catálogo para pegar uno y las medidas del elegido. */
export default function VinylsSection({ room, side, chosenId }: { room: PlacedModule; side: Side; chosenId?: string }) {
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const addVinyl = useHouse((s) => s.addVinyl)
  const patchVinyl = useHouse((s) => s.patchVinyl)
  const removeVinyl = useHouse((s) => s.removeVinyl)
  const pick = useHouse((s) => s.pick)
  // La pieza elegida está en el estado: el árbol la marca y Propiedades enseña solo lo suyo.
  const setChosenId = (id: string) =>
    pick('walls', {
      selectedWall: useHouse.getState().selectedWall,
      selectedPiece: { kind: 'vinyl', roomId: room.id, side, id },
    })
  const [notice, setNotice] = useState('')
  // Al cambiar el ancho o el alto, el otro lo sigue para no deformar la imagen.
  const [locked, setLocked] = useState(true)

  const length = useMemo(
    () => wallFace(room, side, deriveWalls(modules, joints)).length,
    [room, side, modules, joints],
  )
  const list = room.vinyls?.[side] ?? []
  const chosen = list.find((v) => v.id === chosenId)
  const patch = (change: Partial<Omit<Vinyl, 'id'>>) =>
    chosen ? patchVinyl(room.id, side, chosen.id, change) : ''
  const resize = (width: number, height: number) => patch({ width: roundSize(width), height: roundSize(height) })

  return (
    <section className="vinyls">
      {!chosenId && (
        <>
      <h2>Añadir vinilo</h2>
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
        </>
      )}

      {chosen && (
        <>
          <NameField
            value={chosen.name}
            fallback={defaultPieceName(room, 'vinyl', side, chosen.id)}
            onApply={(name) => patch({ name: name || undefined })}
          />
          <p>Vinilo · {vinylType(chosen.typeId)?.name}</p>
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
              onApply={(w) => resize(w, locked ? (chosen.height * w) / chosen.width : chosen.height)}
            />
            <Slide
              label="Alto (m)"
              value={chosen.height}
              min={MIN_VINYL}
              max={WALL_HEIGHT - chosen.y}
              onApply={(h) => resize(locked ? (chosen.width * h) / chosen.height : chosen.width, h)}
            />
          </Fields>
          <label className="check">
            <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
            Mantener la proporción
          </label>
          <Fields title="Giro">
            <Slide
              label="Grados"
              value={chosen.rotation ?? 0}
              min={-180}
              max={180}
              step={1}
              onApply={(rotation) =>
                rotation < -180 || rotation > 180 ? 'Entre -180 y 180.' : patch({ rotation })
              }
            />
          </Fields>
          <div className="actions spaced">
            <button onClick={() => removeVinyl(room.id, side, chosen.id)}>Eliminar</button>
          </div>
          <p className="muted spaced">
            La posición se mide mirando la pared desde dentro, hasta la esquina inferior izquierda
            del vinilo sin girar.
          </p>
        </>
      )}
    </section>
  )
}
