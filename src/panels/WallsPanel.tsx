import { OPENING_CATALOG } from '../model/openings'
import { useHouse } from '../store'

export default function WallsPanel() {
  const tool = useHouse((s) => s.tool)
  const setTool = useHouse((s) => s.setTool)

  return (
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
  )
}
