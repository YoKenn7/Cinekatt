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
  const fullscreenBtn = document.getElementById("player-fullscreen");
  const serverListEl = document.getElementById("server-list");

  const seekRowEl = document.getElementById("player-seek-row");
  const seekEl = document.getElementById("player-seek");
  const timeCurrentEl = document.getElementById("player-time-current");
  const timeDurationEl = document.getElementById("player-time-duration");
  const nextUpEl = document.getElementById("player-nextup");

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

  const ICON_FULLSCREEN_ENTER =
    '<svg class="player-btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M9 3H3v6M15 3h6v6M15 21h6v-6M9 21H3v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const ICON_FULLSCREEN_EXIT =
    '<svg class="player-btn__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M4 9h4V5M20 9h-4V5M4 15h4v4M20 15h-4v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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

  // "Continuar viendo": segundo en el que reanudar (0 = desde el
  // principio) y callback para reportar el avance mientras se reproduce.
  // Solo aplica a contenido no-en-vivo con un <video> real (no iframe).
  let resumeAtSeconds = 0;
  let onProgressCallback = null;
  let lastReportedAt = 0;
  const PROGRESS_REPORT_INTERVAL_MS = 5000;

  // "Siguiente episodio": datos del contenido a seguir (mismo formato
  // que recibe open()) y umbral de progreso al que aparece el botón.
  let currentNextUp = null;
  let nextUpShown = false;
  const NEXT_UP_THRESHOLD = 0.92;

  // Caché de resoluciones: guarda el .m3u8 ya resuelto de cada servidor
  // (por su resolveEndpoint) durante un rato corto, para no volver a
  // pasar por todo el proceso de resolución si el usuario sale y entra
  // de nuevo rápido, o si ya se precargó el siguiente episodio. Vive
  // solo en memoria (se pierde si recargas la página) y usa un tiempo
  // fijo propio, sin fiarse de la expiración que traiga cada proveedor.
  const resolveCache = new Map(); // resolveEndpoint -> { url, expiresAt }
  const RESOLVE_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 8 minutos
  const RESOLVE_CACHE_MAX_ENTRIES = 10;

  function trimResolveCache() {
    while (resolveCache.size > RESOLVE_CACHE_MAX_ENTRIES) {
      const oldestKey = resolveCache.keys().next().value;
      resolveCache.delete(oldestKey);
    }
  }

  // Precarga del siguiente episodio: se dispara al llegar al 90% del
  // actual, resolviendo en segundo plano SOLO el link (nunca descarga
  // segmentos de video), con su propio controlador de cancelación para
  // no interferir con la resolución del contenido que se está viendo.
  let preloadAbortController = null;
  let preloadTriggered = false;
  const PRELOAD_THRESHOLD = 0.9;

  /* ---------------------------------------------------------
     Resolución de la URL de reproducción
     --------------------------------------------------------- */

  async function resolveServerUrl(server, options) {
    // Si el servidor define "resolveEndpoint", se le pide la URL
    // actualizada a ese endpoint en vez de usar una fija. Si no lo
    // define (caso actual de todos tus canales/animes), se usa
    // "url" tal cual, igual que antes.
    if (!server.resolveEndpoint) {
      return server.url;
    }

    // ¿Ya lo teníamos resuelto de hace poco (o lo precargamos)? Se usa
    // directo, sin volver a pasar por todo el proceso de resolución.
    const cached = resolveCache.get(server.resolveEndpoint);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    // Las llamadas normales (reproducción en curso) usan y cancelan
    // activeAbortController; la precarga en segundo plano pasa su
    // propio "signal" para no pisarse con la resolución principal.
    const externalSignal = options && options.signal;
    let controller = null;

    if (!externalSignal) {
      if (activeAbortController) {
        activeAbortController.abort();
      }
      controller = new AbortController();
      activeAbortController = controller;
    }

    const signal = externalSignal || controller.signal;

    try {
      const res = await fetch(server.resolveEndpoint, { signal });
      if (!res.ok) throw new Error(`resolveEndpoint respondió ${res.status}`);
      const data = await res.json();
      if (!data || !data.url) throw new Error("respuesta sin campo 'url'");

      resolveCache.set(server.resolveEndpoint, {
        url: data.url,
        expiresAt: Date.now() + RESOLVE_CACHE_TTL_MS
      });
      trimResolveCache();

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
      if (controller && activeAbortController === controller) {
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
        "Ya casi esta!, espera un poco mas :D";
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

  /**
   * Espera a que se acumule un colchón mínimo de buffer por delante del
   * punto de reproducción antes de darle play() — evita el corte típico
   * de "arranca y se traba a los 2 segundos" por reproducir apenas llega
   * el primer fragmento. Tiene un tope de espera para no sentirse más
   * lento de lo necesario si la conexión ya viene bien.
   */
  function waitForMinimalBuffer(minSeconds, maxWaitMs) {
    return new Promise((resolve) => {
      const start = Date.now();
      function check() {
        const buffered = video.buffered;
        let bufferedAhead = 0;
        if (buffered.length > 0) {
          bufferedAhead = buffered.end(buffered.length - 1) - video.currentTime;
        }
        if (bufferedAhead >= minSeconds || Date.now() - start > maxWaitMs) {
          resolve();
        } else {
          setTimeout(check, 150);
        }
      }
      check();
    });
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

    if (onProgressCallback && Date.now() - lastReportedAt > PROGRESS_REPORT_INTERVAL_MS) {
      lastReportedAt = Date.now();
      onProgressCallback(video.currentTime, video.duration);
    }

    if (currentNextUp && !preloadTriggered && video.duration > 0) {
      if (video.currentTime / video.duration >= PRELOAD_THRESHOLD) {
        preloadTriggered = true;
        preloadNextEpisode(currentNextUp);
      }
    }

    if (currentNextUp && !nextUpShown && video.duration > 0) {
      if (video.currentTime / video.duration >= NEXT_UP_THRESHOLD) {
        nextUpShown = true;
        nextUpEl.hidden = false;
      }
    }
  });

  video.addEventListener("ended", () => {
    if (currentNextUp) {
      goToNextUp();
    }
  });

  nextUpEl.addEventListener("click", goToNextUp);

  function goToNextUp() {
    const next = currentNextUp;
    if (!next) return;
    openNext(next);
  }

  /**
   * Resuelve en segundo plano SOLO el link del siguiente episodio (nunca
   * descarga video), para que esté listo en el caché cuando el usuario
   * llegue ahí. No toca la reproducción actual ni su propio controlador
   * de cancelación — vive completamente aparte.
   */
  async function preloadNextEpisode(nextUpParams) {
    const server = nextUpParams && nextUpParams.servers && nextUpParams.servers[0];
    if (!server || !server.resolveEndpoint) return; // nada que precargar (url fija o iframe)

    const cached = resolveCache.get(server.resolveEndpoint);
    if (cached && cached.expiresAt > Date.now()) return; // ya está listo

    if (preloadAbortController) {
      preloadAbortController.abort();
    }
    const controller = new AbortController();
    preloadAbortController = controller;

    try {
      await resolveServerUrl(server, { signal: controller.signal });
    } catch {
      // Si falla o se cancela, no pasa nada: se resolverá normal cuando
      // el usuario de verdad llegue a ese episodio.
    } finally {
      if (preloadAbortController === controller) {
        preloadAbortController = null;
      }
    }
  }

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
      hls = new Hls({
        // Arranca en la calidad MÁS BAJA disponible y sube sola si la
        // conexión lo permite, en vez de adivinar una calidad alta con
        // el primer fragmento (que puede haber llegado rápido "de
        // suerte") y trabarse en cuanto se acaba ese colchón inicial.
        startLevel: 0,
        // No acumula más de 60s de buffer YA REPRODUCIDO en memoria —
        // se descarta lo viejo. Evita que una sesión larga viendo
        // episodios seguidos vaya consumiendo cada vez más RAM.
        backBufferLength: 60
      });
      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, async () => {
        if (myToken !== sessionToken) return;
        if (resumeAtSeconds > 0) {
          video.currentTime = resumeAtSeconds;
        }

        // Espera un colchón corto antes de reproducir (máx. 4s de
        // espera) — si ya está listo antes, no se pierde tiempo extra.
        await waitForMinimalBuffer(2.5, 4000);
        if (myToken !== sessionToken) return; // pudo cambiar mientras esperábamos

        hideStatus();
        video.play().catch(() => {
          /* el navegador/TV puede bloquear autoplay; el usuario da play manualmente */
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (myToken !== sessionToken) return;
        if (data.fatal) {
          showError("No se pudo cargar este servidor. Prueba con otro o vuelve a intentar.");
        } else {
          // No fatal: HLS.js normalmente se recupera solo (por eso el
          // corte "se traba y sigue"). Se deja registrado para poder
          // confirmar si los ajustes de buffer reducen su frecuencia.
          console.warn("HLS.js: error no fatal:", data.type, data.details);
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.addEventListener(
        "loadedmetadata",
        async () => {
          if (myToken !== sessionToken) return;
          if (resumeAtSeconds > 0) {
            video.currentTime = resumeAtSeconds;
          }
          await waitForMinimalBuffer(2.5, 4000);
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
     Pantalla completa (botón visible solo en móvil vía CSS)
     ------------------------------------------------------------
     Se pide fullscreen sobre "overlay" (no solo sobre el <video>) para
     que la barra de controles propia también quede dentro de la
     pantalla completa. El único caso sin esa opción es Safari de iOS
     viejo (antes de la versión 16.4), que solo sabe poner en pantalla
     completa el <video> directamente vía webkitEnterFullscreen; ahí se
     usa como último recurso, aunque eso oculte la UI personalizada.
     --------------------------------------------------------- */

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function updateFullscreenIcon() {
    if (!fullscreenBtn) return;
    const active = !!getFullscreenElement();
    fullscreenBtn.innerHTML = active ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN_ENTER;
    fullscreenBtn.setAttribute(
      "aria-label",
      active ? "Salir de pantalla completa" : "Pantalla completa"
    );
  }

  // Al entrar en pantalla completa en móvil, fuerza landscape (el video
  // se ve mucho mejor horizontal que vertical). Safari de iOS no
  // implementa este API todavía, así que ahí simplemente no pasa nada
  // y la persona rota el teléfono a mano — no rompe nada, solo no
  // auto-rota. Se libera el bloqueo al salir de pantalla completa para
  // no dejar el teléfono "trabado" en horizontal en el resto de la app.
  function lockLandscape() {
    if (screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
  }

  function unlockOrientation() {
    if (screen.orientation && screen.orientation.unlock) {
      try {
        screen.orientation.unlock();
      } catch (err) {
        /* algunos navegadores tiran error si nunca hubo lock activo */
      }
    }
  }

  function handleFullscreenChange() {
    updateFullscreenIcon();

    if (!document.documentElement.classList.contains("is-mobile")) return;

    if (getFullscreenElement()) {
      lockLandscape();
    } else {
      unlockOrientation();
    }
  }

  function toggleFullscreen() {
    if (getFullscreenElement()) {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      return;
    }

    if (overlay.requestFullscreen) {
      overlay.requestFullscreen().catch(() => {});
    } else if (overlay.webkitRequestFullscreen) {
      overlay.webkitRequestFullscreen();
    } else if (video.webkitEnterFullscreen) {
      video.webkitEnterFullscreen();
    }
  }

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener("click", toggleFullscreen);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
  }

  /* ---------------------------------------------------------
     Abrir / cerrar
     --------------------------------------------------------- */

  function open({ title, servers, returnFocusEl: origin, live, resumeAt, onProgress, nextUp }) {
    if (!servers || servers.length === 0) return;

    titleEl.textContent = title || "";
    currentServers = servers;
    returnFocusEl = origin || document.activeElement;
    isLive = live !== false; // por defecto se asume en vivo (sin barra) si no se especifica

    resumeAtSeconds = isLive ? 0 : (resumeAt || 0);
    onProgressCallback = isLive ? null : (onProgress || null);
    lastReportedAt = 0;
    currentNextUp = isLive ? null : (nextUp || null);
    nextUpShown = false;
    preloadTriggered = false;
    nextUpEl.hidden = true;

    overlay.hidden = false;
    document.body.style.overflow = "hidden";

    playPauseBtn.innerHTML = ICON_PAUSE;
    updateFullscreenIcon();
    seekEl.value = 0;
    seekEl.style.background = "rgba(255, 255, 255, 0.25)";
    timeCurrentEl.textContent = "0:00";
    timeDurationEl.textContent = "0:00";
    seekRowEl.hidden = true; // se vuelve a mostrar cuando cargue, si aplica

    showUi();
    closeBtn.focus();

    loadServer(0);
  }

  /**
   * Pasa al siguiente contenido (ej. el próximo episodio) SIN cerrar el
   * reproductor ni salir de pantalla completa — a diferencia de open(),
   * no toca el overlay ni el foco de "volver", solo reemplaza qué se
   * está reproduciendo. Se usa desde el botón "Siguiente episodio" y al
   * terminar el video automáticamente.
   */
  function openNext({ title, servers, resumeAt, onProgress, nextUp }) {
    if (!servers || servers.length === 0) return;

    titleEl.textContent = title || "";
    currentServers = servers;

    resumeAtSeconds = resumeAt || 0;
    onProgressCallback = onProgress || null;
    lastReportedAt = 0;
    currentNextUp = nextUp || null;
    nextUpShown = false;
    preloadTriggered = false;
    nextUpEl.hidden = true;

    playPauseBtn.innerHTML = ICON_PAUSE;
    seekEl.value = 0;
    seekEl.style.background = "rgba(255, 255, 255, 0.25)";
    timeCurrentEl.textContent = "0:00";
    timeDurationEl.textContent = "0:00";
    seekRowEl.hidden = true;

    showUi();
    loadServer(0);
  }

  function close() {
    // Reporta el punto exacto donde se quedó, ANTES de tocar el video.
    // Si esto era un servidor tipo iframe, currentTime/duration nunca se
    // llenaron de verdad, así que el guardado del lado de la app los
    // descarta solo (duración inválida) — no hace falta distinguir aquí.
    if (onProgressCallback) {
      onProgressCallback(video.currentTime, video.duration);
    }
    onProgressCallback = null;
    resumeAtSeconds = 0;
    currentNextUp = null;
    nextUpShown = false;
    preloadTriggered = false;
    nextUpEl.hidden = true;

    // Invalida cualquier resolve/callback que siga en curso de esta
    // sesión — aunque termine después, su resultado ya no se aplicará.
    sessionToken++;

    // Cancela de verdad la petición de resolve si seguía en curso.
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
    }

    // Cancela también cualquier precarga del siguiente episodio que
    // siguiera en curso — si el usuario ya se fue, no tiene sentido
    // seguir gastando la petición.
    if (preloadAbortController) {
      preloadAbortController.abort();
      preloadAbortController = null;
    }

    stopIframeFocusWatchdog();

    if (getFullscreenElement()) {
      if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }

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
