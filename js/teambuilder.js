import { normalize, toNum, pickBestMove } from "./damage_core.js";

const $ = (sel) => document.querySelector(sel);

const PATH = {
  BASE_STATS: "../assets/data/base_stats.json",
  DB: "../assets/data/miscritsdb.json",
  META: "../assets/data/miscrits_meta.json",

  AVATAR_FOLDER: "../assets/images/miscrits_avatar/",
  AVATAR_FALLBACK: "../assets/images/miscrits_avatar/preset_avatar.png",
};

const COST_BY_RARITY = {
  Legendary: 5,
  Exotic: 4,
  Epic: 3,
  Rare: 2,
  Common: 1,
};

const TEAM_SIZE = 4;
const POINT_CAP = 12;
const PVP_LEVEL = 35;

const DEFAULT_COLORS = { hp: "green", spd: "green", ea: "green", pa: "green", ed: "green", pd: "green" };
const DEFAULT_BONUS = { HP: 0, EA: 0, PA: 0, SPD: 0, ED: 0, PD: 0 };

let DB = [];
let BASE = [];
let META = [];

let DB_BY_NAME = new Map();
let BASE_BY_NAME = new Map();
let META_BY_NAME = new Map();

let PICK_SLOT_INDEX = null;
let SELECTED_THREAT = null;

const state = {
  slots: Array.from({ length: TEAM_SIZE }, () => null),
};

/* =========================================================
   STATS
========================================================= */

function colorFactor(color) {
  const c = normalize(color);
  if (c === "red") return 1;
  if (c === "white") return 2;
  return 3;
}

function statAtLevel(baseStat15, level, color, isHp) {
  const C = colorFactor(color);
  const L = Math.max(1, Math.min(35, Number(level) || 35));

  if (isHp) {
    const perLevel = (12 + 2 * toNum(baseStat15) + 1.5 * C) / 5;
    return Math.floor(perLevel * L + 10);
  } else {
    const perLevel = (3 + 2 * toNum(baseStat15) + 1.5 * C) / 6;
    return Math.floor(perLevel * L + 5);
  }
}

function computeTotalsLevel35(base15, colors = DEFAULT_COLORS, bonus = DEFAULT_BONUS) {
  if (!base15) return null;
  const c = colors || DEFAULT_COLORS;

  const totals = {
    HP: statAtLevel(base15.hp, PVP_LEVEL, c.hp, true),
    SPD: statAtLevel(base15.spd, PVP_LEVEL, c.spd, false),
    EA: statAtLevel(base15.ea, PVP_LEVEL, c.ea, false),
    PA: statAtLevel(base15.pa, PVP_LEVEL, c.pa, false),
    ED: statAtLevel(base15.ed, PVP_LEVEL, c.ed, false),
    PD: statAtLevel(base15.pd, PVP_LEVEL, c.pd, false),
  };

  totals.HP += toNum(bonus.HP);
  totals.SPD += toNum(bonus.SPD);
  totals.EA += toNum(bonus.EA);
  totals.PA += toNum(bonus.PA);
  totals.ED += toNum(bonus.ED);
  totals.PD += toNum(bonus.PD);

  return totals;
}

/* =========================================================
   AVATAR
========================================================= */

function avatarSrcFromMetaOrInfer(name) {
  const meta = META_BY_NAME.get(normalize(name));
  const metaAvatar = meta?.avatar;

  const inferred =
    normalize(name).replace(/\s+/g, "_").replace(/[^\w_]/g, "") + "_avatar.png";

  const file = metaAvatar || inferred;
  return `${PATH.AVATAR_FOLDER}${file}`;
}

/* =========================================================
   POINTS
========================================================= */

function getSlotCost(slot) {
  if (!slot?.rarity) return 0;
  return COST_BY_RARITY[slot.rarity] ?? 0;
}

function pointsUsed() {
  return state.slots.reduce((sum, s) => sum + (s ? getSlotCost(s) : 0), 0);
}

function pointsLeft() {
  return POINT_CAP - pointsUsed();
}

/* =========================================================
   LOAD DATA
========================================================= */

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  return res.json();
}

async function loadAll() {
  const [dbJson, baseJson, metaJson] = await Promise.all([
    loadJSON(PATH.DB),
    loadJSON(PATH.BASE_STATS),
    loadJSON(PATH.META),
  ]);

  DB = Array.isArray(dbJson) ? dbJson : (dbJson?.miscrits ?? []);
  BASE = Array.isArray(baseJson) ? baseJson : (baseJson?.miscrits ?? []);
  META = metaJson?.miscrits ?? metaJson?.data ?? metaJson ?? [];

  DB_BY_NAME = new Map(DB.filter(m => m?.name).map(m => [normalize(m.name), m]));

  BASE_BY_NAME = new Map(
    BASE
      .filter(x => x?.name && x?.baseStats)
      .map(x => [normalize(x.name), x.baseStats])
  );

  META_BY_NAME = new Map(
    (Array.isArray(META) ? META : [])
      .filter(x => x?.name)
      .map(x => [normalize(x.name), x])
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getMetaForName(name) {
  return META_BY_NAME.get(normalize(name)) || null;
}

function getRarityForName(name) {
  const meta = getMetaForName(name);
  if (meta?.rarity) return meta.rarity;

  const baseItem = BASE.find(x => normalize(x?.name) === normalize(name));
  if (baseItem?.rarity) return baseItem.rarity;

  return "Common";
}

function getTierForName(name) {
  const meta = getMetaForName(name);
  return (meta?.tierlist ?? meta?.tier ?? meta?.Tier ?? null);
}

function getElementsForName(name) {
  const m = DB_BY_NAME.get(normalize(name));
  return Array.isArray(m?.elements) ? m.elements : [];
}

function getDbMiscrit(name) {
  return DB_BY_NAME.get(normalize(name)) || null;
}

function getBase15(name) {
  return BASE_BY_NAME.get(normalize(name)) || null;
}

function getTotalsDefault35(name) {
  const base15 = getBase15(name);
  return computeTotalsLevel35(base15, DEFAULT_COLORS, DEFAULT_BONUS);
}

function getTier(name) {
  const meta = META_BY_NAME.get(normalize(name));
  return (meta?.tierlist ?? meta?.tier ?? "").toString().toUpperCase();
}

/* =========================================================
   TEAM SLOTS UI
========================================================= */

function slotLabel(i) {
  return `Slot ${i + 1}`;
}

function slotSubline(slot) {
  if (!slot) return "Empty";
  const elems = slot.elements?.length ? slot.elements.join(", ") : "—";
  return `${slot.rarity} • ${slot.cost} pts • ${elems}`;
}

function renderPointsBar() {
  const used = pointsUsed();
  const left = pointsLeft();

  $("#tbUsed").textContent = String(used);
  $("#tbLeft").textContent = String(left);

  const pill = $("#tbPointsPill");
  if (pill) pill.classList.toggle("is-over", used > POINT_CAP);
}

function renderSlots() {
  const host = $("#tbSlots");
  if (!host) return;

  host.innerHTML = "";

  for (let i = 0; i < TEAM_SIZE; i++) {
    const slot = state.slots[i];

    const row = document.createElement("div");
    row.className = "tb-slot";

    const img = document.createElement("img");
    img.className = "tb-ava";
    img.alt = slot?.name || "";
    img.src = slot?.name ? avatarSrcFromMetaOrInfer(slot.name) : PATH.AVATAR_FALLBACK;
    img.onerror = () => { img.src = PATH.AVATAR_FALLBACK; };

    const meta = document.createElement("div");
    meta.className = "tb-slot__meta";
    meta.innerHTML = `
      <div class="tb-slot__name">${slot?.name ?? slotLabel(i)}</div>
      <div class="tb-slot__sub">${slotSubline(slot)}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "tb-slot__actions";

    const btnPick = document.createElement("button");
    btnPick.type = "button";
    btnPick.className = "tb-btn";
    btnPick.textContent = slot ? "Edit" : "Pick";
    btnPick.addEventListener("click", () => openPicker(i));

    const btnClear = document.createElement("button");
    btnClear.type = "button";
    btnClear.className = "tb-btn";
    btnClear.textContent = "Clear";
    btnClear.disabled = !slot;
    btnClear.addEventListener("click", () => {
      state.slots[i] = null;
      refreshAll();
    });

    actions.appendChild(btnPick);
    actions.appendChild(btnClear);

    row.appendChild(img);
    row.appendChild(meta);
    row.appendChild(actions);

    host.appendChild(row);
  }
}

/* =========================================================
   PICKER MODAL
========================================================= */

function buildSlotFromName(name) {
  const rarity = getRarityForName(name);
  const cost = COST_BY_RARITY[rarity] ?? 0;

  const base15 = BASE_BY_NAME.get(normalize(name)) || null;
  const totals = computeTotalsLevel35(base15, DEFAULT_COLORS, DEFAULT_BONUS);

  return {
    name,
    rarity,
    cost,
    tier: getTierForName(name),
    elements: getElementsForName(name),
    colors: { ...DEFAULT_COLORS },
    bonus: { ...DEFAULT_BONUS },
    totals: totals || { HP: 0, SPD: 0, EA: 0, PA: 0, ED: 0, PD: 0 },
  };
}

function openPicker(slotIndex) {
  PICK_SLOT_INDEX = slotIndex;

  const modal = $("#tbPickerModal");
  const title = $("#tbPickerTitle");
  const search = $("#tbPickerSearch");

  if (title) title.textContent = `Pick Miscrit • ${slotLabel(slotIndex)}`;
  if (search) search.value = "";

  renderPickerGrid("");
  if (modal) modal.hidden = false;

  search?.focus?.();
}

function closePicker() {
  const modal = $("#tbPickerModal");
  if (modal) modal.hidden = true;
  PICK_SLOT_INDEX = null;
}

function renderPickerGrid(query) {
  const grid = $("#tbPickerGrid");
  if (!grid) return;

  const onlyAffordable = !!$("#tbOnlyAffordable")?.checked;
  const q = normalize(query);

  const list = BASE
    .filter(x => x?.name && x?.baseStats)
    .map(x => x.name)
    .filter(n => !q || normalize(n).includes(q))
    .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
    .slice(0, 150);

  grid.innerHTML = "";

  const usedBefore = pointsUsed();
  const currentSlot = PICK_SLOT_INDEX != null ? state.slots[PICK_SLOT_INDEX] : null;
  const currentCost = currentSlot ? currentSlot.cost : 0;

  const effectiveLeft = POINT_CAP - (usedBefore - currentCost);

  for (const name of list) {
    const rarity = getRarityForName(name);
    const cost = COST_BY_RARITY[rarity] ?? 0;

    const canPick = cost <= effectiveLeft;
    if (onlyAffordable && !canPick) continue;

    const tier = getTierForName(name);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "miscritpicker__item";
    if (!canPick) btn.disabled = true;

    const avatar = document.createElement("img");
    avatar.className = "miscritpicker__avatar";
    avatar.alt = "";
    avatar.src = avatarSrcFromMetaOrInfer(name);
    avatar.onerror = () => { avatar.src = PATH.AVATAR_FALLBACK; };

    const left = document.createElement("div");
    left.className = "miscritpicker__left";
    left.appendChild(avatar);

    const nm = document.createElement("div");
    nm.className = "miscritpicker__name";
    nm.textContent = name;
    left.appendChild(nm);

    const right = document.createElement("div");
    right.className = "miscritpicker__right";
    const remAfter = effectiveLeft - cost;

    right.innerHTML = `
      <div><span class="miscritpicker__cost">${cost} pts</span> • ${rarity}</div>
      <div>${tier ? `Tier ${String(tier).toUpperCase()} • ` : ""}After pick: ${remAfter} left</div>
    `;

    btn.appendChild(left);
    btn.appendChild(right);

    btn.addEventListener("click", () => {
      if (PICK_SLOT_INDEX == null) return;
      state.slots[PICK_SLOT_INDEX] = buildSlotFromName(name);
      closePicker();
      refreshAll();
    });

    grid.appendChild(btn);
  }
}

/* =========================================================
   THREAT ANALYSIS
========================================================= */

function classifyOutcome(htkYou, htkThem) {
  if (!Number.isFinite(htkYou) || !Number.isFinite(htkThem)) return "even";
  if (htkYou <= htkThem - 1) return "win";
  if (htkYou >= htkThem + 1) return "lose";
  return "even";
}

function bestAttackResult(attackerName, attackerTotals, defenderName, defenderTotals, mode = "auto") {
  const atkMis = getDbMiscrit(attackerName);
  const defMis = getDbMiscrit(defenderName);
  if (!atkMis || !defMis) return null;

  const best = pickBestMove(atkMis, attackerTotals, defMis, defenderTotals, mode);
  if (!best?.move || !best?.dmg) return null;

  return {
    moveName: best.move.name ?? "—",
    moveElem: best.move.element ?? "—",
    avg: best.dmg.avg,
    min: best.dmg.min,
    max: best.dmg.max,
    htk: best.dmg.htk,
    multiplier: best.dmg.multiplier,
    label: best.dmg.label,
  };
}

function getMetaThreatNames(limit = 80) {
  const order = { S: 0, A: 1, B: 2, C: 3, D: 4, F: 5 };

  return (Array.isArray(META) ? META : [])
    .filter(x => x?.name)
    .map(x => {
      const tier = (x.tierlist ?? x.tier ?? "").toString().toUpperCase().trim();
      return { name: x.name, tier };
    })
    .filter(x => ["S", "A", "B", "C", "D"].includes(x.tier))
    .sort((a, b) => {
      const oa = order[a.tier] ?? 999;
      const ob = order[b.tier] ?? 999;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    })
    .slice(0, limit)
    .map(x => x.name);
}


function clearThreatAnalysis() {
  const box = $("#tbThreatsBox");
  if (box) box.innerHTML = "";
  const cb = $("#tbShowOnlyLoses");
  if (cb) cb.checked = false;
}

function analyzeThreats() {
  const box = $("#tbThreatsBox");
  if (!box) return;

  const mode = $("#tbMode")?.value ?? "auto";
  const onlyLoses = !!$("#tbShowOnlyLoses")?.checked;

  const teamSlots = state.slots
    .map((s, i) => ({ slot: s, idx: i }))
    .filter(x => x.slot?.name);

  if (teamSlots.length !== 4) {
    box.innerHTML = `<div class="tb-warn">Fill all 4 slots to analyze threats.</div>`;
    return;
  }

  const threats = getMetaThreatNames(25);
  const rows = [];

  for (const threatName of threats) {
    const threatTotals = getTotalsDefault35(threatName);
    const threatDb = getDbMiscrit(threatName);
    if (!threatTotals || !threatDb) continue;

    let bestCounter = null;

    for (const { slot, idx } of teamSlots) {
      const atkName = slot.name;
      const atkTotals = slot.totals;
      if (!atkTotals) continue;

      const forward = bestAttackResult(atkName, atkTotals, threatName, threatTotals, mode);
      if (!forward || !Number.isFinite(forward.htk)) continue;

      const back = bestAttackResult(threatName, threatTotals, atkName, atkTotals, mode);
      const htkThem = back?.htk;

      const outcome = classifyOutcome(forward.htk, htkThem);

      const score = (1000 - Math.min(999, forward.htk * 100)) + (forward.avg / 10);

      const candidate = {
        threatName,
        threatTier: getTier(threatName) || "—",
        slotIdx: idx,
        slotName: atkName,
        yourMove: `${forward.moveName} (${forward.moveElem})`,
        yourAvg: forward.avg,
        yourRange: `${forward.min}–${forward.max}`,
        htkYou: forward.htk,
        htkThem: Number.isFinite(htkThem) ? htkThem : Infinity,
        outcome,
        score,
        multiplier: forward.multiplier,
      };

      if (!bestCounter || candidate.score > bestCounter.score) bestCounter = candidate;
    }

    if (!bestCounter) continue;
    if (onlyLoses && bestCounter.outcome !== "lose") continue;

    rows.push(bestCounter);
  }

  if (!rows.length) {
    box.innerHTML = `<div class="tb-warn">No results (check data / slots / tiers).</div>`;
    return;
  }

  const rank = { lose: 0, even: 1, win: 2 };
  rows.sort(
    (a, b) =>
      (rank[a.outcome] - rank[b.outcome]) ||
      (a.threatTier.localeCompare(b.threatTier)) ||
      (a.threatName.localeCompare(b.threatName))
  );

  box.innerHTML = rows
    .map(r => {
      const cls = r.outcome === "win" ? "win" : r.outcome === "lose" ? "lose" : "even";
      const htkThemTxt = r.htkThem === Infinity ? "—" : String(r.htkThem);

      const avatar = avatarSrcFromMetaOrInfer(r.threatName);

      return `
        <div class="tb-threatRow">
          
          <div class="tb-col">
            <div class="tb-label">Miscrit Name</div>
            <div class="tb-value tb-miscrit">
              <img class="tb-mini-avatar" src="${avatarSrcFromMetaOrInfer(r.threatName)}" alt="">
              ${r.threatName}
            </div>
          </div>

          <div class="tb-col">
            <div class="tb-label">Best Option</div>
            <div class="tb-value">${r.slotName}</div>
          </div>

          <div class="tb-col">
            <div class="tb-label">Move</div>
            <div class="tb-value">${r.yourMove}</div>
          </div>

          <div class="tb-col">
            <div class="tb-label">HTK (You/Them)</div>
            <div class="tb-value tb-mono">${r.htkYou} / ${htkThemTxt}</div>
          </div>

          <div class="tb-col">
            <div class="tb-label">Damage</div>
            <div class="tb-value tb-mono">${r.yourRange}</div>
            <div class="tb-label" style="margin-top:6px;">Average</div>
            <div class="tb-value tb-mono">${r.yourAvg}</div>
          </div>

          <div class="tb-outcome">
            <span class="tb-badge ${cls}">${r.outcome.toUpperCase()}</span>
          </div>

        </div>
      `;
    })
    .join("");
}

/* =========================================================
   QUICK CHECK
========================================================= */

function setQuickOut({ atkName = "—", defName = "—", move = "—", avg = "—", range = "—", htk = "—", mul = "—" }) {
  $("#tbOutAtk").textContent = atkName;
  $("#tbOutDef").textContent = defName;
  $("#tbOutMove").textContent = move;
  $("#tbOutAvg").textContent = avg;
  $("#tbOutRange").textContent = range;
  $("#tbOutHtk").textContent = htk;
  $("#tbOutMul").textContent = mul;
}

function computeThreatTotals(name) {
  const base15 = BASE_BY_NAME.get(normalize(name));
  return computeTotalsLevel35(base15, DEFAULT_COLORS, DEFAULT_BONUS);
}

function runQuickCheck() {
  const atkSlotIdx = Number($("#tbAtkSlot")?.value ?? 0);
  const atkSlot = state.slots[atkSlotIdx];

  const threatName = SELECTED_THREAT || $("#tbThreatSearch")?.value?.trim();
  if (!atkSlot || !atkSlot.name || !threatName) {
    setQuickOut({});
    return;
  }

  const atkMis = DB_BY_NAME.get(normalize(atkSlot.name));
  const defMis = DB_BY_NAME.get(normalize(threatName));

  const atkTotals = atkSlot.totals;
  const defTotals = computeThreatTotals(threatName);

  if (!atkMis || !defMis || !atkTotals || !defTotals) {
    setQuickOut({ atkName: atkSlot.name, defName: threatName });
    return;
  }

  const mode = $("#tbMode")?.value ?? "auto";

  const best = pickBestMove(atkMis, atkTotals, defMis, defTotals, mode);
  if (!best?.move || !best?.dmg) {
    setQuickOut({ atkName: atkSlot.name, defName: threatName });
    return;
  }

  const d = best.dmg;

  setQuickOut({
    atkName: atkSlot.name,
    defName: threatName,
    move: `${best.move.name} (${best.move.element ?? "—"})`,
    avg: String(d.avg),
    range: `${d.min}–${d.max}`,
    htk: d.htk === Infinity ? "—" : String(d.htk),
    mul: "x" + String(d.multiplier),
  });
}

/* =========================================================
   THREAT SEARCH
========================================================= */

function closeThreatDropdown() {
  const dd = $("#tbThreatDropdown");
  if (!dd) return;
  dd.hidden = true;
  dd.innerHTML = "";
}

function renderThreatDropdown(query = "") {
  const input = $("#tbThreatSearch");
  const dropdown = $("#tbThreatDropdown");
  if (!input || !dropdown) return;

  const q = normalize(query);
  dropdown.innerHTML = "";

  const matches = DB
    .filter(m => m?.name)
    .filter(m => !q || normalize(m.name).includes(q))
    .slice(0, 40);

  if (!matches.length) {
    dropdown.hidden = true;
    return;
  }

  dropdown.hidden = false;

  for (const m of matches) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "miscritpicker__item";

    const avatar = document.createElement("img");
    avatar.className = "miscritpicker__avatar";
    avatar.src = avatarSrcFromMetaOrInfer(m.name);
    avatar.alt = m.name;
    avatar.onerror = () => { avatar.src = PATH.AVATAR_FALLBACK; };

    const left = document.createElement("div");
    left.className = "miscritpicker__left";
    left.appendChild(avatar);

    const nm = document.createElement("div");
    nm.className = "miscritpicker__name";
    nm.textContent = m.name;
    left.appendChild(nm);

    btn.appendChild(left);

    btn.addEventListener("click", () => {
      SELECTED_THREAT = m.name;
      input.value = m.name;
      closeThreatDropdown();
      runQuickCheck();
    });

    dropdown.appendChild(btn);
  }
}

/* =========================================================
   TEAM HEALTH
========================================================= */

function computeHealthWarnings() {
  const filled = state.slots.filter(Boolean);
  if (filled.length < TEAM_SIZE) return ["Add 4 Miscrits to see warnings."];

  const avgSpd = Math.floor(filled.reduce((s, x) => s + toNum(x.totals?.SPD), 0) / TEAM_SIZE);
  const avgHp = Math.floor(filled.reduce((s, x) => s + toNum(x.totals?.HP), 0) / TEAM_SIZE);

  const primary = filled
    .map(s => (Array.isArray(s.elements) && s.elements.length ? normalize(s.elements[0]) : "none"))
    .filter(Boolean);

  const counts = new Map();
  for (const e of primary) counts.set(e, (counts.get(e) || 0) + 1);

  const maxSame = Math.max(...Array.from(counts.values()));
  const warnings = [];

  if (avgSpd < 120) warnings.push(`Low speed average (${avgSpd}). You may struggle vs fast teams.`);
  if (avgHp < 450) warnings.push(`Low HP average (${avgHp}). Team may be too fragile.`);
  if (maxSame >= 3) warnings.push(`3+ Miscrits share the same primary element. Consider more diversity.`);

  const high = filled.filter(s => ["S", "A"].includes(String(s.tier ?? "").toUpperCase())).length;
  if (high <= 1) warnings.push(`Only ${high} high-tier pick(s). You may rely on a single carry.`);

  const used = pointsUsed();
  if (used <= 10) warnings.push(`You are using only ${used}/12 pts. You may be leaving value on the table.`);

  return warnings.length ? warnings : ["Looks solid. Use Quick Check to test vs S/A threats."];
}

function renderHealth() {
  const box = $("#tbHealth");
  if (!box) return;

  const list = computeHealthWarnings();
  box.innerHTML = list.map(x => `• ${x}`).join("<br>");
}

/* =========================================================
   EXPORT / IMPORT / SHARE
========================================================= */

function exportTeam() {
  const payload = { v: 1, cap: POINT_CAP, slots: state.slots };
  $("#tbIO").value = JSON.stringify(payload, null, 2);
}

function importTeam() {
  const txt = ($("#tbIO").value || "").trim();
  if (!txt) return;

  let parsed = null;
  try { parsed = JSON.parse(txt); } catch { return; }

  const slots = Array.isArray(parsed?.slots) ? parsed.slots : null;
  if (!slots || slots.length !== TEAM_SIZE) return;

  state.slots = slots.map(s => (s?.name ? buildSlotFromName(s.name) : null));
  refreshAll();
}

function encodeShare() {
  const payload = { v: 1, slots: state.slots.map(s => (s?.name ? s.name : null)) };
  const raw = JSON.stringify(payload);
  const b64 = btoa(unescape(encodeURIComponent(raw)));
  location.hash = b64;
}

function decodeShare() {
  const h = (location.hash || "").replace(/^#/, "");
  if (!h) return false;

  try {
    const raw = decodeURIComponent(escape(atob(h)));
    const payload = JSON.parse(raw);

    const names = Array.isArray(payload?.slots) ? payload.slots : null;
    if (!names || names.length !== TEAM_SIZE) return false;

    state.slots = names.map(n => (n ? buildSlotFromName(n) : null));
    return true;
  } catch {
    return false;
  }
}

/* =========================================================
   REFRESH + EVENTS
========================================================= */

function refreshAll() {
  renderPointsBar();
  renderSlots();
  renderHealth();
  runQuickCheck();
  syncError(null);
}

function syncError(msg) {
  const box = $("#tbError");
  if (!box) return;
  if (!msg) { box.hidden = true; box.textContent = ""; return; }
  box.hidden = false;
  box.textContent = msg;
}

function bindUI() {
  $("#tbClearAll")?.addEventListener("click", () => {
    state.slots = Array.from({ length: TEAM_SIZE }, () => null);
    SELECTED_THREAT = null;

    const input = $("#tbThreatSearch");
    if (input) input.value = "";
    closeThreatDropdown();

    clearThreatAnalysis();
    refreshAll();
  });

  $("#tbPickerClose")?.addEventListener("click", closePicker);

  $("#tbPickerSearch")?.addEventListener("input", (e) => renderPickerGrid(e.target.value));
  $("#tbOnlyAffordable")?.addEventListener("change", () => renderPickerGrid($("#tbPickerSearch")?.value || ""));

  $("#tbAnalyzeThreats")?.addEventListener("click", analyzeThreats);
  $("#tbClearThreats")?.addEventListener("click", clearThreatAnalysis);
  $("#tbShowOnlyLoses")?.addEventListener("change", analyzeThreats);

  $("#tbMode")?.addEventListener("change", () => {
    runQuickCheck();
    analyzeThreats();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePicker();
  });

  $("#tbThreatSearch")?.addEventListener("focus", (e) => {
    renderThreatDropdown(e.target.value);
  });

  $("#tbThreatSearch")?.addEventListener("input", (e) => {
    SELECTED_THREAT = null;
    renderThreatDropdown(e.target.value);
  });

  $("#tbThreatSearch")?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeThreatDropdown();
      return;
    }

    if (e.key !== "Enter") return;
    e.preventDefault();

    const first = $("#tbThreatDropdown")?.querySelector(".miscritpicker__item");
    if (first) first.click();
  });

  document.addEventListener("click", (e) => {
    const input = $("#tbThreatSearch");
    const dd = $("#tbThreatDropdown");
    if (!input || !dd) return;

    const wrap = input.closest(".miscritpicker");
    if (wrap && !wrap.contains(e.target)) closeThreatDropdown();
  });

  $("#tbAtkSlot")?.addEventListener("change", runQuickCheck);

  $("#tbExportBtn")?.addEventListener("click", exportTeam);
  $("#tbImportBtn")?.addEventListener("click", importTeam);

  $("#tbCopyLinkBtn")?.addEventListener("click", async () => {
    encodeShare();
    try { await navigator.clipboard.writeText(location.href); } catch {}
  });

  $("#tbPickerModal")?.addEventListener("click", (e) => {
    if (e.target.id === "tbPickerModal") closePicker();
  });
}

/* =========================================================
   INIT
========================================================= */

async function init() {
  try {
    await loadAll();

    const loaded = decodeShare();
    if (!loaded) state.slots = Array.from({ length: TEAM_SIZE }, () => null);

    bindUI();
    refreshAll();
  } catch (e) {
    console.error(e);
    syncError(e?.message || "Error loading data. Check console and JSON paths.");
  }
}

init();
