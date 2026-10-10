import { useEffect, useState } from 'react'
import { FAMILIES, FURNITURE, FamilyId, furnitureType } from '../model/furniture'
import { formatMeters } from '../model/house'
import { useHouse } from '../store'

export default function OptionsPanel() {
  const furniture = useHouse((s) => s.furniture)
  const tool = useHouse((s) => s.tool)
  const setTool = useHouse((s) => s.setTool)
  const selectedFurnitureId = useHouse((s) => s.selectedFurnitureId)
  const rotateFurniture = useHouse((s) => s.rotateFurniture)
  const removeFurniture = useHouse((s) => s.removeFurniture)
  const snapFurnitureToWall = useHouse((s) => s.snapFurnitureToWall)
  const magnet = useHouse((s) => s.furnitureMagnet)
  const setMagnet = useHouse((s) => s.setFurnitureMagnet)
  const [notice, setNotice] = useState('')
  useEffect(() => setNotice(''), [selectedFurnitureId])

  const [family, setFamily] = useState<FamilyId>(FAMILIES[0].id)

  const selected = furniture.find((f) => f.id === selectedFurnitureId)
  const type = selected && furnitureType(selected.typeId)

  return (
    <>
      <section>
        <div className="section-head">
          <h2>Añadir mobiliario</h2>
          <button
            className={magnet ? 'icon-toggle active' : 'icon-toggle'}
            title={
              magnet
                ? 'Imán activado: los muebles se pegan a las paredes al arrastrarlos'
                : 'Imán desactivado: los muebles se mueven libremente'
            }
            aria-label="Imán a las paredes"
            aria-pressed={magnet}
            onClick={() => setMagnet(!magnet)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M6 3v9a6 6 0 0 0 12 0V3h-4v9a2 2 0 0 1-4 0V3z" />
              <path d="M6 7h4M14 7h4" />
              {!magnet && <path d="M3 21 21 3" />}
            </svg>
          </button>
        </div>
        <div className="family-tabs">
          {FAMILIES.map((f) => (
            <button
              key={f.id}
              className={family === f.id ? 'active' : ''}
              onClick={() => {
                setFamily(f.id)
                setTool(null)
              }}
            >
              {f.name}
            </button>
          ))}
        </div>
        <div className="catalog">
          {FURNITURE.filter((f) => f.family === family).map((f) => (
            <button
              key={f.id}
              className={tool === f.id ? 'active' : ''}
              onClick={() => setTool(tool === f.id ? null : f.id)}
            >
              {f.name} · {formatMeters(f.width)} × {formatMeters(f.depth)} m
            </button>
          ))}
        </div>
        {tool && <p className="hint">Haz clic en el plano para colocarlo.</p>}
      </section>

      <section>
        <h2>Selección</h2>
        {selected && type ? (
          <>
            <p>
              {type.name} · {formatMeters(type.width)} × {formatMeters(type.depth)} m ·{' '}
              {formatMeters(type.height)} m de alto
            </p>
            <div className="actions">
              <button
                onClick={() =>
                  setNotice(
                    snapFurnitureToWall(selected.id)
                      ? ''
                      : 'El mueble tiene que estar dentro de una estancia.',
                  )
                }
              >
                Pegar a la pared más próxima
              </button>
              <button onClick={() => rotateFurniture(selected.id)}>Girar 90° (R)</button>
              <button onClick={() => removeFurniture(selected.id)}>Eliminar (Supr)</button>
            </div>
            {notice && <p className="notice">{notice}</p>}
          </>
        ) : (
          <p className="muted">
            Haz clic en un mueble del plano para seleccionarlo y arrástralo para moverlo.
          </p>
        )}
      </section>
    </>
  )
}
