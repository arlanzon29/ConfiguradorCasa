import { useState } from 'react'
import { MAX_SHELLS, SHELL_MAX_LONG, SHELL_MAX_SHORT, formatMeters } from '../model/house'
import { useHouse } from '../store'

const MAX_TEXT = `${formatMeters(SHELL_MAX_LONG)} × ${formatMeters(SHELL_MAX_SHORT)} m`

/** Módulos de fábrica: el contorno de la casa, dentro del cual van las estancias. */
export default function ShellsPanel() {
  const shells = useHouse((s) => s.shells)
  const addShell = useHouse((s) => s.addShell)
  const [notice, setNotice] = useState('')

  const full = shells.length >= MAX_SHELLS
  const add = (vertical: boolean) =>
    setNotice(addShell(vertical) ? '' : 'No queda sitio en la parcela para otro módulo.')

  return (
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
      {notice && <p className="notice">{notice}</p>}
    </section>
  )
}
