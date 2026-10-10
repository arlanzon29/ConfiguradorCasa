import { useState } from 'react'
import SizeForm from '../editor/SizeForm'
import {
  MAX_SHELLS,
  MIN_SIZE,
  SHELL_MAX_LONG,
  SHELL_MAX_SHORT,
  formatMeters,
  validShellSize,
} from '../model/house'
import { useHouse } from '../store'

const MAX_TEXT = `${formatMeters(SHELL_MAX_LONG)} × ${formatMeters(SHELL_MAX_SHORT)} m`

/** Módulos de fábrica: el contorno de la casa, dentro del cual van las estancias. */
export default function ShellsPanel() {
  const shells = useHouse((s) => s.shells)
  const selectedShellId = useHouse((s) => s.selectedShellId)
  const addShell = useHouse((s) => s.addShell)
  const resizeShell = useHouse((s) => s.resizeShell)
  const rotateShell = useHouse((s) => s.rotateShell)
  const removeShell = useHouse((s) => s.removeShell)
  const [notice, setNotice] = useState('')

  const selected = shells.find((s) => s.id === selectedShellId)
  const full = shells.length >= MAX_SHELLS
  const add = (vertical: boolean) =>
    setNotice(addShell(vertical) ? '' : 'No queda sitio en la parcela para otro módulo.')

  return (
    <>
      <section>
        <h2>Módulos de la casa</h2>
        <p className="muted">
          La casa se fabrica en módulos de {MAX_TEXT} como máximo. Puede tener hasta {MAX_SHELLS},
          unidos por un lado o en L. Las estancias se reparten dentro de cada módulo.
        </p>
        {full ? (
          <p className="muted spaced">Ya están los {MAX_SHELLS} módulos.</p>
        ) : (
          <div className="catalog spaced">
            <button onClick={() => add(false)}>Añadir módulo horizontal</button>
            <button onClick={() => add(true)}>Añadir módulo vertical</button>
          </div>
        )}
        {notice && !selected && <p className="notice">{notice}</p>}
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
              validate={(w, d) =>
                validShellSize(w, d) ? '' : `Entre ${MIN_SIZE} m y ${MAX_TEXT}.`
              }
              onSubmit={(w, d) => resizeShell(selected.id, w, d)}
            />
            <div className="actions">
              <button onClick={() => setNotice(rotateShell(selected.id))}>Girar 90° (R)</button>
              <button onClick={() => removeShell(selected.id)}>Eliminar con sus estancias (Supr)</button>
            </div>
            {notice && <p className="notice">{notice}</p>}
          </>
        ) : (
          <p className="muted">
            Haz clic en un módulo para seleccionarlo y arrástralo para moverlo; al acercarlo al
            otro se pega a él.
          </p>
        )}
      </section>
    </>
  )
}
