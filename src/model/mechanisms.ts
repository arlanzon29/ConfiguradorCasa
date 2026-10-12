// Un mecanismo eléctrico es un interruptor o un enchufe: una placa pequeña
// pegada a la cara de una pared que da a una estancia. Solo se ve (no enciende
// nada) y sirve para planificar la instalación. Se guarda en su estancia, por
// lado, y se mide como el vinilo (vinyls.ts): `x` desde la esquina izquierda de
// la cara vista desde dentro e `y` desde el suelo, hasta su esquina inferior
// izquierda. Sus medidas las da el tipo del catálogo; no se cambian.

export interface Mechanism {
  id: string
  /** Nombre que le ha puesto el usuario; si falta, uno por defecto (names.ts). */
  name?: string
  /** Tipo: `id` de MECHANISMS. */
  typeId: string
  x: number
  y: number
}

export interface MechanismType {
  id: string
  /** Código de artículo, para asociarlo a la base de costes (fuera de la web). */
  code: string
  name: string
  kind: 'switch' | 'socket'
  /** Cuántos módulos de 8 cm lleva la placa (1 simple, 2 doble). */
  modules: number
  /** Altura del suelo a su esquina inferior con la que se coloca, en metros. */
  y: number
}

// Medidas de la placa y de su módulo, en metros. Inventadas, a falta de las de EuroCasa.
export const MECHANISM_MODULE = 0.08
export const MECHANISM_HEIGHT = 0.08
export const MECHANISM_THICKNESS = 0.012

// Alturas habituales: el interruptor con su centro a 1,1 m; el enchufe, a 0,3 m.
const SWITCH_Y = 1.1 - MECHANISM_HEIGHT / 2
const SOCKET_Y = 0.3 - MECHANISM_HEIGHT / 2

export const MECHANISMS: MechanismType[] = [
  { id: 'interruptor', code: 'ELE-INT', name: 'Interruptor', kind: 'switch', modules: 1, y: SWITCH_Y },
  { id: 'interruptor-doble', code: 'ELE-INT2', name: 'Interruptor doble', kind: 'switch', modules: 2, y: SWITCH_Y },
  { id: 'conmutador', code: 'ELE-CONM', name: 'Conmutador', kind: 'switch', modules: 1, y: SWITCH_Y },
  { id: 'enchufe', code: 'ELE-ENCH', name: 'Enchufe', kind: 'socket', modules: 1, y: SOCKET_Y },
  { id: 'enchufe-doble', code: 'ELE-ENCH2', name: 'Enchufe doble', kind: 'socket', modules: 2, y: SOCKET_Y },
]

export const mechanismType = (id: string) => MECHANISMS.find((t) => t.id === id)

/** Ancho y alto de la placa de un tipo. */
export const mechanismSize = (type: MechanismType) => ({
  width: MECHANISM_MODULE * type.modules,
  height: MECHANISM_HEIGHT,
})
