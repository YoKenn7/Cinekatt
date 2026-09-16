# TV en Vivo

Sitio estático (sin backend) para ver canales de TV en vivo vía HLS y, más
adelante, anime. Pensado para alojarse tal cual en GitHub Pages.

## Estructura

```
index.html
css/style.css
js/app.js             -> pinta tarjetas y controla la navegación entre secciones
js/player.js           -> reproductor HLS.js (carga y cambia de servidor)
js/channels.js         -> lista manual de canales de TV en vivo
js/anime.js            -> declara el arreglo ANIME_SERIES (vacío, no editar)
js/anime-loader.js     -> lista qué archivos de js/anime/series/ cargar
js/anime/series/       -> un archivo .js por cada serie de anime
js/movies.js           -> declara el arreglo MOVIES (vacío, no editar)
js/movies-loader.js    -> lista qué archivos de js/movies/items/ cargar
js/movies/items/       -> un archivo .js por cada película
assets/logos/          -> logos de los canales
assets/anime/          -> portadas de anime (a futuro)
assets/movies/         -> portadas de películas (a futuro)
```

## Agregar un canal

Edita `js/channels.js` y agrega un bloque al arreglo `CHANNELS`:

```js
{
  id: "mi-canal",
  name: "Mi Canal",
  logo: "assets/logos/mi-canal.png",
  servers: [
    { name: "Servidor 1", url: "https://ejemplo.com/stream.m3u8" },
    { name: "Servidor 2", url: "https://ejemplo.com/otro-stream.m3u8" }
  ]
}
```

- Si el archivo de `logo` no existe, la tarjeta muestra automáticamente una
  insignia con la inicial del nombre, así que puedes agregar canales antes de
  tener el logo listo.
- Un canal puede tener uno o varios `servers`; si tiene más de uno, el
  reproductor muestra botones para cambiar entre ellos.

## Anime

La sección ya tiene su pestaña y su navegación (serie → episodios →
servidores → reproductor). Para que el código no se vuelva enorme al
agregar muchas series, **cada serie vive en su propio archivo**:

```
js/anime.js          -> declara el arreglo ANIME_SERIES (vacío, no lo edites)
js/anime-loader.js   -> lista qué archivos de serie cargar (ANIME_FILES)
js/anime/series/     -> aquí va un archivo .js por cada serie
```

### Agregar una serie nueva

1. Crea `js/anime/series/mi-serie.js` con este contenido:

   ```js
   ANIME_SERIES.push({
     id: "mi-serie",
     title: "Mi Serie",
     cover: "assets/anime/mi-serie.jpg", // opcional
     episodes: [
       {
         id: "ep-1",
         title: "Episodio 1",
         thumbnail: "assets/anime/mi-serie/ep1.jpg", // opcional
         servers: [
           { name: "Servidor 1", url: "https://ejemplo.com/ep1-servidor1.m3u8" },
           { name: "Servidor 2", url: "https://ejemplo.com/ep1-servidor2.m3u8" }
         ]
       },
       {
         id: "ep-2",
         title: "Episodio 2",
         servers: [
           { name: "Servidor 1", url: "https://ejemplo.com/ep2-servidor1.m3u8" }
         ]
       }
     ]
   });
   ```

   `thumbnail` es opcional: si no la pones (o la imagen no existe), el
   episodio muestra una insignia con su inicial, igual que los canales.

   > No es posible sacar esa miniatura automáticamente del video: el
   > navegador bloquea leer un fotograma de un stream HLS de otro origen
   > (protección CORS), así que si quieres una imagen por episodio tendría
   > que ser una captura que consigas y coloques tú manualmente en `thumbnail`.

2. Agrega el nombre del archivo a `ANIME_FILES` en `js/anime-loader.js`:

   ```js
   const ANIME_FILES = [
     "mi-serie.js",
   ];
   ```

No hace falta tocar `index.html` ni ningún otro archivo. Cada serie queda
aislada en su propio archivo chico, fácil de mantener y de revisar en control
de versiones (los cambios de una serie no mezclan diffs con otra).

> Nota: esto sigue siendo 100% estático (sin base de datos ni backend), solo
> son varios archivos `.js` cargados dinámicamente. Si en el futuro quieres
> algo más parecido a una "base de datos" (por ejemplo JSON por serie leído
> con `fetch`), es posible, pero requiere correr el sitio con un servidor
> local (no sirve con doble clic / `file://`) porque `fetch` bloquea
> peticiones locales por CORS. El enfoque de archivos `.js` que usamos aquí
> evita ese problema y sigue funcionando igual de simple con doble clic.


## Películas

Misma idea que Anime: **cada película vive en su propio archivo**, para no
mezclar diffs entre películas al agregar más:

```
js/movies.js          -> declara el arreglo MOVIES (vacío, no lo edites)
js/movies-loader.js   -> lista qué archivos de película cargar (MOVIE_FILES)
js/movies/items/      -> aquí va un archivo .js por cada película
```

A diferencia del anime (que tiene episodios), una película es un solo ítem
reproducible, así que en la sección se muestra como una tarjeta simple
(como un canal de TV), no como una serie con capítulos.

### Agregar una película nueva

1. Crea `js/movies/items/mi-pelicula.js` con este contenido (puedes copiar
   `js/movies/items/ejemplo.js` como plantilla):

   ```js
   MOVIES.push({
     id: "mi-pelicula",
     title: "Mi Película",
     cover: "assets/movies/mi-pelicula.jpg", // opcional
     servers: [
       { name: "Servidor 1", url: "https://ejemplo.com/pelicula-servidor1.m3u8" },
       { name: "Servidor 2", url: "https://ejemplo.com/pelicula-servidor2.m3u8" }
     ]
   });
   ```

   Si no pones `cover` (o la imagen no existe), la tarjeta muestra
   automáticamente una insignia con la inicial del título.

2. Agrega el nombre del archivo a `MOVIE_FILES` en `js/movies-loader.js`:

   ```js
   const MOVIE_FILES = [
     "mi-pelicula.js",
   ];
   ```

No hace falta tocar `index.html` ni ningún otro archivo.

## Publicar en GitHub Pages

1. Sube el contenido de esta carpeta a un repositorio de GitHub.
2. En el repositorio: **Settings → Pages → Branch**, elige la rama (por
   ejemplo `main`) y la carpeta raíz (`/`).
3. Guarda. GitHub Pages publicará `index.html` en unos minutos.

No hace falta build, servidor ni base de datos: es HTML/CSS/JS puro.

## Notas

- El reproductor usa [HLS.js](https://github.com/video-dev/hls.js) desde un
  CDN, con respaldo a reproducción nativa en Safari/iOS.
- Algunos streams `.m3u`/`.m3u8` pueden bloquear la reproducción según el
  origen (CORS) o requerir HTTPS; eso depende del servidor de origen, no del
  sitio en sí.

## Convertirla en app de LG webOS (Smart TV)

Un TV con webOS ejecuta apps que son, en esencia, esta misma carpeta con un
manifiesto extra (`appinfo.json`, ya incluido) empaquetada como `.ipk`.

1. Instala la herramienta oficial: `npm install -g @webos-tools/cli`
   (reemplaza a la antigua `@webosose/ares-cli`, descontinuada desde 2024).
2. En el TV: **LG Content Store → busca "Developer Mode" → instálala →
   ábrela → inicia sesión con una cuenta de desarrollador LG (gratis) →
   activa "Dev Mode Status"**. El TV se reiniciará.
3. Conecta tu PC al TV (misma red WiFi) con `ares-setup-device`, usando la
   IP y la clave que muestra la app Developer Mode.
4. Empaqueta la carpeta: `ares-package tv-en-vivo/`
5. Instala en el TV: `ares-install -d <nombre-dispositivo> com.tvenvivo.app_1.0.0_all.ipk`
6. Lánzala: `ares-launch -d <nombre-dispositivo> com.tvenvivo.app`

Notas:

- `appinfo.json`, `icon.png`, `icon-large.png` y `splash.png` ya vienen
  incluidos con valores de ejemplo (un ícono ámbar simple sobre fondo
  oscuro) — reemplázalos por tu propio diseño cuando quieras.
- El Modo Desarrollador tiene un límite de sesión (históricamente 1000
  horas); si expira, hay que reactivarlo desde la app Developer Mode y
  reinstalar. No afecta usar el TV normalmente, solo las apps sideload.
- Las tarjetas y botones ya son elementos `<button>` nativos, así que el
  control remoto (flechas + OK) navega entre ellos automáticamente sin
  código extra; el botón "Atrás" del control ya cierra el reproductor si
  está abierto.
- Esto es para instalar la app en **tu propio TV**. Publicarla en la LG
  Content Store para que la use cualquier persona es un proceso aparte, con
  registro de desarrollador y revisión de contenido por parte de LG.

## Navegación de control remoto (D-Pad)

Toda la app se puede usar sin mouse ni puntero del Magic Remote:

- **Flechas**: mueven el foco entre tarjetas y botones. No hace falta
  organizar nada en una grilla lógica a mano — `js/tv-nav.js` calcula el
  elemento más cercano en pantalla en la dirección presionada.
- **OK/Enter**: como todo lo interactivo son elementos `<button>` reales,
  el propio control ya dispara el clic sin código adicional.
- **Return/Atrás**: retrocede un nivel según dónde estés:

  ```
  Reproductor (TV o Anime) → Return → pantalla de donde salió
  Capítulos de una serie    → Return → Lista de animes
  Canales / Lista de animes → Return → foco en las pestañas de arriba
  ```

El foco siempre es visible: los elementos usan la clase `focusable` y un
estilo de foco grueso (`--accent` + zoom leve) que no depende de
`:focus-visible`, para que también se vea en versiones viejas de webOS que
no soportan esa pseudo-clase.

Si agregas una tarjeta o botón nuevo en el futuro, solo agrégale la clase
`focusable` y automáticamente entra en la navegación por D-Pad.

## Reproductor a pantalla completa

El video ahora ocupa toda la pantalla. La barra superior (título + Volver)
y la inferior (play/pausa + servidores) se atenúan solas después de unos
segundos y reaparecen con cualquier tecla — igual que Netflix/YouTube en TV.

Si la señal tarda o falla, se muestra un aviso grande con botones de
**Reintentar** y **Volver**, en vez de dejar la pantalla en negro sin
explicación.

## Arquitectura para URLs que expiran (Anime)

Ahora mismo cada servidor de un episodio se ve así en `js/anime/series/*.js`:

```js
servers: [
  { name: "Servidor 1", url: "https://ejemplo.com/algo.m3u8?token=..." }
]
```

El problema: si ese link trae un token que expira, hay que editar el
archivo y reinstalar la app para actualizarlo. Para no depender de eso,
`player.js` ya separa **de dónde sale la URL** de **cómo se reproduce**,
a través de una función `resolveServerUrl(server)`:

- Si el servidor **no** tiene `resolveEndpoint` (como todos los que ya
  agregaste), se usa `url` tal cual — cero cambios de comportamiento.
- Si el servidor **sí** tiene `resolveEndpoint`, la app le pregunta a esa
  URL cuál es el link actualizado, justo antes de reproducir:

  ```js
  servers: [
    {
      name: "Servidor 1",
      resolveEndpoint: "https://tu-backend.com/api/resolver?id=ep1-servidor1"
    }
  ]
  ```

  Ese endpoint solo tiene que responder JSON: `{ "url": "https://.../actual.m3u8" }`.

### Cuando quieras agregar el backend

No hace falta nada complicado ni un servidor propio corriendo 24/7. Basta
con una función serverless (por ejemplo, un Cloudflare Worker o una
función de Vercel/Netlify) que:

1. Reciba un identificador de episodio/servidor (`?id=...`).
2. Internamente sepa dónde sacar el link fresco (haciendo scraping del
   sitio de origen, o llamando a su API si la tiene).
3. Devuelva `{ "url": "..." }`.

Así, cuando un link expire, actualizas la lógica de esa función una sola
vez — no tocas la app instalada en el TV, y no hace falta volver a
empaquetar ni reinstalar nada.

Mientras no tengas ese backend, todo sigue funcionando exactamente igual
que ahora, con las URLs fijas.

## Servidores tipo "iframe" (reproductor embebido de otro sitio)

Algunos sitios (como jkanime) no exponen un `.m3u8` directo: la URL que dan
es la de **su propio reproductor**, pensado para ir dentro de un `<iframe>`.
Para esos casos, un servidor puede declarar `"type": "iframe"` en vez de
usar HLS.js:

```js
servers: [
  { name: "Servidor 1", url: "https://ejemplo.com/algo.m3u8" },              // HLS normal (por defecto)
  { name: "Servidor 2", type: "iframe", url: "https://jkanime.net/jkplayer/um?e=..." } // reproductor embebido
]
```

Si no pones `"type"`, se asume `"hls"` (comportamiento de siempre, nada se
rompe). Puedes mezclar ambos tipos como servidores distintos del mismo
episodio.

**Limitaciones a tener en cuenta con `"iframe"`:**

- Pierdes el spinner de carga, el mensaje de error con Reintentar y los
  controles grandes que tiene el modo HLS — dentro del iframe manda la
  interfaz que haya puesto el sitio de origen.
- El botón Return de tu app sigue funcionando **mientras el foco no entre
  al iframe** (es decir, mientras solo uses las flechas del D-Pad). Si en
  algún momento usas el modo cursor del Magic Remote y haces clic dentro
  del video (por ejemplo sobre los controles propios de ese sitio), el
  foco pasa al iframe y el control remoto deja de llegarle a tu app hasta
  que el foco vuelva a salir de ahí — es una restricción de seguridad del
  navegador entre dominios distintos, no algo que se pueda evitar con
  código.
- Algunos sitios bloquean directamente que los incrustes en un dominio
  ajeno; si el iframe se queda en blanco, puede ser por eso.

## Correcciones de navegación y limpieza del reproductor

Tres arreglos importantes para el uso en TV real:

**1. Covers de Películas iguales a los de Anime.** Ahora `movies-grid`
usa la misma cuadrícula (`anime-grid`) y las tarjetas se construyen con
la misma estructura que `buildAnimeCard()` (cover vertical de
`--anime-cover-w` × `--anime-cover-h`, mismo espaciado y bordes). No se
tocó ningún estilo de Anime — Películas simplemente reutiliza las mismas
clases, y como el tema "glassmorphism" está delimitado a
`#section-anime`, las tarjetas de Películas se ven igual de tamaño pero
mantienen el tema oscuro del resto de la app.

**2. El resolve ya no sigue corriendo después de salir del reproductor.**
`player.js` ahora usa un `AbortController` real para cancelar la petición
a `resolveEndpoint` en cuanto cierras el reproductor (o cambias de
servidor), y además cada carga lleva un identificador de sesión: si el
resultado de un resolve llega después de que ya saliste o abriste otro
contenido, se descarta sin hacer nada. Esto evita el bug de "el video
empieza a sonar solo en el menú" cuando entrabas y salías rápido.

**3. El botón físico Return ya no cierra la app de golpe.** Había dos
problemas combinados:

- La jerarquía de navegación no distinguía "estoy en una sección" de
  "estoy en Inicio" — `handleBack()` ahora sí sigue
  `Reproductor → Capítulos → Sección → Inicio → (recién ahí) salir`.
- Si un servidor tipo `"iframe"` (jkanime, vimeos, etc.) hacía que el
  foco quedara atrapado dentro de ese iframe de otro dominio, el evento
  de Return físico **nunca llegaba a la app** — no por un bug de lógica,
  sino porque los eventos de teclado no cruzan la frontera entre
  documentos de distinto origen. Se agregó un vigilante que recupera el
  foco automáticamente si detecta que se quedó atrapado ahí, mientras un
  servidor tipo iframe esté activo.

`TVNav.onBack(fn)` ahora espera que tu callback devuelva `true` cuando sí
navegó a algo dentro de la app (para bloquear el cierre por defecto), o
`false`/nada cuando no hay a dónde volver (para dejar que el sistema
cierre la app normalmente, solo en la pantalla raíz).
