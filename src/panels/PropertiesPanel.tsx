import { ReactNode, useMemo, useState } from 'react'
import { FurnitureItem, furnitureType, liftOf, partChoices } from '../model/furniture'
import {
  MAX_SKIRTING_HEIGHT,
  MAX_SLAB_HEIGHT,
  MAX_SLAB_MARGIN,
  MAX_WALL_THICKNESS,
  MIN_SLAB_HEIGHT,
  MIN_SIZE,
  MIN_WALL_THICKNESS,
  PLOT,
  PlacedModule,
  SHELL_MAX_LONG,
  SHELL_MAX_SHORT,
  Shell,
  Side,
  WALL_HEIGHT,
  formatMeters,
  roundSize,
  slabOf,
  validShellSize,
  validSize,
  validWallThickness,
} from '../model/house'
import { CORNER_GAP, MIN_OPENING, OPPOSITE, Opening, swingDoor } from '../model/openings'
import { RoofType, roofOf } from '../model/roofs'
import { Wall, deriveWalls, openingSpan, wallOf } from '../model/walls'
import { Mode, furnitureBox, useHouse } from '../store'
import { DEFAULT_JOINERY_FINISH } from '../model/finishes'
import {
  DEFAULT_HOUSE_NAME,
  defaultFurnitureName,
  defaultOpeningName,
  defaultRoomName,
  defaultShellName,
  defaultWallName,
  piecesOf,
  roomName,
} from '../model/names'
import { ARTICLES } from '../model/articles'
import { openingCode } from '../model/openings'
import { finishCode, DEFAULT_CEILING, DEFAULT_GROUND, BASE_FLOOR, floorOf } from '../model/finishes'
import { ArticleCode, Field, Fields, NameField } from './Field'
import { BoardsSection } from './BoardsSection'
import { ColorPicker, FaceFinishes, FinishPicker, RoomFinishes } from './FinishesPanel'
import { AddLight, LightProperties } from './LightsSection'
import MirrorsSection from './MirrorsSection'
import MechanismsSection from './MechanismsSection'
import ModulesPanel from './ModulesPanel'
import OptionsPanel from './OptionsPanel'
import PhotosPanel from './PhotosPanel'
import ShellsPanel from './ShellsPanel'
import VinylsSection from './VinylsSection'
import WallsPanel from './WallsPanel'

// Panel derecho: los datos de lo que está elegido en el árbol o en el plano y,
// debajo, lo que se le puede añadir. Los datos van en casillas
// que se pueden escribir a mano. Cada casilla se aplica sola, al pulsar Intro o
// al salir de ella, y lo que no cabe se rechaza con un aviso debajo.

const SIDE_NAMES: Record<Side, string> = { n: 'norte', s: 'sur', e: 'este', w: 'oeste' }
const EPS = 1e-6

function ShellProperties({ shell }: { shell: Shell }) {
  const moveShell = useHouse((s) => s.moveShell)
  const resizeShell = useHouse((s) => s.resizeShell)
  const rotateShell = useHouse((s) => s.rotateShell)
  const removeShell = useHouse((s) => s.removeShell)
  const setShellSlab = useHouse((s) => s.setShellSlab)
  const [notice, setNotice] = useState('')
  const slab = slabOf(shell)
  const shells = useHouse((s) => s.shells)
  const rename = useHouse((s) => s.rename)

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
      <NameField
        value={shell.name}
        fallback={defaultShellName(shells, shell.id)}
        onApply={(name) => rename('shell', shell.id, name)}
      />
      <ArticleCode
        codes={[
          { code: ARTICLES.shell },
          { label: 'Solera', code: ARTICLES.slab },
          { label: 'Tejado', code: ARTICLES.roof },
        ]}
      />
      <p>Módulo · {formatMeters(shell.width * shell.depth)} m²</p>
      <Fields title="Distancia al borde de la parcela">
        <Field label="Izquierda (m)" value={shell.x} onApply={(x) => move(x, shell.y)} />
        <Field label="Arriba (m)" value={shell.y} onApply={(y) => move(shell.x, y)} />
      </Fields>
      <Fields title="Medidas">
        <Field label="Ancho (m)" value={shell.width} onApply={(w) => resize(w, shell.depth)} />
        <Field label="Fondo (m)" value={shell.depth} onApply={(d) => resize(shell.width, d)} />
      </Fields>
      <Fields title="Solera">
        <Field
          label="Grosor (m)"
          value={slab.height}
          onApply={(m) => {
            const meters = roundSize(m)
            if (!(meters >= MIN_SLAB_HEIGHT && meters <= MAX_SLAB_HEIGHT))
              return `Entre ${formatMeters(MIN_SLAB_HEIGHT)} y ${formatMeters(MAX_SLAB_HEIGHT)} m.`
            return setShellSlab(shell.id, { height: meters })
          }}
        />
      </Fields>
      <Fields title="Solera: lo que sobresale (m)">
        {(['n', 's', 'w', 'e'] as const).map((side) => (
          <Field
            key={side}
            label={{ n: 'Norte', s: 'Sur', w: 'Oeste', e: 'Este' }[side]}
            value={slab.margins[side]}
            onApply={(m) => {
              const meters = roundSize(m)
              if (!(meters >= 0 && meters <= MAX_SLAB_MARGIN)) return `Entre 0 y ${formatMeters(MAX_SLAB_MARGIN)} m.`
              return setShellSlab(shell.id, { margins: { [side]: meters } })
            }}
          />
        ))}
      </Fields>
      <RoofFields shell={shell} />
      <div className="actions spaced">
        <button onClick={() => setNotice(rotateShell(shell.id))}>Girar 90° (R)</button>
        <button onClick={() => removeShell(shell.id)}>Eliminar con sus estancias (Supr)</button>
      </div>
      {notice && <p className="notice">{notice}</p>}
    </>
  )
}

/** Tejado de un módulo: tipo, lo que sube, alero y hacia dónde va la pendiente. */
function RoofFields({ shell }: { shell: Shell }) {
  const setShellRoof = useHouse((s) => s.setShellRoof)
  const roof = roofOf(shell)
  const choice = <T,>(options: [T, string][], value: T, apply: (v: T) => void) => (
    <div className="part-choices">
      {options.map(([v, name]) => (
        <button key={String(v)} className={v === value ? 'swatch active' : 'swatch'} onClick={() => apply(v)}>
          {name}
        </button>
      ))}
    </div>
  )
  return (
    <section className="part-colors">
      <h3>Tejado</h3>
      {choice<RoofType>(
        [
          ['one', 'A un agua'],
          ['two', 'A dos aguas'],
        ],
        roof.type,
        (type) => setShellRoof(shell.id, { type }),
      )}
      <Fields title="Medidas del tejado">
        <Field
          label="Sube (m)"
          value={roof.rise}
          onApply={(m) => setShellRoof(shell.id, { rise: m })}
        />
        <Field
          label="Alero (m)"
          value={roof.overhang}
          onApply={(m) => setShellRoof(shell.id, { overhang: m })}
        />
      </Fields>
      {roof.type === 'one' ? (
        <>
          <p className="muted">Cae hacia</p>
          {choice<Side>(
            [
              ['n', 'Norte'],
              ['s', 'Sur'],
              ['w', 'Oeste'],
              ['e', 'Este'],
            ],
            roof.side,
            (side) => setShellRoof(shell.id, { side }),
          )}
        </>
      ) : (
        <>
          <p className="muted">Cumbrera</p>
          {choice<'long' | 'short'>(
            [
              ['long', 'A lo largo'],
              ['short', 'A lo ancho'],
            ],
            roof.ridge,
            (ridge) => setShellRoof(shell.id, { ridge }),
          )}
        </>
      )}
    </section>
  )
}

function RoomProperties({ room }: { room: PlacedModule }) {
  const shells = useHouse((s) => s.shells)
  const moveModule = useHouse((s) => s.moveModule)
  const resizeModule = useHouse((s) => s.resizeModule)
  const rotateModule = useHouse((s) => s.rotateModule)
  const removeModule = useHouse((s) => s.removeModule)
  const modules = useHouse((s) => s.modules)
  const rename = useHouse((s) => s.rename)

  // La posición se mide desde la esquina de su módulo; sin módulos, desde la de la parcela.
  const shell = shells.find((s) => s.id === room.shellId)
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
      <NameField
        value={room.name}
        fallback={defaultRoomName(modules, room.id)}
        onApply={(name) => rename('room', room.id, name)}
      />
      <ArticleCode
        codes={[
          { label: 'Suelo', code: floorOf(room) ? finishCode(floorOf(room), BASE_FLOOR.id) : ARTICLES.floor },
          { label: 'Techo', code: finishCode(room.ceiling, DEFAULT_CEILING) },
        ]}
      />
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
  const rename = useHouse((s) => s.rename)

  return (
    <>
      <NameField
        value={wall.name}
        fallback={defaultWallName(wall)}
        onApply={(name) => rename('wall', wall.key, name)}
      />
      <ArticleCode
        codes={[
          { code: wall.shared ? ARTICLES.wallShared : ARTICLES.wallExterior },
          ...(wall.skirting.height > 0 ? [{ label: 'Rodapié', code: ARTICLES.skirting }] : []),
        ]}
      />
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
      <NameField
        value={opening.name}
        fallback={defaultOpeningName(opening)}
        onApply={(name) => useHouse.getState().rename('opening', opening.id, name)}
      />
      <ArticleCode
        codes={[
          { code: openingCode(opening) },
          { label: 'Acabado', code: finishCode(opening.finish, DEFAULT_JOINERY_FINISH) },
        ]}
      />
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
  const setFurnitureElevation = useHouse((s) => s.setFurnitureElevation)
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
      <NameField
        value={item.name}
        fallback={defaultFurnitureName(item)}
        onApply={(name) => useHouse.getState().rename('furniture', item.id, name)}
      />
      <ArticleCode codes={[{ code: type.code }]} />
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
      {partChoices(item).map(({ part, option }) => (
        <section key={part.id} className="part-colors">
          <h3>{part.name}</h3>
          <div className="part-choices">
            {part.options.map((o) => (
              <button
                key={o.id}
                className={o.id === option.id ? 'swatch active' : 'swatch'}
                onClick={() => useHouse.getState().setFurnitureColor(item.id, part.id, o.id)}
              >
                <span className="part-dot" style={{ background: o.color }} />
                {o.name}
              </button>
            ))}
          </div>
        </section>
      ))}
      {type.parts?.some((p) => !p.boxColor) && !useHouse.getState().detailedFurniture && (
        <p className="muted">
          {type.parts.filter((p) => !p.boxColor).map((p) => p.name).join(', ')}: solo se ve con
          «Detallados» en la vista 3D.
        </p>
      )}
      <Fields title="Altura">
        <Field
          label="Sobre el suelo (m)"
          value={liftOf(item)}
          onApply={(h) => {
            const max = WALL_HEIGHT - type.height
            if (h < 0 || h > max + EPS) return `Entre 0 y ${formatMeters(Math.max(max, 0))} m.`
            setFurnitureElevation(item.id, h)
            return ''
          }}
        />
      </Fields>
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
        {box.inRoom && (
          <button
            onClick={() =>
              placeFurniture(
                item.id,
                roundSize((box.west + box.east) / 2),
                roundSize((box.north + box.south) / 2),
              )
            }
          >
            Centrar en la estancia
          </button>
        )}
        <button onClick={() => rotateFurniture(item.id)}>Girar 90° (R)</button>
        <button onClick={() => removeFurniture(item.id)}>Eliminar (Supr)</button>
      </div>
      {notice && <p className="notice">{notice}</p>}
    </>
  )
}

/** Las caras de una pared: la de su estancia y, si es compartida, la de la otra. */
function WallFaces({ wall }: { wall: Wall }) {
  const modules = useHouse((s) => s.modules)
  // En una compartida se elige a qué estancia da la cara que se está vistiendo.
  const [other, setOther] = useState(false)
  const faces = [
    { id: wall.moduleId, side: wall.side },
    ...(wall.otherId ? [{ id: wall.otherId, side: OPPOSITE[wall.side] }] : []),
  ]
  const face = faces[other && wall.otherId ? 1 : 0]
  const room = modules.find((m) => m.id === face.id)
  if (!room) return null

  return (
    <>
      {faces.length > 1 && (
        <section className="vinyls">
          <h2>Cara de la pared</h2>
          <div className="actions">
            {faces.map((f, n) => (
              <button
                key={f.id}
                className={f === face ? 'active' : ''}
                onClick={() => setOther(n === 1)}
              >
                La que da a {roomName(modules, f.id)}
              </button>
            ))}
          </div>
        </section>
      )}
      <FaceFinishes room={room} side={face.side} />
      <BoardsSection key={`${room.id}:${face.side}`} room={room} side={face.side} />
    </>
  )
}

/** Qué hacer cuando no hay nada elegido de esa clase. */
const HINTS: Record<Mode, string> = {
  shells: 'Elige un módulo en el árbol o en el plano; elegido, se arrastra para moverlo.',
  modules: 'Elige una estancia en el árbol o haciendo clic en su centro en el plano.',
  walls: 'Elige una pared en el árbol o haciendo clic sobre ella en el plano.',
  options: 'Elige un mueble en el árbol o en el plano.',
  photos: '',
}

interface Props {
  /** Plegado: solo se ve el botón para volver a sacarlo. */
  hidden: boolean
  onToggle: () => void
}

/** La casa entera: su nombre (sale en el árbol y en los archivos que se descargan). */
function HouseProperties() {
  const name = useHouse((s) => s.houseName)
  const ground = useHouse((s) => s.ground)
  const setGround = useHouse((s) => s.setGround)
  return (
    <>
      <NameField
        value={name}
        fallback={DEFAULT_HOUSE_NAME}
        onApply={(text) => useHouse.getState().rename('house', '', text)}
      />
      <h2>Terreno de la parcela</h2>
      <ArticleCode
        codes={[
          { code: ARTICLES.ground },
          { label: 'Acabado', code: finishCode(ground, DEFAULT_GROUND) },
        ]}
      />
      <FinishPicker value={ground ?? DEFAULT_GROUND} onChange={(f) => setGround(f)} />
      {ground && (
        <div className="actions spaced">
          <button onClick={() => setGround(undefined)}>Volver al césped</button>
        </div>
      )}
    </>
  )
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
  const selectedLightId = useHouse((s) => s.selectedLightId)
  const light = room?.lights?.find((l) => l.id === selectedLightId)
  const piece = useHouse((s) => s.selectedPiece)
  const pieceRoom = piece && modules.find((m) => m.id === piece.roomId)
  const pieceThere = !!piece && !!pieceRoom && piecesOf(pieceRoom, piece.kind, piece.side).some((p) => p.id === piece.id)

  const walls = useMemo(
    () => (mode === 'walls' ? deriveWalls(modules, joints) : []),
    [mode, modules, joints],
  )
  const wall = walls.find((w) => w.key === selectedWall)

  // Solo lo de lo elegido: arriba su nombre y sus datos; debajo, si es algo que
  // contiene otras cosas, lo que se le puede añadir. La clave hace que al cambiar
  // de objeto las casillas empiecen de cero.
  let body: ReactNode = <p className="muted">{HINTS[mode]}</p>
  if (mode === 'photos') body = <PhotosPanel />
  else if (mode === 'shells')
    body = shell ? (
      <>
        <section>
          <ShellProperties key={shell.id} shell={shell} />
        </section>
        <ModulesPanel />
      </>
    ) : (
      <>
        <section>
          <HouseProperties />
        </section>
        <ShellsPanel />
      </>
    )
  else if (mode === 'modules' && room && light)
    body = <LightProperties key={light.id} room={room} light={light} />
  else if (mode === 'modules' && room)
    body = (
      <>
        <section>
          <RoomProperties key={room.id} room={room} />
        </section>
        <RoomFinishes room={room} />
        <AddLight key={room.id} room={room} />
        <OptionsPanel />
      </>
    )
  else if (mode === 'walls' && opening)
    body = (
      <section>
        <OpeningProperties key={opening.id} opening={opening} walls={walls} />
      </section>
    )
  else if (mode === 'walls' && piece && pieceRoom && pieceThere) {
    const props = { key: piece.id, room: pieceRoom, side: piece.side, chosenId: piece.id }
    body =
      piece.kind === 'vinyl' ? (
        <VinylsSection {...props} />
      ) : piece.kind === 'mirror' ? (
        <MirrorsSection {...props} />
      ) : piece.kind === 'mechanism' ? (
        <MechanismsSection {...props} />
      ) : (
        <BoardsSection {...props} />
      )
  } else if (mode === 'walls' && wall)
    body = (
      <>
        <section>
          <WallProperties key={wall.key} wall={wall} />
        </section>
        <WallsPanel />
        <WallFaces key={wall.key} wall={wall} />
      </>
    )
  else if (mode === 'options')
    body = (
      <>
        {item ? (
          <section>
            <FurnitureProperties key={item.id} item={item} />
          </section>
        ) : (
          <p className="muted">{HINTS.options}</p>
        )}
        <OptionsPanel />
      </>
    )

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
      {body}
    </aside>
  )
}
