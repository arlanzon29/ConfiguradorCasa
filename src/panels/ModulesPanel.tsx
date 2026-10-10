import { useState } from 'react'
import SizeForm from '../editor/SizeForm'
import { CATALOG, formatMeters, totalArea } from '../model/house'
import { useHouse } from '../store'

const NO_ROOM = 'No queda sitio libre: encoge antes alguna estancia para hacerle hueco.'

export default function ModulesPanel() {
  const modules = useHouse((s) => s.modules)
  const selectedId = useHouse((s) => s.selectedId)
  const addModule = useHouse((s) => s.addModule)
  const resizeModule = useHouse((s) => s.resizeModule)
  const rotateModule = useHouse((s) => s.rotateModule)
  const removeModule = useHouse((s) => s.removeModule)
  const [notice, setNotice] = useState('')

  const selected = modules.find((m) => m.id === selectedId)

  return (
    <>
      <section>
        <h2>Añadir estancia</h2>
        <div className="catalog">
          {CATALOG.map((t) => (
            <button
              key={t.id}
              onClick={() => setNotice(addModule(t.width, t.depth, t.id) ? '' : NO_ROOM)}
            >
              {t.name} m
            </button>
          ))}
        </div>
        {notice && <p className="notice">{notice}</p>}
      </section>

      <section>
        <h2>Medida personalizada</h2>
        <SizeForm
          width={3}
          depth={4}
          submitLabel="Añadir estancia"
          onSubmit={(w, d) => (addModule(w, d) ? '' : NO_ROOM)}
        />
      </section>

      <section>
        <h2>Selección</h2>
        {selected ? (
          <>
            <p>{formatMeters(selected.width * selected.depth)} m²</p>
            <SizeForm
              key={selected.id}
              width={selected.width}
              depth={selected.depth}
              submitLabel="Aplicar medidas"
              onSubmit={(w, d) =>
                resizeModule(selected.id, w, d)
                  ? ''
                  : 'Con esas medidas se sale de su módulo o pisa otra estancia.'
              }
            />
            <div className="actions">
              <button onClick={() => rotateModule(selected.id)}>Girar (R)</button>
              <button onClick={() => removeModule(selected.id)}>Eliminar (Supr)</button>
            </div>
          </>
        ) : (
          <p className="muted">Haz clic en una estancia para seleccionarla y arrástrala para moverla.</p>
        )}
      </section>

      <section>
        <h2>Resumen</h2>
        <p>
          {modules.length} {modules.length === 1 ? 'estancia' : 'estancias'} ·{' '}
          {formatMeters(totalArea(modules))} m²
        </p>
      </section>
    </>
  )
}
