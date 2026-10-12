---
name: crear-casas
description: Montar o cambiar una casa en el Configurador EuroCasa llamando a sus funciones (window.eurocasa) en vez de usar la interfaz. Úsala cuando pidan crear una casa, un módulo, estancias, puertas o ventanas, o cambiar su reparto, hablando como lo haría un comercial.
---

# Crear casas en el Configurador EuroCasa

El comercial describe la casa con sus palabras y tú la montas llamando a las
funciones de la aplicación. Esta skill va creciendo a la vez que las funciones:
si añades o cambias una en `src/api.ts`, actualiza este documento en el mismo
cambio.

## Dónde se trabaja

- La aplicación tiene que estar abierta en el navegador integrado. Las
  funciones están en `window.eurocasa` y se llaman ejecutando JavaScript en la
  página.
- Por defecto, en el **servidor de pruebas** (`pruebas`, `localhost:5183`). El
  plano del usuario vive en `localhost:5173`: ahí solo con su permiso.
- `nuevoPlano()` borra el plano y sus fotos y no se puede deshacer: confirma
  antes si hay algo que perder.
- Tras cambiar `src/api.ts` hay que recargar la página; el plano se conserva.

## La casa, en dos líneas

- **Módulo de fábrica**: el contorno. Máximo 13 × 4,2 m, hasta 2 por casa.
- **Estancia**: un rectángulo dentro de un módulo. No puede salirse ni pisar a
  otra. Las **paredes no se crean**: salen solas de los bordes de las
  estancias; donde dos se tocan hay una sola pared compartida.
- Medidas en **metros**, en múltiplos de **0,2 m** (la rejilla) para módulos y
  estancias. `x` hacia la derecha (este), `y` hacia abajo (sur); norte es
  arriba. La posición de una estancia se da desde la esquina de arriba a la
  izquierda de su módulo.
- Las estancias deben **llenar el módulo**: lo que queda sin estancia no tiene
  suelo ni paredes en 3D.
- Grosor de pared: 0,15 m las exteriores, 0,10 m las compartidas (0,05 m a
  cada lado). Descuéntalo al juzgar si una estancia es habitable: una de
  1,6 m de fondo entre fachada y tabique deja 1,4 m libres.

## Funciones

Todas devuelven lo creado (o la casa entera) y, si no se puede, `{ error }` con
el motivo en español. **Mira siempre el resultado**: un error no cambia nada.
Módulos y estancias se nombran por su nombre (sin distinguir mayúsculas) o por
su id; los huecos, por su id.

| Función | Parámetros | Notas |
|---|---|---|
| `casa()` | — | Lee la casa: `modulos` con sus `estancias`, y `huecos`. Llámala antes de tocar una casa que no has montado tú |
| `nuevoPlano()` | — | Borra todo y deja un módulo vacío de 13 × 4,2 m |
| `medirModulo` | `{ modulo?, ancho, fondo }` | Sin `modulo`, el primero. Falla si alguna estancia dejaría de caber |
| `crearEstancia` | `{ nombre?, ancho, fondo, x?, y?, modulo? }` | Con `x` e `y`, en ese sitio; sin ellos, en el primer hueco libre |
| `eliminarEstancia` | `{ estancia }` | Se lleva sus huecos y muebles |
| `ponerHueco` | `{ tipo, estancia, lado, con?, posicion?, ancho?, alto?, altura?, abreHacia? }` | `tipo`: `puerta` (0,9 m), `corredera` (2,4 m) o `ventana` (1,2 × 1,2 m a 0,9 m del suelo). `lado`: `norte`, `sur`, `este`, `oeste`. `con`: la estancia vecina, para la pared compartida. `posicion`: metros desde el extremo oeste (lados norte y sur) o norte (lados este y oeste) del lado hasta el **centro** del hueco; sin ella, centrado |
| `cambiarHueco` | `{ hueco, ancho?, alto?, altura?, abreHacia? }` | `altura` es la del borde inferior sobre el suelo. `abreHacia`: nombre de la estancia hacia la que abre la puerta, o `fuera`. Al cambiar el ancho conserva el centro |

Un hueco necesita 0,2 m libres hasta cada extremo de su pared y no puede pisar
a otro. Alto de pared: 2,7 m.

Ejemplo, una casa de 10 × 4 m:

```js
const e = window.eurocasa
e.nuevoPlano()
e.medirModulo({ ancho: 10, fondo: 4 })
e.crearEstancia({ nombre: 'Salón', ancho: 6, fondo: 4, x: 0, y: 0 })
e.crearEstancia({ nombre: 'Habitación', ancho: 4, fondo: 4, x: 6, y: 0 })
e.ponerHueco({ tipo: 'puerta', estancia: 'Salón', lado: 'este', con: 'Habitación', abreHacia: 'Habitación' })
e.ponerHueco({ tipo: 'ventana', estancia: 'Habitación', lado: 'norte' })
```

**Lo que todavía no tiene función** (se hace por la interfaz, o se prepara la
función antes): mover o cambiar de medida una estancia (hoy: eliminarla y
crearla otra vez, y se pierden sus huecos), quitar o mover un hueco, canto de
las bisagras, segundo módulo, muebles, luces, acabados, fotos.

## Cómo trabajar con el comercial

- **Si la petición tiene más de una lectura, pregunta antes de montar.** "La
  habitación y el baño a la derecha" tuvo tres (en fila, tipo suite, uno
  encima de otro) y hubo que rehacer la casa tres veces. Ofrece las opciones
  en una línea cada una y deja elegir.
- **No añadas estancias que no te han pedido** (un distribuidor, un
  lavadero). Si crees que hace falta, proponlo y espera.
- **Di siempre qué has decidido tú**: medidas, reparto, fachada de la
  entrada. Al terminar, una tabla con cada estancia, sus medidas y su
  superficie, y lo que conviene mirar.
- Monta primero las estancias, enséñalas y, con el reparto aceptado, pon
  puertas y ventanas.

## Criterio de diseño

**Provisional**: es criterio general puesto por Claude, a falta del de
EuroCasa. Cuando el usuario dé una regla suya, sustituye a la de aquí.

- Cada estancia, con **fachada** para una ventana, y con **puerta** a una
  estancia común (salón o distribuidor).
- Al baño no se entra por un dormitorio ni a un dormitorio por el baño, salvo
  que lo pidan (suite).
- Las puertas de dormitorios y baños **abren hacia el salón** (o la estancia
  común a la que dan): así lo quiso el usuario el 2026-10-12, en contra de lo
  que puse yo (hacia dentro de su estancia). La de entrada, hacia dentro de la
  casa. Una puerta recién puesta abre hacia la estancia nombrada en
  `estancia`; con `abreHacia` se dice otra cosa.
- Ventana de baño: pequeña y alta (0,6 × 0,6 m a 1,5 m del suelo).
- Medidas orientativas, exteriores: dormitorio doble desde 10 m² con lado
  menor de 2,6 m; individual desde 6 m²; baño de 3 a 6 m² con lado menor de
  1,6 m; salón con cocina desde 18 m².
- Si no se sabe cuál es la fachada principal, pregunta; no la supongas.
