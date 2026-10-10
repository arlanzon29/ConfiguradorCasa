import { useState } from 'react'
import { FAMILIES, FURNITURE, FamilyId } from '../model/furniture'
import { formatMeters } from '../model/house'
import { useHouse } from '../store'

export default function OptionsPanel() {
  const tool = useHouse((s) => s.tool)
  const setTool = useHouse((s) => s.setTool)
  const magnet = useHouse((s) => s.furnitureMagnet)
  const setMagnet = useHouse((s) => s.setFurnitureMagnet)
  const [family, setFamily] = useState<FamilyId>(FAMILIES[0].id)

  return (
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
  )
}
