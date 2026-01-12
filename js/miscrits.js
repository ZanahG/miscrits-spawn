const $ = (sel) => document.querySelector(sel);

function stripDiacritics(str) {
  return (str ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normalize(str) {
  return stripDiacritics(str).trim().toLowerCase();
}

let MISCRITS = [];
let DAY_PRESETS = {};
let ZONE_PRESETS = {};
let OBJECT_PRESETS = {};

async function loadMiscrits() {
  const res = await fetch("../miscrits.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

function resolveDays(d) {
  return resolvePreset(d, DAY_PRESETS);
}
function resolveZones(z) {
  return resolvePreset(z, ZONE_PRESETS);
}

function resolveObjects(o) {
  if (Array.isArray(o)) return o;
  if (typeof o === "string") {
    const preset = OBJECT_PRESETS[o];
    return Array.isArray(preset) ? preset : [o];
  }
  return [];
}

function getQueryParam(name) {
  return new URL(window.location.href).searchParams.get(name);
}

const MAPS = window.MAPS ?? {};

function buildSpawnList(m) {
  const wrap = $("#spawnsList");
  if (!wrap) return;
  wrap.innerHTML = "";

  for (const s of m.spawns ?? []) {
    const box = document.createElement("div");
    box.className = "spawn";

    const top = document.createElement("div");
    top.className = "spawn__top";

    const place = document.createElement("div");
    place.className = "spawn__place";
    place.textContent = s.place ?? "-";

    const lvl = document.createElement("div");
    lvl.className = "spawn__lvl";
    lvl.textContent = s.level ?? "";

    top.appendChild(place);
    top.appendChild(lvl);

    const pills = document.createElement("div");
    pills.className = "pills";
    for (const d of resolveDays(s.days)) {
      const p = document.createElement("span");
      p.className = "pill";
      p.textContent = d;
      pills.appendChild(p);
    }

    box.appendChild(top);
    box.appendChild(pills);
    wrap.appendChild(box);
  }
}

function getPrimarySpawn(m) {
  return (m.spawns ?? [])[0] ?? null;
}

function setMiscritHeader(m) {
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
    return `
      <img
        class="type-icon"
        src="../assets/images/type/${key}.png"
        alt="Tipo ${typeRaw}"
        title="Tipo: ${typeRaw}"
        loading="lazy"
        onerror="this.style.display='none'"
      />
    `;
  }

  const title = $("#title");
  if (title) title.textContent = m.name ?? "Miscrit";

  const subtitle = $("#subtitle");
  if (subtitle) {
    const t = m.type ?? "-";
    const r = m.rarity ?? "-";
    subtitle.innerHTML = `${typeIconHTML(t)}<span class="subtitle-text">${t} | Rareza: ${r}</span>`;
  }

  const avatar = $("#avatar");
  if (avatar) {
    avatar.src = `../assets/images/miscrits_avatar/${m.avatar ?? "preset_avatar.png"}`;
    avatar.onerror = () => {
      avatar.src = "../assets/images/miscrits_avatar/preset_avatar.png";
    };
  }

  const name = $("#name");
  if (name) name.textContent = m.name ?? "-";

  const meta = $("#meta");
  if (meta) {
    const t = m.type ?? "-";
    const r = m.rarity ?? "-";
    meta.innerHTML = `${typeIconHTML(t)}<span>${t} • ${r}</span>`;
  }
}

function spawnZoneLabel(spawn) {
  if (Array.isArray(spawn.zone)) return spawn.zone.filter(Boolean).join(", ");

  if (typeof spawn.zone === "string") {
    const resolved = resolveZones(spawn.zone);
    if (resolved.length) return resolved.join(", ");
    return spawn.zone;
  }

  return "";
}

function setMapFromSpawn(spawn) {
  const mapImg = $("#mapImg");
  const mapTitle = $("#mapTitle");
  const hint = document.querySelector(".hint");

  const placeLabel = spawn?.place ?? "MAPA";
  const zoneLabel = spawnZoneLabel(spawn);
  if (mapTitle) mapTitle.textContent = zoneLabel ? `${placeLabel} - ${zoneLabel}` : placeLabel;

  const view = (spawn?.view ?? "").toString().trim().toLowerCase();
  if (hint) {
    hint.textContent =
      view === "object"
        ? "Este Miscrit SOLO aparece en el objeto mostrado en la imágen."
        : "Mapa de ubicación.";
  }

  if (view === "object") {
    const imgPath = spawn.objectImage || null;

    if (imgPath && mapImg) {
      mapImg.src = imgPath;
      mapImg.onerror = () => (mapImg.src = "../assets/images/maps/default.png");
      return;
    }

    const firstObjKey = Array.isArray(spawn.objects) ? spawn.objects[0] : spawn.objects;
    const cfgByObj = firstObjKey ? (MAPS[firstObjKey] ?? null) : null;

    if (cfgByObj?.image && mapImg) {
      mapImg.src = cfgByObj.image;
      mapImg.onerror = () => (mapImg.src = "../assets/images/maps/default.png");
      return;
    }

    if (mapImg) mapImg.src = "../assets/images/maps/default.png";
    return;
  }

  const cfg = MAPS[spawn?.place] ?? null;

  if (!cfg?.image) {
    if (mapImg) mapImg.src = "../assets/images/maps/default.png";
    return;
  }

  if (mapImg) {
    mapImg.src = cfg.image;
    mapImg.onerror = () => (mapImg.src = "../assets/images/maps/default.png");
  }
}

async function init() {
  const back = $("#back");
  if (back) back.addEventListener("click", () => window.history.back());

  const id = getQueryParam("id");
  const subtitle = $("#subtitle");
  if (!id) {
    if (subtitle) subtitle.textContent = "Falta el parámetro ?id=";
    return;
  }

  await loadMiscrits();

  const m = MISCRITS.find((x) => String(x.id) === String(id));
  if (!m) {
    if (subtitle) subtitle.textContent = "Miscrit no encontrado.";
    return;
  }

  setMiscritHeader(m);
  buildSpawnList(m);

  if (window.renderIvsTable) window.renderIvsTable(m.rarity);

  const spawn = getPrimarySpawn(m);
  if (!spawn) return;

  setMapFromSpawn(spawn);
}

init();
