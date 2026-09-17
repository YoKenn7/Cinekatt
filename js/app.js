/**
 * app.js
 * ------------------------------------------------------------------
 * Punto de entrada de la app: controla la barra lateral (sidenav),
 * pinta las tarjetas de canales, pinta el carrusel/categorías de
 * anime, y define qué hace el botón Return en cada nivel:
 *
 *   Cualquier sección raíz:  foco → ítem activo de la barra lateral
 *   Anime (episodios):       Reproductor → Capítulos → Series
 *   TV / Anime:               Reproductor → Grilla de origen
 * ------------------------------------------------------------------
 */

// Estado de navegación (para saber qué hace el botón Return)
const NavState = {
  section: "inicio", // "inicio" | "anime" | "peliculas" | "series" | "tv"
  animeLevel: "series" // "series" | "episodes" (solo aplica si section === "anime")
};

// Contenedor con el primer elemento a enfocar al entrar a cada sección.
const FIRST_FOCUS_ID = {
  inicio: "home-grid",
  anime: "anime-browse",
  peliculas: "movies-grid",
  series: "series-grid",
  tv: "channel-grid"
};

document.addEventListener("DOMContentLoaded", async () => {
  TVNav.init();
  TVNav.onBack(handleBack);

  setupSidenav();
  renderChannels();

  await loadAnimeSeries(); // carga js/anime/series/*.js listados en anime-loader.js
  renderAnime();

  await loadMovies(); // carga js/movies/items/*.js listados en movies-loader.js
  renderMovies();

  renderContinueWatching();

  // Foco inicial: primer acceso rápido de Inicio.
  TVNav.focusFirstIn(document.getElementById("home-grid")) ||
    TVNav.focusFirstIn(document.querySelector(".sidenav__nav"));
});

/* ---------------------------------------------------------
   Botón Return: qué hacer según el nivel actual
   --------------------------------------------------------- */

function handleBack() {
  // 1. Reproductor abierto: ciérralo (Player.close ya cancela cualquier
  //    resolve pendiente y detiene el video/iframe). Manejado.
  if (Player.isOpen()) {
    Player.close();
    return true;
  }

  // 2. Viendo los episodios de una serie: vuelve a la lista de series.
  if (NavState.section === "anime" && NavState.animeLevel === "episodes") {
    renderAnimeSeries();
    return true;
  }

  // 3. Estamos en cualquier sección que no sea Inicio: vuelve a Inicio.
  if (NavState.section !== "inicio") {
    goToSection("inicio");
    return true;
  }

  // 4. Ya estamos en Inicio: no hay a dónde más volver dentro de la app.
  // Devolvemos false para NO interceptar el evento — así el sistema de
  // la TV hace su acción por defecto (salir de la aplicación).
  return false;
}

/* ---------------------------------------------------------
   TV en Vivo
   --------------------------------------------------------- */

function renderChannels() {
  const grid = document.getElementById("channel-grid");
  grid.innerHTML = "";

  CHANNELS.forEach((channel) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "channel-card focusable";
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", `Ver ${channel.name}`);

    const logoWrap = document.createElement("div");
    logoWrap.className = "channel-card__logo";

    const img = document.createElement("img");
    img.src = channel.logo;
    img.alt = channel.name;
    img.loading = "lazy";
    img.onerror = () => {
      logoWrap.innerHTML = "";
      logoWrap.appendChild(buildBadge(channel.name));
    };
    logoWrap.appendChild(img);

    const name = document.createElement("span");
    name.className = "channel-card__name";
    name.textContent = channel.name;

    card.appendChild(logoWrap);
    card.appendChild(name);

    card.addEventListener("click", () => {
      Player.open({ title: channel.name, servers: channel.servers, returnFocusEl: card, live: true });
    });

    grid.appendChild(card);
  });
}

/* ---------------------------------------------------------
   Anime (series → episodios → servidores)
   --------------------------------------------------------- */

function renderAnime() {
  renderAnimeSeries();
}

// Construye una tarjeta de serie reutilizable para la cuadrícula.
function buildAnimeCard(serie) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "anime-card focusable";
  card.setAttribute("role", "listitem");
  card.setAttribute("aria-label", `Ver episodios de ${serie.title}`);

  const cover = document.createElement("div");
  cover.className = "anime-card__cover";

  if (serie.cover) {
    const img = document.createElement("img");
    img.src = serie.cover;
    img.alt = serie.title;
    img.loading = "lazy";
    img.onerror = () => {
      img.remove();
      cover.appendChild(buildAnimeBadge(serie.title));
    };
    cover.appendChild(img);
  } else {
    cover.appendChild(buildAnimeBadge(serie.title));
  }

  const name = document.createElement("span");
  name.className = "anime-card__name";
  name.textContent = serie.title;

  const meta = document.createElement("div");
  meta.className = "anime-card__meta";

  const total = serie.episodes ? serie.episodes.length : 0;
  const epCount = document.createElement("span");
  epCount.className = "anime-card__episodes";
  epCount.textContent = total === 1 ? "1 episodio" : `${total} episodios`;
  meta.appendChild(epCount);

  // El campo "rating" es opcional en los datos de cada serie; si no
  // existe, la tarjeta simplemente no muestra la calificación.
  if (serie.rating !== undefined && serie.rating !== null && serie.rating !== "") {
    const rating = document.createElement("span");
    rating.className = "anime-card__rating";
    rating.textContent = `★ ${serie.rating}`;
    meta.appendChild(rating);
  }

  card.appendChild(cover);
  card.appendChild(name);
  card.appendChild(meta);

  card.addEventListener("click", () => renderAnimeEpisodes(serie));

  return card;
}

function buildAnimeBadge(text) {
  const badge = document.createElement("span");
  badge.className = "anime-card__badge";
  badge.textContent = (text || "").trim().charAt(0).toUpperCase();
  return badge;
}

// Vista 1: todo el anime disponible, en una sola cuadrícula.
function renderAnimeSeries() {
  NavState.section = "anime";
  NavState.animeLevel = "series";

  const browse = document.getElementById("anime-browse");
  const episodesGrid = document.getElementById("anime-episodes-grid");
  const crumb = document.getElementById("anime-breadcrumb");
  const grid = document.getElementById("anime-grid");

  crumb.hidden = true;
  crumb.innerHTML = "";
  episodesGrid.hidden = true;
  episodesGrid.innerHTML = "";
  browse.hidden = false;
  grid.innerHTML = "";

  if (!ANIME_SERIES || ANIME_SERIES.length === 0) {
    grid.appendChild(buildEmptyState(
      "Todavía no hay anime cargado",
      "En cuanto agregues series a <code>js/anime/series/</code>, aparecerán aquí.",
      "🎌"
    ));
    return;
  }

  ANIME_SERIES.forEach((serie) => {
    grid.appendChild(buildAnimeCard(serie));
  });

  TVNav.focusFirstIn(grid);
}

// Vista 2: episodios de una serie
function renderAnimeEpisodes(serie) {
  NavState.section = "anime";
  NavState.animeLevel = "episodes";

  const browse = document.getElementById("anime-browse");
  const grid = document.getElementById("anime-episodes-grid");
  const crumb = document.getElementById("anime-breadcrumb");

  browse.hidden = true;
  grid.hidden = false;
  grid.innerHTML = "";

  crumb.hidden = false;
  crumb.innerHTML = "";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "breadcrumb__back focusable";
  backBtn.innerHTML = "&larr; Series";
  backBtn.addEventListener("click", renderAnimeSeries);

  const seriesName = document.createElement("span");
  seriesName.className = "breadcrumb__current";
  seriesName.textContent = serie.title;

  crumb.appendChild(backBtn);
  crumb.appendChild(seriesName);

  if (!serie.episodes || serie.episodes.length === 0) {
    grid.appendChild(buildEmptyState(
      "Esta serie no tiene episodios todavía",
      "Agrega episodios en su archivo dentro de <code>js/anime/series/</code>."
    ));
    return;
  }

  serie.episodes.forEach((episode, index) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "channel-card focusable";
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", `Ver ${episode.title}`);

    const logoWrap = document.createElement("div");
    logoWrap.className = "channel-card__logo";

    if (episode.thumbnail) {
      const img = document.createElement("img");
      img.src = episode.thumbnail;
      img.alt = episode.title;
      img.loading = "lazy";
      img.onerror = () => {
        logoWrap.innerHTML = "";
        logoWrap.appendChild(buildBadge(episode.title));
      };
      logoWrap.appendChild(img);
    } else {
      logoWrap.appendChild(buildBadge(episode.title));
    }

    const name = document.createElement("span");
    name.className = "channel-card__name";
    name.textContent = episode.title;

    card.appendChild(logoWrap);
    card.appendChild(name);

    card.addEventListener("click", () => {
      const params = buildEpisodeOpenParams(serie, index);
      if (!params) return;
      Player.open({ ...params, returnFocusEl: card });
    });

    grid.appendChild(card);
  });

  TVNav.focusFirstIn(grid);
}

// Construye los parámetros listos para Player.open()/openNext() de un
// episodio, incluyendo (de forma recursiva) los del episodio siguiente
// en "nextUp" — así el reproductor puede mostrar el botón "Siguiente
// episodio" y avanzar solo sin que la app tenga que intervenir.
function buildEpisodeOpenParams(serie, index) {
  const episode = serie.episodes[index];
  if (!episode) return null;

  const contentId = `anime:${serie.id}:${episode.id}`;
  const saved = ContinueWatching.getProgress(contentId);
  const nextEpisode = serie.episodes[index + 1] || null;
  const nextParams = nextEpisode ? buildEpisodeOpenParams(serie, index + 1) : null;

  let alreadyAdvanced = false; // evita repetir la escritura cada 5s tras el 92%

  return {
    title: `${serie.title} — ${episode.title}`,
    servers: episode.servers,
    live: false,
    resumeAt: saved ? saved.currentTime : 0,
    onProgress: (currentTime, duration) => {
      const ratio = duration > 0 ? currentTime / duration : 0;

      if (ratio >= 0.92) {
        if (!alreadyAdvanced) {
          alreadyAdvanced = true;
          ContinueWatching.remove(contentId);
          if (nextEpisode) {
            ContinueWatching.upsertNext({
              id: `anime:${serie.id}:${nextEpisode.id}`,
              title: `${serie.title} — ${nextEpisode.title}`,
              cover: nextEpisode.thumbnail || serie.cover || null,
              kind: "anime",
              servers: nextEpisode.servers
            });
          }
          renderContinueWatching();
        }
      } else {
        ContinueWatching.upsert({
          id: contentId,
          title: `${serie.title} — ${episode.title}`,
          cover: episode.thumbnail || serie.cover || null,
          kind: "anime",
          servers: episode.servers,
          currentTime,
          duration
        });
        renderContinueWatching();
      }
    },
    nextUp: nextParams
  };
}

// Busca a qué serie/episodio corresponde un id guardado en Continuar
// viendo (formato "anime:<serieId>:<episodeId>"). Devuelve null si la
// serie o el episodio ya no existen (por ejemplo, si se renombró el id).
function findAnimeEpisodeByContentId(id) {
  const parts = id.split(":");
  if (parts.length < 3 || parts[0] !== "anime") return null;

  const serieId = parts[1];
  const episodeId = parts.slice(2).join(":");

  const serie = ANIME_SERIES.find((s) => s.id === serieId);
  if (!serie || !serie.episodes) return null;

  const index = serie.episodes.findIndex((ep) => ep.id === episodeId);
  if (index === -1) return null;

  return { serie, index };
}

function buildBadge(text) {
  const badge = document.createElement("span");
  badge.className = "channel-card__badge";
  badge.textContent = (text || "").trim().charAt(0).toUpperCase();
  return badge;
}

function buildEmptyState(title, html, icon = "🎌") {
  const wrap = document.createElement("div");
  wrap.className = "empty-state";
  wrap.innerHTML = `
    <span class="empty-state__icon" aria-hidden="true">${icon}</span>
    <h3>${title}</h3>
    <p>${html}</p>
  `;
  return wrap;
}

/* ---------------------------------------------------------
   Películas
   ------------------------------------------------------------
   Misma idea que TV en Vivo: cada película es un solo ítem
   reproducible (no tiene episodios), así que reutiliza la
   tarjeta ".channel-card". Los datos vienen de MOVIES, que se
   arma igual que ANIME_SERIES: un archivo por película dentro
   de js/movies/items/ (ver js/movies-loader.js).
   --------------------------------------------------------- */

function renderMovies() {
  const grid = document.getElementById("movies-grid");
  grid.innerHTML = "";

  if (!MOVIES || MOVIES.length === 0) {
    grid.appendChild(buildEmptyState(
      "Todavía no hay películas cargadas",
      "En cuanto agregues películas a <code>js/movies/items/</code>, aparecerán aquí.",
      "🎬"
    ));
    return;
  }

  MOVIES.forEach((movie) => {
    grid.appendChild(buildMovieCard(movie));
  });
}

// Misma estructura visual que buildAnimeCard() (mismo cover vertical,
// mismas proporciones/espaciado/bordes) — la única diferencia es que al
// hacer clic abre el reproductor directo, porque una película no tiene
// episodios que listar primero.
function buildMovieCard(movie) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "anime-card focusable";
  card.setAttribute("role", "listitem");
  card.setAttribute("aria-label", `Ver ${movie.title}`);

  const cover = document.createElement("div");
  cover.className = "anime-card__cover";

  if (movie.cover) {
    const img = document.createElement("img");
    img.src = movie.cover;
    img.alt = movie.title;
    img.loading = "lazy";
    img.onerror = () => {
      img.remove();
      cover.appendChild(buildAnimeBadge(movie.title));
    };
    cover.appendChild(img);
  } else {
    cover.appendChild(buildAnimeBadge(movie.title));
  }

  const name = document.createElement("span");
  name.className = "anime-card__name";
  name.textContent = movie.title;

  card.appendChild(cover);
  card.appendChild(name);

  card.addEventListener("click", () => {
    const contentId = `movie:${movie.id}`;
    const saved = ContinueWatching.getProgress(contentId);

    Player.open({
      title: movie.title,
      servers: movie.servers,
      returnFocusEl: card,
      live: false,
      resumeAt: saved ? saved.currentTime : 0,
      onProgress: (currentTime, duration) => {
        ContinueWatching.upsert({
          id: contentId,
          title: movie.title,
          cover: movie.cover || null,
          kind: "movie",
          servers: movie.servers,
          currentTime,
          duration
        });
        renderContinueWatching();
      }
    });
  });

  return card;
}

/* ---------------------------------------------------------
   Continuar viendo
   --------------------------------------------------------- */

function renderContinueWatching() {
  const section = document.getElementById("continue-watching");
  const row = document.getElementById("continue-watching-row");

  const entries = ContinueWatching.getAll();
  row.innerHTML = "";

  if (entries.length === 0) {
    section.hidden = true;
    return;
  }

  section.hidden = false;
  entries.forEach((entry) => {
    row.appendChild(buildContinueWatchingCard(entry));
  });
}

function buildContinueWatchingCard(entry) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "anime-card cw-card focusable";
  card.setAttribute("role", "listitem");
  card.setAttribute("aria-label", `Continuar viendo ${entry.title}`);

  const cover = document.createElement("div");
  cover.className = "anime-card__cover";

  if (entry.cover) {
    const img = document.createElement("img");
    img.src = entry.cover;
    img.alt = entry.title;
    img.loading = "lazy";
    img.onerror = () => {
      img.remove();
      cover.appendChild(buildAnimeBadge(entry.title));
    };
    cover.appendChild(img);
  } else {
    cover.appendChild(buildAnimeBadge(entry.title));
  }

  if (entry.isNext) {
    const badge = document.createElement("span");
    badge.className = "cw-card__next-badge";
    badge.textContent = "Siguiente";
    cover.appendChild(badge);
  } else {
    const track = document.createElement("div");
    track.className = "cw-card__progress-track";
    const fill = document.createElement("div");
    fill.className = "cw-card__progress-fill";
    const pct = entry.duration > 0 ? Math.min(100, (entry.currentTime / entry.duration) * 100) : 0;
    fill.style.width = `${pct}%`;
    track.appendChild(fill);
    cover.appendChild(track);
  }

  const name = document.createElement("span");
  name.className = "anime-card__name";
  name.textContent = entry.title;

  card.appendChild(cover);
  card.appendChild(name);

  card.addEventListener("click", () => {
    if (entry.kind === "anime") {
      const found = findAnimeEpisodeByContentId(entry.id);
      if (found) {
        const params = buildEpisodeOpenParams(found.serie, found.index);
        if (params) {
          Player.open({ ...params, returnFocusEl: card });
          return;
        }
      }
    }

    // Respaldo: la serie/episodio ya no existe en el catálogo (o es una
    // película), pero igual se puede reproducir con los datos guardados.
    Player.open({
      title: entry.title,
      servers: entry.servers,
      returnFocusEl: card,
      live: false,
      resumeAt: entry.currentTime,
      onProgress: (currentTime, duration) => {
        ContinueWatching.upsert({ ...entry, currentTime, duration });
        renderContinueWatching();
      }
    });
  });

  return card;
}

/* ---------------------------------------------------------
   Barra lateral (sidenav) y navegación entre secciones
   --------------------------------------------------------- */

function setupSidenav() {
  const sidenav = document.getElementById("sidenav");
  const items = document.querySelectorAll(".sidenav__item");

  const expand = () => sidenav.classList.add("is-expanded");
  const collapse = () => sidenav.classList.remove("is-expanded");

  // Se expande cuando el foco del control remoto entra en la barra...
  sidenav.addEventListener("focusin", expand);
  sidenav.addEventListener("focusout", (event) => {
    if (sidenav.contains(event.relatedTarget)) return; // el foco sigue dentro
    collapse();
  });

  // ...y también con el mouse (navegador de PC), sin afectar al remoto.
  sidenav.addEventListener("mouseenter", expand);
  sidenav.addEventListener("mouseleave", () => {
    if (!sidenav.contains(document.activeElement)) collapse();
  });

  items.forEach((item) => {
    item.addEventListener("click", () => goToSection(item.dataset.section));
  });

  // Accesos rápidos de la sección Inicio.
  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => goToSection(btn.dataset.goto));
  });
}

function goToSection(key) {
  if (!FIRST_FOCUS_ID[key]) return;

  document.querySelectorAll(".sidenav__item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.section === key);
  });

  document.querySelectorAll("main.content > .section").forEach((section) => {
    section.classList.toggle("is-active", section.id === `section-${key}`);
  });

  NavState.section = key;

  if (key === "inicio") {
    renderContinueWatching();
  }

  const focusContainer = document.getElementById(FIRST_FOCUS_ID[key]);
  TVNav.focusFirstIn(focusContainer) ||
    TVNav.focusFirstIn(document.querySelector(`.sidenav__item[data-section="${key}"]`));
}
