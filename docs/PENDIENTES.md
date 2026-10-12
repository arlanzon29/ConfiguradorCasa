# Temas pendientes

Cosas que el usuario quiere tratar más adelante. Aquí solo se apuntan: nada de esto
está decidido ni empezado. Lo más reciente, arriba.

## Anotado el 2026-10-10

### 18. Rehacer la interfaz: árbol de la casa

- **Idea del usuario (2026-10-11):** a la interfaz hay que darle una vuelta,
  porque cuesta encontrar dónde están las cosas. Propuso la jerarquía de Unity
  a la izquierda. Decidió: fácil antes que flexible, cada pared cuelga de una
  sola estancia, los muebles son de una estancia, y rehacerlo ya.
- Lo usará un comercial con el cliente; estaría bien que el cliente pudiera solo.
- **Hecho el 2026-10-11, paso 1:** árbol a la izquierda, Propiedades siempre a
  la derecha, sin pestañas.
- **Hecho después, el mismo día:** carpetas Paredes, Mobiliario y Luces en cada
  estancia; padre explícito y `.json` anidado como el árbol; Propiedades solo
  de lo elegido; nombre editable en todo; foco por defecto en cada estancia.
- También el mismo día: "+" en el árbol; huecos, vinilos, espejos y tableros
  como líneas bajo su pared, y luego cada clase en su carpeta dentro de la
  pared (Puertas, Ventanas, Vinilos, Espejos, Tableros), cada una con su "+".
- **Falta:** elegir vinilos, espejos y tableros pinchando en el plano, y probar
  todo con el ratón sobre un plano real.

### 17. Más geometría: primitivas (tableros)

- **Idea del usuario (2026-10-11):** colocar más geometría, por ejemplo el
  cabecero de la cama. Empezar por primitivas, la primera un tablero anclado a
  una pared, en una pestaña propia ("Piezas") y poco a poco.
- **Aviso del usuario:** no quiere convertir el programa en uno de modelado 3D.
- **Hecho el 2026-10-11:** tablero con posición, ancho, alto, fondo, acabado y
  tres posturas (contra la pared, de canto, balda). El usuario lo probó y dijo
  "vamos bien".
- Hablado y sin decidir: que el cliente elija piezas hechas (cabecero, balda,
  friso) con dos o tres opciones cada una en vez de cajas libres; un botón "de
  pared a pared"; mudar los espejos a Piezas; tableros sueltos en la estancia;
  moverlos arrastrando en el plano.

### 16. Puertas y ventanas

- **Hecho el 2026-10-10:** cerco, tapajuntas, hoja y manilla en las puertas,
  hacia dónde abren y desde qué canto giran, y el **acabado** de la carpintería
  (color o material como un mismo concepto).
- **Hecho el 2026-10-12:** ese mismo acabado en suelos (ahora también color
  liso) y paredes (ahora también material).
- **Descartado por el usuario (2026-10-12):** hacia dónde desliza la corredera,
  hojas y apertura de las ventanas, persiana y más tipos en el catálogo. Tema
  cerrado.

### 15. Repetir una foto

- **Idea del usuario:** que se pueda repetir una foto.
- Ahora cada foto guarda la posición, el giro y el objetivo de la cámara, y desde
  la pestaña Fotos la cámara vuela hasta allí; pero para sacarla otra vez hay que
  pulsar "Foto en calidad" y guardarla a mano, y queda como una foto nueva.
- Interpretación mía, por confirmar: un botón "Repetir" en cada foto que vuelva a
  trazarla desde el mismo sitio y con el mismo objetivo, para actualizarla cuando
  la casa ha cambiado (muebles, acabados).
- **Hecho el 2026-10-10.** Decidido por el usuario: la nueva **sustituye** a la
  anterior (mismo sitio y número en la lista) y se repite **foto a foto**, sin
  "repetir todas". Botón "Repetir" en la foto seleccionada del panel Fotos.

### 1. Ruido en la foto en calidad

El trazado de rayos deja grano en la imagen.

- **Pregunta del usuario:** ¿se puede aplicar un filtro posterior que quite el ruido
  sin perder calidad?
- El usuario no quiere perder lo que ha calculado el trazado. Caminos hablados:
  más muestras, un filtro guiado por la geometría, y un denoiser por IA (OIDN).
  Los módulos de IA de las gráficas NVIDIA (DLSS, OptiX) no se alcanzan desde el
  navegador.
- **Prueba del 2026-10-11** (pedida por el usuario), en `docs/pruebas/ruido/`:
  la misma vista a 200 muestras en cuatro versiones y un recorte ampliado
  (`comparacion-detalle.jpg`). Grano medido en la pared (0 = liso): ahora 7,4;
  con el filtro 0,2.
  - **Filtro guiado por la geometría** (`denoise.ts`, guardado junto a las
    imágenes, fuera de la aplicación): quita el grano de paredes, techo y
    muebles, conserva las vetas del suelo y la sombra de la mesa, y tarda menos
    de un segundo. Defecto visto: los bordes quedan **en escalera** (se pierde
    el suavizado de contornos) y en algún canto queda una fila de puntos sin
    filtrar. Habría que arreglarlo antes de darlo por bueno.
  - **Ajuste en origen** (panel de luz de 1,8 m en vez de 0,6 y
    `filterGlossyFactor` 0,5): **no mejora**; en la pared el grano sube a 10,0.
    Era una suposición mía y la prueba la desmiente.
  - Sin probar: más muestras, el denoiser por IA, una escena con espejos o
    brillos, y el sol entrando de lleno en el suelo.
- **Hecho el 2026-10-11.** El usuario eligió el filtro guiado por la geometría,
  aplicado después de trazar, con "Sin filtro / Con filtro" y guardando solo la
  elegida; y pidió poder escoger 50, 100 o 200 muestras. Los bordes en escalera
  están corregidos. **Probado y dado por bueno por el usuario.** Queda por ver, si hiciera falta: el denoiser por IA y cómo
  se porta el filtro con brillos, espejos y sol directo.

### 2. Iluminación

- **Idea del usuario:** hay que hacer una manera de poner la iluminación.
- Ahora la foto usa una luz provisional que no se elige: un panel de 0,6 m en el
  centro del techo de cada estancia, más el sol y el cielo.
- Hablado el 2026-10-11: tres tipos (luz de techo, tira de luz, lámpara como
  mueble que alumbra), la luz de fuera (dirección del sol y hora) y los
  interruptores (tema 7). El usuario pidió **empezar por las luces de la
  estancia**.
- **Hecho el 2026-10-11:** foco de techo con nombre, posición ("Centrar en la
  estancia"), potencia, tono y color de emisión. Está en la carpeta "Luces" de
  su estancia en el árbol (la pestaña Luces duró unas horas). Cada estancia
  nueva nace con uno, y las de planos anteriores lo reciben al abrirse.
- **Decidido por el usuario:** fuera las luces provisionales del techo; el sol
  se queda.
- Queda por hablar: tiras, lámparas, sol y hora, encender y apagar, si la
  vista normal debe alumbrar, y más tipos de luz de techo (plafón, panel).
  Sin ver todavía: una foto en calidad con los focos nuevos sobre un plano
  real, para ajustar cuánto alumbra el 100 %.

### 14. Lo que el usuario echa en falta al comparar su foto con la real

Dicho por el usuario al comparar la foto del configurador con la del dormitorio de
matrimonio (leído como "nos falta…"):

- **Rodapié.** **Hecho el 2026-10-10**: por pared, con alto en centímetros y
  color (por defecto 7 cm y blanco), en el panel Propiedades del modo Paredes.
- **La madera detrás de la cama.** El panel de madera a media altura, de pared a
  pared, que hace de cabecero. Podría salir como revestimiento de un tramo de
  pared hasta cierta altura, o como pieza de pared (ver tema 5).
- **Las ventanas hay que mejorarlas.** Ahora son un hueco con un cristal plano.
  Faltan marco, hojas, y lo que se ve detrás (tema 3); en las fotos de exterior,
  además, cajón de persiana.

### Dónde estamos: foto hecha con el configurador

El usuario generó una foto en calidad de un dormitorio de su plano
(`fotos/configurador-dormitorio-2026-10-10.webp`). Sirve de punto de partida para
comparar con las fotos reales. Frente a ellas:

- **Valoración del usuario:** la sensación es parecida a la de la foto real del
  dormitorio de matrimonio: foto con gran angular, habitación pequeña.
- Ya está: proporciones de habitación estrecha, luz suave con sombras de contacto,
  suelo de madera con textura, color de pared, techo.
- Se nota el grano del trazado en paredes y techo (tema 1).
- La ventana es un rectángulo blanco plano: sin paisaje (tema 3), sin marco, hojas
  ni persiana.
- Los muebles son cajas: sin colchón redondeado, ropa de cama, cojines ni tiradores.
- No hay rodapié, ni interruptores (tema 7), ni nada en las paredes (temas 5, 6, 8).
- La luz es uniforme y no se ve de dónde viene (tema 2).

### Para qué son las fotos de interior (temas 12 y 13)

El usuario lo aclaró: las pasó **para que se vea cómo son las habitaciones**. No son
una petición concreta. Lo que enseñan de las estancias reales:

- Son muy pequeñas: la cama ocupa casi todo el ancho y queda el paso justo.
- El mobiliario va encajado de pared a pared y hecho a medida (cabecero corrido,
  mesillas voladas, armario de suelo a techo, camas a dos alturas), no como piezas
  sueltas de catálogo colocadas con holgura.
- Acabados: suelo laminado de madera, paredes claras (lisas o de panel con juntas),
  rodapié, carpintería de madera.

Conviene tenerlo presente al tratar los muebles de medida variable (temas 9 y 10),
el imán a paredes y el objetivo de la cámara.

### 13. Referencia de interior: dormitorio de matrimonio

- **Foto del usuario**, enviada sin comentario. **No está guardada en `fotos/`**:
  llegó mientras se trabajaba y no quedó como archivo; hay que pedírsela otra vez.
  Lo que se ve:
  - Dormitorio estrecho: la cama doble ocupa casi todo el ancho, con el paso justo
    a los lados.
  - Cabecero de panel de madera gris de pared a pared, a media altura, con una
    mesilla volada a cada lado y un interruptor o enchufe sobre cada una.
  - Paredes de paneles lisos en tono claro con juntas verticales a la vista, suelo
    laminado de madera y rodapié blanco.
- Interpretación mía, por confirmar: ejemplo de cabecero y mesillas integrados en
  la pared, de interruptores junto a la cama (tema 7) y de paredes de panel con
  juntas, que es un acabado que el configurador no tiene.

### 12. Referencia de interior: dormitorio con literas

- **Foto del usuario** (`fotos/interior-dormitorio-literas.png`), enviada sin
  comentario. Lo que se ve:
  - Dormitorio muy pequeño, aprovechado al máximo.
  - Dos camas en L a distinta altura: una alta, atravesada al fondo sobre un
    mueble de madera, y otra baja que mete los pies debajo. Escalera blanca.
  - Armario de madera de suelo a techo junto a la puerta, con tiradores metálicos.
  - Ventana con marco de madera, suelo laminado de madera, paredes claras, rodapié.
- Interpretación mía, por confirmar: sirve de ejemplo de lo pequeñas que son las
  estancias (por eso el gran angular) y de muebles que el catálogo no tiene:
  literas o camas a dos alturas y armarios a medida (tema 9).

### 11. Definir el exterior

- **Idea del usuario:** falta definir el exterior (lo dijo así, sin más detalle).
- Ahora el exterior no se configura: la fachada tiene un color fijo, no hay
  cubierta (el techo solo sale en la foto, plano y blanco) y la parcela es un
  rectángulo verde.
- Ya constaba en `PROYECTO.md` que la fachada dependerá del aislante y del
  revestimiento.
- Las fotos de referencia del usuario están en la carpeta `fotos/`.
- **Referencia 3, "esta es espectacular"** (`fotos/exterior-gran-villa.webp`,
  captura de una web con el rótulo "Vivienda prefabricada Gran Villa"):
  - Cubierta de teja a dos aguas con alero ancho y canecillos de madera.
  - Porche cubierto bajo la misma cubierta, con cercha, vigas y pilares de madera
    vista, y muebles de exterior.
  - Fachada de piedra clara con esquinas y recercos de ventana en piedra oscura.
  - Carpintería de madera, cristaleras al porche y una chimenea de piedra.
  - Terraza elevada de baldosa de barro con cuatro escalones corridos, luces
    empotradas en ellos y una barandilla metálica.
  - Es la más ambiciosa de las tres: el porche y la terraza salen del rectángulo
    del módulo.
- **Referencia 2, "casa más sencilla"** (`fotos/exterior-casa-sencilla.png`):
  - Fachada lisa blanca, con un paño de piedra en un extremo.
  - Cubierta oscura de muy poca pendiente, casi plana, con un alero fino.
  - Carpintería oscura: una ventana de dos hojas, una puerta de entrada, una
    cristalera grande y una ventana pequeña.
  - Tarima de madera delante, a modo de terraza, con un escalón y dos sillones.
  - Sin zócalo, canalón visto ni chimenea. Césped, bosque y un lago al fondo.
- **Referencia 1, foto real de una casa** (`fotos/exterior-casa-teja-roja.png`).
  Lo que se ve en ella:
  - Fachada de lamas horizontales en rojo oscuro.
  - Zócalo gris, de aspecto de piedra o bloque, en la parte baja.
  - Ventanas blancas de dos hojas con cajón de persiana y la persiana a medio bajar.
  - Cubierta inclinada de teja con alero y canecillos a la vista.
  - Canalón y bajante en el mismo tono rojizo, y una chimenea.
  - Acera perimetral de hormigón, césped, seto y árboles detrás.
- Interpretación mía de lo que puede abarcar, por confirmar: revestimiento y color
  de fachada, cubierta (plana o inclinada), carpintería exterior, porche o
  terraza, y el terreno alrededor. Se cruza con los paisajes tras las ventanas
  (tema 3) y con el techo (tema 4).

### 10. Encimera variable

- **Idea del usuario:** una encimera variable.
- No hay nada de cocina todavía: ni familia de mobiliario ni encimera.
- Mismo problema de fondo que los armarios variables (tema 9): una pieza cuya
  longitud elige el usuario en lugar de venir fija del catálogo.
- Queda por hablar: si es un tramo recto que se estira o también en L y en U, si
  lleva huecos para fregadero y placa, el material, y si los muebles bajos van
  aparte o forman un conjunto con ella.

### 9. Armarios de tamaño variable

- **Idea del usuario:** armarios de tamaño variable.
- Ahora el armario es una pieza de catálogo con medidas fijas, como el resto del
  mobiliario; ningún mueble se puede redimensionar.
- Relacionado con los tabiques dentro de una estancia para armarios empotrados,
  que ya estaba pendiente en `PROYECTO.md`.
- Queda por hablar: qué medidas se cambian (ancho, fondo, alto), si es estirando en
  el plano o escribiendo medidas, si las puertas se reparten solas según el ancho,
  y si vale para más muebles.

### 8. Ornamentación

- **Idea del usuario:** ornamentación (lo dijo así, sin más detalle).
- Interpretación mía, por confirmar: objetos decorativos como cuadros, plantas,
  lámparas, alfombras, cortinas o jarrones, que dan vida a la foto.
- Queda por hablar: qué piezas quiere, y si van en una familia nueva del
  mobiliario (las de suelo) o como piezas de pared junto a vinilos y espejos.

### 7. Interruptores en la pared

- **Idea del usuario:** interruptores en la pared.
- Serían otra pieza anclada a la pared, como vinilos y espejos, con su altura
  estándar (alrededor de 1,1 m).
- Queda por hablar: si son solo para que se vean (y para planificar la instalación
  eléctrica), o si además encienden y apagan las luces del tema 2; y si entran
  también los enchufes.

### 6. Espejos

- **Pregunta del usuario:** ¿se pueden poner espejos?
- Respuesta dada: sí. En la foto en calidad el reflejo sale real sin trabajo extra
  (material metálico pulido); sin probar todavía con esta versión de la librería.
  En la vista 3D normal un espejo de verdad obliga a dibujar la escena dos veces;
  propuesta: ahí un panel plateado, y reflejo real solo en la foto.
- Encajan con los vinilos: mismo tipo de pieza anclada a la pared.
- **Prueba del 2026-10-11** (pedida por el usuario: una caja alargada y fina en
  una pared, como un acabado). Hecha en Acabados, bajo los vinilos. El usuario
  precisa que quizá luego lleve **geometría para el marco** y que **la superficie
  reflectante debe ser otra cosa**: por eso son dos piezas, cuerpo y superficie.
  Resultado: en la foto el reflejo sale real y nítido (el usuario lo ve bien);
  en la vista normal, panel claro. **El filtro de ruido emborrona lo reflejado.**
- **Decidido por el usuario (2026-10-11):** el filtro deja el espejo sin
  filtrar, con su grano. Hecho. Filtrarlo bien (guías de la escena reflejada)
  queda como posible mejora.
- Queda por hablar: el
  marco y su acabado; si la superficie reflectante pasa a ser un acabado que se
  pueda poner a otras piezas; medidas libres o de catálogo.

### 5. Vinilos en las paredes

- **Pregunta del usuario:** ¿se pueden poner como vinilos en la pared?
- Respuesta dada: sí, es viable. Propuesta: tratarlos como los huecos, un rectángulo
  con imagen anclado a un lado de una estancia (posición, ancho, alto y altura
  sobre el suelo), que no pise puertas ni ventanas. Se verían en 3D y en la foto.
- **Hecho el 2026-10-11, y dado por bueno por el usuario.** Decidido por el usuario: es una imagen con
  fondo transparente con x, y, ancho y alto; va en Acabados; las imágenes son de
  catálogo (el cliente no sube las suyas, de momento); varias piezas sueltas por
  pared. Y la distinción: el vinilo es superficie, un espejo es geometría.
  Después, giro y barras deslizantes. El usuario no quiere que un hueco lo
  recorte: colocarlo bien es cosa de quien lo pone, y así sirve para un efecto
  en una ventana. **Sigue pendiente:** los dibujos reales, moverlo arrastrando,
  y el mural de pared entera.

### 4. Techo: ponerlo, quitarlo y elegir su color

- **Idea del usuario:** el techo habría que poder ponerlo y quitarlo, y habría que
  definir su color.
- Ahora el techo solo existe mientras dura la foto en calidad, siempre blanco, y no
  se puede elegir nada. En la vista 3D normal no hay techo (lo pidió el usuario en
  su día).
- Queda por hablar: si el interruptor afecta a la vista normal, a la foto o a las
  dos; si el color es uno para toda la casa o por estancia; y dónde se configura
  (lo natural sería el modo Acabados, junto al suelo y las paredes).

### 3. Paisajes tras las ventanas

- **Idea del usuario:** hay que poner paisajes que se vean por las ventanas.
- Ahora por las ventanas solo se ve un cielo en degradado.
- **El usuario añade (2026-10-10):** una foto exterior también requiere un paisaje.
  Es el mismo problema visto desde fuera: en sus fotos de referencia la casa está
  rodeada de césped, setos, árboles, monte o un lago.
- **El usuario precisa: "modelado".** Lo leo como que el paisaje tiene que estar
  modelado en 3D (terreno, césped, setos, árboles), no ser solo una imagen de
  fondo. Por confirmar.
- **Y añade: "o igual una foto fija".** Es decir, lo tiene abierto: paisaje
  modelado o una foto fija de fondo. Sin decidir.
- Apunte mío sobre eso, sin estudiar: lo habitual es combinar las dos cosas, lo
  cercano modelado (terreno, acera, setos, algún árbol) y lo lejano (monte, cielo)
  en una imagen panorámica, porque modelar hasta el horizonte no compensa.
- Apunte mío anterior, sin estudiar: una sola imagen panorámica de 360° alrededor de la casa
  podría servir para las dos cosas (lo que se ve por las ventanas y el fondo de una
  foto exterior) y además dar la luz del cielo. El suelo cercano (césped, acera)
  tendría que ser geometría aparte, enlazando con el exterior (tema 11).
- Queda por hablar: de dónde salen las imágenes, si se elige una por casa o por
  ventana, y cómo se orienta respecto a la casa.
