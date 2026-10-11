import { ReactNode, useEffect, useState } from 'react'
import { formatMeters, roundSize } from '../model/house'

// Casillas de medidas que se escriben a mano. Cada una se aplica sola, al pulsar
// Intro o al salir de ella, y lo que no cabe se rechaza con un aviso debajo.

interface FieldProps {
  label: string
  value: number
  /** Ocupa las dos columnas. */
  full?: boolean
  /** Devuelve un mensaje de error, o '' si se ha aplicado. */
  onApply: (value: number) => string
}

export function Field({ label, value, full, onApply }: FieldProps) {
  const shown = formatMeters(value)
  const [text, setText] = useState(shown)
  const [error, setError] = useState('')
  // Cuenta las veces que se aplica: si el valor se ajusta y queda igual que
  // estaba, la casilla tiene que volver a mostrarlo.
  const [applied, setApplied] = useState(0)

  useEffect(() => {
    setText(shown)
    setError('')
  }, [shown, applied])

  const commit = () => {
    if (text === shown) return setError('')
    const typed = Number(text.replace(',', '.'))
    if (text.trim() === '' || !Number.isFinite(typed)) return setError('Escribe un número.')
    const next = roundSize(typed)
    const problem = next === roundSize(value) ? '' : onApply(next)
    setError(problem)
    if (!problem) setApplied((n) => n + 1)
  }

  return (
    <>
      <label className={full ? 'full' : undefined}>
        {label}
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setApplied((n) => n + 1)
          }}
        />
      </label>
      {error && <p className="notice">{error}</p>}
    </>
  )
}

export const Fields = ({ title, children }: { title: string; children: ReactNode }) => (
  <>
    <h3>{title}</h3>
    <div className="size-form fields">{children}</div>
  </>
)
