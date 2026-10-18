import { useEffect, useState } from 'react'
import {
  EXAMPLE_HOUSES,
  absoluteUrl,
  checkUrl,
  forgetLink,
  openUrl,
  rememberLink,
  useLinks,
} from '../remoteHouse'

/**
 * "Cargar URL": una ventana con dos pestañas. "Ejemplos", las casas que viajan
 * con la web; "Mis casas", las direcciones que se han abierto o añadido en este
 * navegador, con una casilla para añadir otra. Abrir una recarga la página con
 * ?url=… y la casa se carga como cualquier casa de una dirección.
 */
export default function LoadUrlDialog({ onClose }: { onClose: () => void }) {
  const links = useLinks((s) => s.links)
  const [tab, setTab] = useState<'examples' | 'mine'>('examples')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Antes de apuntarla se lee: así no entra en la lista una dirección que no sirve.
  const add = async () => {
    const url = text.trim()
    if (!url || busy) return
    setBusy(true)
    setNotice('Comprobando la dirección…')
    const result = await checkUrl(url)
    setBusy(false)
    if ('error' in result) return setNotice(result.error)
    rememberLink(url, result.name)
    setText('')
    setNotice(`Añadida: ${result.name ?? 'casa sin nombre'}.`)
  }

  const date = (ms: number) =>
    new Date(ms).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Cargar una casa desde una dirección"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>Cargar URL</h2>
          <button className="panel-toggle" aria-label="Cerrar" title="Cerrar (Esc)" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'examples'}
            className={tab === 'examples' ? 'active' : ''}
            onClick={() => setTab('examples')}
          >
            Ejemplos
          </button>
          <button
            role="tab"
            aria-selected={tab === 'mine'}
            className={tab === 'mine' ? 'active' : ''}
            onClick={() => setTab('mine')}
          >
            Mis casas · {links.length}
          </button>
        </div>

        {tab === 'examples' ? (
          <ul className="link-list">
            {EXAMPLE_HOUSES.map((house) => (
              <li key={house.url}>
                <div>
                  <strong>{house.name}</strong>
                  <span className="muted">{house.detail}</span>
                  <code>{absoluteUrl(house.url)}</code>
                </div>
                <button onClick={() => openUrl(house.url)}>Abrir</button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <div className="link-add">
              <input
                type="url"
                placeholder="https://…/casa.json"
                aria-label="Dirección de una casa"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void add()
                }}
              />
              <button disabled={busy || !text.trim()} onClick={() => void add()}>
                Añadir
              </button>
            </div>
            {notice && <p className="notice">{notice}</p>}
            {links.length === 0 ? (
              <p className="muted">
                Todavía no hay ninguna. Las casas que se abran desde una dirección se apuntan aquí solas.
              </p>
            ) : (
              <ul className="link-list">
                {links.map((link) => (
                  <li key={link.url}>
                    <div>
                      <strong>{link.name ?? 'Casa sin nombre'}</strong>
                      <span className="muted">{date(link.at)}</span>
                      <code>{link.url}</code>
                    </div>
                    <button onClick={() => openUrl(link.url)}>Abrir</button>
                    <button title="Quitar de la lista (no borra la casa)" onClick={() => forgetLink(link.url)}>
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  )
}
