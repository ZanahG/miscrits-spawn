const $ = (sel) => document.querySelector(sel);

/* =========================================================
   STATE
========================================================= */
let MISCRITS = [];
let TEAMS = [];
let TEAMS_BY_MISCRIT = {};
let selectedName = null;
let RELIC_MAP = {};
let TRENDING_IDS = [];
let MISCRITS_BY_NAME = {};
let BEST_RELICS = {};
let OPTIONAL_RELICS = {};
let ACTIVE_RELICS = new Set();
let MODAL_USED_KEYS = [];
let MODAL_OPTIONAL_KEYS = [];
let MODAL_BASE35 = null;
let MODAL_MISCRIT_NAME = "";

const RARITIES = ["Meta", "Common", "Rare", "Epic", "Exotic", "Legendary"];
const TIERS = ["S", "A", "B", "C", "D", "F"];
const MISCRITS_META_URL = "../assets/data/miscrits_meta.json";

let MISCRITS_META = [];
let TIER_BY_NAME = {};

const BASE_STATS_URL = "../assets/data/base_stats.json";
const RELICS_STATS_URL = "../assets/data/relics.json";
const SLOT_LEVELS = [10, 20, 30, 35];

let BASE_BY_NAME = {};
let RELICS_BY_KEY = {}; 

const TYPE_ICON_FOLDER = "../assets/images/type/";
const TYPE_ICON_FALLBACK = `${TYPE_ICON_FOLDER}unknown.png`;

/* =========================================================
   UTILS
========================================================= */
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
  return path || "../assets/images/relics/CRUZ.png";
}
function findMiscritByName(name) {
  return MISCRITS_BY_NAME[normalize(name)] ?? null;
}

/* =========================================================
   MODAL OPEN/CLOSE
========================================================= */
function openModal() {
  const el = document.getElementById("miscritModal");
  if (!el) return;
  el.classList.add("is-open");
  el.setAttribute("aria-hidden", "false");
}
function closeModal() {
  const el = document.getElementById("miscritModal");
  if (!el) return;
  el.classList.remove("is-open");
  el.setAttribute("aria-hidden", "true");
}

/* =========================================================
   MODAL HEADER HELPERS
========================================================= */
function rarityBadgeClass(rarity) {
  const r = normalize(rarity);
  if (r === "meta") return "badge--meta";
  if (r === "common") return "badge--common";
  if (r === "rare") return "badge--rare";
  if (r === "epic") return "badge--epic";
  if (r === "exotic") return "badge--exotic";
  if (r === "legendary") return "badge--legendary";
  return "badge--common";
}

function setBadge(id, text, extraClass) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `badge ${extraClass || ""}`.trim();
  el.textContent = text ?? "—";
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v ?? "—";
}

function setImg(id, src, alt = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.src = src;
  el.alt = alt;
  el.onerror = () => {
    el.onerror = null;
    el.src = "../assets/images/miscrits_avatar/preset_avatar.png";
  };
}

function typeIconSrc(type) {
  const t = normalize(type);
  if (!t) return TYPE_ICON_FALLBACK;
  return `${TYPE_ICON_FOLDER}${t}.png`;
}

function usageForMiscrit(name) {
  const list = TEAMS_BY_MISCRIT[normalize(name)] ?? [];
  if (!TEAMS.length) return { count: list.length, pct: 0 };
  return { count: list.length, pct: (list.length / TEAMS.length) * 100 };
}

/* =========================================================
   MODAL RELICS
========================================================= */
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

function resolveRelic(ref) {
  if (!ref) return "";
  const key = relicNameToKey(ref);
  return RELIC_MAP[key] ?? RELIC_MAP[(ref ?? "").toString().trim()] ?? ref;
}

function getRelicStatsAnyLevelByKey(key) {
  const k = relicNameToKey(key);
  const byKey = RELICS_BY_KEY[k];
  if (byKey?.stats) return byKey.stats;

  const byNorm = RELICS_BY_KEY[normalize(titleizeFromKey(k))];
  return byNorm?.stats || null;
}

function sumRelicBonusesActive() {
  const totals = { hp: 0, spd: 0, ea: 0, pa: 0, ed: 0, pd: 0 };

  for (const key of ACTIVE_RELICS) {
    const st = getRelicStatsAnyLevelByKey(key);
    if (!st) continue;
    totals.hp += Number(st.HP || 0);
    totals.spd += Number(st.SPD || 0);
    totals.ea += Number(st.EA || 0);
    totals.pa += Number(st.PA || 0);
    totals.ed += Number(st.ED || 0);
    totals.pd += Number(st.PD || 0);
  }

  return totals;
}

function fixedBonus20() {
  return { hp: 20, spd: 20, ea: 20, pa: 20, ed: 20, pd: 20 };
}

/* =========================================================
   MODAL RENDER
========================================================= */
function renderStatsGrid(baseStats, fixedBonus, relicBonus) {
  const host = document.getElementById("modalStatsGrid");
  if (!host) return;
  host.innerHTML = "";

  const rows = [
    ["HP", "hp"],
    ["SPD", "spd"],
    ["EA", "ea"],
    ["PA", "pa"],
    ["ED", "ed"],
    ["PD", "pd"],
  ];

  for (const [label, key] of rows) {
    const base  = Number(baseStats?.[key] || 0);
    const fixed = Number(fixedBonus?.[key] || 0);
    const relic = Number(relicBonus?.[key] || 0);
    const total = base + fixed + relic;

    const relicClass = relic > 0 ? "statDelta statDelta--pos"
                    : relic < 0 ? "statDelta statDelta--neg"
                    : "statDelta";

    const relicText = relic === 0 ? "" : (relic > 0 ? `+${relic}` : `${relic}`);

    const card = document.createElement("div");
    card.className = "statCard";

    card.innerHTML = `
      <div class="statHeader">
        <img class="statIcon" src="../assets/images/icons/${key}.png" alt="${label}"
          onerror="this.style.display='none'">
        <span class="statLabel">${label}</span>
      </div>

      <div class="statValueRow">
        <div class="statValue">${total}</div>
        ${relicText ? `<div class="${relicClass}">${relicText}</div>` : ""}
      </div>

      <div class="statBreakdown">
        Base ${base} + Bonus ${fixed} + Relics ${relic}
      </div>
    `;

    host.appendChild(card);
  }
}

function renderRelicsRowTo(hostId, relicKeys) {
  const host = document.getElementById(hostId);
  if (!host) return;
  host.innerHTML = "";

  if (!relicKeys || !relicKeys.length) {
    host.innerHTML = `<div class="statLabel">—</div>`;
    return;
  }

  for (const raw of relicKeys) {
    const k = relicNameToKey(raw);
    if (!k) continue;

    const pill = document.createElement("div");
    pill.className = `relicPill${ACTIVE_RELICS.has(k) ? " is-active" : ""}`;
    pill.dataset.relickey = k;

    const img = document.createElement("img");
    img.src = safeImgSrc(resolveRelic(k));
    img.alt = k;
    img.onerror = () => {
      img.onerror = null;
      img.src = "../assets/images/relics/CRUZ.png";
    };

    const span = document.createElement("span");
    span.textContent = k;

    pill.appendChild(img);
    pill.appendChild(span);
    host.appendChild(pill);
  }
}

function recalcModalStats() {
  if (!MODAL_BASE35) return;
  const fixed = fixedBonus20();
  const relicBonus = sumRelicBonusesActive();
  renderStatsGrid(MODAL_BASE35, fixed, relicBonus);
  renderRelicsRowTo("modalRelicsRow", MODAL_USED_KEYS);
  renderRelicsRowTo("modalRelicsOptionalRow", MODAL_OPTIONAL_KEYS);
}


/* =========================================================
   MODAL BINDINGS
========================================================= */
function bindModal() {
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-modal-close]")) {
      e.preventDefault();
      closeModal();
      return;
    }

    const pill = e.target.closest(".relicPill");
    if (pill) {
      const k = pill.dataset.relickey;
      if (!k) return;

      if (ACTIVE_RELICS.has(k)) ACTIVE_RELICS.delete(k);
      else ACTIVE_RELICS.add(k);

      recalcModalStats();
      return;
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });
}

/* =========================================================
   STATS CALC
========================================================= */
function colorFactor(color) {
  const c = (color ?? "").toString().trim().toLowerCase();
  if (c === "red") return 1;
  if (c === "white") return 2;
  return 3;
}
function statAtLevel(baseStat15, level, color, isHp) {
  const C = colorFactor(color);
  const L = level;
  if (isHp) {
    const perLevel = (12 + 2 * baseStat15 + 1.5 * C) / 5;
    return Math.floor(perLevel * L + 10);
  } else {
    const perLevel = (3 + 2 * baseStat15 + 1.5 * C) / 6;
    return Math.floor(perLevel * L + 5);
  }
}
function stats35AllGreenFromBase(baseStats) {
  const lvl = 35;
  const green = "green";
  return {
    hp: statAtLevel(baseStats.hp, lvl, green, true),
    spd: statAtLevel(baseStats.spd, lvl, green, false),
    ea: statAtLevel(baseStats.ea, lvl, green, false),
    pa: statAtLevel(baseStats.pa, lvl, green, false),
    ed: statAtLevel(baseStats.ed, lvl, green, false),
    pd: statAtLevel(baseStats.pd, lvl, green, false),
  };
}
function titleizeFromKey(key) {
  return (key ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/* =========================================================
   AUTO RELICS
========================================================= */
function getUsedRelicsKeysForName(name) {
  const key = normalize(name);
  const arr = BEST_RELICS[key];
  if (!Array.isArray(arr)) return [];
  return arr.map(relicNameToKey).slice(0, 4);
}

function getOptionalRelicsKeysForName(name) {
  const key = normalize(name);
  const arr = OPTIONAL_RELICS[key];
  if (!Array.isArray(arr)) return [];
  const used = new Set(getUsedRelicsKeysForName(name).map(relicNameToKey));
  const out = [];
  for (const r of arr) {
    const k = relicNameToKey(r);
    if (!k || used.has(k)) continue;
    if (out.includes(k)) continue;
    out.push(k);
  }
  return out;
}

/* =========================================================
   OPEN MODAL
========================================================= */
function openMiscritModal(name) {
  const m = findMiscritByName(name);
  if (!m) return;

  MODAL_MISCRIT_NAME = m.name || "";
  setImg("modalAvatar", avatarSrc(m), m.name);
  setText("modalTitle", m.name);

  const typeIconEl = document.getElementById("modalTypeIcon");
  if (typeIconEl) {
    typeIconEl.src = typeIconSrc(m.type);
    typeIconEl.alt = m.type || "";
    typeIconEl.onerror = () => {
      typeIconEl.onerror = null;
      typeIconEl.src = TYPE_ICON_FALLBACK;
    };
  }
  setText("modalTypeText", m.type || "—");

  const metaKey = normalize(m.name);
  const tier = (TIER_BY_NAME[metaKey] || "").toUpperCase();
  const metaObj = MISCRITS_META.find((x) => normalize(x?.name) === metaKey);
  const bestRank = (metaObj?.best_rank || "").toString().trim();

  const rarityText = m.rarity || "—";
  setBadge("modalRarity", rarityText, `badge--rarity ${rarityBadgeClass(rarityText)}`);

  let rankClass = "badge--rank";

  if (bestRank === "RS") {
    rankClass += " badge--rank-rs";
  } else if (bestRank === "S+") {
    rankClass += " badge--rank-splus";
  }

  setBadge("modalBestRank",bestRank ? bestRank : "—",rankClass);
  setBadge("modalTier", tier ? `Tier ${tier}` : "Tier —", "badge--tier");

  MODAL_USED_KEYS = getUsedRelicsKeysForName(m.name);
  MODAL_OPTIONAL_KEYS = getOptionalRelicsKeysForName(m.name);

  ACTIVE_RELICS = new Set(MODAL_USED_KEYS.map(relicNameToKey));
  const baseStats = BASE_BY_NAME[normalize(m.name)];
  MODAL_BASE35 = baseStats ? stats35AllGreenFromBase(baseStats) : { hp: 0, spd: 0, ea: 0, pa: 0, ed: 0, pd: 0 };

  recalcModalStats();
  openModal();
}

/* =========================================================
   META + RELICS HELPERS
========================================================= */
function getRelicsForMiscrit(mm) {
  if (Array.isArray(mm?.relics) && mm.relics.length) return mm.relics.slice(0, 4);
  if (mm?.autoRelics !== true) return [];

  const key = normalize(mm?.name);
  const best = BEST_RELICS[key];
  if (!Array.isArray(best)) return [];

  return best.map(relicNameToKey).slice(0, 4);
}
function getRelicsArray(mm) {
  const list = getRelicsForMiscrit(mm);
  return list.map(resolveRelic).filter(Boolean).slice(0, 4);
}

/* =========================================================
   META SECTION
========================================================= */
function getTierOfMiscrit(m) {
  return (TIER_BY_NAME[normalize(m?.name)] || "").toUpperCase();
}

function buildMetaTierGroups() {
  const tiers = {};
  for (const t of TIERS) tiers[t] = [];

  for (const m of MISCRITS) {
    const tier = getTierOfMiscrit(m);
    if (!tier) continue;
    if (!tiers[tier]) tiers[tier] = [];
    tiers[tier].push(m);
  }

  for (const t of Object.keys(tiers)) {
    tiers[t].sort((a, b) => (a.name ?? "").localeCompare((b.name ?? ""), "es"));
    if (!tiers[t].length) delete tiers[t];
  }

  return tiers;
}

function renderMetaSection(host) {
  const tierGroups = buildMetaTierGroups();
  const total = Object.values(tierGroups).reduce((acc, arr) => acc + arr.length, 0);

  const section = document.createElement("div");
  section.className = "rare-section";
  section.dataset.rarity = "Meta";

  const header = document.createElement("button");
  header.type = "button";
  header.className = "rare-header";
  header.dataset.action = "toggle-rarity";
  header.dataset.rarity = "Meta";
  header.innerHTML = `
    <strong>Meta</strong>
    <span>${total} Miscrits</span>
  `;

  const body = document.createElement("div");
  body.className = "rare-body";
  body.style.display = "none";

  if (!total) {
    body.innerHTML = `<div class="team-card"><div class="team-notes">No hay Miscrits con tierlist cargada.</div></div>`;
    section.appendChild(header);
    section.appendChild(body);
    host.appendChild(section);
    return;
  }

  for (const tier of TIERS) {
    const list = tierGroups[tier];
    if (!list?.length) continue;

    const sub = document.createElement("div");
    sub.className = "meta-tier";

    const subHeader = document.createElement("button");
    subHeader.type = "button";
    subHeader.className = "rare-header meta-tier__header";
    subHeader.dataset.action = "toggle-tier";
    subHeader.dataset.tier = tier;
    subHeader.innerHTML = `
      <strong>${tier} Tier</strong>
      <span>${list.length}</span>
    `;

    const subBody = document.createElement("div");
    subBody.className = "rare-body meta-tier__body";
    subBody.style.display = "none";

    const grid = document.createElement("div");
    grid.className = "avatar-grid";

    for (const m of list) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-btn";
      btn.dataset.name = m.name ?? "";
      btn.title = m.name ?? "Miscrit";

      const img = document.createElement("img");
      img.src = avatarSrc(m);
      img.alt = m.name ?? "Miscrit";
      img.loading = "lazy";
      img.onerror = () => {
        img.onerror = null;
        img.src = "../assets/images/miscrits_avatar/preset_avatar.png";
      };

      btn.appendChild(img);
      grid.appendChild(btn);
    }

    subBody.appendChild(grid);
    sub.appendChild(subHeader);
    sub.appendChild(subBody);
    body.appendChild(sub);
  }

  section.appendChild(header);
  section.appendChild(body);
  host.appendChild(section);
}

/* =========================================================
   LOADERS
========================================================= */
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

async function loadMiscritsMeta() {
  const res = await fetch(MISCRITS_META_URL, { cache: "no-store" });
  if (!res.ok) {
    console.warn("miscrits_meta.json no encontrado, Meta y autoRelics quedarán vacíos.");
    MISCRITS_META = [];
    TIER_BY_NAME = {};
    BEST_RELICS = {};
    OPTIONAL_RELICS = {};
    return;
  }

  const data = await res.json();
  MISCRITS_META = data.miscrits ?? [];

  TIER_BY_NAME = {};
  BEST_RELICS = {};
  OPTIONAL_RELICS = {};

  for (const m of MISCRITS_META) {
    const key = normalize(m?.name);
    if (!key) continue;

    const tier = (m?.tierlist ?? "").toString().trim().toUpperCase();
    if (tier) TIER_BY_NAME[key] = tier;

    const rb = m?.relics_by_level || {};
    const order = ["10", "20", "30", "35"];

    const used = [];
    const optionals = [];
    const seen = new Set();

    for (const lvl of order) {
      const arr = Array.isArray(rb[lvl]) ? rb[lvl] : [];
      if (!arr.length) continue;

      const firstKey = relicNameToKey(arr[0]);
      if (firstKey && !seen.has(firstKey)) {
        seen.add(firstKey);
        used.push(firstKey);
      }

      for (let i = 1; i < arr.length; i++) {
        const optKey = relicNameToKey(arr[i]);
        if (!optKey || seen.has(optKey)) continue;
        seen.add(optKey);
        optionals.push(optKey);
      }

      if (used.length >= 4) break;
    }

    if (used.length) BEST_RELICS[key] = used.slice(0, 4);
    if (optionals.length) OPTIONAL_RELICS[key] = optionals.slice(0, 24);
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

async function loadBaseStats() {
  const res = await fetch(BASE_STATS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} cargando base_stats.json`);
  const data = await res.json();

  BASE_BY_NAME = {};
  const list = Array.isArray(data?.miscrits) ? data.miscrits : [];
  for (const m of list) {
    const key = normalize(m?.name);
    if (!key || !m?.baseStats) continue;
    BASE_BY_NAME[key] = m.baseStats;
  }
}

async function loadRelicsStats() {
  const res = await fetch(RELICS_STATS_URL, { cache: "no-store" });
  if (!res.ok) {
    console.warn("No pude cargar relics.json, modal mostrará bonus 0.");
    RELICS_BY_KEY = {};
    return;
  }

  const raw = await res.json();
  const arr = Array.isArray(raw) ? raw : [];

  RELICS_BY_KEY = {};
  for (const r of arr) {
    const name = (r?.name ?? "").toString().trim();
    const level = Number(r?.level) || 0;
    const stats = r?.stats || {};
    const icon = (r?.icon ?? "").toString().trim();

    if (!name || !level) continue;

    const byName = normalize(name);
    RELICS_BY_KEY[byName] = { name, level, stats, icon };

    const keyGuess = relicNameToKey(name);
    if (keyGuess) RELICS_BY_KEY[keyGuess] = { name, level, stats, icon };
  }
}

/* =========================================================
   INDEXING
========================================================= */
function indexTeamsByMiscrit(teams) {
  const map = {};
  for (const t of teams) {
    for (const mm of t.miscrits ?? []) {
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
    const rr = RARITIES.find((x) => rarityKey(x) === rarityKey(m.rarity)) ?? "Common";
    if (rr !== "Meta") map[rr].push(m);
  }

  for (const r of RARITIES) {
    map[r].sort((a, b) => (a.name ?? "").localeCompare((b.name ?? ""), "es"));
  }
  return map;
}

/* =========================================================
   UI
========================================================= */
function setActiveAvatar(name, originBtn = null) {
  const key = normalize(name);
  document.querySelectorAll(".avatar-btn").forEach((b) => b.classList.remove("is-active"));

  if (originBtn) {
    originBtn.classList.add("is-active");
    return;
  }
  if (!key) return;

  document.querySelectorAll(".avatar-btn").forEach((b) => {
    if (normalize(b.dataset.name) === key) b.classList.add("is-active");
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

function teamDisplayTitle(t) {
  const raw = (t?.title ?? "").toString().trim();
  if (raw) return raw;
  const id = (t?.id ?? "").toString().trim().toUpperCase();
  return id ? `TEAM ${id}` : "TEAM";
}

function buildTeamCardEl(t, extraClass = "") {
  const card = document.createElement("div");
  card.className = `team-card ${extraClass}`.trim();

  const slotsHTML = (t.miscrits ?? [])
    .slice(0, 4)
    .map((mm) => {
      const name = (mm.name ?? "").toString().trim();
      const full = findMiscritByName(name);
      const src = full ? avatarSrc(full) : "../assets/images/miscrits_avatar/preset_avatar.png";
      const relics = getRelicsArray(mm);

      const relicsHTML = relics
        .map(
          (r) => `
        <button class="relic-btn" type="button" data-mname="${name}" data-kind="relic">
          <img src="${safeImgSrc(r)}" alt="Relic" onerror="this.src='../assets/images/relics/CRUZ.png'">
        </button>
      `
        )
        .join("");

      return `
        <div class="team-slot">
          <button class="team-miscrit" type="button" data-mname="${name}" data-kind="miscrit" title="Ver stats de ${name}">
            <img src="${src}" alt="${name}" onerror="this.src='../assets/images/miscrits_avatar/preset_avatar.png'">
          </button>
          <div class="relic-grid">${relicsHTML}</div>
        </div>
      `;
    })
    .join("");

  const title = teamDisplayTitle(t);
  const meta = [t.format].filter(Boolean).join(" • ");

  card.innerHTML = `
    <div class="team-title">${title}</div>
    <div class="team-subtitle">${meta}</div>
    <div class="team-grid">${slotsHTML}</div>
    ${t.summary ? `<div class="team-notes">${t.summary}</div>` : ""}
  `;

  return card;
}

function renderAccordions() {
  const host = $("#rarityAccordions");
  if (!host) return;

  host.innerHTML = "";
  renderMetaSection(host);

  const grouped = groupByRarity(MISCRITS);

  for (const rarity of RARITIES) {
    if (rarity === "Meta") continue;

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
      img.onerror = () => {
        img.onerror = null;
        img.src = "../assets/images/miscrits_avatar/preset_avatar.png";
      };

      btn.appendChild(img);
      grid.appendChild(btn);
    }

    body.appendChild(grid);
    section.appendChild(header);
    section.appendChild(body);
    host.appendChild(section);
  }
}

function openSectionForMiscrit(name, originBtn = null) {
  const m = findMiscritByName(name);
  if (!m) return;

  const originMetaTier = originBtn?.closest(".meta-tier");
  const originMetaSection = originBtn?.closest('.rare-section[data-rarity="Meta"]');

  if (originMetaSection) {
    const metaBody = originMetaSection.querySelector(".rare-body");
    if (metaBody) metaBody.style.display = "block";
    originMetaSection.classList.add("is-open");

    if (originMetaTier) {
      const tierBody = originMetaTier.querySelector(".meta-tier__body");
      if (tierBody) tierBody.style.display = "block";
      originMetaTier.classList.add("is-open");
    }
    return;
  }

  const rarity = RARITIES.find((r) => rarityKey(r) === rarityKey(m.rarity)) ?? "Common";
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

  for (const t of teams) teamsList.appendChild(buildTeamCardEl(t, ""));
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

function selectMiscrit(name, originBtn = null) {
  selectedName = name;
  setActiveAvatar(name, originBtn);
  openSectionForMiscrit(name, originBtn);
  renderTeamsFor(name);
}

/* =========================================================
   TOP CAROUSEL
========================================================= */
function pickTopTeams(max = 5) {
  const byId = new Map(TEAMS.map((t) => [String(t.id), t]));
  const picked = [];

  for (const id of TRENDING_IDS) {
    const t = byId.get(String(id));
    if (t) picked.push(t);
    if (picked.length >= max) break;
  }

  if (picked.length < max) {
    for (const t of TEAMS) {
      if (picked.length >= max) break;
      if (picked.some((x) => String(x.id) === String(t.id))) continue;
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

/* =========================================================
   EVENTS
========================================================= */
function bindDelegatedEvents() {
  document.addEventListener("click", (e) => {
    const avatarBtn = e.target.closest(".avatar-btn");
    if (avatarBtn) {
      e.stopPropagation();
      const name = avatarBtn.dataset.name;
      if (!name) return;

      if (normalize(selectedName) === normalize(name)) clearSelection();
      else selectMiscrit(name, avatarBtn);
      return;
    }

    const tierBtn = e.target.closest('[data-action="toggle-tier"]');
    if (tierBtn) {
      e.preventDefault();
      const sub = tierBtn.closest(".meta-tier");
      if (!sub) return;

      const body = sub.querySelector(".meta-tier__body");
      if (!body) return;

      const open = body.style.display !== "none";
      body.style.display = open ? "none" : "block";
      sub.classList.toggle("is-open", !open);
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

      const t = TEAMS.find((x) => String(x.id) === String(tid));
      if (!t) return;

      renderSingleTeam(t);
      return;
    }
    const miscritBtn = e.target.closest('[data-kind="miscrit"][data-mname]');
    if (miscritBtn) {
      e.preventDefault();
      e.stopPropagation();
      const mname = miscritBtn.getAttribute("data-mname");
      if (mname) openMiscritModal(mname);
      return;
    }
    const relicBtn = e.target.closest('[data-kind="relic"][data-mname]');
    if (relicBtn) {
      e.preventDefault();
      e.stopPropagation();
      const mname = relicBtn.getAttribute("data-mname");
      if (mname) openMiscritModal(mname);
      return;
    }
  });
}

/* =========================================================
   INIT
========================================================= */
async function init() {
  await loadTeams();
  await loadMiscrits();
  await loadMiscritsMeta();
  await loadBaseStats();
  await loadRelicsStats();

  renderAccordions();
  bindModal();
  renderTopCarousel();
  bindDelegatedEvents();
  clearSelection();
}

init().catch(console.error);
