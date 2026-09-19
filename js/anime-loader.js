/**
 * anime-loader.js
 * ------------------------------------------------------------------
 * Aquí se lista, uno por línea, el nombre de cada archivo de serie
 * que quieres que cargue la app. Cada archivo vive en
 * js/anime/series/ y agrega su serie al arreglo ANIME_SERIES
 * (declarado en anime.js) con una sola línea:
 *
 *   ANIME_SERIES.push({ ... datos de la serie ... });
 *
 * Para agregar una serie nueva:
 *   1. Crea js/anime/series/tu-serie.js con su ANIME_SERIES.push({...})
 *   2. Agrega "tu-serie.js" a la lista ANIME_FILES de abajo
 *
 * No hace falta tocar index.html ni ningún otro archivo.
 * ------------------------------------------------------------------
 */

const ANIME_FILES = [
  "IMF.js",
  "obwi.js",
  "100-3.js",
  "rgs.js",
  "lub.js",
  "bncm.js",
  "hknts.js",
  "twac.js",
  "titt.js",
  "mini.js",
  "tdi.js",
  "rag.js",
  "tans2.js",
  "osananajimi-to-wa-love-comedy-ni-naranai.js",
  "chiwaram.js",
  "kaoniden.js",
  "miksanwa.js",
  "seibutyar.js",
  "kurmedni.js",
  "konkaini.js",
  "tokbosrus.js",
  "senwaoto.js",
  "gimsei.js",
  "wuljiuwan.js",
  "uruyat(20.js",
  "thedanin.js",
  "spykyo.js",
  "renflo.js",
  "seinakim.js",
  "grablu.js",
  "grablu2.js",
  "grablu3.js",
  "repdatkoi.js",
  "youjitshi.js",
  "woneggpri.js",
];

const ANIME_SERIES_BASE_PATH = "js/anime/series/";

function loadAnimeSeries() {
  const loads = ANIME_FILES.map((filename) => {
    return new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = ANIME_SERIES_BASE_PATH + filename;
      script.onload = () => resolve();
      script.onerror = () => {
        console.error(`No se pudo cargar la serie: ${filename}`);
        resolve(); // seguimos con las demás series aunque una falle
      };
      document.head.appendChild(script);
    });
  });

  return Promise.all(loads);
}
