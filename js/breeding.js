const $ = (sel) => document.querySelector(sel);

const MISCRITS_JSON_URL = "../miscrits.json";
const AVATAR_FOLDER = "../assets/images/miscrits_avatar/";
const AVATAR_FALLBACK = `${AVATAR_FOLDER}preset_avatar.png`;

const COST_PER_ATTEMPT = 5000;
const STATS = ["hp", "ea", "pa", "ed", "pd", "spd"];

let MISCRITS = [];
let parents = [null, null, null];

/* =========================
   UTILS
========================= */
function normalize(s) {
  return (s ?? "").toString().trim().toLowerCase();
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function setStatus(text) {
  const el = $("#br-status");
  if (el) el.textContent = text || "";
}
function avatarSrc(m) {
  const file = (m?.avatar ?? "").toString().trim();
  return file ? `${AVATAR_FOLDER}${file}` : AVATAR_FALLBACK;
}
function primaryPlace(m) {
  return (m?.spawns?.[0]?.place ?? "Unknown").toString();
}
function randInt(n) {
  return Math.floor(Math.random() * n);
}

/* =========================
   SELECT COLOR UI
========================= */
function applyColorToSelect(sel) {
  if (!sel) return;
  sel.setAttribute("data-val", sel.value);
}
function initColorSelects() {
  document.querySelectorAll(".br-color, .br-desired").forEach(sel => {
    applyColorToSelect(sel);
    sel.addEventListener("change", () => applyColorToSelect(sel));
  });
}

/* ===== PRESETS ==== */
function applyPreset(parentIndex, type) {
  STATS.forEach(stat => {
    const sel = document.querySelector(`.br-color[data-parent="${parentIndex}"][data-stat="${stat}"]`);
    if (!sel) return;

    if (type === "all-green") sel.value = "Green";
    if (type === "red-speed") sel.value = (stat === "spd" ? "Red" : "Green");

    applyColorToSelect(sel);
  });
  if ($("#br-target")?.value) doCalculate();
}

function applyGoalPreset(type) {
  STATS.forEach(stat => {
    const sel = document.querySelector(`.br-desired[data-stat="${stat}"]`);
    if (!sel) return;

    if (type === "all-green") sel.value = "Green";
    if (type === "red-speed") sel.value = (stat === "spd" ? "Red" : "Green");

    applyColorToSelect(sel);
  });

  if ($("#br-target")?.value) doCalculate();
}

function bindPresetButtons() {
  document.querySelectorAll(".br-preset").forEach(btn => {
    btn.setAttribute("type", "button");

    btn.addEventListener("click", (e) => {
      e.preventDefault();

      const scope = btn.getAttribute("data-scope") || "parent";
      const type = btn.getAttribute("data-type");

      if (!type) return;

      if (scope === "goal") {
        applyGoalPreset(type);
        return;
      }

      const parent = btn.getAttribute("data-parent");
      if (parent == null) return;
      applyPreset(parent, type);
    });
  });
}

/* =========================
   DROPDOWN PICKER
========================= */
function renderMiscritDropdown(dd, input, onPick) {
  const close = () => { dd.hidden = true; dd.innerHTML = ""; };

  const open = () => {
    const q = normalize(input.value);
    const matches = MISCRITS
      .filter(m => !q || normalize(m.name).includes(q))
      .slice(0, 60);

    if (!matches.length) return close();

    dd.hidden = false;
    dd.innerHTML = matches.map(m => `
      <button type="button" class="miscritpicker__item" data-id="${m.id}">
        <img class="miscritpicker__avatar" src="${avatarSrc(m)}" alt="">
        <div class="miscritpicker__name">${m.name}</div>
      </button>
    `).join("");

    dd.querySelectorAll(".miscritpicker__item").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const picked = MISCRITS.find(x => String(x.id) === String(id));
        if (!picked) return;
        input.value = picked.name;
        close();
        onPick(picked);
      });
    });
  };

  input.addEventListener("focus", open);
  input.addEventListener("input", open);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();

    if (e.key === "Enter") {
      const exact = MISCRITS.find(m => normalize(m.name) === normalize(input.value));
      if (exact) {
        e.preventDefault();
        onPick(exact);
        close();
        return;
      }
      const first = dd.querySelector(".miscritpicker__item");
      if (first) {
        e.preventDefault();
        first.click();
      }
    }
  });

  document.addEventListener("click", (e) => {
    const host = input.closest(".miscritpicker");
    if (host && !host.contains(e.target)) close();
  });
}

/* =========================
   PARENT UI
========================= */
function updateParentUI(i, m) {
  const a = $(`#br-avatar-${i}`);
  const n = $(`#br-name-${i}`);
  const meta = $(`#br-meta-${i}`);

  if (a) a.src = m ? avatarSrc(m) : AVATAR_FALLBACK;
  if (n) n.textContent = m ? m.name : "—";

  if (!meta) return;
  if (!m) {
    meta.textContent = "—";
    return;
  }
  meta.textContent = `${m.type || "?"} · ${m.rarity || "?"} · ${primaryPlace(m)}`;
}

/* =========================
   READ INPUTS
========================= */
function readParentColors(parentIndex) {
  const map = {};
  STATS.forEach(stat => {
    const sel = document.querySelector(`.br-color[data-parent="${parentIndex}"][data-stat="${stat}"]`);
    map[stat] = (sel?.value ?? "Green");
  });
  return map;
}

function readDesiredColors() {
  const map = {};
  STATS.forEach(stat => {
    const sel = document.querySelector(`.br-desired[data-stat="${stat}"]`);
    map[stat] = (sel?.value ?? "Any");
  });
  return map;
}

/* =========================
   TARGET SELECT
========================= */
function rebuildTargetSelect() {
  const sel = $("#br-target");
  if (!sel) return;

  const current = sel.value;
  const list = parents.filter(Boolean);
  sel.innerHTML = "";

  if (!list.length) {
    sel.innerHTML = `<option value="">— Select 3 Miscrits for Breeding —</option>`;
    return;
  }

  const uniq = [];
  const seen = new Set();
  for (const m of list) {
    const key = normalize(m.name);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(m);
  }

  sel.innerHTML = `<option value="">— Expected Target —</option>` + uniq.map(m =>
    `<option value="${m.id}">${m.name}</option>`
  ).join("");

  if (current) sel.value = current;
}

function countTargetInParents(targetId) {
  return parents.filter(p => p && String(p.id) === String(targetId)).length;
}

/* =========================
   CALC PROBABILITY
========================= */
function calcProbability(targetId, desired) {
  const validParents = parents.filter(Boolean);
  if (validParents.length !== 3) return { ok: false, error: "Selecciona los 3 padres." };
  if (!targetId) return { ok: false, error: "Elige un target." };

  const count = countTargetInParents(targetId);
  if (count <= 0) return { ok: false, error: "El target debe ser uno de los 3 padres." };

  const pResult = count / 3;
  const parentColors = [0, 1, 2].map(i => readParentColors(i));

  const parts = [];
  let pStats = 1;

  for (const stat of STATS) {
    const want = desired[stat] || "Any";
    if (want === "Any") {
      parts.push({ stat, want, p: 1, hit: 3 });
      continue;
    }
    const hit = parentColors.reduce((acc, pc) => acc + ((pc[stat] === want) ? 1 : 0), 0);
    const p = hit / 3;
    pStats *= p;
    parts.push({ stat, want, p, hit });
  }

  return { ok: true, pResult, pStats, pTotal: pResult * pStats, parts };
}

function fmtPct(p) {
  if (!Number.isFinite(p)) return "—";
  return `${(p * 100).toFixed(p * 100 < 1 ? 3 : 2)}%`;
}
function fmtNum(n) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}
function buildBreakdownText(res) {
  const lines = [];
  lines.push(`P(result = target) = ${res.pResult.toFixed(4)} (${(res.pResult * 100).toFixed(2)}%)`);
  for (const it of res.parts) {
    if (it.want === "Any") continue;
    lines.push(`P(${it.stat.toUpperCase()} = ${it.want}) = ${it.hit}/3 = ${it.p.toFixed(4)}`);
  }
  lines.push(`P(stats) = ${res.pStats.toFixed(6)}`);
  lines.push(`P(total) = ${res.pTotal.toFixed(6)}`);
  return lines.join("\n");
}

function doCalculate() {
  const desired = readDesiredColors();
  const targetId = $("#br-target")?.value || "";

  const res = calcProbability(targetId, desired);
  const probEl = $("#br-prob");
  const attEl = $("#br-attempts");
  const goldEl = $("#br-gold");
  const bdEl = $("#br-breakdown");

  if (!res.ok) {
    setStatus(res.error);
    if (probEl) probEl.textContent = "—";
    if (attEl) attEl.textContent = "—";
    if (goldEl) goldEl.textContent = "—";
    if (bdEl) bdEl.textContent = "";
    return;
  }

  setStatus("");

  if (probEl) probEl.textContent = fmtPct(res.pTotal);

  const expectedAttempts = res.pTotal > 0 ? (1 / res.pTotal) : Infinity;
  if (attEl) attEl.textContent = Number.isFinite(expectedAttempts) ? expectedAttempts.toFixed(2) : "∞";

  const expectedGold = Number.isFinite(expectedAttempts) ? expectedAttempts * COST_PER_ATTEMPT : Infinity;
  if (goldEl) goldEl.textContent = Number.isFinite(expectedGold) ? fmtNum(Math.round(expectedGold)) : "∞";

  if (bdEl) bdEl.textContent = buildBreakdownText(res);
}

/* =========================
   SIMULATION
========================= */
function getParentStatColor(parentIndex, stat) {
  const sel = document.querySelector(`.br-color[data-parent="${parentIndex}"][data-stat="${stat}"]`);
  return sel?.value || "White";
}

function simulateOnce() {
  const p = parents.filter(Boolean);
  if (p.length !== 3) return null;

  const offspringMiscrit = p[randInt(3)];
  const rolledStats = {};

  STATS.forEach(stat => {
    const sourceParentIndex = randInt(3);
    rolledStats[stat] = getParentStatColor(sourceParentIndex, stat);
  });

  return { miscrit: offspringMiscrit, stats: rolledStats };
}

function renderSimCard(result) {
  const card = $("#br-simCard");
  const a = $("#br-simAvatar");
  const n = $("#br-simName");
  const m = $("#br-simMeta");
  const s = $("#br-simStats");

  if (!card || !a || !n || !m || !s) return;

  card.hidden = false;

  a.src = avatarSrc(result.miscrit);
  a.alt = result.miscrit.name || "";

  n.textContent = result.miscrit.name || "—";
  m.textContent = `${result.miscrit.type || "?"} • ${result.miscrit.rarity || "?"}`;

  s.innerHTML = STATS.map(stat => {
    const val = result.stats[stat] || "White";
    return `
      <div class="br-simStat">
        <div class="br-simStat__k">${stat.toUpperCase()}</div>
        <div class="br-simStat__v" data-val="${val}">${val}</div>
      </div>
    `;
  }).join("");
}

/* =========================
   RESET
========================= */
function resetAll() {
  parents = [null, null, null];

  for (let i = 0; i < 3; i++) {
    const input = $(`#br-pick-${i}`);
    if (input) input.value = "";
    updateParentUI(i, null);

    STATS.forEach(stat => {
      const sel = document.querySelector(`.br-color[data-parent="${i}"][data-stat="${stat}"]`);
      if (sel) {
        sel.value = "Green";
        applyColorToSelect(sel);
      }
    });
  }

  STATS.forEach(stat => {
    const sel = document.querySelector(`.br-desired[data-stat="${stat}"]`);
    if (sel) {
      sel.value = "Any";
      applyColorToSelect(sel);
    }
  });

  rebuildTargetSelect();

  if ($("#br-prob")) $("#br-prob").textContent = "—";
  if ($("#br-attempts")) $("#br-attempts").textContent = "—";
  if ($("#br-gold")) $("#br-gold").textContent = "—";
  if ($("#br-breakdown")) $("#br-breakdown").textContent = "";

  const simCard = $("#br-simCard");
  if (simCard) simCard.hidden = true;

  setStatus("");
}

/* =========================
   LOAD + INIT
========================= */
async function loadMiscrits() {
  const res = await fetch(MISCRITS_JSON_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} cargando ${MISCRITS_JSON_URL}`);
  const json = await res.json();

  const list = Array.isArray(json?.miscrits) ? json.miscrits : [];
  MISCRITS = list
    .filter(m => m?.name && m?.id != null)
    .slice()
    .sort((a, b) => toNum(a.id) - toNum(b.id));
}

function init() {
  for (let i = 0; i < 3; i++) {
    const input = $(`#br-pick-${i}`);
    const dd = $(`#br-dd-${i}`);
    if (!input || !dd) continue;

    renderMiscritDropdown(dd, input, (picked) => {
      parents[i] = picked;
      updateParentUI(i, picked);
      rebuildTargetSelect();
      if ($("#br-target")?.value) doCalculate();
    });
  }

  $("#br-calc")?.addEventListener("click", doCalculate);
  $("#br-reset")?.addEventListener("click", resetAll);

  $("#br-target")?.addEventListener("change", () => {
    if ($("#br-target")?.value) doCalculate();
  });

  $("#br-simulate")?.addEventListener("click", () => {
    const result = simulateOnce();
    if (!result) {
      setStatus("Selecciona los 3 padres antes de simular.");
      return;
    }
    setStatus("");
    renderSimCard(result);
  });

  document.querySelectorAll(".br-color, .br-desired").forEach(el => {
    el.addEventListener("change", () => {
      if ($("#br-target")?.value) doCalculate();
    });
  });

  initColorSelects();
  bindPresetButtons();
  resetAll();
}

(async function boot() {
  try {
    await loadMiscrits();
    init();
  } catch (e) {
    console.error(e);
    setStatus("Error cargando Miscrits. Revisa consola y ruta del JSON.");
  }
})();
