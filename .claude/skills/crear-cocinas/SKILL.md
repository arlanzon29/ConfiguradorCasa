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
| `lavavajillas-pequeno` | 0,45 × 0,6 × 0,8 | Estrecho: 45 de ancho y 60 de fondo (usuario, 2026-10-12; antes estaba al revés) |
| `lavadora` | 0,6 × 0,6 × 0,82 | Ojo de buey redondo |
| `lavadora-pequena` | 0,45 × 0,6 × 0,8 | Igual: 45 de ancho y 60 de fondo |
| `horno` | 0,6 × 0,6 × 0,82 | Con las medidas del lavavajillas (lo pidió el usuario) |
| `frigorifico` | 0,6 × 0,6 × 2,1 | Congelador pequeño **arriba**, frío abajo; asas separadas; bisagras a la izquierda (supuesto) |
| `frigorifico-pequeno` | 0,6 × 0,6 × 1,8 | Igual |
| `armario-cocina` | 0,45 × 0,6 × 0,8 | Para ponerlo junto al lavavajillas; dos puertas. 80 de alto como los pequeños, para una encimera a ras (usuario) |
| `mesa-armarios` | 1,2 × 0,6 × 0,8 | Mesa de trabajo con **una sola puerta al medio** y dos paños fijos |
| `fregadero` | 0,4 × 0,45 | **Una sola pila, sin profundidad**: se apoya sobre la encimera (el usuario descartó el agujero) |
| `vitroceramica` | 0,5 × 0,5 × 0,02 | 4 fuegos, fina y negra. Lleva su altura propia (0,9 m): ponle la de la encimera |

En el catálogo hay más muebles (mesas, sofás, camas…): son de otras familias.

## Reglas de la cocina

Las decididas por el usuario van marcadas **(usuario)**; las demás son
provisionales, puestas por Claude hasta que él las confirme.

- **"Pequeño" es estrecho, no poco profundo** (usuario, 2026-10-12): 45 de ancho
  y **60 de fondo**, como el armario de cocina. El fondo de toda la hilera es 0,6.
- **Se empieza por el frigorífico pequeño de 1,80** (usuario, 2026-10-12): es
  el primer paso de la cocina de prueba. Va en la esquina noreste del salón,
  de espaldas a la pared norte (`frigorifico-pequeno`, `pared: 'norte'`,
  `posicion` de sobra para que se arrime a la esquina).
- **Encimera = un tablero** (usuario): `ponerTablero` fino y con fondo, no una
  pieza de catálogo. Medidas con las que se montó: **0,02 de alto** (grueso, usuario), **0,6 de fondo**,
  acabado `gris-perla` (granito, la textura que pasó el usuario).
- **Las piezas de debajo miden lo mismo** (usuario): los electrodomésticos pequeños
  y el armario de cocina, **0,80** de alto, para poner una encimera encima a
  ras. Con los normales (0,82) no encajan: no los mezcles bajo la misma encimera.
- **Altura de la encimera** (provisional): el tablero apoya **sobre** lo que hay
  debajo. Con la hilera de 0,80, su borde inferior va a **0,80** (`altura: 0,80`)
  y la cara de arriba queda a **0,82** con la encimera de 2 cm. Con la de 0,82 serían 0,82 y 0,84.
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
- **Al recolocar una encimera, no reutilices la `posicion` que devuelve
  `ponerTablero`/`casa().tableros`**: va redondeada al centímetro y cada vuelta la
  corre 1-2 cm (pasó: la encimera quedó 2 cm a la derecha y se metía en el
  frigorífico). Recalcula el centro desde los muebles: `(izquierda + derecha) / 2`
  con el borde izquierdo del primero y el derecho del último (`x ± ancho/2`).
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
e.ponerTablero({ estancia, lado: 'norte', ancho: der - izq, alto: 0.02, fondo: 0.6,
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
2. (usuario) Lavavajillas pequeño, lavadora pequeña y armario pequeño. De
   izquierda a derecha: **armario, lavavajillas, lavadora, frigorífico** (el
   usuario cambió el armario "al otro lado": primero estaba junto al
   frigorífico). Son `armario-cocina`, `lavavajillas-pequeno` y
   `lavadora-pequena`, **los tres de 0,45 de ancho, 0,6 de fondo y 0,8 de
   alto**, encadenados contra la pared norte desde el frigorífico, que va
   en la esquina. Todos los frentes quedan en el mismo plano y a la misma
   altura.
3. (usuario) **Encimera**: un tablero contra la pared norte, de gris perla
   (`acabado: 'gris-perla'`), de 1,35 m de ancho (del borde izquierdo del
   armario al derecho de la lavadora; llega justo al frigorífico; luego se
   alargó 1 cm a cada lado para cubrir la tapa: ver el paso 5), **0,02 de
   alto** (el usuario: "la encimera es menos gruesa"; salió de 0,04), 0,6 de
   fondo y `altura` 0,80 (cara de arriba a 0,82). Fue `ponerTablero` con
   `posicion` 2,58 y `ancho` 1,35.

4. (usuario) **Fregadero y vitrocerámica sobre la encimera**, de espaldas a la
   pared y a `altura` 0,82 (la cara de arriba de la encimera de 2 cm).
   Resultado, tras varias idas y venidas del usuario:
   - **Fregadero sobre el armario** (`x` del armario, 2,13 en la prueba).
   - **Vitro a su lado derecho, sin pegarse**: 10 cm entre las dos piezas.
   - **Los dos separados de la pared y centrados en el fondo de la
     encimera**: `y` la del centro de la encimera (0,45 en la prueba), con
     unos 5-7 cm de encimera por detrás y por delante.
   Se colocan sueltos con `x` e `y` (`espalda: 'norte'`). Lo que el usuario
   descartó por el camino: pegarlos entre sí, y centrar el conjunto a lo ancho.

5. (usuario) **Tapa lateral de madera en el extremo izquierdo**: un tablón de
   `pino`, **de canto** (saliendo de la pared), 0,02 de grueso, **0,80 de alto**
   (hasta donde empieza la encimera), 0,6 de fondo, justo a la izquierda del
   armario: `ponerTablero` con `ancho: 0.02`, `alto: 0.8`, `fondo: 0.6`, `altura: 0`,
   `posicion` el borde izquierdo del armario menos 0,01. **La encimera va encima
   de la tapa** (usuario: "que quede encima del tablón"): se alarga 2 cm hacia
   la izquierda para cubrirla, 1,36 de ancho en vez de 1,35, de la tapa al
   frigorífico.
   El usuario primero pidió "tapar el armario con un tablón": salió un bloque
   macizo (0,45 × 0,8 × 0,61) que **escondía las puertas** y lo descartó ("la tapa
   al otro lado, la 1, y quita el bloque"). **Un tablero no puede ser una tapa
   fina delante de un mueble**; para cerrar un costado sí vale de canto.

## Pendiente

- Qué tablero tapa "todo" (frentes de los electrodomésticos): por hablar con el
  usuario.
- Su relación con la ventana: queda sobre el fregadero y la vitro, algo a la izquierda
  del centro del conjunto.
- Cocina en L y isla con la mesa de armarios.
- Los códigos de artículo y el criterio de diseño de EuroCasa, que sustituyan a
  los provisionales.
