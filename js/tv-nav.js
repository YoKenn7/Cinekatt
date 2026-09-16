/**
 * tv-nav.js
 * ------------------------------------------------------------------
 * Motor de navegación pensado para control remoto (D-Pad):
 *
 * 1. Movimiento de foco con las flechas, basado en la posición real
 *    en pantalla de los elementos marcados con la clase "focusable"
 *    (no hace falta organizarlos en una grilla lógica a mano: se
 *    calcula el elemento más cercano en la dirección presionada).
 * 2. OK/Enter: no se maneja aquí — los elementos ya son <button>
 *    nativos, así que el propio navegador dispara "click" al
 *    presionar Enter/OK sobre un elemento enfocado.
 * 3. Return/Back: normalizado y enviado al callback que registres con
 *    TVNav.onBack(fn). Cubre el código de tecla que usa webOS (461) y
 *    "Escape" (para probar desde un navegador de PC/laptop). El callback
 *    debe devolver true si navegó a algo dentro de la app (para bloquear
 *    la acción por defecto del sistema), o false/nada si no había a
 *    dónde volver (para dejar que el sistema haga lo suyo, ej. cerrar
 *    la app en la pantalla raíz).
 *
 * No depende de nada del resto de la app: solo necesita que los
 * elementos interactivos tengan la clase "focusable".
 * ------------------------------------------------------------------
 */

const TVNav = (() => {
  const BACK_KEYCODES = new Set([461]); // webOS Magic Remote / control "Atrás"
  let backHandler = null;

  function getFocusables() {
    // Si el reproductor está abierto, el foco solo puede moverse
    // dentro de él (evita "atravesar" hacia tarjetas tapadas debajo).
    const overlay = document.getElementById("player-overlay");
    const scope = overlay && !overlay.hidden ? overlay : document;

    return Array.from(scope.querySelectorAll(".focusable")).filter(
      (el) => el.offsetParent !== null && !el.disabled
    );
  }

  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function moveFocus(direction) {
    const focusables = getFocusables();
    if (focusables.length === 0) return;

    const current = document.activeElement;
    if (!current || !focusables.includes(current)) {
      focusables[0].focus();
      return;
    }

    const from = centerOf(current);
    let best = null;
    let bestScore = Infinity;

    focusables.forEach((el) => {
      if (el === current) return;
      const to = centerOf(el);
      const dx = to.x - from.x;
      const dy = to.y - from.y;

      let primary; // distancia en la dirección que interesa
      let cross; // qué tan alineado está en el otro eje
      let valid;

      switch (direction) {
        case "right":
          valid = dx > 4;
          primary = dx;
          cross = dy;
          break;
        case "left":
          valid = dx < -4;
          primary = -dx;
          cross = dy;
          break;
        case "down":
          valid = dy > 4;
          primary = dy;
          cross = dx;
          break;
        case "up":
          valid = dy < -4;
          primary = -dy;
          cross = dx;
          break;
        default:
          valid = false;
      }

      if (!valid) return;

      // Favorece elementos cercanos y alineados; penaliza el desvío lateral.
      const score = primary + Math.abs(cross) * 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    });

    if (best) {
      best.focus();
      if (best.scrollIntoView) {
        best.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      }
    }
  }

  function focusFirstIn(container) {
    const scope = container || document;
    const first = scope.querySelector(".focusable");
    if (first) first.focus();
    return first;
  }

  function onBack(fn) {
    backHandler = fn;
  }

  function handleKeydown(event) {
    const isBack = BACK_KEYCODES.has(event.keyCode) || event.key === "Escape";

    if (isBack) {
      if (backHandler) {
        const handled = backHandler();
        // Solo bloqueamos la acción por defecto del sistema (que en TV
        // suele ser cerrar la app) si de verdad navegamos a algo dentro
        // de la app. Si no hay a dónde volver (ej. ya estamos en la
        // pantalla raíz), dejamos pasar el evento tal cual, para que el
        // propio sistema decida qué hacer (normalmente, salir).
        if (handled) {
          event.preventDefault();
        }
      }
      return;
    }

    switch (event.key) {
      case "ArrowLeft":
        moveFocus("left");
        event.preventDefault();
        break;
      case "ArrowRight":
        moveFocus("right");
        event.preventDefault();
        break;
      case "ArrowUp":
        moveFocus("up");
        event.preventDefault();
        break;
      case "ArrowDown":
        moveFocus("down");
        event.preventDefault();
        break;
    }
  }

  function init() {
    document.addEventListener("keydown", handleKeydown);
  }

  return { init, onBack, focusFirstIn, getFocusables };
})();
