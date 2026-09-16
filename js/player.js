/**
 * player.js
 * ------------------------------------------------------------------
 * Reproductor HLS a pantalla completa, pensado para control remoto:
 *
 *   - Video ocupa toda la pantalla.
 *   - Barra superior (título + Volver) y barra inferior (play/pausa +
 *     servidores) se atenúan solas y reaparecen con cualquier tecla.
 *   - Estados claros de "cargando" y "error" con botones grandes de
 *     Reintentar / Volver.
 *   - resolveServerUrl() separa "de dónde viene la URL" de "cómo se
 *     reproduce": hoy usa la URL fija guardada en channels.js/anime.js,
 *     pero está lista para pedirle la URL actualizada a un backend en
 *     el futuro sin tocar el resto del reproductor. Ver el README,
 *     sección "Arquitectura para URLs que expiran".
 * ------------------------------------------------------------------
 */

const Player = (() => {
  const overlay = document.getElementById("player-overlay");
  const video = document.getElementById("video");
  const iframeEl = document.getElementById("player-iframe");
  const titleEl = document.getElementById("player-title");
  const uiEl = document.getElementById("player-ui");
  const closeBtn = document.getElementById("player-close");
  const playPauseBtn = document.getElementById("player-playpause");
  const serverListEl = document.getElementById("server-list");

  const seekRowEl = document.getElementById("player-seek-row");
  const seekEl = document.getElementById("player-seek");
  const timeCurrentEl = document.getElementById("player-time-current");
  const timeDurationEl = document.getElementById("player-time-duration");

  const statusEl = document.getElementById("player-status");
  const spinnerEl = document.getElementById("player-spinner");
  const statusTextEl = document.getElementById("player-status-text");
  const errorActionsEl = document.getElementById("player-error-actions");
  const retryBtn = document.getElementById("player-retry");
  const backErrorBtn = document.getElementById("player-back-error");

  const UI_HIDE_DELAY = 5000; // ms de inactividad antes de atenuar los controles
  const LOADING_TIMEOUT = 15000; // ms antes de avisar que está tardando

  const ICON_PAUSE =
    '<svg class="player-btn__icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';

  const ICON_PLAY =
    '<svg class="player-btn__icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M8 5v14l11-7z"/></svg>';

  let hls = null;
  let currentServers = [];
  let currentIndex = -1;
  let returnFocusEl = null;
  let uiHideTimer = null;
  let loadingTimeoutTimer = null;
  let isLive = true;
  let isSeeking = false;

  // sessionToken cambia cada vez que se abre el reproductor, se cierra,
  // o se cambia de servidor. Cualquier operación asíncrona en curso
  // (sobre todo el resolveEndpoint) guarda el token vigente al empezar,
  // y antes de aplicar su resultado revisa si ese token sigue siendo el
  // actual — si no, significa que el usuario ya se fue o cambió de
  // contenido, y el resultado se descarta sin hacer nada.
  let sessionToken = 0;

  // Controlador del fetch de resolveEndpoint en curso, para poder
  // cancelarlo de verdad (no solo ignorar su resultado) al salir.
  let activeAbortController = null;

  // Vigilante que evita que el foco quede atrapado dentro de un iframe
  // de otro dominio — si eso pasara, el botón físico Return del control
  // dejaría de llegarle a la app (ver startIframeFocusWatchdog más abajo).
  let iframeFocusWatchdog = null;

  /* ---------------------------------------------------------
     Resolución de la URL de reproducción
     --------------------------------------------------------- */

  async function resolveServerUrl(server) {
    // Si el servidor define "resolveEndpoint", se le pide la URL
    // actualizada a ese endpoint en vez de usar una fija. Si no lo
    // define (caso actual de todos tus canales/animes), se usa
    // "url" tal cual, igual que antes.
    if (!server.resolveEndpoint) {
      return server.url;
    }

    // Si ya había un resolve en curso (de otro servidor/contenido), se
    // cancela de verdad antes de empezar este — así nunca hay dos
    // peticiones de resolve compitiendo entre sí.
    if (activeAbortController) {
      activeAbortController.abort();
    }
    const controller = new AbortController();
    activeAbortController = controller;

    try {
      const res = await fetch(server.resolveEndpoint, { signal: controller.signal });
      if (!res.ok) throw new Error(`resolveEndpoint respondió ${res.status}`);
      const data = await res.json();
      if (!data || !data.url) throw new Error("respuesta sin campo 'url'");
      return data.url;
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw err; // cancelado a propósito: no hay respaldo, simplemente se descarta
      }
      console.error("No se pudo resolver la URL desde el backend:", err);
      // Respaldo: si el servidor también trae una "url" fija, se usa
      // como último recurso para no dejar al usuario sin nada.
      if (server.url) return server.url;
      throw err;
    } finally {
      if (activeAbortController === controller) {
        activeAbortController = null;
      }
    }
  }

  /* ---------------------------------------------------------
     Estados: cargando / error / reproduciendo
     --------------------------------------------------------- */

  function showLoading(message) {
    clearTimeout(loadingTimeoutTimer);
    statusEl.hidden = false;
    spinnerEl.hidden = false;
    statusTextEl.textContent = message || "Cargando señal…";
    statusTextEl.classList.remove("is-error");
    errorActionsEl.hidden = true;

    loadingTimeoutTimer = setTimeout(() => {
      statusTextEl.textContent =
        "Esto está tardando más de lo normal. Puedes esperar o volver.";
      errorActionsEl.hidden = false;
    }, LOADING_TIMEOUT);
  }

  function showError(message) {
    clearTimeout(loadingTimeoutTimer);
    statusEl.hidden = false;
    spinnerEl.hidden = true;
    statusTextEl.textContent = message || "No se pudo reproducir este servidor.";
    statusTextEl.classList.add("is-error");
    errorActionsEl.hidden = false;
  }

  function hideStatus() {
    clearTimeout(loadingTimeoutTimer);
    statusEl.hidden = true;
    errorActionsEl.hidden = true;
  }

  /* ---------------------------------------------------------
     Barra de progreso (solo para contenido no-en-vivo, tipo HLS)
     --------------------------------------------------------- */

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function updateSeekVisibility() {
    const server = currentServers[currentIndex];
    const isIframe = server && server.type === "iframe";
    seekRowEl.hidden = isLive || isIframe;
  }

  function updateSeekFill() {
    const max = Number(seekEl.max) || 0;
    const value = Number(seekEl.value) || 0;
    const pct = max > 0 ? (value / max) * 100 : 0;
    seekEl.style.background =
      `linear-gradient(to right, var(--player-accent) ${pct}%, rgba(255, 255, 255, 0.25) ${pct}%)`;
  }

  function attachSeekTracking() {
    if (isFinite(video.duration)) {
      seekEl.max = video.duration;
      timeDurationEl.textContent = formatTime(video.duration);
      updateSeekFill();
    }
  }

  video.addEventListener("loadedmetadata", attachSeekTracking);

  video.addEventListener("timeupdate", () => {
    if (isSeeking) return;
    seekEl.value = video.currentTime;
    timeCurrentEl.textContent = formatTime(video.currentTime);
    updateSeekFill();
  });

  seekEl.addEventListener("input", () => {
    isSeeking = true;
    timeCurrentEl.textContent = formatTime(Number(seekEl.value));
    updateSeekFill();
  });

  seekEl.addEventListener("change", () => {
    video.currentTime = Number(seekEl.value);
    isSeeking = false;
  });

  // Deja que el navegador maneje izquierda/derecha de forma nativa sobre
  // el slider (así el D-Pad adelanta/atrasa). Arriba/abajo sí deben poder
  // sacar el foco de la barra hacia los demás botones.
  seekEl.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.stopPropagation();
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
    }
  });

  /* ---------------------------------------------------------
     Carga de video (HLS.js con respaldo nativo)
     --------------------------------------------------------- */

  function destroyHls() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }

  async function loadServer(index) {
    const server = currentServers[index];
    if (!server) return;

    currentIndex = index;
    renderServerButtons();
    destroyHls();
    stopIframeFocusWatchdog();

    // Nueva sesión de carga: invalida cualquier resolve/callback que
    // siga en curso de una carga anterior (otro servidor, u otro
    // contenido si el usuario salió y entró a algo distinto rapidísimo).
    const myToken = ++sessionToken;

    if (server.type === "iframe") {
      loadIframeServer(server, myToken);
    } else {
      await loadHlsServer(server, myToken);
    }
  }

  function loadIframeServer(server, myToken) {
    // Servidor tipo "iframe": el video no lo maneja HLS.js, sino el
    // reproductor propio del sitio de origen (ej. jkanime). Aquí solo
    // lo mostramos a pantalla completa; el play/pausa y la barra de
    // progreso son los que ese sitio haya puesto dentro del iframe.
    video.hidden = true;
    video.removeAttribute("src");
    playPauseBtn.hidden = true;
    updateSeekVisibility();

    showLoading("Cargando reproductor…");

    iframeEl.hidden = false;
    iframeEl.onload = () => {
      if (myToken !== sessionToken) return; // el usuario ya se fue de aquí
      hideStatus();
    };
    iframeEl.onerror = () => {
      if (myToken !== sessionToken) return;
      showError("No se pudo cargar este servidor.");
    };
    iframeEl.src = server.url;

    // Este iframe es de otro dominio: si el foco queda atrapado ahí
    // dentro, el botón físico Return del control deja de llegarle a la
    // app. Lo vigilamos mientras este servidor esté activo.
    startIframeFocusWatchdog();
  }

  async function loadHlsServer(server, myToken) {
    video.hidden = false;
    playPauseBtn.hidden = false;
    iframeEl.hidden = true;
    iframeEl.removeAttribute("src");
    updateSeekVisibility();

    showLoading();
    video.removeAttribute("src");

    let url;
    try {
      url = await resolveServerUrl(server);
    } catch (err) {
      if (myToken !== sessionToken) return; // ya no aplica: se descarta en silencio
      if (err && err.name === "AbortError") return; // cancelado a propósito, no es un error real
      showError("No se pudo obtener el enlace de este servidor.");
      return;
    }

    // Mientras esperábamos el resolve, el usuario pudo haber cerrado el
    // reproductor o cambiado de servidor/contenido. Si este resultado ya
    // no corresponde a la sesión activa, se descarta por completo: nunca
    // se arranca una reproducción "vieja" en segundo plano.
    if (myToken !== sessionToken) return;

    if (Hls.isSupported()) {
      hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (myToken !== sessionToken) return;
        hideStatus();
        video.play().catch(() => {
          /* el navegador/TV puede bloquear autoplay; el usuario da play manualmente */
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (myToken !== sessionToken) return;
        if (data.fatal) {
          showError("No se pudo cargar este servidor. Prueba con otro o vuelve a intentar.");
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (myToken !== sessionToken) return;
          hideStatus();
          video.play().catch(() => {});
        },
        { once: true }
      );
      video.addEventListener(
        "error",
        () => {
          if (myToken !== sessionToken) return;
          showError("No se pudo cargar este servidor. Prueba con otro o vuelve a intentar.");
        },
        { once: true }
      );
    } else {
      showError("Este dispositivo no soporta la reproducción de HLS.");
    }
  }

  /* ---------------------------------------------------------
     Vigilante de foco para servidores tipo iframe
     ------------------------------------------------------------
     Un iframe de otro dominio puede "atrapar" el foco del teclado
     (por ejemplo, si su propio script llama a algo como
     ventana.focus() para desbloquear el autoplay). Mientras el foco
     esté ahí dentro, el botón físico Return del control remoto deja
     de llegarle a nuestra app por completo — no es algo que se pueda
     arreglar con más lógica de navegación, porque el evento nunca
     llega a nuestro documento. La única forma práctica de evitarlo es
     vigilar activamente y recuperar el foco en cuanto eso pase.
     --------------------------------------------------------- */

  function startIframeFocusWatchdog() {
    stopIframeFocusWatchdog();
    iframeFocusWatchdog = setInterval(() => {
      if (document.activeElement === iframeEl) {
        closeBtn.focus();
      }
    }, 400);
  }

  function stopIframeFocusWatchdog() {
    if (iframeFocusWatchdog) {
      clearInterval(iframeFocusWatchdog);
      iframeFocusWatchdog = null;
    }
  }

  function renderServerButtons() {
    serverListEl.innerHTML = "";

    if (currentServers.length <= 1) return;

    currentServers.forEach((server, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "server-btn focusable" + (index === currentIndex ? " is-active" : "");
      btn.textContent = server.name || `Servidor ${index + 1}`;
      btn.addEventListener("click", () => loadServer(index));
      serverListEl.appendChild(btn);
    });
  }

  /* ---------------------------------------------------------
     Barra de controles: se atenúa sola, reaparece con cualquier tecla
     --------------------------------------------------------- */

  function showUi() {
    uiEl.classList.remove("is-hidden");
    clearTimeout(uiHideTimer);
    uiHideTimer = setTimeout(() => {
      uiEl.classList.add("is-hidden");
    }, UI_HIDE_DELAY);
  }

  function handlePlayerActivity(event) {
    if (overlay.hidden) return;
    // No interferir con las teclas de retroceso; esas ya cierran o navegan.
    if (event && (event.keyCode === 461 || event.key === "Escape")) return;
    showUi();
  }

  /* ---------------------------------------------------------
     Abrir / cerrar
     --------------------------------------------------------- */

  function open({ title, servers, returnFocusEl: origin, live }) {
    if (!servers || servers.length === 0) return;

    titleEl.textContent = title || "";
    currentServers = servers;
    returnFocusEl = origin || document.activeElement;
    isLive = live !== false; // por defecto se asume en vivo (sin barra) si no se especifica

    overlay.hidden = false;
    document.body.style.overflow = "hidden";

    playPauseBtn.innerHTML = ICON_PAUSE;
    seekEl.value = 0;
    seekEl.style.background = "rgba(255, 255, 255, 0.25)";
    timeCurrentEl.textContent = "0:00";
    timeDurationEl.textContent = "0:00";
    seekRowEl.hidden = true; // se vuelve a mostrar cuando cargue, si aplica

    showUi();
    closeBtn.focus();

    loadServer(0);
  }

  function close() {
    // Invalida cualquier resolve/callback que siga en curso de esta
    // sesión — aunque termine después, su resultado ya no se aplicará.
    sessionToken++;

    // Cancela de verdad la petición de resolve si seguía en curso.
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    stopIframeFocusWatchdog();

    destroyHls();
    video.pause(); // corta el sonido/imagen de inmediato, antes de limpiar el src
    video.removeAttribute("src");
    video.load();
    video.hidden = false;

    iframeEl.onload = null;
    iframeEl.onerror = null;
    iframeEl.src = "";
    iframeEl.hidden = true;
    playPauseBtn.hidden = false;

    seekRowEl.hidden = true;
    seekEl.value = 0;
    seekEl.style.background = "rgba(255, 255, 255, 0.25)";
    isSeeking = false;

    hideStatus();
    clearTimeout(uiHideTimer);

    overlay.hidden = true;
    document.body.style.overflow = "";
    currentServers = [];
    currentIndex = -1;

    if (returnFocusEl && document.contains(returnFocusEl)) {
      returnFocusEl.focus();
    }
    returnFocusEl = null;
  }

  /* ---------------------------------------------------------
     Eventos
     --------------------------------------------------------- */

  closeBtn.addEventListener("click", close);
  backErrorBtn.addEventListener("click", close);
  retryBtn.addEventListener("click", () => loadServer(currentIndex));

  playPauseBtn.addEventListener("click", () => {
    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  });

  video.addEventListener("play", () => (playPauseBtn.innerHTML = ICON_PAUSE));
  video.addEventListener("pause", () => (playPauseBtn.innerHTML = ICON_PLAY));

  overlay.addEventListener("click", (event) => {
    if (event.target === video) showUi();
  });

  // En pantallas táctiles no hay "mousemove": un toque sobre el video
  // (fuera de los botones) debe reaparecer los controles igual que un
  // movimiento de mouse o una tecla del control remoto.
  overlay.addEventListener("touchstart", (event) => {
    if (event.target === video) showUi();
  }, { passive: true });

  document.addEventListener("keydown", handlePlayerActivity);
  document.addEventListener("mousemove", handlePlayerActivity);

  return { open, close, isOpen: () => !overlay.hidden };
})();
