// ===============================
// Estado global
// ===============================
let MISCRITS = [];
let DAY_PRESETS = {};
let ZONE_PRESETS = {};
let OBJECT_PRESETS = {};

let FILTERED = [];
let PAGE = 1;
let PER_PAGE = 36;

// ===============================
// Helpers DOM / texto
// ===============================
const $ = (sel) => document.querySelector(sel);

function stripDiacritics(str) {
  return (str ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const DAY_ES_TO_EN = {
  "domingo": "Sunday",
  "lunes": "Monday",
  "martes": "Tuesday",
  "miercoles": "Wednesday",
  "jueves": "Thursday",
  "viernes": "Friday",
  "sabado": "Saturday"
};

function dayToEnglish(dayEs) {
  const key = stripDiacritics(dayEs).trim().toLowerCase();
  return DAY_ES_TO_EN[key] ?? dayEs;
}


function getServerDayName() {
  const now = new Date(
    new Date().toLocaleString("en-US", {
      timeZone: "America/Santiago"
    })
  );

  const resetHour = 21;
  if (now.getHours() >= resetHour) {
    now.setDate(now.getDate() + 1);
  }

  const daysEs = [
    "Domingo",
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado"
  ];

  return daysEs[now.getDay()];
}

function normalize(str) {
  return stripDiacritics(str).trim().toLowerCase();
}

function matchesText(haystack, needle) {
  if (!needle) return true;
  return normalize(haystack).includes(normalize(needle));
}

function equalsNormalized(a, b) {
  return normalize(a) === normalize(b);
}

function isRarePlus(rarityRaw) {
  const r = normalize(rarityRaw);
  return ["rare", "epic", "exotic", "legendary"].includes(r);
}

// ===============================
// Cargar JSON
// ===============================
async function loadMiscrits() {
  const res = await fetch("./miscrits.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} cargando miscrits.json`);
  const data = await res.json();

  DAY_PRESETS = data.presets ?? {};
  ZONE_PRESETS = data.ZONES ?? {};
  OBJECT_PRESETS = data.OBJECTS ?? {};
  MISCRITS = data.miscrits ?? [];
}

function resolvePreset(value, presets) {
  if (typeof value === "string") return presets[value] ?? [];
  return Array.isArray(value) ? value : [];
}

function resolveDays(days) {
  return resolvePreset(days, DAY_PRESETS);
}

function includesDay(daysArray, selectedDay) {
  return (daysArray ?? []).some((d) => equalsNormalized(d, selectedDay));
}

// ===============================
// URL Filters + paginación
// ===============================
const FILTER_KEYS = ["q", "day", "place", "rarity", "page", "perPage"];

function defaultFilters() {
  return {
    q: "",
    day: "",
    place: "",
    rarity: "",
    page: "1",
    perPage: "36",
  };
}

function getFiltersFromUI() {
  return {
    q: $("#q")?.value ?? "",
    day: $("#day")?.value ?? "",
    place: $("#place")?.value ?? "",
    rarity: $("#rarity")?.value ?? "",
    page: String(PAGE),
    perPage: String(PER_PAGE),
  };
}

function setFiltersToUI(f) {
  if (!f) return;
  if ($("#q")) $("#q").value = f.q ?? "";
  if ($("#day")) $("#day").value = f.day ?? "";
  if ($("#place")) $("#place").value = f.place ?? "";
  if ($("#rarity")) $("#rarity").value = f.rarity ?? "";
  if ($("#pageSize") && f.perPage) $("#pageSize").value = f.perPage;
}

function getFiltersFromURL() {
  const sp = new URLSearchParams(window.location.search);
  const f = {};
  for (const k of FILTER_KEYS) f[k] = sp.get(k) ?? "";
  return f;
}

function updateURLFromFilters(filters) {
  const d = defaultFilters();
  const sp = new URLSearchParams();

  for (const k of FILTER_KEYS) {
    const v = (filters?.[k] ?? "").toString().trim();
    const dv = (d?.[k] ?? "").toString().trim();
    if (!v || v === dv) continue;
    sp.set(k, v);
  }

  const newQuery = sp.toString();
  const newUrl = `${window.location.pathname}${newQuery ? "?" + newQuery : ""}`;
  window.history.replaceState({}, "", newUrl);
}

// ===============================
// Fondo overlay por lugar
// ===============================
function placeToImageFilename(place) {
  if (!place) return "default.jpg";
  return (
    place
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^\w_]/g, "") + ".jpg"
  );
}

function applySpawnBackground(box, place) {
  const file = placeToImageFilename(place);
  box.style.setProperty("--spawn-bg", `url("./assets/images/places/${file}")`);
}

// ===============================
// Badge rareza
// ===============================
function rarityToBadgeClass(rarityRaw) {
  const r = (rarityRaw ?? "").toString().trim().toLowerCase();
  if (!r) return "";
  return `badge--${r}`;
}

// ===============================
// Type icon helper
// ===============================
function typeToKey(typeRaw) {
  return (typeRaw ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function typeIconHTML(typeRaw) {
  const key = typeToKey(typeRaw);
  if (!key) return "";
  const safeAlt = (typeRaw ?? "").toString();
  return `
    <img
      class="type-icon"
      src="./assets/images/type/${key}.png"
      alt="Tipo ${safeAlt}"
      title="Tipo: ${safeAlt}"
      loading="lazy"
      onerror="this.style.display='none'"
    />
  `;
}

// ===============================
// Paginación helpers
// ===============================
function clampPage(page, totalPages) {
  if (totalPages <= 1) return 1;
  if (page < 1) return 1;
  if (page > totalPages) return totalPages;
  return page;
}

function getPaged(list) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  PAGE = clampPage(PAGE, totalPages);

  const startIdx = (PAGE - 1) * PER_PAGE;
  const endIdx = Math.min(startIdx + PER_PAGE, total);
  const slice = list.slice(startIdx, endIdx);

  return { slice, total, totalPages, startIdx, endIdx };
}

function updatePagerUI(total, totalPages, startIdx, endIdx) {
  const info = $("#pageInfo");
  const btnPrev = $("#btnPrev");
  const btnNext = $("#btnNext");

  if (info) {
    if (total === 0) info.textContent = "Sin resultados";
    else info.textContent = `Mostrando ${startIdx + 1}-${endIdx} de ${total} • Página ${PAGE}/${totalPages}`;
  }

  if (btnPrev) btnPrev.disabled = PAGE <= 1;
  if (btnNext) btnNext.disabled = PAGE >= totalPages;
}

// ===============================
// Render
// ===============================
function render(listPaged, total, totalPages, startIdx, endIdx) {
  const results = $("#results");
  const count = $("#count");
  if (!results || !count) return;

  results.innerHTML = "";
  count.textContent = `${total} resultado(s)`;

  updatePagerUI(total, totalPages, startIdx, endIdx);

  if (total === 0) {
    const div = document.createElement("div");
    div.className = "empty card";
    div.textContent = "No se encontraron Miscrits con esos filtros.";
    results.appendChild(div);
    return;
  }

  const tpl = $("#miscritCard");
  if (!tpl) {
    console.error("No existe el template #miscritCard en index.html");
    return;
  }

  for (const m of listPaged) {
    const node = tpl.content.cloneNode(true);
    const avatarEl = node.querySelector(".miscrit__avatar");
    if (avatarEl) {
      avatarEl.src = `./assets/images/miscrits_avatar/${m.avatar ?? "preset_avatar.png"}`;
      avatarEl.alt = m.name ?? "Miscrit";
      avatarEl.loading = "lazy";
      avatarEl.onerror = () => {
        avatarEl.src = "./assets/images/miscrits_avatar/preset_avatar.png";
      };
    }

    const nameEl = node.querySelector(".miscrit__name");
    if (nameEl) {
      const wrap = document.createElement("div");
      wrap.className = "name-row";
      wrap.innerHTML = `${typeIconHTML(m.type)}<span class="name-text"></span>`;
      wrap.querySelector(".name-text").textContent = m.name ?? "(sin nombre)";
      nameEl.replaceWith(wrap);
    }

    const typeEl = node.querySelector(".miscrit__type");
    if (typeEl) typeEl.textContent = "";

    const badgeEl = node.querySelector(".badge");
    if (badgeEl) {
      badgeEl.textContent = m.rarity ?? "-";
      badgeEl.classList.remove(
        "badge--common",
        "badge--rare",
        "badge--epic",
        "badge--exotic",
        "badge--legendary"
      );
      const cls = rarityToBadgeClass(m.rarity);
      if (cls) badgeEl.classList.add(cls);
    }

    const spawnsWrap = node.querySelector(".spawns");
    if (spawnsWrap) {
      spawnsWrap.innerHTML = "";

      for (const s of (m.spawns ?? [])) {
        const box = document.createElement("div");
        box.className = "spawn";
        applySpawnBackground(box, s.place);

        const top = document.createElement("div");
        top.className = "spawn__top";

        const place = document.createElement("div");
        place.className = "spawn__place";
        place.textContent = s.place ?? "-";

        const lvl = document.createElement("div");
        lvl.className = "spawn__lvl";
        lvl.textContent = "";

        top.appendChild(place);
        top.appendChild(lvl);

        const daysWrap = document.createElement("div");
        daysWrap.className = "pills";
        for (const d of resolveDays(s.days)) {
          const pill = document.createElement("span");
          pill.className = "pill";
          pill.textContent = dayToEnglish(d);
          daysWrap.appendChild(pill);
        }

        box.appendChild(top);
        box.appendChild(daysWrap);
        spawnsWrap.appendChild(box);
      }
    }

    const cardEl = node.querySelector(".miscrit");
    if (cardEl) {
      cardEl.style.cursor = "pointer";
      cardEl.addEventListener("click", () => {
        updateURLFromFilters(getFiltersFromUI());
        const returnQS = new URLSearchParams(window.location.search).toString();
        const url = `./html/miscrits.html?id=${encodeURIComponent(m.id)}&return=${encodeURIComponent(returnQS)}`;
        window.location.href = url;
      });
    }

    results.appendChild(node);
  }
}

// ===============================
// Filtro principal + paginación
// ===============================
function applyFilters(resetPage = false) {
  if (resetPage) PAGE = 1;

  const q = $("#q")?.value ?? "";
  const place = $("#place")?.value ?? "";
  const rarity = $("#rarity")?.value ?? "";

  const dayRaw = $("#day")?.value ?? "";
  const day = dayRaw === "__today__" ? getServerDayName() : dayRaw;

  FILTERED = MISCRITS.filter((m) => {
    if (!matchesText(m.name, q)) return false;

    if (dayRaw === "__today__" && !isRarePlus(m.rarity)) return false;

    if (rarity && !equalsNormalized(m.rarity, rarity)) return false;

    const placeOk = !place
      ? true
      : (m.spawns ?? []).some((s) => matchesText(s.place, place));
    if (!placeOk) return false;

    const dayOk = !day
      ? true
      : (m.spawns ?? []).some((s) => includesDay(resolveDays(s.days), day));
    return dayOk;
  });

  const { slice, total, totalPages, startIdx, endIdx } = getPaged(FILTERED);
  updateURLFromFilters(getFiltersFromUI());
  render(slice, total, totalPages, startIdx, endIdx);
}

// ===============================
// Init
// ===============================
async function init() {
  try {
    await loadMiscrits();
  } catch (e) {
    console.error(e);
    render([], 0, 1, 0, 0);
    return;
  }

  const fromURL = getFiltersFromURL();
  const d = defaultFilters();

  const restored = {
    q: fromURL.q || d.q,
    day: fromURL.day || d.day,
    place: fromURL.place || d.place,
    rarity: fromURL.rarity || d.rarity,
    page: fromURL.page || d.page,
    perPage: fromURL.perPage || d.perPage,
  };

  const urlPage = parseInt(restored.page || "1", 10);
  const urlPer = parseInt(restored.perPage || String(PER_PAGE), 10);

  PAGE = Number.isFinite(urlPage) && urlPage > 0 ? urlPage : 1;
  PER_PAGE = Number.isFinite(urlPer) && urlPer > 0 ? urlPer : PER_PAGE;

  setFiltersToUI(restored);

  if ($("#pageSize")) $("#pageSize").value = String(PER_PAGE);

  const daySelect = $("#day");
  function syncDayHighlight() {
    if (!daySelect) return;
    daySelect.classList.toggle("is-today", daySelect.value === "__today__");
  }
  syncDayHighlight();

  applyFilters(false);

  const onFilterChange = () => applyFilters(true);

  $("#q")?.addEventListener("input", onFilterChange);

  $("#day")?.addEventListener("change", () => {
    PAGE = 1;
    syncDayHighlight();
    applyFilters(false);
  });

  $("#place")?.addEventListener("change", onFilterChange);
  $("#rarity")?.addEventListener("change", onFilterChange);

  $("#pageSize")?.addEventListener("change", () => {
    const v = parseInt($("#pageSize").value, 10);
    PER_PAGE = Number.isFinite(v) && v > 0 ? v : PER_PAGE;
    PAGE = 1;
    applyFilters(false);
  });

  $("#btnPrev")?.addEventListener("click", () => {
    PAGE = Math.max(1, PAGE - 1);
    applyFilters(false);
  });

  $("#btnNext")?.addEventListener("click", () => {
    PAGE = PAGE + 1;
    applyFilters(false);
  });

  $("#btnClear")?.addEventListener("click", () => {
    if ($("#q")) $("#q").value = "";
    if ($("#day")) $("#day").value = "";
    if ($("#place")) $("#place").value = "";
    if ($("#rarity")) $("#rarity").value = "";

    PAGE = 1;
    PER_PAGE = parseInt($("#pageSize")?.value || "36", 10) || 36;

    syncDayHighlight();
    applyFilters(false);
  });

  $("#btnRandom")?.addEventListener("click", () => {
    if (!MISCRITS.length) return;
    const i = Math.floor(Math.random() * MISCRITS.length);
    const pick = MISCRITS[i];

    if ($("#q")) $("#q").value = pick.name ?? "";
    if ($("#day")) $("#day").value = "__today__";
    if ($("#place")) $("#place").value = "";
    if ($("#rarity")) $("#rarity").value = "";
    PAGE = 1;
    syncDayHighlight();
    applyFilters(false);
  });
}

init();
