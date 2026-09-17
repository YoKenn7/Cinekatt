/**
 * continue-watching.js
 * ------------------------------------------------------------------
 * Guarda en localStorage (solo en este dispositivo/navegador, sin
 * backend) el progreso de reproducción de anime y películas, para
 * poder mostrar una fila de "Continuar viendo" en Inicio.
 *
 * No aplica a TV en Vivo (no tiene sentido "continuar" algo en vivo).
 * ------------------------------------------------------------------
 */

const ContinueWatching = (() => {
  const STORAGE_KEY = "cw:v1";
  const MAX_ENTRIES = 20;
  const FINISHED_RATIO = 0.92; // 92% visto o más: se considera terminado
  const MIN_PROGRESS_SECONDS = 10; // menos que esto no vale la pena guardarlo

  function readAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch {
      return []; // localStorage no disponible (modo privado, etc.)
    }
  }

  function writeAll(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* si falla el guardado, simplemente no persiste; no rompe la app */
    }
  }

  function getAll() {
    return readAll().sort((a, b) => b.updatedAt - a.updatedAt);
  }

  function getProgress(id) {
    return readAll().find((entry) => entry.id === id) || null;
  }

  /**
   * entry: { id, title, cover, kind ("anime"|"movie"), servers,
   *          currentTime, duration }
   */
  function upsert(entry) {
    if (!entry || !entry.id) return;
    if (!entry.duration || !isFinite(entry.duration) || entry.duration < 30) return;
    if (!entry.currentTime || entry.currentTime < MIN_PROGRESS_SECONDS) return;

    const ratio = entry.currentTime / entry.duration;
    let list = readAll().filter((e) => e.id !== entry.id);

    if (ratio < FINISHED_RATIO) {
      list.unshift({ ...entry, updatedAt: Date.now() });
      list = list.slice(0, MAX_ENTRIES);
    }
    // Si ya casi terminó, no se vuelve a agregar: se considera visto.

    writeAll(list);
  }

  /**
   * Similar a upsert(), pero para marcar un episodio como "el que sigue"
   * apenas se termina el anterior — sin progreso real todavía (currentTime
   * en 0). Cuando esa persona empiece a verlo de verdad, upsert() lo va
   * a reemplazar solo (mismo id) con el progreso real.
   */
  function upsertNext(entry) {
    if (!entry || !entry.id) return;

    let list = readAll().filter((e) => e.id !== entry.id);
    list.unshift({
      ...entry,
      currentTime: 0,
      duration: entry.duration || 0,
      isNext: true,
      updatedAt: Date.now()
    });
    list = list.slice(0, MAX_ENTRIES);
    writeAll(list);
  }

  function remove(id) {
    writeAll(readAll().filter((e) => e.id !== id));
  }

  return { getAll, getProgress, upsert, upsertNext, remove };
})();
