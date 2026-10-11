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

interface NameFieldProps {
  /** El nombre puesto por el usuario, si lo hay. */
  value?: string
  /** El nombre por defecto: se enseña si no hay otro, y dejarlo vacío vuelve a él. */
  fallback: string
  onApply: (name: string) => void
}

/** La casilla "Nombre" que encabeza las propiedades de cualquier cosa. */
export function NameField({ value, fallback, onApply }: NameFieldProps) {
  const shown = value ?? fallback
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])

  const commit = () => {
    const typed = text.trim()
    if (!typed || typed === fallback) {
      if (value !== undefined) onApply('')
      return setText(fallback)
    }
    if (typed !== value) onApply(typed)
  }

  return (
    <div className="size-form fields">
      <label className="full">
        Nombre
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setText(shown)
          }}
        />
      </label>
    </div>
  )
}

export const Fields = ({ title, children }: { title: string; children: ReactNode }) => (
  <>
    <h3>{title}</h3>
    <div className="size-form fields">{children}</div>
  </>
)
