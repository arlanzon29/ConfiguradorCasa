---
name: crear-casas
description: Montar o cambiar una casa en ConfiguradorCasa llamando a sus funciones (window.eurocasa) en vez de usar la interfaz. Úsala cuando pidan crear una casa, un módulo, estancias, puertas o ventanas, o cambiar su reparto, hablando como lo haría un comercial.
---

# Crear casas en ConfiguradorCasa

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
  suelo ni paredes en 3D (se ve la solera).
- **Solera**: cada módulo se apoya en la suya, que sobresale lo mismo por los
  cuatro lados (0,5 m por defecto) y tiene un grosor (0,2 m por defecto), que
  es la altura del suelo de la casa sobre el terreno. Alrededor, el **terreno**
  de toda la parcela (césped si no se elige otro).
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
| `casa()` | — | Lee la casa: su `nombre`, su `terreno`, `modulos` con su `solera` (`sobresale` y `grosor`) y sus `estancias`, y `huecos`, `muebles`, `mecanismos` (interruptores y enchufes) y `fotos`. Llámala antes de tocar una casa que no has montado tú |
| `nuevoPlano()` | — | Borra todo (también el nombre) y deja un módulo vacío de 13 × 4,2 m |
| `nombrarCasa` | `nombre` | Pone nombre a la casa (sale en el árbol, en el archivo de plano y en los nombres de lo que se descarga). Vacío, vuelve a "Casa". Al montar una casa para un cliente, ponle nombre ("Casa García") |
| `medirModulo` | `{ modulo?, ancho, fondo }` | Sin `modulo`, el primero. Falla si alguna estancia dejaría de caber |
| `cambiarSolera` | `{ modulo?, sobresale?, grosor? }` | En metros. Sin `modulo`, el primero. `sobresale`: de 0 a 3 (lo que sale la solera del módulo por cada lado); `grosor`: de 0,05 a 1, y **sube o baja toda la casa** de ese módulo. Lo que no se diga no cambia. Si hay dos módulos, ponles el mismo grosor salvo que pidan otra cosa: con grosores distintos la casa queda a dos alturas |
| `ponerTerreno` | `{ acabado }` | El suelo de **toda la parcela** alrededor de la casa: un material o un color (como `ponerSuelo`), o `césped` para volver al de siempre. Solo se ve en 3D |
| `crearEstancia` | `{ nombre?, ancho, fondo, x?, y?, modulo? }` | Con `x` e `y`, en ese sitio; sin ellos, en el primer hueco libre |
| `eliminarEstancia` | `{ estancia }` | Se lleva sus huecos y muebles |
| `ponerHueco` | `{ tipo, estancia, lado, con?, posicion?, ancho?, alto?, altura?, abreHacia?, cerrada? }` | `tipo`: `puerta` (0,9 m), `corredera` (2,4 m) o `ventana` (1,2 × 1,2 m a 0,9 m del suelo). `lado`: `norte`, `sur`, `este`, `oeste`. `con`: la estancia vecina, para la pared compartida. `posicion`: metros desde el extremo oeste (lados norte y sur) o norte (lados este y oeste) del lado hasta el **centro** del hueco; sin ella, centrado |
| `cambiarHueco` | `{ hueco, ancho?, alto?, altura?, abreHacia?, posicion?, cerrada? }` | `altura` es la del borde inferior sobre el suelo. `cerrada`: `true` pone la hoja de una puerta abatible **cerrada** en la vista 3D y en la foto (por defecto se ve abierta a 90°, como en el plano, y tapa lo que haya detrás); `false` la abre. Solo una puerta abatible. `abreHacia`: nombre de la estancia hacia la que abre la puerta, o `fuera`. Al cambiar el ancho conserva el centro. `posicion` lo mueve a lo largo de su pared: metros hasta el **centro** del hueco desde el extremo oeste o norte del lado de **su** estancia (la `estancia` y el `lado` que da `casa().huecos`, que en una pared compartida puede ser la vecina; `desde` es ahí su borde inicial). Si no cabe entero ahí, falla y no se mueve |
| `quitarHueco` | `{ hueco }` | Por su id |
| `catalogoMuebles()` | — | Los muebles que hay, con `ancho`, `fondo` (de la espalda al frente) y `alto`. Hoy: `mesa-comedor`, `mesa-centro`, `silla`, `sofa`, `cama-doble` (1,6 × 2 m; la "cama de matrimonio"), `cama-individual`, `mesilla`, `armario`, `armario-medio`, `television` (de pie, 1,2 m), y de la familia cocina `lavavajillas`, `lavavajillas-pequeno` (45 × 60), `lavadora`, `lavadora-pequena` (45 × 60), `horno` (60 × 60 × 82), `mesa-armarios` (120 × 60 × 80, una puerta de 0,5 m en un extremo), `taburete` (35 × 35 × 65), `fregadero` (40 × 45, plano: se apoya sobre la encimera; ponle `altura` = la del tablón), `frigorifico` (2,1 m), `frigorifico-pequeno` (1,8 m), `armario-cocina` (45 × 60 × 82) y `vitroceramica` (4 fuegos, 50 × 50, ya a 0,9 m del suelo) |
| `ponerMueble` | `{ mueble, estancia, pared?, posicion?, x?, y?, espalda?, altura? }` | `mueble`: id o nombre del catálogo. **Contra una pared**: con `pared` (`norte`, `sur`, `este`, `oeste`) va **de espaldas** a ella (cabecero, respaldo, fondo del armario), a ras; `posicion` son los metros desde el extremo oeste o norte del lado hasta el **centro** del mueble (sin ella, centrado; si se sale, se arrima a la esquina). **Suelto**: sin `pared`, su centro va a (`x`, `y`) desde la esquina de arriba a la izquierda de la estancia (sin ellos, al centro de ella), de espaldas a `espalda` (por defecto `norte`). Falla si no cabe o se mete en una pared. `altura`: ver `cambiarMueble` |
| `cambiarMueble` | `{ mueble, altura? }` | Cambia un mueble ya puesto (por su id). `altura`: metros **sobre el suelo** a los que va su base: 0 apoya en el suelo; **0,5 para una tele sobre una mesilla** (la altura de la mesilla). No puede pasar de la altura de pared menos la del mueble. No mueve el mueble de debajo ni lo sigue: si lo cambias de sitio, súbelo tú. `ponerMueble` admite también `altura` |
| `deshacer()` / `rehacer()` | — | Deshace o repite el último cambio de la casa (como Ctrl+Z). Útil si te equivocas montando algo. Los cambios hechos seguidos, en menos de medio segundo, cuentan como un solo paso. No tocan las fotos |
| `ponerTablero` | `{ estancia, lado, ancho, alto, fondo, posicion?, altura?, acabado? }` | Un tablero (una caja anclada a la cara **interior** de la pared de ese `lado`). `ancho` es a lo largo de la pared, `alto` en vertical y `fondo` lo que sale de ella; **el grueso es la menor de las tres**. **Encimera**: `ancho` lo que cubra, `alto` 0,04, `fondo` 0,6, `altura` la de lo que haya debajo (0,82 sobre un lavavajillas), `acabado: 'gris-perla'` (granito) o `pino`. `posicion`: metros desde el extremo oeste (norte y sur) o norte (este y oeste) del lado hasta su **centro**; sin ella, centrado. `altura`: del suelo a su borde **inferior**. Una vitrocerámica o un fregadero encima: `ponerMueble` con `altura` = la de la cara superior de la encimera. Los tableros no admiten agujeros |
| `quitarTablero` | `{ tablero }` | Por su id (los da `casa().tableros`) |
| `quitarMueble` | `{ mueble }` | Por su id (los da `casa().muebles`) |
| `catalogoMecanismos()` | — | Los interruptores y enchufes que hay, con `ancho` y la `altura` a la que se ponen (al centro): `interruptor`, `interruptor-doble`, `conmutador` (1,1 m) y `enchufe`, `enchufe-doble` (0,3 m). Placas de 8 cm (la doble, 16) |
| `ponerMecanismo` | `{ tipo, estancia, lado, posicion?, altura? }` | Un interruptor o enchufe en la cara **interior** de la pared de ese `lado` de la estancia (en una compartida, su cara; la de la otra estancia se pide con la otra estancia). `posicion`: metros desde el extremo oeste (norte y sur) o norte (este y oeste) del lado hasta el **centro** de la placa; sin ella, centrado. `altura`: metros del suelo al **centro**; sin ella, la del catálogo. **Solo se ve: no enciende nada.** No impide pisar un hueco ni otra pieza: míralo tú (el interruptor junto a la puerta, a un lado, del lado de la manilla; el enchufe no detrás de un mueble) |
| `quitarMecanismo` | `{ mecanismo }` | Por su id (los da `casa().mecanismos`) |
| `catalogoAcabados()` | — | `materiales` (con textura; hoy solo `pino`, "Madera de pino") y `colores` de la paleta (Blanco roto, Blanco, Gris perla, Arena, Salvia, Azul grisáceo, Terracota, Antracita). Si preguntan qué opciones hay, léelas de aquí y cuéntalas |
| `ponerSuelo` | `{ estancia, acabado, girado? }` | `acabado`: nombre o id de un material o color del catálogo, un color `#rrggbb`, o `sin acabado`. `girado`: la veta girada 90°. El suelo es por estancia; `casa()` da el `suelo` de cada una |
| `pintarParedes` | `{ estancia, acabado, lado? }` | Las caras **interiores** de las paredes de esa estancia, con un color o un material (igual que en `ponerSuelo`, salvo `sin acabado`). Con `lado`, solo esa pared; sin él, las cuatro, y se pierden los colores propios que tuviera alguna. Una pared compartida tiene dos caras: pintar el salón no cambia la cara que da a la habitación. `casa()` da las `paredes` de cada estancia |
| `llevarCamara` | `{ estancia, mirando?, desde? }` | Lleva la cámara de la vista 3D a esa estancia, de pie (ojos a 1,6 m sobre el suelo de la estancia). Con `desde` (`noroeste`, `noreste`, `suroeste`, `sureste`) se pone en esa **esquina** y mira en diagonal al centro: es la vista que mejor enseña una estancia. Con `mirando` (`norte`, `sur`, `este`, `oeste`), centrada en la pared contraria y mirando recto. **Sin nada, va a la vista de la última foto guardada de esa estancia** (con su objetivo; devuelve `foto` con su número) y, si no hay ninguna, mira recto a lo largo del lado más largo. Una foto es de la estancia a la que mira la cámara, aunque esté sacada desde el umbral de la puerta; `casa().fotos` dice de cuál es cada una. La cámara vuela, tarda algo más de un segundo: espera antes de capturar. Úsala para enseñar o comprobar a la vista lo que has cambiado en una estancia |
| `hacerFoto` | `{ muestras? }` | Empieza una **foto en calidad** de lo que ve la cámara (llévala antes con `llevarCamara`). `muestras`: 50, 100 o 200; sin decirlo, las que estén elegidas. Hace falta la vista 3D a la vista ("Vista 3D", "Plano + 3D" o la ventana `?vista=3d`). La primera foto tarda alrededor de un minuto en arrancar. **No la guarda**: al terminar, la página pregunta "¿Guardar la foto?" y lo decide quien la mira |
| `verFoto` | `{ foto?, estancia? }` | Abre el **visor** con una foto guardada: la de ese número (como en `casa().fotos`) o la última de esa estancia. El visor tiene Anterior, Siguiente, Descargar y Cerrar. Si piden "la foto" de una estancia, es esto. El archivo no se puede sacar de la página desde aquí: para tenerlo, el botón "Descargar" del visor |
| `descargarGlb` | `{ enviarA? }` | Con `enviarA`, en vez de descargar manda el GLB por POST a esa dirección (el receptor de Blender, ver "Pasar la casa a Blender"); devuelve una promesa. Sin nada: descarga la casa como `configuradorcasa-<nombre de la casa>-<fecha>.glb` (lo mismo que el botón "Descargar GLB" de la vista 3D), para abrirla en Blender o Unity. Hace falta la vista 3D a la vista. El archivo cae en la carpeta de descargas del navegador; los focos van como discos emisivos, sin luz |
| `cambiarImagenFoto` | `{ foto, imagen }` | Sustituye la **imagen** de la foto guardada número `foto` por otra, normalmente un render de Blender hecho desde su misma cámara. `imagen` es una dirección que la página pueda leer: un `data:` o una ruta del propio servidor (en local, copia el archivo a `public/` un momento, pásale `'/<nombre>.png'` y bórralo después). Se guarda en JPEG al 92 %; conserva número, cámara y objetivo. **No se deshace**: la imagen anterior se pierde, así que confírmalo antes con quien la pide |

**Pasar la casa a Blender** ("pasa la casa a Blender"; solo en el equipo del
usuario, con Blender abierto y "Start MCP Server" pulsado):

0. **Con la web publicada, lo acordado con el usuario:** él descarga el GLB
   y dice el nombre del archivo; pon esa ruta en `GLB` de `blender_casa.py` y
   sigue en el paso 2. El envío directo queda para `localhost`.
1. **Directo, sin pantalla de descarga:** manda a Blender
   `blender_receptor.py` (junto a esta skill; abre un receptor de un solo uso
   en `http://localhost:8765`) y, en la web con la vista 3D a la vista,
   `await descargarGlb({ enviarA: 'http://localhost:8765' })`, que devuelve
   `{ glb: 'enviado', kb }`. Probado desde `localhost:5173`. **Desde la web
   publicada (HTTPS) el navegador de la app lo bloquea**
   (`ERR_BLOCKED_BY_CLIENT`); en Chrome puede pedir permiso de "red local" la
   primera vez, sin probar. Si falla, usa la descarga: `descargarGlb()` sin
   nada deja el archivo en Descargas (el usuario acepta la pantalla de
   descarga) y `blender_casa.py` lo encuentra solo; antes borra el
   `eurocasa-casa.glb` de la carpeta temporal para que no coja uno viejo.
2. Lee `casa().fotos`.
3. Abre `blender_casa.py` (junto a esta skill) **como UTF-8** (en
   PowerShell, `Get-Content -Raw -Encoding utf8`, y escribir sin BOM: si no,
   la "í" de "Carpintería" llega rota y no reconoce las ventanas),
   sustituye `FOTOS = []` por
   esas fotos (JSON tal cual) y, si hace falta, `GLB` por la ruta; mándalo
   entero con `execute_blender_code`. Quita la casa anterior (colección "Casa
   ConfiguradorCasa", "Paisaje" y lo marcado con `eurocasa`), importa el GLB, pone
   Cycles en GPU (CUDA), cielo y sol, techo, una luz por foco, la
   carpintería mejorada (cristal de verdad que deja pasar el sol, cantos
   suavizados, manillas de metal; reconoce las piezas por su nombre
   "Carpintería <rol>"), el paisaje (`PAISAJE = True`: césped hasta el
   horizonte, 70 árboles y 40 arbustos fuera de la parcela) y una cámara por
   foto.
   Devuelve un resumen; mira el resultado con `look` (`mode: camera`).
4. Si piden render: cámara activa (`scene.camera`) y su `resolucion`,
   `render.render(write_still=True)` a un archivo. Para que el usuario vea
   el avance, `bpy.ops.render.render('INVOKE_DEFAULT', write_still=True)`,
   que abre la ventana de render (puede quedar detrás de la de Blender).
5. Para subirlo a la web: `cambiarImagenFoto` (abajo), con permiso.

**localhost o GitHub Pages: qué se puede hacer en cada una con Blender**
(2026-10-17). El navegador no deja que una página de internet hable con
programas del equipo (el receptor de Blender, el servidor local) ni lea sus
archivos; con la web en `localhost` esa barrera no existe.

| | localhost | GitHub Pages |
|---|---|---|
| Funciones de la casa, cámaras de las fotos | sí | sí |
| GLB directo a Blender (`enviarA`) | sí, sin pantalla | no: el usuario acepta la descarga y dice el archivo |
| Meter un render en una foto | sí, `cambiarImagenFoto` | no: el usuario, con "Subir imagen" |

Para trabajar con Blender, mejor `localhost`; un comercial o un cliente usa
GitHub Pages y no tiene Blender. En el Chrome del usuario quizá funcione
desde GitHub Pages aceptando un permiso de "red local"; sin probar.

**Blender o la web** (opinión del usuario, 2026-10-17): Blender es muy
superior en el render (luz del sol, sombras, telas; unos 16 s por foto en
la GPU frente a más de un minuto la primera vez en la web), y la web es muy
buena para lo que es. **Se deja como está**: no se intenta igualar la web a
Blender. Los muebles detallados (`model` en el catálogo, botón
"Sencillos / Detallados" de la vista 3D) se ven en las dos; hoy **todos los muebles del catálogo** (22; la lista, en
`modelos-blender/LEEME.md`). Un mueble nuevo del catálogo nace en cajas
hasta que se le haga su modelo.

**Colores por partes de un mueble** (prueba con el sofá, 2026-10-17): el
catálogo dice qué se puede cambiar de cada mueble y entre qué opciones
(`parts` en `furniture.ts`; `catalogoMuebles()` lo devuelve en `colores`).
Lo que no está ahí no se cambia. Sofá: `tapiceria` (azul, blanco, rosa),
`cojin-izquierdo` y `cojin-derecho` (blanco, azul, rojo); izquierdo y derecho
mirándolo de frente. Taburete: `asiento` (blanco, rojo, azul, rosa). Se cambia con
`cambiarMueble({ mueble: id, colores: { 'cojin-izquierdo': 'rojo' } })`, que
rechaza lo que no se puede o no está en la lista; `casa().muebles` da los
`colores` de cada uno. Es de ese mueble de esa casa y viaja en el plano.
Las partes con `boxColor` tiñen también las cajas de "Sencillos" (la
tapicería del sofá, el asiento del taburete); las demás (los cojines) solo
se ven con "Detallados" y en Blender (llegan pintadas en el GLB). Cada parte es un material del
modelo por su nombre en Blender: para un mueble nuevo, darle en el `.blend`
un material propio a cada parte que se quiera poder cambiar.

**Regla del usuario: se guarda siempre el `.blend`** de cada modelo que se
haga en Blender, por si hay que retocarlo: el original en
`modelos-blender/<mueble>.blend` (solo su escena, con
`bpy.data.libraries.write`) y el `.glb` en `public/modelos/`, en el mismo
cambio, más su línea en la tabla de `modelos-blender/LEEME.md`.

**Renderizar las fotos de la web con Blender, de principio a fin** (probado
por el usuario en GitHub Pages el 2026-10-17, "funciona"):

1. Lee `casa().fotos` (cámaras) y pide el GLB: `descargarGlb()` con la vista
   3D a la vista; el usuario acepta la descarga y dice el nombre.
2. `blender_casa.py` con `GLB` y `FOTOS` rellenos (pasos de arriba).
3. Por cada foto: `scene.camera` a "Foto N …", resolución de su
   `resolucion`, 100 muestras en GPU (unos 20-30 s cada una), guardar en
   **JPEG** directamente en Descargas como `<nombre-del-glb>_fotoN.jpg`
   (la casa no tiene nombre propio). Enséñaselas al usuario antes de nada.
4. **En GitHub Pages la página no puede leer archivos del equipo**
   (`cambiarImagenFoto` con una ruta local falla, y el portapapeles simulado
   tampoco llega): el usuario las sube él: en el árbol, despliega "Fotos" →
   pincha "Foto N" → **"Subir imagen"** en Propiedades → el `_fotoN.jpg` que le corresponde. La foto
   conserva número, cámara y objetivo; la imagen anterior se pierde.
5. En `localhost` puedes subirlas tú con `cambiarImagenFoto` (copiando el
   archivo un momento a `public/` y borrándolo después).

**Copiar la cámara de una foto en Blender** (`casa().fotos[i]`, con `x`, `y` y
`camara`): en Blender, posición `(x, −y, camara.altura)`, giro en grados
`(90° + cabeceo, 0, giro)` (pasando cabeceo y giro de radianes a grados),
`sensor_fit` vertical con ángulo `camara.objetivo` y resolución
`camara.ancho × camara.alto`. Así coincide con el GLB de `descargarGlb`
importado tal cual. Render en GPU con CUDA (OptiX falla en el equipo del
usuario).

Los muebles **no chocan** entre sí ni con las puertas: comprueba tú, con las
medidas del catálogo y las posiciones de `casa()`, que no se pisan ni tapan
una puerta.

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
crearla otra vez, y se pierden sus huecos y muebles), canto de las bisagras, segundo módulo, mover o girar un mueble ya puesto
(hoy: quitarlo y ponerlo otra vez), luces, acabados de techo y carpintería, rodapié, guardar una foto o elegir su
filtro y objetivo. Suelos y paredes solo
se ven en la vista 3D y en la foto, no en el plano.

## Códigos de artículo

Cada elemento de catálogo lleva un `codigo` (campo `code` en el código), para
asociarlo a la base de costes de `comercial/`, que **la web no conoce**. Salen
en `catalogoMuebles`, `catalogoAcabados`, `catalogoMecanismos` y, por
instancia, en `casa().muebles`, `casa().huecos` y `casa().mecanismos`. Lo que
no es catálogo (módulo, solera, terreno, paredes, rodapié, techo, focos, tablero, espejo) tiene su código en `src/model/articles.ts`. **Todos son
inventados por Claude**, a falta de los de la empresa: no los des por reales.

## Casas guardadas: la carpeta `comercial/`

Las casas de los comerciales son archivos de plano `.json` en `comercial/` (en
la raíz del proyecto, **fuera de git**: no se sube a GitHub). La página no lee
el disco; el puente eres tú:

| Función | Parámetros | Notas |
|---|---|---|
| `bajarCasa` | `{ fotos? }` | Devuelve el **texto** del plano, el mismo que "Guardar plano". Sin fotos por defecto (pesan ~300 KB cada una) |
| `subirCasa` | `texto` | Sustituye la casa (y sus fotos) por la del texto. Devuelve `casa()` o `{ error }` si no es un plano. **Borra la casa actual**: confirma antes si hay algo que perder |

- **Guardar**: `JSON.stringify(await window.eurocasa.bajarCasa())` en la
  página y escribe ese texto en `comercial/<nombre>.json` con Write.
- **Guardar con fotos** (`{ fotos: true }`): el texto pesa ~0,5 MB por foto,
  demasiado para escribirlo tú. Levanta un receptor de un solo uso en
  segundo plano (un `http.createServer` de Node en el scratchpad, con CORS,
  que escriba el cuerpo del POST en el archivo y se cierre) y haz desde la
  página `fetch('http://127.0.0.1:<puerto>/', { method: 'POST', body: texto })`.
  Comprueba después el archivo (JSON válido y número de fotos).
- **Lo que hay en el navegador es lo bueno** (decisión del usuario,
  2026-10-12): al guardar, no compares con el archivo anterior ni restaures
  nada de él, fotos incluidas; el usuario puede haber repetido una foto o
  cambiado la casa por la interfaz. Antes de sobrescribir, guarda una copia del
  archivo previo en el scratchpad, por si piden volver atrás.
- **Por defecto, guarda con fotos** si la casa las tiene (decisión del
  usuario, 2026-10-12), salvo que pida lo contrario.
- **Abrir con fotos**: tampoco lo pases por la conversación. Sirve el archivo
  con un servidor de Node de un solo uso (GET, con CORS) y en la página:
  `window.eurocasa.subirCasa(await (await fetch('http://127.0.0.1:<puerto>/')).text())`.
- **Abrir**: lee el archivo con Read y pásalo a la página:
  `window.eurocasa.subirCasa(<texto del archivo como cadena JSON>)`.
- **Listar**: mira qué hay en `comercial/` con Glob. Nombra los archivos con
  letras minúsculas y guiones (`casa-garcia.json`).

## Mandar la casa a otro navegador (las Quest): por una dirección

Dos piezas que no se conocen (decisión del usuario, 2026-10-17):

- **La web** abre una casa desde cualquier dirección:
  `https://arlanzon29.github.io/ConfiguradorCasa/?url=<dirección del .json>`.
  Arranca en la vista 3D, carga la casa (la primera vez pregunta si sustituye
  la que hubiera en ese navegador, salvo que viniera de esa misma dirección) y
  enseña **"Recargar casa"** en la barra de las vistas. En la VR recarga **A o
  X**; en la maqueta AR, **pulsar un stick**. No mira sola si ha cambiado (el
  usuario lo prefiere a mano). Recargar machaca lo tocado en ese navegador.
- **Tú** subes el `.json` a una plataforma y das la dirección. Hoy es
  **Supabase**, con `subir_casa.mjs` (junto a esta skill):

  1. Consigue el plano: de `comercial/`, o de la página con
     `JSON.stringify(await window.eurocasa.bajarCasa())`, escrito con Write en
     el scratchpad. **Sin fotos** (en las gafas no hacen falta; ~10 KB).
  2. `node .claude/skills/crear-casas/subir_casa.mjs <plano.json> [nombre] [qr.png]`.
     Nombre por defecto `demo`: con el mismo nombre se sobrescribe y la
     dirección no cambia, así que las gafas solo tienen que pulsar "Recargar
     casa". Para la casa de un cliente real, un nombre al azar (que no se
     pueda adivinar: quien tenga la dirección la ve).
  3. Devuelve `archivo`, `web` (la dirección para abrir), `qr` (PNG con `web`
     dentro), `seLeeIgual` y `cors`. Si `seLeeIgual` es `false` o `cors` no
     trae `*` o el origen de la web, la web no podrá leerlo: dilo.
  4. Da al usuario la dirección `web` y enséñale el QR (SendUserFile). La
     dirección del `archivo` también se puede pegar en la web, en **"Cargar
     URL" → "Mis casas"**, donde queda apuntada (y se apunta sola al abrir la
     casa con `web`). Las dos casas de ejemplo están en `public/EjemplosCasa/`.

- La conexión está en `supabase.local.json`, en la raíz y **fuera de git**:
  `{ "url": "https://xxxx.supabase.co", "clave": "<secreta>", "bucket": "configuradorcasa" }`.
  La clave secreta (`service_role` o `sb_secret_…`) **nunca** va a la web, a
  la conversación ni al repositorio. El bucket es público: leer es libre,
  subir solo con la clave. Si no existe el archivo, pídeselo al usuario.
- **El proyecto de Supabase es el de SuiteFamilia** (`D:\IA\SuiteFamilia`;
  decisión del usuario, 2026-10-18), con su propio bucket `configuradorcasa`.
  La clave secreta es la de **todo** ese proyecto: no toques nada fuera de
  ese bucket.
- **El QR en las Quest**: el sistema no lo lee; hace falta una app de la
  tienda (p. ej. "QR Scanner VR"). Si no la tiene, que guarde la dirección en
  favoritos de las gafas una vez y luego solo recargue.
- **Plan gratuito de Supabase**: el proyecto se pausa tras 7 días sin
  actividad y la dirección deja de responder hasta reactivarlo desde su panel.
  Si la subida falla sin motivo claro, sospecha eso.
- Para cambiar de plataforma basta otro guion que suba y dé una dirección que
  se lea desde otra web (CORS); la web no cambia.

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
la empresa. Cuando el usuario dé una regla suya, sustituye a la de aquí.

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
- La cama, con el cabecero contra una pared sin ventana ni puerta si la hay,
  y con paso a los dos lados si es doble (unos 0,6 m por lado).
- Sillas alrededor de una mesa: el respaldo mira **hacia fuera** de la mesa
  (la silla del lado norte lleva `espalda: 'norte'`) y van **metidas bajo la
  mesa** (lo pidió el usuario el 2026-10-12): su centro 0,15 m por dentro del
  canto, de modo que solo asoma el respaldo. En la mesa de comedor
  (1,6 × 0,9 m), cuatro sillas van dos a cada lado largo, a ±0,4 m del centro
  a lo largo y a ±0,3 m a lo ancho.
- Interruptores y enchufes (provisional, criterio de Claude): el interruptor
  junto a la puerta, por el lado de la manilla y a 0,1–0,2 m del cerco, dentro
  de la estancia; un enchufe por pared libre como mínimo, y junto a la cama
  uno a cada lado (en el cabecero, sobre la mesilla). Antes de ponerlos,
  mira dónde caen los huecos y los muebles de `casa()`.
- Una puerta abatible barre un cuarto de círculo de su ancho hacia donde
  abre: no pongas muebles ahí.
- "Vamos a la habitación", "vuelve al baño": `llevarCamara` **sin `mirando`
  ni `desde`**, para que use la vista de la foto guardada si la hay (lo pidió
  el usuario el 2026-10-12: esa vista la ha elegido él).
- Para **enseñar una estancia** que no tiene foto (o antes de sacar la
  primera), la cámara va a una esquina (`desde`), no centrada en una pared: en una estancia pequeña la
  vista recta enseña sobre todo pared. Elige la esquina **más lejana del
  mueble más alto** (un armario pegado a la cámara tapa media imagen) y, si
  puede ser, la contraria a la puerta, para que se vea la entrada. Mira la
  captura antes de darla por buena y, si no se entiende la estancia, prueba
  otra esquina.
- Antes de decir que un mueble cabe, mira las cuatro paredes: qué tramo queda
  libre de puertas, ventanas y otros muebles. Si casi cabe, piensa si correr
  una puerta lo arregla, y proponlo.
- Si no se sabe cuál es la fachada principal, pregunta; no la supongas.
