const $ = (sel) => document.querySelector(sel);

let MISCRITS = [];
let TEAMS = [];
let TEAMS_BY_MISCRIT = {};
let selectedName = null;
let RELIC_MAP = {};
let TRENDING_IDS = [];
let MISCRITS_BY_NAME = {};
let BEST_RELICS = {};

const RARITIES = ["Common", "Rare", "Epic", "Exotic", "Legendary"];
const BEST_RELICS_URL = "../assets/data/best_relics.json";

function stripDiacritics(str) {
  return (str ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
function normalize(str) {
  return stripDiacritics(str).trim().toLowerCase();
}

function rarityKey(r) {
  return normalize(r);
}

function avatarSrc(m) {
  return `../assets/images/miscrits_avatar/${m?.avatar ?? "preset_avatar.png"}`;
}

function safeImgSrc(path) {
  return path || "../assets/images/ui/placeholder.png";
}

function findMiscritByName(name) {
  return MISCRITS_BY_NAME[normalize(name)] ?? null;
}

/* ===================== RELICS HELPERS ===================== */

function relicNameToKey(name) {
  const s = (name ?? "").toString().trim();
  if (!s) return "";

  if (/^[A-Z0-9_]+$/.test(s)) return s;

  return s
    .toUpperCase()
    .replace(/['’]/g, "")        
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildRelicAliasIndex(relicMap) {
  const idx = {};

  for (const key of Object.keys(relicMap || {})) {
    const kNorm = normalize(key.replace(/_/g, " "));
    idx[kNorm] = key;
    idx[kNorm.replace(/\s+/g, "")] = key;
  }

  return idx;
}

function resolveRelicKeyFromHumanName(humanName, aliasIndex) {
  const directKey = relicNameToKey(humanName);
  if (directKey && RELIC_MAP[directKey]) return directKey;

  const n = normalize(humanName);
  if (aliasIndex[n]) return aliasIndex[n];
  if (aliasIndex[n.replace(/\s+/g, "")]) return aliasIndex[n.replace(/\s+/g, "")];

  const n2 = n.replace(/\s+/g, "");
  for (const k of Object.keys(aliasIndex)) {
    if (k.includes(n2) || n2.includes(k)) return aliasIndex[k];
  }

  return "";
}

function getRelicsForMiscrit(mm) {
  if (Array.isArray(mm?.relics) && mm.relics.length) return mm.relics.slice(0, 4);
  if (mm?.autoRelics !== true) return [];

  const key = normalize(mm?.name);
  const best = BEST_RELICS[key];
  return Array.isArray(best) ? best.slice(0, 4) : [];
}

function resolveRelic(ref) {
  if (!ref) return "";
  return RELIC_MAP[ref] ?? ref;
}

function getRelicsArray(mm) {
  const list = getRelicsForMiscrit(mm);
  return list
    .map(resolveRelic)
    .filter(Boolean)
    .slice(0, 4);
}

/* ===================== LOADERS ===================== */

async function loadMiscrits() {
  const res = await fetch("../miscrits.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} cargando miscrits.json`);
  const data = await res.json();
  MISCRITS = data.miscrits ?? [];

  MISCRITS_BY_NAME = {};
  for (const m of MISCRITS) {
    const key = normalize(m?.name);
    if (!key) continue;
    MISCRITS_BY_NAME[key] = m;
  }
}

async function loadTeams() {
  const res = await fetch("../pvp_teams.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} cargando pvp_teams.json`);
  const data = await res.json();

  TEAMS = data.teams ?? [];
  RELIC_MAP = data.RELICS ?? {};
  TRENDING_IDS = Array.isArray(data.trendingTeams) ? data.trendingTeams : [];
  TEAMS_BY_MISCRIT = indexTeamsByMiscrit(TEAMS);
}

async function loadBestRelics() {
  const res = await fetch(BEST_RELICS_URL, { cache: "no-store" });
  if (!res.ok) {
    console.warn("best_relics.json no encontrado, autoRelics quedará vacío.");
    BEST_RELICS = {};
    return;
  }

  const raw = await res.json();

  const aliasIndex = buildRelicAliasIndex(RELIC_MAP);
  const out = {};

  for (const [miscritName, relicNames] of Object.entries(raw || {})) {
    const mKey = normalize(miscritName);
    if (!mKey) continue;

    const arr = Array.isArray(relicNames) ? relicNames : [];
    const keys = [];

    for (const human of arr) {
      const k = resolveRelicKeyFromHumanName(human, aliasIndex);
      if (k) keys.push(k);
    }

    out[mKey] = keys.slice(0, 4);
  }

  BEST_RELICS = out;
}

/* ===================== INDEXING ===================== */

function indexTeamsByMiscrit(teams) {
  const map = {};
  for (const t of teams) {
    for (const mm of (t.miscrits ?? [])) {
      const key = normalize(mm.name);
      if (!key) continue;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
  }
  return map;
}

function groupByRarity(list) {
  const map = {};
  for (const r of RARITIES) map[r] = [];

  for (const m of list) {
    const rr = RARITIES.find(x => rarityKey(x) === rarityKey(m.rarity)) ?? "Common";
    map[rr].push(m);
  }

  for (const r of RARITIES) {
    map[r].sort((a, b) => (a.name ?? "").localeCompare((b.name ?? ""), "es"));
  }
  return map;
}

/* ===================== UI ===================== */

function setActiveAvatar(name) {
  const key = normalize(name);
  document.querySelectorAll(".avatar-btn").forEach((b) => {
    b.classList.toggle("is-active", !!key && normalize(b.dataset.name) === key);
  });
}

function clearSelection() {
  selectedName = null;
  setActiveAvatar(null);

  const panelTitle = $("#panelTitle");
  const panelMeta = $("#panelMeta");
  const teamsList = $("#teamsList");

  if (panelTitle) panelTitle.textContent = "Select one Miscrit";
  if (panelMeta) panelMeta.textContent = "This will show best teams for this Miscrit";
  if (teamsList) teamsList.innerHTML = "";
}

function goToSpawnDetailByName(name) {
  const m = findMiscritByName(name);
  if (!m?.id) return;
  window.location.href = `./miscrits.html?id=${encodeURIComponent(m.id)}`;
}

function teamDisplayTitle(t) {
  const raw = (t?.title ?? "").toString().trim();
  if (raw) return raw;
  const id = (t?.id ?? "").toString().trim().toUpperCase();
  return id ? `TEAM ${id}` : "TEAM";
}

function buildTeamCardEl(t, extraClass = "") {
  const card = document.createElement("div");
  card.className = `team-card ${extraClass}`.trim();

  const slotsHTML = (t.miscrits ?? []).slice(0, 4).map((mm) => {
    const name = (mm.name ?? "").toString().trim();
    const full = findMiscritByName(name);
    const src = full ? avatarSrc(full) : "../assets/images/miscrits_avatar/preset_avatar.png";
    const relics = getRelicsArray(mm);

    const relicsHTML = relics.map((r) => `
      <button class="relic-btn" type="button" data-mname="${name}">
        <img src="${safeImgSrc(r)}" alt="Relic" onerror="this.src='../assets/images/ui/placeholder.png'">
      </button>
    `).join("");

    return `
      <div class="team-slot">
        <button class="team-miscrit" type="button" data-mname="${name}" title="Ver dónde capturar ${name}">
          <img src="${src}" alt="${name}" onerror="this.src='../assets/images/miscrits_avatar/preset_avatar.png'">
        </button>
        <div class="relic-grid">
          ${relicsHTML}
        </div>
      </div>
    `;
  }).join("");

  const title = teamDisplayTitle(t);
  const meta = [t.format].filter(Boolean).join(" • ");

  card.innerHTML = `
    <div class="team-title">${title}</div>
    <div class="team-subtitle">${meta}</div>
    <div class="team-grid">
      ${slotsHTML}
    </div>
    ${t.summary ? `<div class="team-notes">${t.summary}</div>` : ""}
  `;

  return card;
}

function renderAccordions() {
  const host = $("#rarityAccordions");
  if (!host) return;

  host.innerHTML = "";
  const grouped = groupByRarity(MISCRITS);

  for (const rarity of RARITIES) {
    const section = document.createElement("div");
    section.className = "rare-section";
    section.dataset.rarity = rarity;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "rare-header";
    header.dataset.action = "toggle-rarity";
    header.dataset.rarity = rarity;
    header.innerHTML = `
      <strong>${rarity}</strong>
      <span>${grouped[rarity].length} Miscrits</span>
    `;

    const body = document.createElement("div");
    body.className = "rare-body";
    body.style.display = "none";

    const grid = document.createElement("div");
    grid.className = "avatar-grid";

    for (const m of grouped[rarity]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-btn";
      btn.dataset.name = m.name ?? "";
      btn.title = m.name ?? "Miscrit";

      const img = document.createElement("img");
      img.src = avatarSrc(m);
      img.alt = m.name ?? "Miscrit";
      img.loading = "lazy";
      img.onerror = () => { img.src = "../assets/images/miscrits_avatar/preset_avatar.png"; };

      btn.appendChild(img);
      grid.appendChild(btn);
    }

    body.appendChild(grid);
    section.appendChild(header);
    section.appendChild(body);
    host.appendChild(section);
  }
}

function openSectionForMiscrit(name) {
  const m = findMiscritByName(name);
  if (!m) return;

  const rarity = RARITIES.find(r => rarityKey(r) === rarityKey(m.rarity)) ?? "Common";
  const section = document.querySelector(`.rare-section[data-rarity="${rarity}"]`);
  if (!section) return;

  const body = section.querySelector(".rare-body");
  if (!body) return;

  body.style.display = "block";
  section.classList.add("is-open");
}

function renderTeamsFor(selectedMiscritName) {
  const panelTitle = $("#panelTitle");
  const panelMeta = $("#panelMeta");
  const teamsList = $("#teamsList");
  if (!panelTitle || !panelMeta || !teamsList) return;

  const m = findMiscritByName(selectedMiscritName);
  const teams = TEAMS_BY_MISCRIT[normalize(selectedMiscritName)] ?? [];

  panelTitle.textContent = m ? m.name : "Miscrit";
  panelMeta.textContent = m ? `${m.type ?? "-"} • ${m.rarity ?? "-"}` : "—";

  teamsList.innerHTML = "";

  if (!teams.length) {
    teamsList.innerHTML = `<div class="team-card"><div class="team-notes">No hay equipos cargados aún para este Miscrit.</div></div>`;
    return;
  }

  for (const t of teams) {
    teamsList.appendChild(buildTeamCardEl(t, ""));
  }
}

function renderSingleTeam(t) {
  const panelTitle = $("#panelTitle");
  const panelMeta = $("#panelMeta");
  const teamsList = $("#teamsList");
  if (!panelTitle || !panelMeta || !teamsList) return;

  panelTitle.textContent = teamDisplayTitle(t);
  const meta = [t.format, t.patch ? `Patch ${t.patch}` : ""].filter(Boolean).join(" • ");
  panelMeta.textContent = meta || "—";

  teamsList.innerHTML = "";
  teamsList.appendChild(buildTeamCardEl(t, ""));
}

function selectMiscrit(name) {
  selectedName = name;
  setActiveAvatar(name);
  openSectionForMiscrit(name);
  renderTeamsFor(name);
}

function pickTopTeams(max = 5) {
  const byId = new Map(TEAMS.map(t => [String(t.id), t]));
  const picked = [];

  for (const id of TRENDING_IDS) {
    const t = byId.get(String(id));
    if (t) picked.push(t);
    if (picked.length >= max) break;
  }

  if (picked.length < max) {
    for (const t of TEAMS) {
      if (picked.length >= max) break;
      if (picked.some(x => String(x.id) === String(t.id))) continue;
      picked.push(t);
    }
  }

  return picked.slice(0, max);
}

function renderTopCarousel() {
  const track = $("#topTrack");
  if (!track) return;

  const topTeams = pickTopTeams(5);
  track.innerHTML = "";

  const marquee = document.createElement("div");
  marquee.className = "pvp-marquee";

  const makeCard = (t) => {
    const c = buildTeamCardEl(t, "topteam-card");
    c.dataset.teamid = String(t.id);
    c.style.cursor = "pointer";
    return c;
  };

  for (const t of topTeams) marquee.appendChild(makeCard(t));
  for (const t of topTeams) marquee.appendChild(makeCard(t));

  track.appendChild(marquee);
}

function bindDelegatedEvents() {
  document.addEventListener("click", (e) => {
    const avatarBtn = e.target.closest(".avatar-btn");
    if (avatarBtn) {
      e.stopPropagation();
      const name = avatarBtn.dataset.name;
      if (!name) return;
      if (normalize(selectedName) === normalize(name)) clearSelection();
      else selectMiscrit(name);
      return;
    }

    const toggleBtn = e.target.closest('[data-action="toggle-rarity"]');
    if (toggleBtn) {
      e.preventDefault();
      const section = toggleBtn.closest(".rare-section");
      if (!section) return;

      const body = section.querySelector(".rare-body");
      if (!body) return;

      const open = body.style.display !== "none";
      body.style.display = open ? "none" : "block";
      section.classList.toggle("is-open", !open);
      return;
    }

    const teamCard = e.target.closest("[data-teamid]");
    if (teamCard) {
      e.preventDefault();
      const tid = teamCard.getAttribute("data-teamid");
      if (!tid) return;

      const t = TEAMS.find(x => String(x.id) === String(tid));
      if (!t) return;

      renderSingleTeam(t);
      return;
    }

    const mnameEl = e.target.closest("[data-mname]");
    if (mnameEl) {
      e.preventDefault();
      e.stopPropagation();
      const mname = mnameEl.getAttribute("data-mname");
      if (mname) goToSpawnDetailByName(mname);
      return;
    }
  });
}

/* ===================== INIT ===================== */

async function init() {
  await loadTeams();
  await loadBestRelics();
  await loadMiscrits();

  renderAccordions();
  renderTopCarousel();
  bindDelegatedEvents();
  clearSelection();
}

init().catch(console.error);
