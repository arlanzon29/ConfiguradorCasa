import { useEffect, useState } from 'react'
import { MIN_SIZE, PLOT, roundSize, validSize } from '../model/house'

interface Props {
  width: number
  depth: number
  /** Rótulos de las dos casillas; por defecto, ancho y fondo de un módulo. */
  labels?: [string, string]
  submitLabel: string
  /** Mensaje de error si las medidas no valen, o ''. Por defecto, los límites de un módulo. */
  validate?: (width: number, depth: number) => string
  /** Devuelve un mensaje de error, o '' si se ha aplicado. */
  onSubmit: (width: number, depth: number) => string
}

const parse = (text: string) => roundSize(Number(text.replace(',', '.')))

const validateModule = (width: number, depth: number) =>
  validSize(width, depth) ? '' : `Medidas entre ${MIN_SIZE} m y ${PLOT.width} × ${PLOT.depth} m.`

export default function SizeForm({
  width,
  depth,
  labels = ['Ancho (m)', 'Fondo (m)'],
  submitLabel,
  validate = validateModule,
  onSubmit,
}: Props) {
  const [w, setW] = useState(String(width))
  const [d, setD] = useState(String(depth))
  const [error, setError] = useState('')

  useEffect(() => {
    setW(String(width))
    setD(String(depth))
    setError('')
  }, [width, depth])

  return (
    <form
      className="size-form"
      onSubmit={(e) => {
        e.preventDefault()
        const pw = parse(w)
        const pd = parse(d)
        setError(validate(pw, pd) || onSubmit(pw, pd))
      }}
    >
      <label>
        {labels[0]}
        <input inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} />
      </label>
      <label>
        {labels[1]}
        <input inputMode="decimal" value={d} onChange={(e) => setD(e.target.value)} />
      </label>
      <button type="submit">{submitLabel}</button>
      {error && <p className="notice">{error}</p>}
    </form>
  )
}
