const $ = (sel) => document.querySelector(sel);

let MISCRITS = [];
let TEAMS = [];
let TEAMS_BY_MISCRIT = {};
let selectedId = null;
let RELIC_MAP = {};
let TRENDING_IDS = [];

const RARITIES = ["Common", "Rare", "Epic", "Exotic", "Legendary"];

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

async function loadMiscrits() {
  const res = await fetch("../miscrits.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} cargando miscrits.json`);
  const data = await res.json();
  MISCRITS = data.miscrits ?? [];
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

function indexTeamsByMiscrit(teams) {
  const map = {};
  for (const t of teams) {
    for (const mm of (t.miscrits ?? [])) {
      const id = String(mm.id);
      if (!map[id]) map[id] = [];
      map[id].push(t);
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

function findMiscritById(id) {
  return MISCRITS.find(m => String(m.id) === String(id)) ?? null;
}

function setActiveAvatar(id) {
  document.querySelectorAll(".avatar-btn").forEach((b) => {
    b.classList.toggle("is-active", !!id && b.dataset.id === id);
  });
}

function clearSelection() {
  selectedId = null;
  setActiveAvatar(null);

  const panelTitle = $("#panelTitle");
  const panelMeta = $("#panelMeta");
  const teamsList = $("#teamsList");

  if (panelTitle) panelTitle.textContent = "Select one Miscrit";
  if (panelMeta) panelMeta.textContent = "This will show best teams for this Miscrit";
  if (teamsList) teamsList.innerHTML = "";
}

function resolveRelic(ref) {
  if (!ref) return "";
  return RELIC_MAP[ref] ?? ref;
}

function getRelicsArray(mm) {
  if (!Array.isArray(mm?.relics)) return [];
  return mm.relics.map(resolveRelic).filter(Boolean).slice(0, 4);
}

function goToSpawnDetail(miscritId) {
  window.location.href = `./miscrits.html?id=${encodeURIComponent(miscritId)}`;
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
    const full = findMiscritById(mm.id);
    const name = mm.name ?? full?.name ?? mm.id;
    const src = full ? avatarSrc(full) : "../assets/images/miscrits_avatar/preset_avatar.png";
    const relics = getRelicsArray(mm);

    const relicsHTML = relics.map((r) => `
      <button class="relic-btn" type="button" data-mid="${mm.id}">
        <img src="${safeImgSrc(r)}" alt="Relic" onerror="this.src='../assets/images/ui/placeholder.png'">
      </button>
    `).join("");

    return `
      <div class="team-slot">
        <button class="team-miscrit" type="button" data-mid="${mm.id}" title="Ver dónde capturar ${name}">
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

/**
 * Render acordeones
 */
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
      btn.dataset.id = String(m.id);
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

function openSectionForMiscrit(id) {
  const m = findMiscritById(id);
  if (!m) return;

  const rarity = RARITIES.find(r => rarityKey(r) === rarityKey(m.rarity)) ?? "Common";
  const section = document.querySelector(`.rare-section[data-rarity="${rarity}"]`);
  if (!section) return;

  const body = section.querySelector(".rare-body");
  if (!body) return;

  body.style.display = "block";
  section.classList.add("is-open");
}

function renderTeamsFor(selectedMiscritId) {
  const panelTitle = $("#panelTitle");
  const panelMeta = $("#panelMeta");
  const teamsList = $("#teamsList");

  if (!panelTitle || !panelMeta || !teamsList) return;

  const m = findMiscritById(selectedMiscritId);
  const teams = TEAMS_BY_MISCRIT[String(selectedMiscritId)] ?? [];

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

function selectMiscrit(id) {
  selectedId = id;
  setActiveAvatar(id);
  openSectionForMiscrit(id);
  renderTeamsFor(id);
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

  const prev = $("#topPrev");
  const next = $("#topNext");

  const scrollByCard = (dir) => {
    const firstCard = track.querySelector(".topteam-card");
    if (!firstCard) return;
    const w = firstCard.getBoundingClientRect().width + 14;
    track.scrollBy({ left: dir * w, behavior: "smooth" });
  };

  if (prev) prev.addEventListener("click", () => scrollByCard(-1));
  if (next) next.addEventListener("click", () => scrollByCard(1));
}

/**
 * Delegación: 1 solo listener para TODO
 */
function bindDelegatedEvents() {
  document.addEventListener("click", (e) => {
    const avatarBtn = e.target.closest(".avatar-btn");
    if (avatarBtn) {
      e.stopPropagation();
      const id = avatarBtn.dataset.id;
      if (!id) return;
      if (selectedId === id) clearSelection();
      else selectMiscrit(id);

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

    const midEl = e.target.closest("[data-mid]");
    if (midEl) {
      e.preventDefault();
      e.stopPropagation();
      const mid = midEl.getAttribute("data-mid");
      if (mid) goToSpawnDetail(mid);
      return;
    }
  });
}

/**
 * Init
 */
async function init() {
  await Promise.all([loadMiscrits(), loadTeams()]);
  renderAccordions();
  renderTopCarousel();
  bindDelegatedEvents();
  clearSelection();
}

init().catch(console.error);
