import { useMemo, useState } from 'react'
import { FAMILIES, FURNITURE } from '../model/furniture'
import { PlacedModule, formatMeters } from '../model/house'
import { OPENING_CATALOG, OPPOSITE } from '../model/openings'
import { VINYLS, vinylPlacement } from '../model/vinyls'
import {
  furnitureName,
  lightName,
  PieceKind,
  openingName,
  pieceName,
  piecesOf,
  roomName,
  shellName,
  wallName,
} from '../model/names'
import { deriveWalls, openingsOf, wallOf } from '../model/walls'
import { usePhotos } from '../photos'
import { useHouse } from '../store'

// Panel izquierdo: la casa como un árbol. Casa → módulos → estancias, y en cada
// estancia una carpeta con sus paredes (y en cada pared, carpetas de puertas,
// ventanas, vinilos, espejos y tableros), otra con su mobiliario y otra con sus luces. Elegir una línea es lo mismo que pinchar la cosa en el
// plano; sus datos salen en el panel derecho. El "+" de una carpeta añade lo que
// esa carpeta guarda: un foco, un mueble, una puerta, un vinilo… El orden y
// de quién cuelga cada cosa los manda la casa: aquí no se mueve nada de rama.

/** Carpetas de cada pared: qué guarda cada una y, por tanto, qué añade su "+". */
interface WallGroup {
  name: string
  /** En singular, para el rótulo del "+". */
  one: string
  opening?: 'door' | 'window'
  piece?: PieceKind
}
const WALL_GROUPS: WallGroup[] = [
  { name: 'Puertas', one: 'una puerta', opening: 'door' },
  { name: 'Ventanas', one: 'una ventana', opening: 'window' },
  { name: 'Vinilos', one: 'un vinilo', piece: 'vinyl' },
  { name: 'Espejos', one: 'un espejo', piece: 'mirror' },
  { name: 'Tableros', one: 'un tablero', piece: 'board' },
]

interface RowProps {
  level: number
  label: string
  detail?: string
  active?: boolean
  /** Con hijos: true abierta, false cerrada. Sin hijos, nada. */
  open?: boolean
  onToggle?: () => void
  onPick: () => void
  /** Con él, la línea lleva un "+" para añadirle algo. */
  onAdd?: () => void
  addTitle?: string
}

function Row({ level, label, detail, active, open, onToggle, onPick, onAdd, addTitle }: RowProps) {
  return (
    <div className={active ? 'tree-row active' : 'tree-row'} style={{ paddingLeft: level * 14 }}>
      {open === undefined ? (
        <span className="tree-twist" />
      ) : (
        <button
          className="tree-twist"
          aria-label={open ? 'Plegar' : 'Desplegar'}
          onClick={onToggle}
        >
          {open ? '▾' : '▸'}
        </button>
      )}
      <button className="tree-label" onClick={onPick}>
        {label}
        {detail && <span className="muted"> · {detail}</span>}
      </button>
      {onAdd && (
        <button className="tree-add" title={addTitle} aria-label={addTitle} onClick={onAdd}>
          +
        </button>
      )}
    </div>
  )
}

export default function HouseTree() {
  const mode = useHouse((s) => s.mode)
  const shells = useHouse((s) => s.shells)
  const modules = useHouse((s) => s.modules)
  const joints = useHouse((s) => s.joints)
  const openings = useHouse((s) => s.openings)
  const furniture = useHouse((s) => s.furniture)
  const selectedShellId = useHouse((s) => s.selectedShellId)
  const selectedId = useHouse((s) => s.selectedId)
  const selectedWall = useHouse((s) => s.selectedWall)
  const selectedOpeningId = useHouse((s) => s.selectedOpeningId)
  const selectedFurnitureId = useHouse((s) => s.selectedFurnitureId)
  const selectedLightId = useHouse((s) => s.selectedLightId)
  const pick = useHouse((s) => s.pick)
  const addLight = useHouse((s) => s.addLight)
  const addFurniture = useHouse((s) => s.addFurniture)
  const addOpening = useHouse((s) => s.addOpening)
  const selectedPiece = useHouse((s) => s.selectedPiece)
  // La línea cuyo "+" tiene abierta la lista de lo que se le puede añadir, y el aviso si no cabe.
  const [menu, setMenu] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const toggleMenu = (key: string) => {
    setNotice('')
    setMenu(menu === key ? null : key)
  }
  const photoCount = usePhotos((s) => s.photos.length)
  // Estancias y carpetas abiertas o cerradas a mano; las demás se abren solas si tienen lo elegido.
  const [opened, setOpened] = useState<Record<string, boolean>>({})

  const walls = useMemo(() => deriveWalls(modules, joints), [modules, joints])
  // La pared elegida o, con un hueco elegido, la suya: es la que abre sus ramas.
  const opening = openings.find((o) => o.id === selectedOpeningId)
  const wallKey = selectedWall ?? (opening && wallOf(opening, modules, walls)?.key)

  const roomOf = (f: (typeof furniture)[number]) => modules.find((m) => m.id === f.roomId)
  const loose = furniture.filter((f) => !roomOf(f))
  const furnitureRow = (f: (typeof furniture)[number], level: number) => (
    <Row
      key={f.id}
      level={level}
      label={furnitureName(f)}
      active={f.id === selectedFurnitureId}
      onPick={() => pick('options', { selectedFurnitureId: f.id })}
    />
  )

  // Puertas y ventanas de una pared, en el orden en que están a lo largo de ella.
  const holes = (w: (typeof walls)[number]) => openingsOf(w, modules, walls, openings)

  // Vinilos, espejos y tableros de una pared: los de la cara que da a su estancia
  // y, si es compartida, los de la otra. Son del lado entero de su estancia; si
  // ese lado tiene varios tramos de pared, cada pieza va al tramo donde cae.
  const KINDS: PieceKind[] = ['vinyl', 'mirror', 'board']
  const pieces = (w: (typeof walls)[number]) => {
    const faces = [
      { id: w.moduleId, side: w.side },
      ...(w.otherId ? [{ id: w.otherId, side: OPPOSITE[w.side] }] : []),
    ]
    return faces.flatMap(({ id, side }) => {
      const room = modules.find((m) => m.id === id)
      if (!room) return []
      const stretches = walls.filter(
        (x) =>
          (x.moduleId === id && x.side === side) ||
          (x.otherId === id && OPPOSITE[x.side] === side),
      )
      return KINDS.flatMap((kind) =>
        piecesOf(room, kind, side)
          .filter((p) => {
            if (stretches.length < 2) return true
            const at = vinylPlacement(room, side, p as never, walls)?.along
            return at === undefined ? stretches[0] === w : at >= w.from && at <= w.to
          })
          .map((p) => ({ kind, room, side, id: p.id })),
      )
    })
  }
  /** Añade una pieza a la cara de la pared que da a su estancia y la deja elegida. */
  const addPiece = (w: (typeof walls)[number], kind: PieceKind, typeId?: string) => {
    const s = useHouse.getState()
    const id =
      kind === 'vinyl'
        ? s.addVinyl(w.moduleId, w.side, typeId!)
        : kind === 'mirror'
          ? s.addMirror(w.moduleId, w.side)
          : s.addBoard(w.moduleId, w.side)
    if (!id) return setNotice('No cabe en esta pared.')
    setMenu(null)
    pick('walls', {
      selectedWall: w.key,
      selectedPiece: { kind, roomId: w.moduleId, side: w.side, id },
    })
  }

  // Una carpeta de una pared, con lo suyo dentro y un "+" que sabe qué añade:
  // si solo hay una clase, la pone directamente; si hay varias, se elige en una lista.
  const wallFolder = (w: (typeof walls)[number], group: WallGroup, level: number) => {
    const key = `${w.key}:${group.name}`
    const own = group.opening ? holes(w).filter((h) => h.opening.kind === group.opening) : []
    const items = group.piece ? pieces(w).filter((p) => p.kind === group.piece) : []
    const holds =
      own.some((h) => h.opening.id === selectedOpeningId) ||
      items.some((p) => p.id === selectedPiece?.id)
    const shown = opened[key] ?? holds
    const toggle = () => setOpened({ ...opened, [key]: !shown })
    const types: { id: string; name: string }[] = group.opening
      ? OPENING_CATALOG.filter((t) => t.kind === group.opening)
      : group.piece === 'vinyl'
        ? VINYLS
        : []
    const addOne = (typeId?: string) => {
      if (group.piece) return addPiece(w, group.piece, typeId)
      // Sale centrado en la pared; luego se desliza por ella.
      if (addOpening(typeId!, w.key, (w.from + w.to) / 2)) setMenu(null)
      else setNotice('No cabe en esta pared.')
    }
    return (
      <div key={key}>
        <Row
          level={level}
          label={group.name}
          detail={String(own.length + items.length)}
          open={shown}
          onToggle={toggle}
          onPick={toggle}
          addTitle={`Añadir a esta pared: ${group.one}`}
          onAdd={() => {
            if (types.length > 1) return toggleMenu(key)
            // Si no cabe, el aviso sale bajo la carpeta.
            setNotice('')
            setMenu(key)
            addOne(types[0]?.id)
          }}
        />
        {menu === key && (
          <div className="tree-menu" style={{ marginLeft: (level + 1) * 14 }}>
            {types.length > 1 &&
              types.map((t) => (
                <button key={t.id} onClick={() => addOne(t.id)}>
                  {t.name}
                </button>
              ))}
            {notice && <p className="notice">{notice}</p>}
          </div>
        )}
        {shown &&
          own.map(({ opening: o }) => (
            <Row
              key={o.id}
              level={level + 1}
              label={openingName(o)}
              detail={`${formatMeters(o.width)} m`}
              active={o.id === selectedOpeningId}
              onPick={() => pick('walls', { selectedOpeningId: o.id })}
            />
          ))}
        {shown &&
          items.map((p) => (
            <Row
              key={p.id}
              level={level + 1}
              label={pieceName(p.room, p.kind, p.side, p.id)}
              detail={p.room.id !== w.moduleId ? `cara de ${roomName(modules, p.room.id)}` : undefined}
              active={selectedPiece?.id === p.id}
              onPick={() =>
                pick('walls', {
                  selectedWall: w.key,
                  selectedPiece: { kind: p.kind, roomId: p.room.id, side: p.side, id: p.id },
                })
              }
            />
          ))}
      </div>
    )
  }

  const roomRows = (room: PlacedModule, level: number) => {
    const own = walls.filter((w) => w.moduleId === room.id)
    const items = furniture.filter((f) => roomOf(f) === room)
    const holdsWall = own.some((w) => w.key === wallKey)
    const holdsItem = items.some((f) => f.id === selectedFurnitureId)
    const lights = room.lights ?? []
    const holdsLight = lights.some((l) => l.id === selectedLightId)
    const open = opened[room.id] ?? (room.id === selectedId || holdsWall || holdsItem)
    // Una carpeta: su línea, que solo pliega y despliega, y si está abierta lo que tiene.
    const folder = (
      name: string,
      count: number,
      holds: boolean,
      rows: () => React.ReactNode,
      add?: { title: string; run: () => void; menu?: React.ReactNode },
    ) => {
      const key = `${room.id}:${name}`
      const shown = opened[key] ?? holds
      const toggle = () => setOpened({ ...opened, [key]: !shown })
      return (
        <>
          <Row
            level={level + 1}
            label={name}
            detail={String(count)}
            open={shown}
            onToggle={toggle}
            onPick={toggle}
            onAdd={add?.run}
            addTitle={add?.title}
          />
          {add?.menu}
          {shown && rows()}
        </>
      )
    }
    return (
      <div key={room.id}>
        <Row
          level={level}
          label={roomName(modules, room.id)}
          detail={`${formatMeters(room.width)} × ${formatMeters(room.depth)} m`}
          active={room.id === selectedId && mode === 'modules' && !holdsLight}
          open={open}
          onToggle={() => setOpened({ ...opened, [room.id]: !open })}
          onPick={() => pick('modules', { selectedId: room.id })}
        />
        {open &&
          folder('Paredes', own.length, holdsWall, () =>
            own.map((w) => {
            // Un lado partido en varios tramos los numera, si no tienen nombre propio.
            const same = own.filter((o) => o.side === w.side)
            const number = same.length > 1 && !w.name ? ` ${same.indexOf(w) + 1}` : ''
            // Cerrada de entrada; se abre sola si tiene lo elegido.
            const wallOpen = opened[w.key] ?? w.key === wallKey
            return (
              <div key={w.key}>
                <Row
                  open={wallOpen}
                  onToggle={() => setOpened({ ...opened, [w.key]: !wallOpen })}
                  level={level + 2}
                  label={`${wallName(w)}${number}`}
                  detail={w.otherId ? `con ${roomName(modules, w.otherId)}` : undefined}
                  active={w.key === selectedWall && !selectedPiece}
                  onPick={() => pick('walls', { selectedWall: w.key })}
                />
                {wallOpen && WALL_GROUPS.map((group) => wallFolder(w, group, level + 3))}
              </div>
            )
            }),
          )}
        {open &&
          folder(
            'Mobiliario',
            items.length,
            holdsItem,
            () => items.map((f) => furnitureRow(f, level + 2)),
            {
              title: 'Añadir un mueble a esta estancia',
              run: () => toggleMenu(`${room.id}:muebles`),
              menu: menu === `${room.id}:muebles` && (
                <div className="tree-menu" style={{ marginLeft: (level + 2) * 14 }}>
                  {FAMILIES.map((family) => (
                    <div key={family.id}>
                      <span className="muted">{family.name}</span>
                      {FURNITURE.filter((t) => t.family === family.id).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            // Sale en el centro de la estancia; luego se arrastra.
                            addFurniture(t.id, room.x + room.width / 2, room.y + room.depth / 2)
                            setMenu(null)
                          }}
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              ),
            },
          )}
        {open &&
          folder('Luces', lights.length, holdsLight, () =>
            lights.map((l) => (
              <Row
                key={l.id}
                level={level + 2}
                label={lightName(room, l)}
                active={l.id === selectedLightId}
                onPick={() => pick('modules', { selectedId: room.id, selectedLightId: l.id })}
              />
            )),
            {
              title: 'Añadir un foco de techo a esta estancia',
              run: () => {
                const id = addLight(room.id)
                if (id) pick('modules', { selectedId: room.id, selectedLightId: id })
              },
            },
          )}
      </div>
    )
  }

  const housed = (room: PlacedModule) => shells.some((sh) => sh.id === room.shellId)

  return (
    <nav className="tree" aria-label="La casa">
      <Row
        level={0}
        label="Casa"
        active={mode === 'shells' && !selectedShellId}
        onPick={() => pick('shells')}
      />
      {shells.map((sh) => (
        <div key={sh.id}>
          <Row
            level={1}
            label={shellName(shells, sh)}
            detail={`${formatMeters(sh.width)} × ${formatMeters(sh.depth)} m`}
            active={sh.id === selectedShellId}
            onPick={() => pick('shells', { selectedShellId: sh.id })}
          />
          {modules.filter((m) => m.shellId === sh.id).map((m) => roomRows(m, 2))}
        </div>
      ))}
      {/* Planos antiguos sin módulos, y muebles que no están en ninguna estancia. */}
      {modules.filter((m) => !housed(m)).map((m) => roomRows(m, 1))}
      {loose.map((f) => furnitureRow(f, 1))}
      <Row
        level={0}
        label="Fotos"
        detail={String(photoCount)}
        active={mode === 'photos'}
        onPick={() => pick('photos')}
      />
    </nav>
  )
}
