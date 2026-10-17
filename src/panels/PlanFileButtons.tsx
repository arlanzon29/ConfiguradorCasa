import { useRef, useState } from 'react'
import { Plan, parsePhotos, parsePlan, serializePlan } from '../model/planFile'
import { exportPhotos, importPhotos, usePhotos } from '../photos'
import { useHouse } from '../store'
import { redo, undo, useHistory } from '../history'
import { hasPlan } from '../remoteHouse'

// Sin barra inicial: la web puede colgar de una subcarpeta (GitHub Pages).
// Para añadir otro: su archivo en public/ejemplos y una línea aquí.
const EXAMPLES = [
  { name: 'Test 1', url: 'ejemplos/ejemplo1.json' },
  { name: 'Test 2', url: 'ejemplos/ejemplo2.json' },
]

/** Empezar un plano nuevo, guardarlo en un archivo y cargarlo desde uno, o cargar el ejemplo. */
export default function PlanFileButtons() {
  const undos = useHistory((s) => s.undos)
  const redos = useHistory((s) => s.redos)
  const loadPlan = useHouse((s) => s.loadPlan)
  const newPlan = useHouse((s) => s.newPlan)
  const replacePhotos = usePhotos((s) => s.replaceAll)
  const fileInput = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState('')
  // Acción que sustituiría el plano actual y espera confirmación. Se pregunta en
  // la propia página: los cuadros de diálogo del navegador pueden estar bloqueados.
  const [pending, setPending] = useState<{ message: string; run: () => void } | null>(null)

  const startNew = () => {
    newPlan()
    // Las fotos son de la casa: se van con el plano.
    void replacePhotos([])
    // Si ya se estaba en un plano recién creado no cambia nada a la vista: se avisa.
    setNotice('Plano nuevo listo: un módulo vacío de 13 × 4,2 m.')
  }

  /** Ejecuta `run` directamente si no hay nada que perder; si lo hay, pide confirmación. */
  const replacePlan = (message: string, run: () => void) => {
    setNotice('')
    if (hasPlan()) setPending({ message, run })
    else run()
  }

  const save = async () => {
    // Las fotos van dentro del mismo archivo, con la imagen convertida a texto.
    const url = URL.createObjectURL(
      new Blob([serializePlan(useHouse.getState(), await exportPhotos())], {
        type: 'application/json',
      }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `eurocasa-plano-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setNotice('')
  }

  const loadText = async (text: string, what: string) => {
    const plan: Plan | null = parsePlan(text)
    if (!plan) {
      setPending(null)
      setNotice('Ese archivo no es un plano de este configurador.')
      return
    }
    const photos = await importPhotos(parsePhotos(text))
    replacePlan(`Cargar ${what} sustituirá el plano actual y sus fotos.`, () => {
      loadPlan(plan)
      void replacePhotos(photos)
    })
  }

  const load = async (file: File) => loadText(await file.text(), 'este archivo')

  /** Una de las casas de ejemplo que viajan con la web (public/ejemplos). */
  const loadExample = async (example: (typeof EXAMPLES)[number]) => {
    setNotice('')
    try {
      const response = await fetch(example.url)
      if (!response.ok) throw new Error(String(response.status))
      await loadText(await response.text(), `el ejemplo ${example.name}`)
    } catch {
      setNotice('No se ha podido cargar el ejemplo.')
    }
  }

  return (
    <div className="plan-file">
      <button disabled={undos === 0} onClick={() => undo()} title="Ctrl+Z">
        Deshacer
      </button>
      <button disabled={redos === 0} onClick={() => redo()} title="Ctrl+Y">
        Rehacer
      </button>
      <button
        className="full"
        onClick={() =>
          replacePlan('Se borrarán el plano actual y sus fotos para empezar uno nuevo.', startNew)
        }
      >
        Nuevo plano
      </button>
      <button onClick={() => void save()}>Guardar plano</button>
      <button onClick={() => fileInput.current?.click()}>Cargar plano</button>
      <p className="muted full">Cargar ejemplo:</p>
      {EXAMPLES.map((example) => (
        <button key={example.url} onClick={() => void loadExample(example)}>
          {example.name}
        </button>
      ))}
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Se vacía para que elegir dos veces el mismo archivo vuelva a avisar.
          e.target.value = ''
          if (file) void load(file)
        }}
      />
      {pending && (
        <div className="confirm full">
          <p>{pending.message} ¿Continuar?</p>
          <button
            className="danger"
            onClick={() => {
              pending.run()
              setPending(null)
            }}
          >
            Sí, sustituir
          </button>
          <button onClick={() => setPending(null)}>Cancelar</button>
        </div>
      )}
      {notice && <p className="notice full">{notice}</p>}
    </div>
  )
}
