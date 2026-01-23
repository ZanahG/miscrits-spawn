import { normalize, normalizeElements, toNum, clamp, pickBestMove } from "./damage_core.js";

/* =========================================================
   CONFIG
========================================================= */
const PVP_POINTS = { common: 1, rare: 2, epic: 3, exotic: 4, legendary: 5 };
const CAP = 12;

const AVATAR_FOLDER = "../assets/images/miscrits_avatar/";
const AVATAR_FALLBACK = `${AVATAR_FOLDER}preset_avatar.png`;

const STRONG = {
  water: ["fire"],
  fire: ["nature"],
  nature: ["water"],
  earth: ["lightning"],
  wind: ["earth"],
  lightning: ["wind"],
};

const ALL_ELEMS = ["water", "fire", "nature", "earth", "wind", "lightning"];
const PVP_LEVEL = 35;

// performance limits
const MAX_COUNTERS = 8;
const MAX_THREATS_FOR_SWAPS = 8;
const MAX_SWAP_SUGGESTIONS = 6;
const MAX_SWAP_POOL = 220; // candidatos a meter (cap para no matar el navegador)

// cache limits
const MAX_BESTHTK_CACHE = 50000;

/* =========================================================
   STATE
========================================================= */
let DB = [];
let TEAM = [null, null, null, null];

let BASE_BY_NAME = new Map(); // name -> base stats (lvl15)
const TOTALS_CACHE = new Map(); // name -> totals lvl35 | null
const BESTHTK_CACHE = new Map(); // "atk|def" -> result | null

let DB_WITH_MOVES = []; // prefiltrado (moves)
let DB_WITH_MOVES_AND_STATS = []; // moves + stats calc

let LAST_THREATS = []; // hard counters list
let LAST_SWAP_RECS = []; // swaps list

const $ = (sel) => document.querySelector(sel);

/* =========================================================
   SMALL UTILS
========================================================= */
function cacheSet(map, key, val, max = MAX_BESTHTK_CACHE) {
  // simple safety: avoid unbounded growth
  if (map.size > max) map.clear();
  map.set(key, val);
}

/* =========================================================
   GLOBAL DROPDOWN CLOSE
========================================================= */
function closeAllDropdowns() {
  document.querySelectorAll("#tbSlots .tb__dd").forEach((dd) => (dd.hidden = true));
}

function closeAllDropdownsExcept(ddToKeep) {
  document.querySelectorAll("#tbSlots .tb__dd").forEach((dd) => {
    if (dd !== ddToKeep) dd.hidden = true;
  });
}

document.addEventListener("click", (e) => {
  const insidePicker = e.target.closest("#tbSlots .miscritpicker");
  if (!insidePicker) closeAllDropdowns();
});

/* =========================================================
   AVATAR UTILS
========================================================= */
function avatarSrcFromName(name) {
  if (!name) return AVATAR_FALLBACK;
  const file =
    name
      .toString()
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^\w_]/g, "") + "_avatar.png";
  return `${AVATAR_FOLDER}${file}`;
}

function setSlotAvatar(slotIndex, miscrit) {
  const input = document.querySelector(`.tb__input[data-slot="${slotIndex}"]`);
  const picker = input?.closest(".tb__picker");
  if (!picker) return;

  const wrap = picker.querySelector(".tb__picked");
  const img = picker.querySelector(".tb__pickedImg");
  if (!wrap || !img) return;

  if (!miscrit) {
    wrap.hidden = true;
    img.src = "";
    img.alt = "";
    return;
  }

  wrap.hidden = false;
  img.src = avatarSrcFromName(miscrit.name);
  img.alt = miscrit.name || "";
  img.onerror = () => {
    img.onerror = null;
    img.src = AVATAR_FALLBACK;
  };
}

/* =========================================================
   BASE STATS -> TOTALS (lvl 35 all green)
========================================================= */
function statAtLevel(baseStat15, level, isHp) {
  const C = 3; // all green
  const L = clamp(level, 1, 35);

  if (isHp) {
    const perLevel = (12 + 2 * toNum(baseStat15) + 1.5 * C) / 5;
    return Math.floor(perLevel * L + 10);
  } else {
    const perLevel = (3 + 2 * toNum(baseStat15) + 1.5 * C) / 6;
    return Math.floor(perLevel * L + 5);
  }
}

function getBase15ForName(name) {
  const raw = BASE_BY_NAME.get(normalize(name));
  if (!raw) return null;

  const hp = raw.hp ?? raw.HP ?? raw.Hp ?? raw.health ?? null;
  const spd = raw.spd ?? raw.SPD ?? raw.speed ?? null;
  const ea = raw.ea ?? raw.EA ?? raw.elemAtk ?? raw.elementalAttack ?? null;
  const pa = raw.pa ?? raw.PA ?? raw.physAtk ?? raw.physicalAttack ?? null;
  const ed = raw.ed ?? raw.ED ?? raw.elemDef ?? raw.elementalDefense ?? null;
  const pd = raw.pd ?? raw.PD ?? raw.physDef ?? raw.physicalDefense ?? null;

  if (hp == null || spd == null || ea == null || pa == null || ed == null || pd == null) return null;

  return { hp: toNum(hp), spd: toNum(spd), ea: toNum(ea), pa: toNum(pa), ed: toNum(ed), pd: toNum(pd) };
}

function totalsAtPvpLevel(name, fallbackStats) {
  const key = normalize(name);
  if (TOTALS_CACHE.has(key)) return TOTALS_CACHE.get(key);

  const b15 = getBase15ForName(name);
  if (b15) {
    const totals = {
      HP: statAtLevel(b15.hp, PVP_LEVEL, true),
      SPD: statAtLevel(b15.spd, PVP_LEVEL, false),
      EA: statAtLevel(b15.ea, PVP_LEVEL, false),
      PA: statAtLevel(b15.pa, PVP_LEVEL, false),
      ED: statAtLevel(b15.ed, PVP_LEVEL, false),
      PD: statAtLevel(b15.pd, PVP_LEVEL, false),
    };
    TOTALS_CACHE.set(key, totals);
    return totals;
  }

  if (fallbackStats) {
    const totals = { ...fallbackStats };
    TOTALS_CACHE.set(key, totals);
    return totals;
  }

  TOTALS_CACHE.set(key, null);
  return null;
}

/* =========================================================
   TEAM ANALYSIS (coverage/weakness)
========================================================= */
function computeCoverage(team) {
  const cov = Object.fromEntries(ALL_ELEMS.map((e) => [e, 0]));
  for (const m of team) {
    if (!m) continue;
    const elems = normalizeElements(m.elements);
    for (const atkElem of elems) {
      const beats = STRONG[atkElem] || [];
      for (const defElem of beats) cov[defElem] += 1;
    }
  }
  return cov;
}

function computeWeaknesses(team) {
  // qué elementos te pegan fuerte
  const wk = Object.fromEntries(ALL_ELEMS.map((e) => [e, 0]));
  for (const m of team) {
    if (!m) continue;
    const elems = normalizeElements(m.elements);
    for (const myElem of elems) {
      for (const attacker of ALL_ELEMS) {
        if ((STRONG[attacker] || []).includes(myElem)) wk[attacker] += 1;
      }
    }
  }
  return wk;
}

/* =========================================================
   DB LOAD
========================================================= */
async function loadDB() {
  const [dbRes, metaRes, baseStatsRes] = await Promise.all([
    fetch("../assets/data/miscritsdb.json", { cache: "no-store" }),
    fetch("../miscrits.json", { cache: "no-store" }),
    fetch("../assets/data/base_stats.json", { cache: "no-store" }),
  ]);

  if (!dbRes.ok) throw new Error("No pude cargar miscritsdb.json");
  if (!metaRes.ok) throw new Error("No pude cargar miscrits.json");
  if (!baseStatsRes.ok) throw new Error("No pude cargar base_stats.json");

  const db = await dbRes.json();
  const metaJson = await metaRes.json();
  const meta = metaJson?.miscrits ?? [];

  const baseStatsJson = await baseStatsRes.json();
  const baseArr = Array.isArray(baseStatsJson) ? baseStatsJson : baseStatsJson?.miscrits ?? [];

  BASE_BY_NAME = new Map(
    baseArr
      .filter((x) => x?.name && (x?.baseStats || x?.stats || x?.base || x?.base_stats))
      .map((x) => {
        const bs = x.baseStats ?? x.stats ?? x.base ?? x.base_stats;
        return [normalize(x.name), bs];
      })
  );

  const metaByName = new Map(meta.filter((x) => x?.name).map((x) => [normalize(x.name), x]));

  DB = db.map((m) => {
    const mm = metaByName.get(normalize(m.name)) || {};
    return {
      ...m,
      rarity: mm.rarity ?? m.rarity ?? "Unknown",
      avatar: mm.avatar ?? m.avatar ?? null,
      elements: Array.isArray(m.elements) ? m.elements : mm.elements ?? [],
      stats: m.stats ?? mm.stats ?? null,
      attacks: m.attacks ?? mm.attacks ?? [],
      enhancedAttacks: m.enhancedAttacks ?? mm.enhancedAttacks ?? [],
    };
  });

  // agrega los que estén en meta pero no en db
  for (const mm of meta) {
    const key = normalize(mm?.name);
    if (!key) continue;
    const exists = DB.some((x) => normalize(x.name) === key);
    if (!exists) {
      DB.push({
        name: mm.name,
        rarity: mm.rarity ?? "Unknown",
        avatar: mm.avatar ?? null,
        elements: mm.elements ?? [],
        stats: mm.stats ?? null,
        attacks: mm.attacks ?? [],
        enhancedAttacks: mm.enhancedAttacks ?? [],
      });
    }
  }

  DB.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" }));

  // pre-filtros (bajan muchísimo el costo)
  DB_WITH_MOVES = DB.filter((m) => m?.attacks?.length || m?.enhancedAttacks?.length);
  DB_WITH_MOVES_AND_STATS = DB_WITH_MOVES.filter((m) => !!totalsAtPvpLevel(m.name, m.stats));

  // debug liviano (sin recalcular para todo DB)
  console.log("[TB] DB total:", DB.length);
  console.log("[TB] With moves:", DB_WITH_MOVES.length);
  console.log("[TB] With base stats records:", baseArr.length);
  console.log("[TB] With both (moves+stats):", DB_WITH_MOVES_AND_STATS.length);
}

/* =========================================================
   POINTS
========================================================= */
function rarityPoints(m) {
  const r = normalize(m?.rarity);
  return PVP_POINTS[r] ?? 0;
}

function teamPoints() {
  return TEAM.reduce((s, m) => s + rarityPoints(m), 0);
}

function renderPoints() {
  const used = teamPoints();
  const el = $("#tbPoints");
  if (!el) return;
  el.textContent = `${used} / ${CAP}`;
  el.classList.toggle("is-over", used > CAP);
}

/* =========================================================
   DROPDOWN RENDER
========================================================= */
function renderSlots() {
  const host = $("#tbSlots");
  const tpl = $("#tplTbSlot");
  if (!host || !tpl) return;

  host.replaceChildren();

  for (let i = 0; i < 4; i++) {
    const frag = tpl.content.cloneNode(true);

    const head = frag.querySelector(".tb__slotHead");
    const input = frag.querySelector(".tb__input");
    const dd = frag.querySelector(".tb__dd");

    head.textContent = `Slot ${i + 1}`;
    input.value = TEAM[i]?.name ?? "";
    input.dataset.slot = String(i);

    const open = () => {
      closeAllDropdownsExcept(dd);
      renderDD(i, input.value, dd);

      // si escribe a mano y es match exact, actualiza avatar
      const exact = findExactMiscrit(input.value);
      setSlotAvatar(i, exact || TEAM[i]);
    };

    input.addEventListener("focus", open);
    input.addEventListener("input", open);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        dd.hidden = true;
        return;
      }

      if (e.key === "Enter") {
        const exact = findExactMiscrit(input.value);
        if (exact) {
          e.preventDefault();
          selectSlot(i, exact, input, dd);
          closeAllDropdowns();
          return;
        }

        const first = dd.querySelector(".miscritpicker__item");
        if (first) {
          e.preventDefault();
          first.click();
        }
      }
    });

    // cuando pierde foco: si hay match exact => selecciona SOLO si cambió
    input.addEventListener("blur", () => {
      // pequeño delay para permitir click en dropdown
      setTimeout(() => {
        const exact = findExactMiscrit(input.value);
        if (!exact) return;

        const curKey = normalize(TEAM[i]?.name);
        const nextKey = normalize(exact.name);
        if (curKey !== nextKey) selectSlot(i, exact, input, dd);
      }, 120);
    });

    host.appendChild(frag);
    setSlotAvatar(i, TEAM[i]);
  }
}

function renderDD(slotIndex, query, dd) {
  if (!dd) return;

  const tplItem = $("#tplTbDdItem");
  if (!tplItem) return;

  const q = normalize(query);
  const matches = DB.filter((m) => !q || normalize(m.name).includes(q)).slice(0, 60);

  dd.replaceChildren();

  if (!matches.length) {
    dd.hidden = true;
    return;
  }

  dd.hidden = false;

  matches.forEach((m) => {
    const node = tplItem.content.cloneNode(true);
    const btn = node.querySelector(".miscritpicker__item");

    const img = node.querySelector(".miscritpicker__avatar");
    const nameEl = node.querySelector(".miscritpicker__name");
    const metaEl = node.querySelector(".tb__ddMeta");

    img.src = avatarSrcFromName(m.name);
    img.alt = "";
    img.onerror = () => {
      img.onerror = null;
      img.src = AVATAR_FALLBACK;
    };

    nameEl.textContent = m.name;
    if (metaEl) metaEl.textContent = m.rarity ? `(${m.rarity})` : "";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const input = document.querySelector(`.tb__input[data-slot="${slotIndex}"]`);
      selectSlot(slotIndex, m, input, dd);
      closeAllDropdowns();
    });

    dd.appendChild(node);
  });
}

function findExactMiscrit(name) {
  const v = normalize(name);
  if (!v) return null;
  return DB.find((m) => normalize(m.name) === v) ?? null;
}

/* =========================================================
   SELECTION + RECALC (ONLY WHEN TEAM CHANGES)
========================================================= */
function selectSlot(i, m, inputEl, dd) {
  const prevKey = normalize(TEAM[i]?.name);
  const nextKey = normalize(m?.name);

  TEAM[i] = m;
  if (inputEl) inputEl.value = m.name;
  if (dd) dd.hidden = true;

  setSlotAvatar(i, m);

  renderPoints();
  renderAnalysis();

  // recalcula solo si cambió realmente
  if (prevKey !== nextKey) {
    recomputeCountersAndSwaps();
  }
}

/* =========================================================
   DAMAGE-BASED COUNTERS (CACHED)
========================================================= */
function hasMoves(m) {
  return !!(m?.attacks?.length || m?.enhancedAttacks?.length);
}

function cacheKeyPair(atkName, defName) {
  return `${normalize(atkName)}|${normalize(defName)}`;
}

function bestHTK(attacker, defender) {
  if (!attacker?.name || !defender?.name) return null;

  const key = cacheKeyPair(attacker.name, defender.name);
  if (BESTHTK_CACHE.has(key)) return BESTHTK_CACHE.get(key);

  const atkTotals = totalsAtPvpLevel(attacker.name, attacker.stats);
  const defTotals = totalsAtPvpLevel(defender.name, defender.stats);

  if (!atkTotals || !defTotals || !hasMoves(attacker)) {
    cacheSet(BESTHTK_CACHE, key, null);
    return null;
  }

  const best = pickBestMove(attacker, atkTotals, defender, defTotals, "auto");
  if (!best?.dmg || !best?.move) {
    cacheSet(BESTHTK_CACHE, key, null);
    return null;
  }

  const res = {
    htk: best.dmg.htk,
    avg: best.dmg.avg,
    moveName: best.move.name ?? "—",
    moveElem: normalize(best.move.element || "physical"),
    mul: best.dmg.multiplier,
    label: best.dmg.label,
  };

  cacheSet(BESTHTK_CACHE, key, res);
  return res;
}

function computeHardCounters(team, limit = MAX_COUNTERS) {
  const chosen = team.filter(Boolean);
  if (!chosen.length) return [];

  // enemigos: solo evaluables (moves + stats)
  const enemies = DB_WITH_MOVES_AND_STATS;

  const out = [];

  for (const e of enemies) {
    // enemy -> team: el mejor (menor HTK) contra cualquiera del team
    let bestVs = null;
    for (const t of chosen) {
      const res = bestHTK(e, t);
      if (!res) continue;
      if (!bestVs || res.htk < bestVs.htk) bestVs = { ...res, target: t };
    }
    if (!bestVs) continue;

    out.push({ enemy: e, vs: bestVs });
  }

  out.sort((a, b) => {
    const d = toNum(a.vs.htk) - toNum(b.vs.htk); // HTK más bajo primero
    if (d !== 0) return d;
    return toNum(b.vs.avg) - toNum(a.vs.avg); // avg más alto
  });

  return out.slice(0, limit);
}

/* =========================================================
   SWAPS (LIMITED + CACHED bestHTK)
========================================================= */
function teamThreatIndex(team, threatsList) {
  const chosen = team.filter(Boolean);
  if (!chosen.length || !threatsList.length) return -Infinity;

  // mientras más grande, mejor (enemy tarda más / tú lo matas antes)
  let score = 0;

  for (const th of threatsList) {
    const e = th.enemy;

    const enemyKills = toNum(th.vs?.htk);
    if (!Number.isFinite(enemyKills)) continue;

    let teamKills = Infinity;
    for (const t of chosen) {
      const res = bestHTK(t, e);
      if (!res) continue;
      if (res.htk < teamKills) teamKills = res.htk;
    }
    if (!Number.isFinite(teamKills)) continue;

    score += teamKills - enemyKills;
  }

  return score;
}

function buildSwapPool(chosen) {
  const used = new Set(chosen.map((m) => normalize(m.name)));

  // prioriza por rarity points desc (para meter legends primero) y luego nombre
  const sorted = DB_WITH_MOVES_AND_STATS
    .filter((m) => m?.name && !used.has(normalize(m.name)))
    .slice()
    .sort((a, b) => {
      const d = rarityPoints(b) - rarityPoints(a);
      if (d !== 0) return d;
      return (a.name ?? "").localeCompare(b.name ?? "", "en", { sensitivity: "base" });
    });

  return sorted.slice(0, MAX_SWAP_POOL);
}

function suggestSwaps(team, threats, maxSuggestions = MAX_SWAP_SUGGESTIONS) {
  const chosen = team.filter(Boolean);
  if (!chosen.length || !threats.length) return [];

  const baseIndex = teamThreatIndex(team, threats);
  if (!Number.isFinite(baseIndex)) return [];

  const pool = buildSwapPool(chosen);

  const recs = [];

  for (let slot = 0; slot < 4; slot++) {
    const outM = team[slot];
    if (!outM) continue;

    for (const cand of pool) {
      const next = team.slice();
      next[slot] = cand;

      const pts = next.reduce((s, m) => s + rarityPoints(m), 0);
      if (pts > CAP) continue;

      const idx = teamThreatIndex(next, threats);
      const delta = idx - baseIndex;

      if (delta > 0) {
        recs.push({ slot, out: outM, in: cand, delta });
      }
    }
  }

  recs.sort((a, b) => b.delta - a.delta);
  return recs.slice(0, maxSuggestions);
}

/* =========================================================
   RENDER: THREATS + COVERAGE
========================================================= */
function renderAnalysis() {
  const threatsEl = $("#tbThreats");
  const coverageEl = $("#tbCoverage");

  const cov = computeCoverage(TEAM);
  const wk = computeWeaknesses(TEAM);

  // Biggest threats (elemental)
  if (threatsEl) {
    threatsEl.replaceChildren();

    const threats = ALL_ELEMS
      .map((e) => ({ e, cov: cov[e] || 0, wk: wk[e] || 0 }))
      .filter((x) => x.cov === 0 && x.wk > 0)
      .sort((a, b) => b.wk - a.wk)
      .slice(0, 3);

    if (!threats.length) {
      const mutedTpl = $("#tplMuted");
      if (mutedTpl) threatsEl.appendChild(mutedTpl.content.cloneNode(true));
    } else {
      const tpl = $("#tplThreat");
      threats.forEach((t) => {
        const node = tpl.content.cloneNode(true);
        node.querySelector("img").src = `../assets/images/type/${t.e}.png`;
        node.querySelector("img").alt = t.e;
        node.querySelector("span").textContent = t.e;
        node.querySelector("b").textContent = String(t.wk);
        threatsEl.appendChild(node);
      });
    }
  }

  // Coverage cards
  if (coverageEl) {
    coverageEl.replaceChildren();
    const tplCard = $("#tplElemCard");
    if (!tplCard) return;

    ALL_ELEMS.forEach((elem) => {
      const node = tplCard.content.cloneNode(true);
      const card = node.querySelector(".tb__elemCard");

      const c = cov[elem] || 0;
      const w = wk[elem] || 0;

      const state =
        c >= 1 && w === 0 ? "good" :
        c >= 1 && w >= 1 ? "ok" :
        c === 0 && w === 0 ? "ok" : "bad";

      card.classList.add(`tb__elemCard--${state}`);

      node.querySelector(".tb__elemIcon").src = `../assets/images/type/${elem}.png`;
      node.querySelector(".tb__elemIcon").alt = elem;
      node.querySelector(".tb__elemName").textContent = elem;
      node.querySelector(".covVal").textContent = String(c);
      node.querySelector(".wkVal").textContent = String(w);

      coverageEl.appendChild(node);
    });
  }
}

/* =========================================================
   RENDER: COUNTERS / SWAPS (NO innerHTML)
========================================================= */
function renderCounters(list) {
  const host = $("#tbCounters");
  const tpl = $("#tplCounter");
  const mutedTpl = $("#tplMuted");
  if (!host || !tpl) return;

  host.replaceChildren();

  if (!list?.length) {
    if (mutedTpl) host.appendChild(mutedTpl.content.cloneNode(true));
    return;
  }

  for (const it of list) {
    const node = tpl.content.cloneNode(true);

    const avatar = node.querySelector(".tb__counterAvatar");
    const nameEl = node.querySelector(".tb__counterName");
    const htkEl = node.querySelector(".tb__counterHTK");
    const vsEl = node.querySelector(".tb__counterVs");
    const moveIcon = node.querySelector(".tb__counterMoveIcon");
    const moveName = node.querySelector(".tb__counterMoveName");
    const mulEl = node.querySelector(".tb__counterMul");
    const avgEl = node.querySelector(".tb__counterAvg");

    const enemy = it.enemy;
    const vs = it.vs;

    avatar.src = avatarSrcFromName(enemy?.name);
    avatar.alt = enemy?.name ?? "";
    avatar.onerror = () => {
      avatar.onerror = null;
      avatar.src = AVATAR_FALLBACK;
    };

    nameEl.textContent = enemy?.name ?? "—";
    htkEl.textContent = `HTK: ${vs?.htk ?? "—"}`;

    const targetName = vs?.target?.name ?? "—";
    vsEl.textContent = `vs ${targetName}`;

    const elem = vs?.moveElem || "physical";
    moveIcon.src = `../assets/images/type/${elem}.png`;
    moveIcon.alt = elem;

    moveName.textContent = vs?.moveName ?? "—";

    const mul = vs?.mul;
    mulEl.textContent = Number.isFinite(mul) ? `x${mul}` : "";

    const avg = vs?.avg;
    avgEl.textContent = Number.isFinite(avg) ? `AVG: ${avg}` : "";

    host.appendChild(node);
  }
}

function renderSwaps(list) {
  const host = $("#tbSwaps");
  const tpl = $("#tplSwap");
  const mutedTpl = $("#tplMuted");
  if (!host || !tpl) return;

  host.replaceChildren();

  if (!list?.length) {
    if (mutedTpl) host.appendChild(mutedTpl.content.cloneNode(true));
    return;
  }

  for (const it of list) {
    const node = tpl.content.cloneNode(true);

    node.querySelector(".tb__swapSlot").textContent = `Slot ${toNum(it.slot) + 1}`;

    const outAv = node.querySelector(".tb__swapAvatarOut");
    const inAv = node.querySelector(".tb__swapAvatarIn");
    const outName = node.querySelector(".tb__swapNameOut");
    const inName = node.querySelector(".tb__swapNameIn");
    const deltaEl = node.querySelector(".tb__swapDelta");

    outAv.src = avatarSrcFromName(it.out?.name);
    outAv.alt = it.out?.name ?? "";
    outAv.onerror = () => {
      outAv.onerror = null;
      outAv.src = AVATAR_FALLBACK;
    };

    inAv.src = avatarSrcFromName(it.in?.name);
    inAv.alt = it.in?.name ?? "";
    inAv.onerror = () => {
      inAv.onerror = null;
      inAv.src = AVATAR_FALLBACK;
    };

    outName.textContent = it.out?.name ?? "—";
    inName.textContent = it.in?.name ?? "—";

    deltaEl.textContent = `Improvement: +${Math.round(toNum(it.delta) * 100) / 100}`;

    host.appendChild(node);
  }
}

/* =========================================================
   RECALC COUNTERS + SWAPS (ONLY ON TEAM CHANGE)
========================================================= */
function recomputeCountersAndSwaps() {
  const chosen = TEAM.filter(Boolean);
  if (!chosen.length) {
    LAST_THREATS = [];
    LAST_SWAP_RECS = [];
    renderCounters(LAST_THREATS);
    renderSwaps(LAST_SWAP_RECS);
    return;
  }

  // 1) hard counters
  LAST_THREATS = computeHardCounters(TEAM, MAX_COUNTERS);
  renderCounters(LAST_THREATS);

  // 2) swaps: usa subset de amenazas (para costo)
  const threatsForSwaps = LAST_THREATS.slice(0, MAX_THREATS_FOR_SWAPS);
  LAST_SWAP_RECS = suggestSwaps(TEAM, threatsForSwaps, MAX_SWAP_SUGGESTIONS);
  renderSwaps(LAST_SWAP_RECS);

  // debug top
  if (LAST_THREATS.length) {
    const top = LAST_THREATS[0];
    console.log("[TB] Top counter:", {
      enemy: top.enemy?.name,
      target: top.vs?.target?.name,
      htk: top.vs?.htk,
      avg: top.vs?.avg,
      move: top.vs?.moveName,
      elem: top.vs?.moveElem,
      mul: top.vs?.mul,
    });
  }
}

/* =========================================================
   INIT
========================================================= */
async function init() {
  await loadDB();

  renderSlots();
  renderPoints();
  renderAnalysis();

  // render inicial vacío
  renderCounters([]);
  renderSwaps([]);
}

init().catch((e) => {
  console.error(e);
});
