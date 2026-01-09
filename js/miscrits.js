// miscrits.js (completo corregido)
// - Soporta objects como: preset string ("BUSHES"), array ["Blighted Stone"], o string directo "Blighted Stone"
// - Soporta vista "object": muestra imagen del objeto (spawn.objectImage) en vez de pines
// - Mantiene mapa normal con pines para el resto
// - No rompe si falta algún elemento del DOM

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
  const res = await fetch("./miscrits.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  DAY_PRESETS = data.presets ?? {};
  ZONE_PRESETS = data.ZONES ?? {};
  OBJECT_PRESETS = data.OBJECTS ?? {};
  MISCRITS = data.miscrits ?? [];
}

// Preset genérico: si viene string => busca en presets, si viene array => devuelve array
function resolvePreset(value, presets) {
  if (typeof value === "string") return presets[value] ?? [];
  return Array.isArray(value) ? value : [];
}

function resolveDays(d) { return resolvePreset(d, DAY_PRESETS); }
function resolveZones(z) { return resolvePreset(z, ZONE_PRESETS); }

// Objects especial: si es string y NO existe en presets, lo trata como texto directo
function resolveObjects(o) {
  if (Array.isArray(o)) return o;
  if (typeof o === "string") {
    const preset = OBJECT_PRESETS[o];
    return Array.isArray(preset) ? preset : [o]; // <- clave: permite strings directos
  }
  return [];
}

function getQueryParam(name) {
  return new URL(window.location.href).searchParams.get(name);
}

/**
 * MAPS viene desde maps.js (recomendado):
 * window.MAPS = { Forest: { title, image, zones: { "Zona 1": {x,y}... } } ... }
 */
const MAPS = window.MAPS ?? {};

// Pin icon
const PIN_ICON = "./assets/images/ui/pin_question.png";
const FALLBACK_PIN =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <path d="M32 4c-11 0-20 9-20 20 0 16 20 36 20 36s20-20 20-36C52 13 43 4 32 4z" fill="#a05a2c"/>
  <circle cx="32" cy="24" r="12" fill="#ffd9b3"/>
  <text x="32" y="29" font-size="16" text-anchor="middle" font-family="Arial" fill="#4b2b14">?</text>
</svg>
`);

function buildSpawnList(m) {
  const wrap = $("#spawnsList");
  if (!wrap) return;
  wrap.innerHTML = "";

  for (const s of (m.spawns ?? [])) {
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

/**
 * Decide qué spawn usar en el detalle.
 * (primer spawn por ahora)
 */
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
        src="./assets/images/type/${key}.png"
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
    avatar.src = `./assets/images/miscrits_avatar/${m.avatar ?? "preset_avatar.png"}`;
    avatar.onerror = () => {
      avatar.src = "./assets/images/miscrits_avatar/preset_avatar.png";
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

  const placeLabel = spawn?.place ?? "MAPA";
  const zoneLabel = spawnZoneLabel(spawn);
  mapTitle.textContent = zoneLabel ? `${placeLabel} - ${zoneLabel}` : placeLabel;

  // ✅ Si es vista tipo "object", mostramos esa imagen (NO depende de MAPS[place])
  if ((spawn?.view ?? "").toString().toLowerCase() === "object") {
    const imgPath = spawn.objectImage || null;

    if (imgPath) {
      mapImg.src = imgPath;
      mapImg.onerror = () => (mapImg.src = "./assets/images/maps/default.png");
      return { mode: "object" };
    }

    // fallback si no viene objectImage: intenta usar el primer objects como key en MAPS
    const firstObjKey = Array.isArray(spawn.objects) ? spawn.objects[0] : spawn.objects;
    const cfgByObj = firstObjKey ? (MAPS[firstObjKey] ?? null) : null;

    if (cfgByObj?.image) {
      mapImg.src = cfgByObj.image;
      mapImg.onerror = () => (mapImg.src = "./assets/images/maps/default.png");
      return { mode: "object" };
    }

    mapImg.src = "./assets/images/maps/default.png";
    return { mode: "object" };
  }

  // ✅ Vista normal (mapa por place)
  const cfg = MAPS[spawn?.place] ?? null;

  if (!cfg?.image) {
    mapImg.src = "./assets/images/maps/default.png";
    return null;
  }

  mapImg.src = cfg.image;
  mapImg.onerror = () => (mapImg.src = "./assets/images/maps/default.png");
  return cfg;
}



// Card flotante de pin
function showPinCard({ title, objects, anchorEl, imageOverride = null }) {
  const card = $("#pinCard");
  const cardTitle = $("#pinCardTitle");
  const cardImg = $("#pinCardImg");
  const chips = $("#pinCardChips");
  const mapFrame = $("#mapFrame");
  if (!card || !cardTitle || !cardImg || !chips || !mapFrame) return;

  cardTitle.textContent = title;
  chips.innerHTML = "";

  // Imagen de objeto (si viene override, úsalo)
  const imgSrc = imageOverride || "./assets/images/objects/default_object.png";
  cardImg.src = imgSrc;
  cardImg.onerror = () => {
    cardImg.src =
      "data:image/svg+xml;utf8," +
      encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">
        <rect width="96" height="96" rx="16" fill="#0f1624"/>
        <text x="48" y="54" font-size="14" text-anchor="middle" fill="#9aa4b2" font-family="Arial">OBJ</text>
      </svg>
    `);
  };

  if (!objects.length) {
    const sp = document.createElement("span");
    sp.className = "pill";
    sp.textContent = "Sin datos";
    chips.appendChild(sp);
  } else {
    for (const o of objects) {
      const sp = document.createElement("span");
      sp.className = "pill";
      sp.textContent = o;
      chips.appendChild(sp);
    }
  }

  // Posicionar card cerca del pin (dentro del map-frame)
  const pinRect = anchorEl.getBoundingClientRect();
  const frameRect = mapFrame.getBoundingClientRect();

  const left = pinRect.left - frameRect.left + 24;
  const top = pinRect.top - frameRect.top - 10;

  card.style.left = `${Math.min(left, frameRect.width - 280)}px`;
  card.style.top = `${Math.max(top, 14)}px`;

  card.hidden = false;
}

function hidePinCard() {
  const card = $("#pinCard");
  if (card) card.hidden = true;
}

function renderPinsForSpawn(spawn, mapCfg) {
  const pinsWrap = $("#pins");
  const mapFrame = $("#mapFrame");
  if (!pinsWrap || !mapFrame) return;

  pinsWrap.innerHTML = "";
  hidePinCard();

  let zones = resolveZones(spawn.zone);
  if (!zones.length) zones = ["Zona 1"];

  const objects = resolveObjects(spawn.objects);
  const objectsTitle = objects.length ? objects.join(", ") : "Cualquier objeto";

  for (const z of zones) {
    const pos = mapCfg?.zones?.[z];
    if (!pos) continue;

    const pin = document.createElement("div");
    pin.className = "pin";
    pin.style.left = `${pos.x}%`;
    pin.style.top = `${pos.y}%`;

    const img = document.createElement("img");
    img.src = PIN_ICON;
    img.onerror = () => (img.src = FALLBACK_PIN);
    img.alt = "Pin";

    pin.appendChild(img);

    pin.addEventListener("click", (e) => {
      e.stopPropagation();
      const title = objects.length ? objectsTitle : "Cualquier objeto";
      showPinCard({
        title,
        objects: objects.length ? objects : ["Cualquier objeto"],
        anchorEl: pin,
        imageOverride: spawn.objectImage ?? null, // por si quieres reutilizar esto en mapa también
      });
    });

    pinsWrap.appendChild(pin);
  }

  // click afuera cierra
  mapFrame.addEventListener("click", () => hidePinCard(), { once: true });
}

/**
 * Vista "object": en vez de pines, muestra una imagen del objeto en el map-frame
 * usando spawn.objectImage
 */
function renderObjectView(spawn, mapCfg) {
  const pinsWrap = $("#pins");
  const mapFrame = $("#mapFrame");
  const mapImg = $("#mapImg");
  const hint = document.querySelector(".hint");

  if (pinsWrap) pinsWrap.innerHTML = "";
  hidePinCard();

  // Mantén el título del mapa como el lugar real (Forest, etc.)
  // y el mapa base como el de place (Forest) para conservar el contexto:
  // pero en vez de pines, reemplazamos la imagen principal por la del objeto.
  if (mapImg) {
    const original = mapCfg?.image ?? mapImg.src;
    const objectImg = spawn.objectImage;

    if (objectImg) {
      mapImg.src = objectImg;
      mapImg.onerror = () => {
        mapImg.src = original || "./assets/images/maps/default.png";
      };
    }
  }

  if (hint) hint.textContent = "Este Miscrit SOLO aparece en el objeto mostrado en la imágen.";
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

  const mapCfg = setMapFromSpawn(spawn);
  if (!mapCfg) return;

  if ((spawn.view ?? "").toString().toLowerCase() !== "object") {
    renderPinsForSpawn(spawn, mapCfg);
  } else {
    hidePinCard();
    const pinsWrap = $("#pins");
    if (pinsWrap) pinsWrap.innerHTML = "";
  }


  const placeLabel = spawn.place ?? "MAPA";
  const zoneLabel = spawnZoneLabel(spawn);
  $("#mapTitle").textContent = zoneLabel ? `${placeLabel} - ${zoneLabel}` : placeLabel;

  if (!mapCfg) return;

  // Si no hay config, no podemos poner pines (pero igual mostramos la imagen default)
  if (!mapCfg) return;

  // Si spawn.view === "object", mostramos imagen del objeto (spawn.objectImage)
  const view = (spawn.view ?? "").toString().trim().toLowerCase();
  if (view === "object" && spawn.objectImage) {
    renderObjectView(spawn, mapCfg);
    return;
  }

  // Vista normal con pines
  renderPinsForSpawn(spawn, mapCfg);
}

init();
