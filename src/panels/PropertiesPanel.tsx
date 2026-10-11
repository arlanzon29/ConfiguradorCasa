import { ReactNode, useMemo, useState } from 'react'
import { FurnitureItem, furnitureType } from '../model/furniture'
import {
  MAX_SKIRTING_HEIGHT,
  MAX_WALL_THICKNESS,
  MIN_SIZE,
  MIN_WALL_THICKNESS,
  PLOT,
  PlacedModule,
  SHELL_MAX_LONG,
  SHELL_MAX_SHORT,
  Shell,
  Side,
  WALL_HEIGHT,
  contains,
  formatMeters,
  roundSize,
  validShellSize,
  validSize,
  validWallThickness,
} from '../model/house'
import { CORNER_GAP, MIN_OPENING, Opening, swingDoor } from '../model/openings'
import { Wall, deriveWalls, openingSpan, wallOf } from '../model/walls'
import { Mode, furnitureBox, useHouse } from '../store'
import { DEFAULT_JOINERY_FINISH } from '../model/finishes'
import { Field, Fields } from './Field'
import { ColorPicker, FinishPicker } from './FinishesPanel'

// Panel derecho: los datos de lo que está seleccionado en el plano, en casillas
// que se pueden escribir a mano. Cada casilla se aplica sola, al pulsar Intro o
// al salir de ella, y lo que no cabe se rechaza con un aviso debajo.

const SIDE_NAMES: Record<Side, string> = { n: 'norte', s: 'sur', e: 'este', w: 'oeste' }
const EPS = 1e-6

function ShellProperties({ shell }: { shell: Shell }) {
  const moveShell = useHouse((s) => s.moveShell)
  const resizeShell = useHouse((s) => s.resizeShell)
  const rotateShell = useHouse((s) => s.rotateShell)
  const removeShell = useHouse((s) => s.removeShell)
  const [notice, setNotice] = useState('')

  const move = (x: number, y: number) => {
    if (x < 0 || y < 0) return 'No puede ser negativa.'
    moveShell(shell.id, x, y)
    const now = useHouse.getState().shells.find((s) => s.id === shell.id)
    return now && (now.x !== shell.x || now.y !== shell.y)
      ? ''
      : 'Ahí se sale de la parcela o pisa el otro módulo.'
  }
  const resize = (width: number, depth: number) =>
    validShellSize(width, depth)
      ? resizeShell(shell.id, width, depth)
      : `Entre ${MIN_SIZE} m y ${formatMeters(SHELL_MAX_LONG)} × ${formatMeters(SHELL_MAX_SHORT)} m.`

  return (
    <>
      <p>Módulo · {formatMeters(shell.width * shell.depth)} m²</p>
      <Fields title="Distancia al borde de la parcela">
        <Field label="Izquierda (m)" value={shell.x} onApply={(x) => move(x, shell.y)} />
        <Field label="Arriba (m)" value={shell.y} onApply={(y) => move(shell.x, y)} />
      </Fields>
      <Fields title="Medidas">
        <Field label="Ancho (m)" value={shell.width} onApply={(w) => resize(w, shell.depth)} />
        <Field label="Fondo (m)" value={shell.depth} onApply={(d) => resize(shell.width, d)} />
      </Fields>
      <div className="actions spaced">
        <button onClick={() => setNotice(rotateShell(shell.id))}>Girar 90° (R)</button>
        <button onClick={() => removeShell(shell.id)}>Eliminar con sus estancias (Supr)</button>
      </div>
      {notice && <p className="notice">{notice}</p>}
    </>
  )
}

function RoomProperties({ room }: { room: PlacedModule }) {
  const shells = useHouse((s) => s.shells)
  const moveModule = useHouse((s) => s.moveModule)
  const resizeModule = useHouse((s) => s.resizeModule)
  const rotateModule = useHouse((s) => s.rotateModule)
  const removeModule = useHouse((s) => s.removeModule)

  // La posición se mide desde la esquina de su módulo; sin módulos, desde la de la parcela.
  const shell = shells.find((s) => contains(s, room))
  const ox = shell?.x ?? 0
  const oy = shell?.y ?? 0
  const outer = shell ? 'su módulo' : 'la parcela'

  const move = (x: number, y: number) => {
    if (x < ox || y < oy) return 'No puede ser negativa.'
    moveModule(room.id, x, y)
    const now = useHouse.getState().modules.find((m) => m.id === room.id)
    return now && (now.x !== room.x || now.y !== room.y)
      ? ''
      : `Ahí se sale de ${outer} o pisa otra estancia.`
  }
  const resize = (width: number, depth: number) => {
    if (!validSize(width, depth))
      return `Medidas entre ${MIN_SIZE} m y ${PLOT.width} × ${PLOT.depth} m.`
    return resizeModule(room.id, width, depth)
      ? ''
      : `Con esas medidas se sale de ${outer} o pisa otra estancia.`
  }

  return (
    <>
      <p>Estancia · {formatMeters(room.width * room.depth)} m²</p>
      <Fields title={shell ? 'Distancia al borde del módulo' : 'Distancia al borde de la parcela'}>
        <Field
          label="Izquierda (m)"
          value={room.x - ox}
          onApply={(x) => move(roundSize(ox + x), room.y)}
        />
        <Field
          label="Arriba (m)"
          value={room.y - oy}
          onApply={(y) => move(room.x, roundSize(oy + y))}
        />
      </Fields>
      <Fields title="Medidas">
        <Field label="Ancho (m)" value={room.width} onApply={(w) => resize(w, room.depth)} />
        <Field label="Fondo (m)" value={room.depth} onApply={(d) => resize(room.width, d)} />
      </Fields>
      <div className="actions spaced">
        <button onClick={() => rotateModule(room.id)}>Girar (R)</button>
        <button onClick={() => removeModule(room.id)}>Eliminar (Supr)</button>
      </div>
    </>
  )
}

function WallProperties({ wall }: { wall: Wall }) {
  const setWallThickness = useHouse((s) => s.setWallThickness)
  const setWallOpen = useHouse((s) => s.setWallOpen)
  const setWallSkirting = useHouse((s) => s.setWallSkirting)

  return (
    <>
      <p>
        {wall.shared
          ? 'Pared compartida entre dos estancias'
          : `Pared exterior ${SIDE_NAMES[wall.side]}`}{' '}
        · {formatMeters(wall.to - wall.from)} m{wall.open && ' · sin pared'}
      </p>
      <Fields title="Medidas">
        <Field
          full
          label="Grosor (cm)"
          value={Math.round(wall.thickness * 100)}
          onApply={(cm) => {
            const meters = Math.round(cm) / 100
            if (!validWallThickness(meters))
              return `Entre ${MIN_WALL_THICKNESS * 100} y ${MAX_WALL_THICKNESS * 100} cm.`
            setWallThickness(wall.key, meters)
            return ''
          }}
        />
      </Fields>
      <Fields title="Rodapié">
        <Field
          full
          label="Alto (cm), 0 para quitarlo"
          value={Math.round(wall.skirting.height * 100)}
          onApply={(cm) => {
            const meters = Math.round(cm) / 100
            if (meters < 0 || meters > MAX_SKIRTING_HEIGHT)
              return `Entre 0 y ${MAX_SKIRTING_HEIGHT * 100} cm.`
            setWallSkirting(wall.key, { height: meters })
            return ''
          }}
        />
      </Fields>
      <ColorPicker
        value={wall.skirting.color}
        onChange={(color) => setWallSkirting(wall.key, { color })}
      />
      {wall.shared && <p className="muted spaced">El rodapié es el mismo en las dos caras.</p>}
      <div className="actions spaced">
        <button onClick={() => setWallOpen(wall.key, !wall.open)}>
          {wall.open ? 'Volver a poner la pared' : 'Quitar la pared'}
        </button>
      </div>
    </>
  )
}

function OpeningProperties({ opening, walls }: { opening: Opening; walls: Wall[] }) {
  const modules = useHouse((s) => s.modules)
  const moveOpening = useHouse((s) => s.moveOpening)
  const resizeOpening = useHouse((s) => s.resizeOpening)
  const setOpeningSill = useHouse((s) => s.setOpeningSill)
  const centerOpening = useHouse((s) => s.centerOpening)
  const setDoor = useHouse((s) => s.setDoor)
  const setOpeningFinish = useHouse((s) => s.setOpeningFinish)
  const removeOpening = useHouse((s) => s.removeOpening)
  const [notice, setNotice] = useState('')

  const wall = wallOf(opening, modules, walls)
  const span = openingSpan(opening, modules)

  // `gap` es la distancia del hueco al extremo inicial (o al final) de su pared.
  const slide = (gap: number, fromEnd: boolean) => {
    if (!wall) return ''
    const max = wall.to - wall.from - opening.width - CORNER_GAP
    if (gap < CORNER_GAP - EPS || gap > max + EPS)
      return `Entre ${formatMeters(CORNER_GAP)} y ${formatMeters(max)} m.`
    moveOpening(opening.id, fromEnd ? wall.to - gap - opening.width : wall.from + gap)
    const now = useHouse.getState().openings.find((o) => o.id === opening.id)
    return now && now.offset !== opening.offset ? '' : 'Ahí pisa otro hueco.'
  }
  const resize = (width: number, height: number) => {
    if (width < MIN_OPENING || height < MIN_OPENING || opening.sill + height > WALL_HEIGHT)
      return `Mínimo ${formatMeters(MIN_OPENING)} m, y no puede pasar de ${formatMeters(WALL_HEIGHT)} m de altura.`
    return resizeOpening(opening.id, width, height) ? '' : 'No cabe en la pared o pisa otro hueco.'
  }

  return (
    <>
      <p>{opening.kind === 'door' ? 'Puerta' : 'Ventana'}</p>
      {wall && span && (
        <Fields title="Distancia al extremo de la pared">
          <Field
            label={wall.horizontal ? 'Izquierdo (m)' : 'Superior (m)'}
            value={span.from - wall.from}
            onApply={(gap) => slide(gap, false)}
          />
          <Field
            label={wall.horizontal ? 'Derecho (m)' : 'Inferior (m)'}
            value={wall.to - span.to}
            onApply={(gap) => slide(gap, true)}
          />
        </Fields>
      )}
      <Fields title="Medidas">
        <Field label="Ancho (m)" value={opening.width} onApply={(w) => resize(w, opening.height)} />
        <Field label="Alto (m)" value={opening.height} onApply={(h) => resize(opening.width, h)} />
        {opening.kind === 'window' && (
          <Field
            full
            label="Altura desde el suelo (m)"
            value={opening.sill}
            onApply={(sill) =>
              setOpeningSill(opening.id, sill)
                ? ''
                : `Entre 0 y ${formatMeters(WALL_HEIGHT - opening.height)} m para una ventana de ${formatMeters(opening.height)} m de alto.`
            }
          />
        )}
      </Fields>
      {swingDoor(opening) && (
        <div className="actions spaced">
          <button
            title="La puerta pasa a abrir hacia el otro lado de la pared"
            onClick={() =>
              setDoor(opening.id, { swing: opening.swing === 'out' ? 'in' : 'out' })
            }
          >
            Abrir hacia el otro lado
          </button>
          <button
            title="Las bisagras pasan al otro canto del hueco"
            onClick={() =>
              setDoor(opening.id, { hinge: opening.hinge === 'end' ? 'start' : 'end' })
            }
          >
            Girar desde el otro canto
          </button>
          <button
            title="Cómo se ve la hoja en la vista 3D y en la foto"
            onClick={() => setDoor(opening.id, { closed: !opening.closed })}
          >
            {opening.closed ? 'Abrir la puerta en 3D' : 'Cerrar la puerta en 3D'}
          </button>
        </div>
      )}
      <div className="actions spaced">
        <button
          onClick={() =>
            setNotice(centerOpening(opening.id) ? '' : 'En el centro de la pared hay otro hueco.')
          }
        >
          Centrar en la pared
        </button>
        <button onClick={() => removeOpening(opening.id)}>Eliminar (Supr)</button>
      </div>
      {notice && <p className="notice">{notice}</p>}
      <h3>{opening.kind === 'door' ? 'Acabado de la puerta' : 'Acabado de la ventana'}</h3>
      <FinishPicker
        value={opening.finish ?? DEFAULT_JOINERY_FINISH}
        onChange={(finish) => setOpeningFinish(opening.id, finish)}
      />
      <div className="actions spaced">
        <button
          title="Pone este acabado en la carpintería de toda la casa"
          onClick={() => setOpeningFinish(null, opening.finish ?? DEFAULT_JOINERY_FINISH)}
        >
          Aplicar a todas las puertas y ventanas
        </button>
      </div>
    </>
  )
}

function FurnitureProperties({ item }: { item: FurnitureItem }) {
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const placeFurniture = useHouse((s) => s.placeFurniture)
  const rotateFurniture = useHouse((s) => s.rotateFurniture)
  const removeFurniture = useHouse((s) => s.removeFurniture)
  const snapFurnitureToWall = useHouse((s) => s.snapFurnitureToWall)
  const [notice, setNotice] = useState('')

  const type = furnitureType(item.typeId)
  const box = useMemo(() => furnitureBox(item, modules, joints), [item, modules, joints])
  if (!type || !box) return null

  // Las distancias van del borde del mueble al límite de cada lado; por dentro
  // se guarda el centro.
  const place = (side: Side, gap: number) => {
    const horizontal = side === 'w' || side === 'e'
    const free = horizontal
      ? box.east - box.west - 2 * box.halfX
      : box.south - box.north - 2 * box.halfY
    if (gap < 0 || gap > free + EPS)
      return free < 0 ? 'El mueble no cabe a lo ancho.' : `Entre 0 y ${formatMeters(free)} m.`
    const x =
      side === 'w' ? box.west + gap + box.halfX : side === 'e' ? box.east - gap - box.halfX : item.x
    const y =
      side === 'n'
        ? box.north + gap + box.halfY
        : side === 's'
          ? box.south - gap - box.halfY
          : item.y
    placeFurniture(item.id, x, y)
    return ''
  }

  return (
    <>
      <p>
        {type.name} · {formatMeters(type.width)} × {formatMeters(type.depth)} m ·{' '}
        {formatMeters(type.height)} m de alto · giro {item.rotation}°
      </p>
      <Fields
        title={box.inRoom ? 'Distancia a las paredes' : 'Distancia a los bordes de la parcela'}
      >
        <Field
          label="Oeste, izquierda (m)"
          value={item.x - box.halfX - box.west}
          onApply={(gap) => place('w', gap)}
        />
        <Field
          label="Este, derecha (m)"
          value={box.east - item.x - box.halfX}
          onApply={(gap) => place('e', gap)}
        />
        <Field
          label="Norte, arriba (m)"
          value={item.y - box.halfY - box.north}
          onApply={(gap) => place('n', gap)}
        />
        <Field
          label="Sur, abajo (m)"
          value={box.south - item.y - box.halfY}
          onApply={(gap) => place('s', gap)}
        />
      </Fields>
      {!box.inRoom && <p className="muted">Está fuera de las estancias.</p>}
      <div className="actions spaced">
        <button
          onClick={() =>
            setNotice(
              snapFurnitureToWall(item.id) ? '' : 'El mueble tiene que estar dentro de una estancia.',
            )
          }
        >
          Pegar a la pared más próxima
        </button>
        <button onClick={() => rotateFurniture(item.id)}>Girar 90° (R)</button>
        <button onClick={() => removeFurniture(item.id)}>Eliminar (Supr)</button>
      </div>
      {notice && <p className="notice">{notice}</p>}
    </>
  )
}

/** Qué se puede seleccionar en cada modo; los que no están aquí no tienen panel derecho. */
export const PROPERTY_HINTS: Partial<Record<Mode, string>> = {
  shells:
    'Haz clic en un módulo para seleccionarlo y arrástralo para moverlo; al acercarlo al otro se pega a él.',
  modules: 'Haz clic en una estancia para seleccionarla y arrástrala para moverla.',
  walls:
    'Haz clic cerca de una pared para seleccionarla, o sobre una puerta o ventana para moverla a lo largo de su pared.',
  options: 'Haz clic en un mueble del plano para seleccionarlo y arrástralo para moverlo.',
}

interface Props {
  /** Plegado: solo se ve el botón para volver a sacarlo. */
  hidden: boolean
  onToggle: () => void
}

export default function PropertiesPanel({ hidden, onToggle }: Props) {
  const mode = useHouse((s) => s.mode)
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const shell = useHouse((s) => s.shells.find((sh) => sh.id === s.selectedShellId))
  const selectedId = useHouse((s) => s.selectedId)
  const room = modules.find((m) => m.id === selectedId)
  const selectedWall = useHouse((s) => s.selectedWall)
  const opening = useHouse((s) => s.openings.find((o) => o.id === s.selectedOpeningId))
  const item = useHouse((s) => s.furniture.find((f) => f.id === s.selectedFurnitureId))

  const walls = useMemo(
    () => (mode === 'walls' ? deriveWalls(modules, joints) : []),
    [mode, modules, joints],
  )
  const wall = walls.find((w) => w.key === selectedWall)

  // La clave hace que al cambiar de objeto las casillas empiecen de cero.
  let body: ReactNode = null
  if (mode === 'shells' && shell) body = <ShellProperties key={shell.id} shell={shell} />
  else if (mode === 'modules' && room) body = <RoomProperties key={room.id} room={room} />
  else if (mode === 'walls' && opening)
    body = <OpeningProperties key={opening.id} opening={opening} walls={walls} />
  else if (mode === 'walls' && wall) body = <WallProperties key={wall.key} wall={wall} />
  else if (mode === 'options' && item) body = <FurnitureProperties key={item.id} item={item} />

  const toggle = (
    <button
      className="panel-toggle"
      title={hidden ? 'Mostrar el panel' : 'Ocultar el panel'}
      aria-label={hidden ? 'Mostrar el panel derecho' : 'Ocultar el panel derecho'}
      onClick={onToggle}
    >
      {hidden ? '‹' : '›'}
    </button>
  )
  if (hidden) return <aside className="sidebar properties collapsed">{toggle}</aside>

  return (
    <aside className="sidebar properties">
      <div className="panel-head">
        {toggle}
        <h2>Propiedades</h2>
      </div>
      {body ?? <p className="muted">{PROPERTY_HINTS[mode]}</p>}
    </aside>
  )
}
