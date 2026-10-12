import { FurnitureItem, FurnitureType, furnitureType, liftOf } from '../model/furniture'

const WOOD = '#b08d62'
const FABRIC = '#8fa3b0'
const LINEN = '#f4f1ea'
const WHITE = '#ecebe6'

interface Box {
  /** Centro de la caja. El mueble tiene su centro en x/z = 0 y apoya en y = 0. */
  position: [number, number, number]
  size: [number, number, number]
  color: string
  /** Disco en vez de caja: `size` es [diámetro, diámetro, grueso] y el eje va a lo largo de z. */
  round?: boolean
}

/** Cajas que componen un mueble; su parte trasera queda hacia -z. */
function boxes({ shape, width: w, depth: d, height: h }: FurnitureType): Box[] {
  const leg = 0.05
  const legs = (top: number, color: string): Box[] =>
    [-1, 1].flatMap((sx) =>
      [-1, 1].map((sz) => ({
        position: [sx * (w / 2 - leg), top / 2, sz * (d / 2 - leg)] as [number, number, number],
        size: [leg, top, leg] as [number, number, number],
        color,
      })),
    )

  switch (shape) {
    case 'table': {
      const top = 0.04
      return [{ position: [0, h - top / 2, 0], size: [w, top, d], color: WOOD }, ...legs(h - top, WOOD)]
    }
    case 'chair': {
      const seat = 0.45
      return [
        { position: [0, seat - 0.02, 0], size: [w, 0.04, d], color: WOOD },
        { position: [0, (seat + h) / 2, -d / 2 + 0.02], size: [w, h - seat, 0.04], color: WOOD },
        ...legs(seat - 0.04, WOOD),
      ]
    }
    case 'bed': {
      const base = h * 0.55
      const head = 0.06
      return [
        { position: [0, base / 2, 0], size: [w, base, d], color: WOOD },
        { position: [0, base + (h - base) / 2, head / 2], size: [w - 0.06, h - base, d - head - 0.04], color: LINEN },
        { position: [0, 0.5, -d / 2 + head / 2], size: [w, 1, head], color: WOOD },
        { position: [0, h + 0.05, -d / 2 + head + 0.25], size: [w - 0.3, 0.1, 0.4], color: WHITE },
      ]
    }
    case 'sofa': {
      const seat = 0.42
      const arm = 0.15
      const back = 0.2
      return [
        { position: [0, seat / 2, back / 2], size: [w - 2 * arm, seat, d - back], color: FABRIC },
        { position: [0, h / 2, -d / 2 + back / 2], size: [w, h, back], color: FABRIC },
        { position: [-w / 2 + arm / 2, 0.3, back / 2], size: [arm, 0.6, d - back], color: FABRIC },
        { position: [w / 2 - arm / 2, 0.3, back / 2], size: [arm, 0.6, d - back], color: FABRIC },
      ]
    }
    case 'appliance': {
      // Electrodoméstico de encastre: cuerpo blanco con el frente (+z) algo más oscuro y un tirador.
      const front = 0.02
      return [
        { position: [0, h / 2, -front / 2], size: [w, h, d - front], color: WHITE },
        { position: [0, h / 2, d / 2 - front / 2], size: [w - 0.02, h - 0.02, front], color: '#c9ccd0' },
        { position: [0, h - 0.1, d / 2 + 0.01], size: [w * 0.6, 0.025, 0.02], color: '#8a8d92' },
      ]
    }
    case 'fridge': {
      // Puerta lateral con dos puertas: arriba el congelador (pequeño), abajo el frío.
      // Las bisagras van a la izquierda y los tiradores (verticales) a la derecha.
      const front = 0.025
      const gap = 0.01
      const freezer = h * 0.25
      const cold = h - freezer - gap
      const doorW = w - 0.02
      const handle = (y: number, len: number): Box => ({
        position: [w / 2 - 0.05, y, d / 2 + 0.01],
        size: [0.02, len, 0.025],
        color: '#8a8d92',
      })
      return [
        { position: [0, h / 2, -front / 2], size: [w, h, d - front], color: WHITE },
        { position: [0, cold / 2, d / 2 - front / 2], size: [doorW, cold - gap / 2, front], color: '#d6d8dc' },
        { position: [0, cold + gap + freezer / 2, d / 2 - front / 2], size: [doorW, freezer - gap / 2, front], color: '#d6d8dc' },
        handle(cold - 0.3, 0.4),
        handle(cold + gap + 0.14, 0.16),
      ]
    }
    case 'washer': {
      // Carga frontal: panel de mandos arriba y ojo de buey oscuro en el centro.
      const front = 0.02
      const eye = Math.min(w, h) * 0.55
      return [
        { position: [0, h / 2, -front / 2], size: [w, h, d - front], color: WHITE },
        { position: [0, h / 2, d / 2 - front / 2], size: [w - 0.02, h - 0.02, front], color: '#d6d8dc' },
        { position: [0, h - 0.07, d / 2 + 0.005], size: [w - 0.1, 0.07, 0.01], color: '#6b6e73' },
        // Aro cromado y cristal oscuro: dos discos.
        { position: [0, h * 0.42, d / 2 + 0.006], size: [eye + 0.07, eye + 0.07, 0.012], color: '#a8abb0', round: true },
        { position: [0, h * 0.42, d / 2 + 0.014], size: [eye, eye, 0.012], color: '#23262b', round: true },
      ]
    }
    case 'sink': {
      // Fregadero de acero sin profundidad: se apoya sobre la encimera, con un
      // borde bajo, la cubeta como una placa más oscura y el grifo detrás.
      const steel = '#c9ccd1'
      const basin = '#8e9399'
      const rim = 0.02
      const f = 0.03
      const iw = w - 2 * f
      const id = d - 2 * f
      const tap = h - rim
      return [
        { position: [0, rim / 2, -(d / 2 - f / 2)], size: [w, rim, f], color: steel },
        { position: [0, rim / 2, d / 2 - f / 2], size: [w, rim, f], color: steel },
        { position: [-(w / 2 - f / 2), rim / 2, 0], size: [f, rim, id], color: steel },
        { position: [w / 2 - f / 2, rim / 2, 0], size: [f, rim, id], color: steel },
        { position: [0, 0.004, 0], size: [iw, 0.008, id], color: basin },
        // Grifo: caño vertical y pico hacia delante.
        { position: [0, rim + (tap - 0.03) / 2, -d / 2 + 0.05], size: [0.03, tap - 0.03, 0.03], color: steel },
        { position: [0, h - 0.015, -d / 2 + 0.05 + 0.07], size: [0.03, 0.03, 0.17], color: steel },
      ]
    }
    case 'cabinet-table': {
      // Mesa de trabajo con armarios debajo: tablero, zócalo, cuerpo y dos puertas con tirador.
      const top = 0.04
      const kick = 0.08
      const inset = 0.02
      const gap = 0.01
      // Una sola puerta en el centro, entre dos paños fijos.
      const inner = w - 2 * inset
      const doorW = inner / 2
      const panelW = (inner - doorW) / 2 - gap
      const faceH = h - top - kick - 2 * gap
      const faceY = kick + (h - top - kick) / 2
      const faceZ = d / 2 - inset - 0.01
      const panel = (sx: number): Box => ({
        position: [sx * (doorW / 2 + gap + panelW / 2), faceY, faceZ],
        size: [panelW, faceH, 0.02],
        color: '#dbd8d0',
      })
      return [
        { position: [0, h - top / 2, 0], size: [w, top, d], color: WOOD },
        { position: [0, kick / 2, -inset / 2], size: [w - 2 * inset, kick, d - 2 * inset - 0.04], color: '#3a3a3e' },
        { position: [0, kick + (h - top - kick) / 2, -inset], size: [w - 2 * inset, h - top - kick, d - 2 * inset - 0.02], color: WHITE },
        panel(-1),
        panel(1),
        { position: [0, faceY, faceZ], size: [doorW - gap, faceH, 0.02], color: '#e6e3dc' },
        { position: [0, h - top - 0.08, faceZ + 0.02], size: [0.3, 0.025, 0.025], color: '#8a8d92' },
      ]
    }
    case 'oven': {
      // Horno: panel de mandos arriba con tres mandos, tirador y ventana de cristal oscuro.
      const front = 0.02
      const knob = 0.035
      return [
        { position: [0, h / 2, -front / 2], size: [w, h, d - front], color: WHITE },
        { position: [0, h / 2, d / 2 - front / 2], size: [w - 0.02, h - 0.02, front], color: '#d6d8dc' },
        { position: [0, h - 0.08, d / 2 + 0.005], size: [w - 0.1, 0.1, 0.01], color: '#2b2d31' },
        ...[-0.18, 0, 0.18].map((x): Box => ({
          position: [x, h - 0.08, d / 2 + 0.02],
          size: [knob * 2, knob * 2, 0.02],
          color: '#9a9da2',
          round: true,
        })),
        { position: [0, h - 0.2, d / 2 + 0.03], size: [w - 0.16, 0.025, 0.025], color: '#8a8d92' },
        { position: [0, h * 0.4, d / 2 + 0.006], size: [w - 0.14, h * 0.5, 0.012], color: '#17171a' },
      ]
    }
    case 'hob': {
      // Placa de vidrio negro con cuatro fuegos (aros) en las esquinas.
      const ring = (sx: number, sz: number): Box => ({
        position: [sx * w * 0.22, h + 0.001, sz * d * 0.22],
        size: [w * 0.3, 0.002, d * 0.3],
        color: '#2a2a2e',
      })
      return [
        { position: [0, h / 2, 0], size: [w, h, d], color: '#141416' },
        ring(-1, -1),
        ring(1, -1),
        ring(-1, 1),
        ring(1, 1),
      ]
    }
    case 'tv': {
      // Pantalla fina sobre un pie corto; la pantalla mira hacia delante (+z).
      const base = 0.04
      const screen = 0.04
      return [
        { position: [0, base / 2, 0], size: [w * 0.4, base, d], color: '#2b2b2e' },
        { position: [0, (base + h) / 2, -d / 2 + screen / 2 + 0.05], size: [w, h - base, screen], color: '#17171a' },
      ]
    }
    case 'wardrobe': {
      const gap = 0.01
      return [
        { position: [0, h / 2, -gap], size: [w, h, d - 2 * gap], color: WHITE },
        // Dos puertas ligeramente separadas, para que se lea como armario.
        { position: [-w / 4, h / 2, d / 2 - gap], size: [w / 2 - gap, h - 0.04, 2 * gap], color: WOOD },
        { position: [w / 4, h / 2, d / 2 - gap], size: [w / 2 - gap, h - 0.04, 2 * gap], color: WOOD },
      ]
    }
  }
}

interface Props {
  item: FurnitureItem
  /** Altura del suelo sobre el que apoya. */
  floorY: number
  selected: boolean
}

export default function Furniture3D({ item, floorY, selected }: Props) {
  const type = furnitureType(item.typeId)
  if (!type) return null
  return (
    // En el plano el giro es horario con y hacia abajo; en 3D eso es un giro negativo sobre y.
    <group position={[item.x, floorY + liftOf(item), item.y]} rotation-y={(-item.rotation * Math.PI) / 180}>
      {boxes(type).map((box, i) => (
        <mesh key={i} position={box.position} rotation-x={box.round ? Math.PI / 2 : 0} castShadow receiveShadow>
          {box.round ? (
            <cylinderGeometry args={[box.size[0] / 2, box.size[0] / 2, box.size[2], 32]} />
          ) : (
            <boxGeometry args={box.size} />
          )}
          <meshStandardMaterial color={box.color} emissive={selected ? '#d9480f' : '#000000'} emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  )
}
