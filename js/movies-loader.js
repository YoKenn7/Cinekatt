/**
 * movies-loader.js
 * ------------------------------------------------------------------
 * Aquí se lista, uno por línea, el nombre de cada archivo de
 * película que quieres que cargue la app. Cada archivo vive en
 * js/movies/items/ y agrega su película al arreglo MOVIES
 * (declarado en movies.js) con una sola línea:
 *
 *   MOVIES.push({ ... datos de la película ... });
 *
 * Para agregar una película nueva:
 *   1. Crea js/movies/items/mi-pelicula.js con su MOVIES.push({...})
 *      (puedes copiar js/movies/items/ejemplo.js como plantilla)
 *   2. Agrega "mi-pelicula.js" a la lista MOVIE_FILES de abajo
 *
 * No hace falta tocar index.html ni ningún otro archivo.
 * ------------------------------------------------------------------
 */

const MOVIE_FILES = [
  "obs.js",
  "spg.js",
  "ts5.js",
  "bck.js",
  "ovd.js",
  "ddg.js",
];

const MOVIES_BASE_PATH = "js/movies/items/";

function loadMovies() {
  const loads = MOVIE_FILES.map((filename) => {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = MOVIES_BASE_PATH + filename;
      script.onload = () => resolve();
      script.onerror = () => {
        console.error(`No se pudo cargar la película: ${filename}`);
        resolve(); // seguimos con las demás películas aunque una falle
      };
      document.head.appendChild(script);
    });
  });

  return Promise.all(loads);
}
