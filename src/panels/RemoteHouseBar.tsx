import { useEffect } from 'react'
import { REMOTE_URL, reloadRemote, useRemote } from '../remoteHouse'

/**
 * Con ?url=…, en la barra de las vistas: "Recargar casa", lo que ha pasado en la
 * última carga y, la primera vez, si se sustituye la casa que ya había aquí.
 * Carga la casa al abrir la página.
 */
export default function RemoteHouseBar() {
  const busy = useRemote((s) => s.busy)
  const message = useRemote((s) => s.message)
  const pending = useRemote((s) => s.pending)
  const confirm = useRemote((s) => s.confirm)
  const cancel = useRemote((s) => s.cancel)

  useEffect(() => {
    if (REMOTE_URL) void reloadRemote()
  }, [])

  if (!REMOTE_URL) return null
  return (
    <div className="remote-house">
      {pending ? (
        <>
          <span>La casa de la dirección sustituirá la de este navegador y sus fotos.</span>
          <button className="danger" onClick={confirm}>
            Sí, sustituir
          </button>
          <button onClick={cancel}>Cancelar</button>
        </>
      ) : (
        <>
          <button disabled={busy} title={REMOTE_URL} onClick={() => void reloadRemote()}>
            Recargar casa
          </button>
          {message && <span className="muted">{message}</span>}
        </>
      )}
    </div>
  )
}
