---
name: crear-cocinas
description: Montar o cambiar la cocina de una casa en el Configurador EuroCasa (electrodomésticos, armarios, encimera, fregadero, vitrocerámica) con las funciones de window.eurocasa. Úsala cuando pidan preparar, ampliar o cambiar una cocina, o poner un electrodoméstico, una encimera o un fregadero. Complementa a crear-casas.
---

# Crear cocinas en el Configurador EuroCasa

Esta skill es de **cocinas**. Para lo demás (dónde se trabaja, módulos, estancias,
puertas, ventanas, cámara, fotos, cómo hablar con el comercial) lee antes
**`crear-casas`**: las funciones son las mismas (`window.eurocasa`).

Se va construyendo **paso a paso con el usuario**: cada vez que él decide algo
(una medida, un orden, una altura), se apunta aquí como regla, con el porqué. Si
cambias o añades una función en `src/api.ts` que toque cocinas, actualiza este
documento en el mismo cambio.

## Cómo se trabaja

1. El usuario pide **un paso cada vez** (la encimera, el fregadero, lo que tape
   los frentes…). No montes más de lo que pide ni añadas piezas por tu cuenta.
2. Hazlo en el entorno de pruebas (otro puerto, otra casa) y enséñaselo con
   `llevarCamara` y una captura de la vista 3D.
3. Dile qué has decidido y qué has supuesto, sobre todo las medidas inventadas.
4. Lo que decida, apúntalo en "Reglas de la cocina" o en "Pendiente".

## Las piezas (familia **Cocina** del catálogo)

Medidas en metros, ancho × fondo × alto. Los códigos son provisionales.
`catalogoMuebles()` es la fuente: si discrepa con esta tabla, manda él.

| Pieza (`mueble`) | Medidas | Notas |
|---|---|---|
| `lavavajillas` | 0,6 × 0,6 × 0,82 | |
| `lavavajillas-pequeno` | 0,6 × 0,45 × 0,8 | |
| `lavadora` | 0,6 × 0,6 × 0,82 | Ojo de buey redondo |
| `lavadora-pequena` | 0,6 × 0,45 × 0,8 | |
| `horno` | 0,6 × 0,6 × 0,82 | Con las medidas del lavavajillas (lo pidió el usuario) |
| `frigorifico` | 0,6 × 0,6 × 2,1 | Congelador pequeño **arriba**, frío abajo; asas separadas; bisagras a la izquierda (supuesto) |
| `frigorifico-pequeno` | 0,6 × 0,6 × 1,8 | Igual |
| `armario-cocina` | 0,45 × 0,6 × 0,82 | Para ponerlo junto al lavavajillas; dos puertas |
| `mesa-armarios` | 1,2 × 0,6 × 0,8 | Mesa de trabajo con **una sola puerta al medio** y dos paños fijos |
| `fregadero` | 0,4 × 0,45 | **Una sola pila, sin profundidad**: se apoya sobre la encimera (el usuario descartó el agujero) |
| `vitroceramica` | 0,5 × 0,5 × 0,02 | 4 fuegos, fina y negra. Lleva su altura propia (0,9 m): ponle la de la encimera |

En el catálogo hay más muebles (mesas, sofás, camas…): son de otras familias.

## Reglas de la cocina

Las decididas por el usuario van marcadas **(usuario)**; las demás son
provisionales, puestas por Claude hasta que él las confirme.

- **Se empieza por el frigorífico pequeño de 1,80** (usuario, 2026-10-12): es
  el primer paso de la cocina de prueba. Va en la esquina noreste del salón,
  de espaldas a la pared norte (`frigorifico-pequeno`, `pared: 'norte'`,
  `posicion` de sobra para que se arrime a la esquina).
- **Encimera = un tablero** (usuario): `ponerTablero` fino y con fondo, no una
  pieza de catálogo. Medidas con las que se montó: **0,04 de alto, 0,6 de fondo**,
  acabado `gris-perla` (granito, la textura que pasó el usuario).
- **Altura de la encimera** (provisional): el tablero apoya **sobre** lo que hay
  debajo. Con electrodomésticos de 0,82, su borde inferior va a **0,82**
  (`altura: 0,82`) y la cara de arriba queda a **0,86**.
- **Lo que va encima de la encimera** (vitro, fregadero): `ponerMueble` con
  `altura` = la cara de arriba de la encimera (0,86).
- **Las piezas de suelo van a ras, una al lado de otra**, de espaldas a la pared.
  Se colocan encadenando desde un extremo (la esquina o el frigorífico, que
  es lo más alto) y leyendo en cada paso la `x` que devuelve `ponerMueble`.
- **El frigorífico en un extremo**, no entre medias, para que su altura no tape
  la encimera ni la ventana (provisional).
- **La ventana, sobre la encimera** (provisional): `altura` 1,1 m y `alto` 1,0.
- **No metas la vitro sobre una lavadora ni un lavavajillas** si hay otra
  opción: en la realidad va sobre el horno o un armario (provisional). En la
  primera prueba se puso sobre el armario de 45 cm.
- **Un tablero no admite agujeros** (limitación): por eso el fregadero es plano.

## Receta: una hilera en la pared norte

Encadenando desde el este (la posición de `ponerMueble` es en metros desde el
extremo oeste del lado hasta el **centro** de la pieza; con una posición de más,
se arrima a la esquina). Cambia el orden o las piezas según pida el usuario.

```js
const e = window.eurocasa
const fr  = e.ponerMueble({ mueble: 'frigorifico',    estancia, pared: 'norte', posicion: 99 }) // a la esquina
const la  = e.ponerMueble({ mueble: 'lavadora',       estancia, pared: 'norte', posicion: fr.x - 0.3 - 0.3 })
const ar  = e.ponerMueble({ mueble: 'armario-cocina', estancia, pared: 'norte', posicion: la.x - 0.3 - 0.225 })
const lv  = e.ponerMueble({ mueble: 'lavavajillas',   estancia, pared: 'norte', posicion: ar.x - 0.225 - 0.3 })
// Encimera sobre las tres primeras: de lv.x - 0.3 a la.x + 0.3
const izq = lv.x - 0.3, der = la.x + 0.3
e.ponerTablero({ estancia, lado: 'norte', ancho: der - izq, alto: 0.04, fondo: 0.6,
                 posicion: (izq + der) / 2, altura: 0.82, acabado: 'gris-perla' })
e.ponerMueble({ mueble: 'vitroceramica', estancia, pared: 'norte', posicion: ar.x, altura: 0.86 })
```

Los anchos de cada pieza salen del catálogo (0,6 las normales, 0,45 el armario):
no los escribas a mano si cambian, léelos de `catalogoMuebles()`.

## Límites de hoy

- No hay agujero en los tableros: el fregadero se apoya encima, sin profundidad.
- Un tablero siempre cuelga de una pared: no puede quedar paralelo a ella a
  0,6 m para tapar los frentes de los electrodomésticos.
- Las piezas **no chocan**: comprueba tú que no se pisan y que cabe el fondo.
- La altura de un mueble la pone quien coloca; si mueves el de debajo, el de
  encima no lo sigue.
- Las puertas de los frigoríficos abren a la izquierda siempre (no se elige).

## Estado de la cocina de prueba

Entorno de pruebas (puerto 5185), casa nueva: `Salón` de 4 × 3 m con **solo**
la puerta (sur) y la ventana (norte); sin más. Pasos hechos, en orden:

1. Frigorífico pequeño (1,80 m) en la esquina noreste.

## Pendiente

- Qué tablero tapa "todo" (frentes de los electrodomésticos): por hablar con el
  usuario.
- Colocar el fregadero en la hilera y su relación con la ventana.
- Cocina en L y isla con la mesa de armarios.
- Los códigos de artículo y el criterio de diseño de EuroCasa, que sustituyan a
  los provisionales.
