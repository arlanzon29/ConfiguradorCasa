import { useEffect, useMemo, useState } from 'react'
import SizeForm from '../editor/SizeForm'
import {
  MAX_WALL_THICKNESS,
  MIN_WALL_THICKNESS,
  Side,
  WALL_HEIGHT,
  formatMeters,
  roundSize,
  validWallThickness,
} from '../model/house'
import { MIN_OPENING, OPENING_CATALOG } from '../model/openings'
import { deriveWalls } from '../model/walls'
import { useHouse } from '../store'

const SIDE_NAMES: Record<Side, string> = { n: 'norte', s: 'sur', e: 'este', w: 'oeste' }

interface ValueFormProps {
  label: string
  value: number
  submitLabel: string
  /** Devuelve un mensaje de error, o '' si se ha aplicado. */
  onApply: (value: number) => string
}

/** Formulario de una sola medida. */
function ValueForm({ label, value, submitLabel, onApply }: ValueFormProps) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setText(String(value))
    setError('')
  }, [value])

  return (
    <form
      className="size-form"
      onSubmit={(e) => {
        e.preventDefault()
        setError(onApply(Number(text.replace(',', '.'))))
      }}
    >
      <label className="full">
        {label}
        <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="submit">{submitLabel}</button>
      {error && <p className="notice">{error}</p>}
    </form>
  )
}

export default function WallsPanel() {
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const openings = useHouse((s) => s.openings)
  const tool = useHouse((s) => s.tool)
  const setTool = useHouse((s) => s.setTool)
  const selectedWall = useHouse((s) => s.selectedWall)
  const selectedOpeningId = useHouse((s) => s.selectedOpeningId)
  const setWallThickness = useHouse((s) => s.setWallThickness)
  const setWallOpen = useHouse((s) => s.setWallOpen)
  const resizeOpening = useHouse((s) => s.resizeOpening)
  const removeOpening = useHouse((s) => s.removeOpening)
  const setOpeningSill = useHouse((s) => s.setOpeningSill)
  const centerOpening = useHouse((s) => s.centerOpening)
  const [notice, setNotice] = useState('')
  useEffect(() => setNotice(''), [selectedOpeningId])

  const walls = useMemo(() => deriveWalls(modules, joints), [modules, joints])
  const opening = openings.find((o) => o.id === selectedOpeningId)
  const wall = walls.find((w) => w.key === selectedWall)

  return (
    <>
      <section>
        <h2>Añadir hueco</h2>
        <div className="catalog">
          {OPENING_CATALOG.map((t) => (
            <button
              key={t.id}
              className={tool === t.id ? 'active' : ''}
              onClick={() => setTool(tool === t.id ? null : t.id)}
            >
              {t.name}
            </button>
          ))}
        </div>
        {tool && <p className="hint">Haz clic sobre una pared del plano para colocarlo.</p>}
      </section>

      <section>
        <h2>Selección</h2>
        {opening ? (
          <>
            <p>{opening.kind === 'door' ? 'Puerta' : 'Ventana'}</p>
            <SizeForm
              key={opening.id}
              width={opening.width}
              depth={opening.height}
              labels={['Ancho (m)', 'Alto (m)']}
              submitLabel="Aplicar medidas"
              validate={(w, h) =>
                w >= MIN_OPENING && h >= MIN_OPENING && opening.sill + h <= WALL_HEIGHT
                  ? ''
                  : `Mínimo ${formatMeters(MIN_OPENING)} m, y no puede pasar de ${formatMeters(WALL_HEIGHT)} m de altura.`
              }
              onSubmit={(w, h) =>
                resizeOpening(opening.id, w, h) ? '' : 'No cabe en la pared o pisa otro hueco.'
              }
            />
            {opening.kind === 'window' && (
              <ValueForm
                key={opening.id}
                label="Altura desde el suelo (m)"
                value={opening.sill}
                submitLabel="Aplicar altura"
                onApply={(sill) =>
                  setOpeningSill(opening.id, roundSize(sill))
                    ? ''
                    : `Entre 0 y ${formatMeters(WALL_HEIGHT - opening.height)} m para una ventana de ${formatMeters(opening.height)} m de alto.`
                }
              />
            )}
            <div className="actions">
              <button
                onClick={() =>
                  setNotice(centerOpening(opening.id) ? '' : 'En el centro de la pared hay otro hueco.')
                }
              >
                Centrar en la pared
              </button>
              <button onClick={() => removeOpening(opening.id)}>Eliminar (Supr)</button>
            </div>
            {notice && <p className="notice">{notice}</p>}
          </>
        ) : wall ? (
          <>
            <p>
              {wall.shared
                ? 'Pared compartida entre dos estancias'
                : `Pared exterior ${SIDE_NAMES[wall.side]}`}{' '}
              · {formatMeters(wall.to - wall.from)} m{wall.open && ' · sin pared'}
            </p>
            <ValueForm
              label="Grosor (cm)"
              value={Math.round(wall.thickness * 100)}
              submitLabel="Aplicar grosor"
              onApply={(cm) => {
                const meters = Math.round(cm) / 100
                if (!validWallThickness(meters))
                  return `Entre ${MIN_WALL_THICKNESS * 100} y ${MAX_WALL_THICKNESS * 100} cm.`
                setWallThickness(wall.key, meters)
                return ''
              }}
            />
            <div className="actions">
              <button onClick={() => setWallOpen(wall.key, !wall.open)}>
                {wall.open ? 'Volver a poner la pared' : 'Quitar la pared'}
              </button>
            </div>
          </>
        ) : (
          <p className="muted">
            Haz clic cerca de una pared para seleccionarla, o sobre una puerta o ventana para
            moverla a lo largo de su pared.
          </p>
        )}
      </section>
    </>
  )
}
