const $ = (sel) => document.querySelector(sel);

let DB = [];
let RELICS = [];
let RELIC_BY_NAME = new Map();
let ATK_BASE = null;
let DEF_BASE = null;
let MISCRITS_META = [];           
let AVATAR_BY_NAME = new Map();



let atkId = null;
let defId = null;
let atkAttackIndex = 0;
let atkUseEnhanced = false;

function getAtkMoves(atk) {
  if (!atk) return [];
  if (atkUseEnhanced && Array.isArray(atk.enhancedAttacks) && atk.enhancedAttacks.length) {
    return atk.enhancedAttacks;
  }
  return atk.attacks ?? [];
}


const SLOT_LEVELS = [10, 20, 30, 35];

const STRONG = {
  water: ["fire"],
  fire: ["nature"],
  nature: ["water"],
  earth: ["air"],
  air: ["earth"],
  electric: ["water"],
  magic: ["mind"],
  mind: ["magic"],
  physical: ["undead"],
  undead: ["physical"]
};
const WEAK = {
  water: ["electric", "nature"],
  fire: ["water", "earth"],
  nature: ["fire", "air"],
  earth: ["fire", "water"],
  air: ["nature", "electric"],
  electric: ["earth"],
  magic: ["undead"],
  mind: ["undead"],
  physical: ["mind"],
  undead: ["magic"]
};

function normalize(str) {
  return (str ?? "").toString().trim().toLowerCase();
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getMiscritPrimaryElement(m) {
  const el = Array.isArray(m?.elements) ? m.elements[0] : "";
  return normalize(el);
}

function miscritElementIconSrc(m) {
  const el = getMiscritPrimaryElement(m) || "physical";
  return `../assets/images/type/${el}.png`;
}

function renderMiscritDropdown(side, query) {
  const dd = side === "atk" ? $("#atkMiscritDropdown") : $("#defMiscritDropdown");
  if (!dd) return;

  const q = normalize(query);
  const matches = DB
    .filter(m => !q || normalize(m.name).includes(q))
    .slice(0, 50);

  if (!matches.length) {
    dd.hidden = true;
    dd.innerHTML = "";
    return;
  }

  dd.hidden = false;
  dd.innerHTML = matches.map(m => {
    const el = getMiscritPrimaryElement(m);
    const icon = miscritElementIconSrc(m);

    return `
      <button type="button" class="miscritpicker__item" data-name="${m.name}">
        <div class="miscritpicker__left">
          <img class="miscritpicker__elem" src="${icon}" alt="${el}">
          <div class="miscritpicker__name">${m.name}</div>
        </div>
      </button>
    `;
  }).join("");

  dd.querySelectorAll(".miscritpicker__item").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-name");
      const input = side === "atk" ? $("#atkMiscritSearch") : $("#defMiscritSearch");
      if (input) input.value = name;

      applyMiscritSelection(side, name);
      dd.hidden = true;
    });
  });
}

function bindMiscritPicker(side) {
  const input = side === "atk" ? $("#atkMiscritSearch") : $("#defMiscritSearch");
  const dd = side === "atk" ? $("#atkMiscritDropdown") : $("#defMiscritDropdown");
  if (!input || !dd) return;

  const close = () => { dd.hidden = true; };
  const open = () => renderMiscritDropdown(side, input.value);

  input.addEventListener("focus", open);
  input.addEventListener("input", open);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();

    if (e.key === "Enter") {
      e.preventDefault();
      const v = normalize(input.value);
      const exact = DB.find(m => normalize(m.name) === v);
      if (exact) {
        applyMiscritSelection(side, exact.name);
        close();
        return;
      }
      const firstBtn = dd.querySelector(".miscritpicker__item");
      if (firstBtn) {
        firstBtn.click();
      }
    }
  });

  document.addEventListener("click", (e) => {
    const host = input.closest(".miscritpicker");
    if (!host) return;
    if (!host.contains(e.target)) close();
  });
}


function elementMultiplier(atkElem, defElems) {
  const a = normalize(atkElem);
  const defs = (defElems ?? []).map(normalize);

  let mul = 1;

  for (const d of defs) {
    if (STRONG[a]?.includes(d)) mul *= 2.0;
    if (WEAK[a]?.includes(d)) mul *= 0.5;
  }
  return mul;
}

function setStatsInputsObj(prefix, stats) {
  if (!stats) return;
  $(`#${prefix}HP`).value  = toNum(stats.HP);
  $(`#${prefix}SPD`).value = toNum(stats.SPD);
  $(`#${prefix}EA`).value  = toNum(stats.EA);
  $(`#${prefix}PA`).value  = toNum(stats.PA);
  $(`#${prefix}ED`).value  = toNum(stats.ED);
  $(`#${prefix}PD`).value  = toNum(stats.PD);
}

function calcSideWithRelics(side) {
  const base = side === "atk" ? ATK_BASE : DEF_BASE;
  if (!base) return null;

  const picks = getRelicSelectionsDetailed(side === "atk" ? ".atkRelic" : ".defRelic");

  return applyRelicStatsBySlot(
    { HP: base.HP, SPD: base.SPD, PA: base.PA, EA: base.EA, PD: base.PD, ED: base.ED },
    picks
  );
}

function refreshSideStatsFromRelics(side) {
  const total = calcSideWithRelics(side);
  if (!total) return;
  setStatsInputsObj(side, total);
}


function computePerHit(ap, atkStat, defStat, elemMul) {
  const a = toNum(ap);
  const atk = Math.max(1, toNum(atkStat));
  const def = Math.max(1, toNum(defStat));
  const m = toNum(elemMul);
  const base = (a * (atk / def)) * m;
  const min = Math.floor(base * 0.90);
  const max = Math.floor(base * 1.10);

  return { min, max, base };
}


function isElementalAttack(elem) {
  const e = normalize(elem);
  return ["water","fire","nature","earth","air","electric","magic","mind","undead"].includes(e);
}

function pickAtkDefStats(mode, atkMis, defMis, attackElem, inputs) {
  if (mode === "physical") {
    return { atk: inputs.atkPA, def: inputs.defPD, label: "PA vs PD" };
  }
  if (mode === "elemental") {
    return { atk: inputs.atkEA, def: inputs.defED, label: "EA vs ED" };
  }

  const elemental = isElementalAttack(attackElem);
  if (elemental) return { atk: inputs.atkEA, def: inputs.defED, label: "EA vs ED" };
  return { atk: inputs.atkPA, def: inputs.defPD, label: "PA vs PD" };
}

function slugFileName(name) {
  return (name ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\w_]/g, "") + ".png";
}

const RELIC_PLACEHOLDER = "../assets/images/relics/molten_coin.png";

function relicIconSrc(r) {
  const fallback = RELIC_PLACEHOLDER;
  if (!r) return fallback;

  if (r.icon) return `../assets/images/relics/${r.icon}`;
  return `../assets/images/relics/${slugFileName(r.name)}`;
}

function relicBonusText(r) {
  const s = r?.stats || {};
  const parts = [];

  if (toNum(s.HP))  parts.push(`+${toNum(s.HP)} HP`);
  if (toNum(s.SPD)) parts.push(`+${toNum(s.SPD)} SPD`);
  if (toNum(s.PA))  parts.push(`+${toNum(s.PA)} PA`);
  if (toNum(s.EA))  parts.push(`+${toNum(s.EA)} EA`);
  if (toNum(s.PD))  parts.push(`+${toNum(s.PD)} PD`);
  if (toNum(s.ED))  parts.push(`+${toNum(s.ED)} ED`);

  return parts.join(" • ");
}

function getInputsRaw() {
  return {
    atkPA: toNum($("#atkPA")?.value),
    atkEA: toNum($("#atkEA")?.value),
    atkSPD: toNum($("#atkSPD")?.value),
    atkPD: toNum($("#atkPD")?.value),
    atkED: toNum($("#atkED")?.value),
    atkHP: toNum($("#atkHP")?.value),

    defPA: toNum($("#defPA")?.value),
    defEA: toNum($("#defEA")?.value),
    defSPD: toNum($("#defSPD")?.value),
    defPD: toNum($("#defPD")?.value),
    defED: toNum($("#defED")?.value),
    defHP: toNum($("#defHP")?.value),
  };
}

function findById(idOrName) {
  if (idOrName == null) return null;
  const key = String(idOrName).trim();
  const byId = DB.find(m => m.id != null && String(m.id) === key);
  if (byId) return byId;
  const nk = normalize(key);
  return DB.find(m => normalize(m.name) === nk) ?? null;
}


function fillMiscritDatalist() {
  const dl = $("#miscritsList");
  if (!dl) return;

  const names = DB
    .map(m => (m.name ?? "").toString().trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "es"));

  dl.innerHTML = names.map(n => `<option value="${n}"></option>`).join("");
}


function populateRelicSelects() {
  const allSelects = document.querySelectorAll(".atkRelic, .defRelic");
  if (!allSelects.length) return;

  const sorted = RELICS.slice().sort((a, b) => (a.name ?? "").localeCompare((b.name ?? ""), "es"));

  const html = [
    `<option value=""></option>`,
    ...sorted.map(r => `<option value="${r.name}">${r.name}</option>`)
  ].join("");

  allSelects.forEach(sel => {
    sel.innerHTML = html;
  });
}

function applyMiscritSelection(side, idOrName) {
  const m = findById(idOrName);
  if (!m?.stats) return;

  if (side === "atk") {
    atkId = m.name;
    $("#atkMiscrit") && ($("#atkMiscrit").value = atkId);

    ATK_BASE = { ...m.stats };
    refreshSideStatsFromRelics("atk");

    setMeta(atkId, $("#atkMeta"));
    fillAttackSelect();
    syncMoveListPicker();
    renderSelectedMoveButton();
    setAvatarFromMiscrit("atk", m);

    renderResult();
    return;
  }

  if (side === "def") {
    defId = m.name;
    $("#defMiscrit") && ($("#defMiscrit").value = defId);

    DEF_BASE = { ...m.stats };
    refreshSideStatsFromRelics("def");

    setMeta(defId, $("#defMeta"));
    setAvatarFromMiscrit("def", m);

    renderResult();
    return;
  }
}

function syncMoveListPicker() {
  const atk = findById(atkId);
  const picker = $("#atkAttackPicker");
  const sel = $("#atkAttack");
  const grid = $("#moveListGrid");
  if (!picker || !sel) return;

  const attacks = getAtkMoves(atk);

  const ordered = attacks
    .map((a, idx) => ({ a, idx }))
    .sort((x, y) => toNum(y.a?.ap) - toNum(x.a?.ap));


  picker.innerHTML = ordered.map(({ a, idx }) =>
    `<option value="${idx}">${a.name} • AP ${toNum(a.ap)}</option>`
  ).join("");

  picker.value = sel.value || "0";


  if (!grid) return;
  grid.innerHTML = "";

  const bg = atkUseEnhanced
    ? "../assets/images/ui/enchanted_attack.png"
    : "../assets/images/ui/unchanted_attack.png";

  ordered.forEach(({ a, idx }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "move-card" +
      (atkUseEnhanced ? " is-enhanced" : "") +
      (String(idx) === String(sel.value) ? " is-selected" : "");

    const icon = normalize(a.element || "physical");
    const iconSrc = `../assets/images/type/${icon}.png`;

    btn.innerHTML = `
      <div class="move-card__bg" style="background-image:url('${bg}')"></div>
      <img class="move-card__icon" src="${iconSrc}" alt="">
      <div class="move-card__name">${a.name ?? ""}</div>
      <div class="move-card__ap">${toNum(a.ap)}</div>
    `;

    btn.addEventListener("click", () => {
      atkAttackIndex = idx;
      sel.value = String(idx);
      picker.value = String(idx);
      syncMoveListPicker();
      renderSelectedMoveButton();
      renderResult();
    });

    grid.appendChild(btn);
  });

  renderSelectedMoveButton();
}

function renderSelectedMoveButton() {
  const btn = $("#openMoveList");
  if (!btn) return;

  const atk = findById(atkId);
  const moves = getAtkMoves(atk);
  const a = moves[atkAttackIndex];

  if (!a) {
    btn.classList.remove("move-btn");
    btn.innerHTML = "Move list";
    return;
  }

  const bg = atkUseEnhanced
    ? "../assets/images/ui/enchanted_attack.png"
    : "../assets/images/ui/unchanted_attack.png";

  const icon = normalize(a.element || "physical");
  const iconSrc = `../assets/images/type/${icon}.png`;

  btn.classList.add("move-btn");
  btn.innerHTML = `
    <span class="move-btn__bg" style="background-image:url('${bg}')"></span>
    <img class="move-btn__icon" src="${iconSrc}" alt="">
    <span class="move-btn__name">${a.name ?? ""}</span>
    <span class="move-btn__ap">${toNum(a.ap)}</span>
  `;
}

function setAvatarFromMiscrit(side, m) {
  const imgEl = side === "atk" ? $("#atkAvatar") : $("#defAvatar");
  if (!imgEl || !m?.name) return;

  const avatarFile = AVATAR_BY_NAME.get(normalize(m.name));
  const src = avatarFile
    ? `../assets/images/miscrits_avatar/${avatarFile}`
    : `../assets/images/miscrits_avatar/flue_avatar.png`;

  imgEl.src = src;
  imgEl.onerror = () => {
    imgEl.src = `../assets/images/miscrits_avatar/flue_avatar.png`;
  };
}

function parseMiscritInput(value) {
  const v = (value ?? "").toString().trim();
  if (!v) return null;

  const vv = normalize(v);

  const exact = DB.find(m => normalize(m.name) === vv);
  if (exact) return exact.name;

  const matches = DB.filter(m => normalize(m.name).includes(vv));
  if (matches.length === 1) return matches[0].name;

  return null;
}

function setSearchValueFromId(inputEl, idOrName) {
  const m = findById(idOrName);
  if (!inputEl || !m) return;
  inputEl.value = m.name;
}

function setStatsInputs(prefix, stats) {
  if (!stats) return;
  $(`#${prefix}PA`).value = toNum(stats.PA);
  $(`#${prefix}EA`).value = toNum(stats.EA);
  $(`#${prefix}SPD`).value = toNum(stats.SPD);
  $(`#${prefix}PD`).value = toNum(stats.PD);
  $(`#${prefix}ED`).value = toNum(stats.ED);
  $(`#${prefix}HP`).value = toNum(stats.HP);
}

function setMeta(id, metaEl) {
  const m = findById(id);
  if (!metaEl) return;
  if (!m) { metaEl.textContent = "—"; return; }

  const elems = Array.isArray(m.elements) ? m.elements.join(", ") : "";
  metaEl.textContent = elems ? `Elements: ${elems}` : "—";
}

function fillAttackSelect() {
  const atk = findById(atkId);
  const sel = $("#atkAttack");
  if (!sel) return;

  const attacks = getAtkMoves(atk);

  sel.innerHTML = attacks.map((a, i) => `<option value="${i}">${a.name}</option>`).join("");

  if (!attacks.length) {
    sel.innerHTML = `<option value="0">(Sin ataques)</option>`;
    atkAttackIndex = 0;
    sel.value = "0";
    return;
  }

  atkAttackIndex = Math.min(atkAttackIndex, attacks.length - 1);
  sel.value = String(atkAttackIndex);
  renderSelectedMoveButton();
}


/* =========================================================
   RELICS
========================================================= */

let RELIC_PICK = { side: null, slot: null };

function getSlotLevel(slot) {
  const s = Math.max(0, Math.min(3, toNum(slot)));
  return SLOT_LEVELS[s] ?? 35;
}

function getRelicSelect(side, slot) {
  const cls = side === "atk" ? ".atkRelic" : ".defRelic";
  return document.querySelector(`${cls}[data-slot="${slot}"]`);
}

function getRelicSelectionsDetailed(sideCls) {
  return Array.from(document.querySelectorAll(sideCls))
    .map(sel => {
      const slot = toNum(sel.getAttribute("data-slot"));
      const name = (sel.value ?? "").toString().trim();
      if (!name) return null;
      return { name, slot, level: getSlotLevel(slot) };
    })
    .filter(Boolean);
}

function applyRelicStatsBySlot(stats, selections) {
  const out = { ...stats };

  for (const { slot, name } of selections) {
    const r = RELIC_BY_NAME.get(name);
    if (!r) continue;

    const lvl = SLOT_LEVELS[slot] ?? 35;
    if (toNum(r.level) !== toNum(lvl)) continue;

    const b = r.stats || {};
    out.HP  = toNum(out.HP)  + toNum(b.HP);
    out.SPD = toNum(out.SPD) + toNum(b.SPD);
    out.PA  = toNum(out.PA)  + toNum(b.PA);
    out.EA  = toNum(out.EA)  + toNum(b.EA);
    out.PD  = toNum(out.PD)  + toNum(b.PD);
    out.ED  = toNum(out.ED)  + toNum(b.ED);
  }

  return out;
}

function setSlotButtonUI(side, slot) {
  const host = document.querySelector(`.relic-slot[data-side="${side}"][data-slot="${slot}"]`);
  if (!host) return;

  const sel = getRelicSelect(side, slot);
  const name = (sel?.value ?? "").toString().trim();

  const r = name ? RELIC_BY_NAME.get(name) : null;
  const img = r ? relicIconSrc(r) : RELIC_PLACEHOLDER;

  host.dataset.relicName = name || "";
  host.dataset.relicLevel = String(getSlotLevel(slot));

  const insideImg = host.querySelector("img");
  if (insideImg) {
    insideImg.src = img;
    insideImg.alt = name || "Empty";
    insideImg.onerror = () => { insideImg.src = RELIC_PLACEHOLDER; };
  } else {
    host.style.backgroundImage = `url("${img}")`;
    host.style.backgroundRepeat = "no-repeat";
    host.style.backgroundPosition = "center";
    host.style.backgroundSize = "70% 70%";
  }
  host.title = name ? `${name} (lvl ${getSlotLevel(slot)})` : `Empty (lvl ${getSlotLevel(slot)})`;
  host.setAttribute("aria-label", host.title);
}

function refreshAllRelicSlots() {
  for (let i = 0; i < 4; i++) {
    setSlotButtonUI("atk", i);
    setSlotButtonUI("def", i);
  }
}

function openRelicModal(side, slot) {
  RELIC_PICK = { side, slot };

  const modal = $("#relicModal");
  const title = $("#relicModalTitle");
  const grid = $("#relicGrid");
  const search = $("#relicSearch");

  if (!modal || !title || !grid || !search) return;

  const lvl = getSlotLevel(slot);
  title.textContent = `Relics lvl ${lvl} • ${side === "atk" ? "Attacker" : "Defender"}`;

  search.value = "";
  grid.innerHTML = "";

  const renderGrid = (q) => {
    const qq = normalize(q);
    grid.innerHTML = "";

    const items = RELICS
      .filter(r => toNum(r.level) === toNum(lvl))
      .filter(r => !qq || normalize(r.name).includes(qq))
      .sort((a, b) => (a.name ?? "").localeCompare((b.name ?? ""), "es"));
    const empty = document.createElement("div");
    empty.className = "relic-item";
    empty.innerHTML = `
      <img class="relic-item__img" src="${RELIC_PLACEHOLDER}" alt="">
      <div class="relic-item__text">
        <div class="relic-item__name">Empty</div>
        <div class="relic-item__bonus">Sin bonus</div>
      </div>
    `;
    empty.addEventListener("click", () => {
      const sel = getRelicSelect(side, slot);
      if (sel) sel.value = "";

      refreshAllRelicSlots();
			refreshSideStatsFromRelics(side);
      closeRelicModal();
      renderResult();
    });
    grid.appendChild(empty);

    for (const r of items) {
      const el = document.createElement("div");
      el.className = "relic-item";
      el.innerHTML = `
        <img class="relic-item__img" src="${relicIconSrc(r)}" alt="${r.name}" onerror="this.src='${RELIC_PLACEHOLDER}'">
        <div class="relic-item__text">
          <div class="relic-item__name">${r.name}</div>
          <div class="relic-item__bonus">${relicBonusText(r) || "—"}</div>
        </div>
      `;
      el.addEventListener("click", () => {
        const sel = getRelicSelect(side, slot);
        if (sel) sel.value = r.name;
        refreshAllRelicSlots();
				refreshSideStatsFromRelics(side);
        closeRelicModal();
        renderResult();
      });
      grid.appendChild(el);
    }
  };

  renderGrid("");
  search.oninput = () => renderGrid(search.value);

  modal.hidden = false;
}

function closeRelicModal() {
  const modal = $("#relicModal");
  if (modal) modal.hidden = true;
  RELIC_PICK = { side: null, slot: null };
}

/* =========================================================
   TOTAL STATS + RESULT
========================================================= */

function readTotalStatsForCalc() {
  const raw = getInputsRaw();

  const atkPicks = getRelicSelectionsDetailed(".atkRelic");
  const defPicks = getRelicSelectionsDetailed(".defRelic");

  const atkWithRelics = applyRelicStatsBySlot(
    { HP: raw.atkHP, SPD: raw.atkSPD, PA: raw.atkPA, EA: raw.atkEA, PD: raw.atkPD, ED: raw.atkED },
    atkPicks
  );

  const defWithRelics = applyRelicStatsBySlot(
    { HP: raw.defHP, SPD: raw.defSPD, PA: raw.defPA, EA: raw.defEA, PD: raw.defPD, ED: raw.defED },
    defPicks
  );

  return { atk: atkWithRelics, def: defWithRelics };
}

function renderResult() {
  const outMin = $("#outMin");
  const outMax = $("#outMax");
  const outAvg = $("#outAvg");
  const outKO  = $("#outKO");

  const resultMeta  = $("#resultMeta");  
  const resultBox   = $("#resultBox");  
  const resultNotes = $("#resultNotes");

  const setUI = (minTxt, maxTxt, avgTxt, koTxt) => {
    if (outMin) outMin.textContent = minTxt;
    if (outMax) outMax.textContent = maxTxt;
    if (outAvg) outAvg.textContent = avgTxt;
    if (outKO)  outKO.textContent  = koTxt;
  };

  const atk = findById(atkId);
  const def = findById(defId);

  if (!atk || !def) {
    setUI("—", "—", "—", "—");
    if (resultMeta) resultMeta.textContent = "—";
    if (resultBox)  resultBox.textContent  = "Selecciona attacker y defender.";
    if (resultNotes) resultNotes.textContent = "";
    return;
  }

  const attacks = getAtkMoves(atk);
  const a = attacks[atkAttackIndex] ?? null;

  if (!a) {
    setUI("—", "—", "—", "—");
    if (resultMeta) resultMeta.textContent = "—";
    if (resultBox)  resultBox.textContent  = "Este Miscrit no tiene ataques cargados.";
    if (resultNotes) resultNotes.textContent = "";
    return;
  }

  const totals = readTotalStatsForCalc();

  const mode = $("#atkMode")?.value ?? "auto";
  const picked = pickAtkDefStats(mode, atk, def, a.element, {
    atkPA: totals.atk.PA,
    atkEA: totals.atk.EA,
    defPD: totals.def.PD,
    defED: totals.def.ED
  });

  const mul = elementMultiplier(a.element, def.elements);
  const per = computePerHit(a.ap, picked.atk, picked.def, mul);

  const hits = Math.max(1, toNum(a.hits ?? 1));

  const totalMin = per.min * hits;
  const totalMax = per.max * hits;
  const totalAvg = Math.floor((totalMin + totalMax) / 2);

  const defHP = Math.max(0, toNum(totals.def.HP));
  const usesToKO = totalAvg > 0 ? Math.ceil(defHP / totalAvg) : "—";

  setUI(
    String(totalMin),
    String(totalMax),
    String(totalAvg),
    String(usesToKO)
  );

  const mulLabel = mul === 1 ? "1.00x" : `${mul.toFixed(2)}x`;
  if (resultMeta) {
    resultMeta.textContent =
      `${a.name} • ${String(a.element).toUpperCase()} • ${picked.label} • Elem ${mulLabel} • Hits x${hits}`;
  }
  if (resultBox) {
    resultBox.textContent =
      `Total damage: ${totalMin} - ${totalMax} (avg ${totalAvg}) • Uses to KO: ${usesToKO}`;
  }

  const atkPicks = getRelicSelectionsDetailed(".atkRelic");
  const defPicks = getRelicSelectionsDetailed(".defRelic");
  const fmt = (arr) => arr.length ? arr.map(x => `${x.name} (lvl ${x.level})`).join(", ") : "—";

  if (resultNotes) {
    resultNotes.textContent =
      `Relics attacker: ${fmt(atkPicks)} • Relics defender: ${fmt(defPicks)}\n` +
      `ATK total: HP ${totals.atk.HP} SPD ${totals.atk.SPD} PA ${totals.atk.PA} EA ${totals.atk.EA} PD ${totals.atk.PD} ED ${totals.atk.ED}\n` +
      `DEF total: HP ${totals.def.HP} SPD ${totals.def.SPD} PA ${totals.def.PA} EA ${totals.def.EA} PD ${totals.def.PD} ED ${totals.def.ED}`;
  }
}


/* =========================================================
   LOAD + INIT + BIND
========================================================= */

async function loadAll() {
  const [dbRes, relicRes, metaRes] = await Promise.all([
    fetch("../assets/data/miscritsdb.json", { cache: "no-store" }),
    fetch("../assets/data/relics.json", { cache: "no-store" }),
    fetch("../miscrits.json", { cache: "no-store" })
  ]);

  if (!dbRes.ok) throw new Error(`HTTP ${dbRes.status} cargando miscritsdb.json`);
  if (!relicRes.ok) throw new Error(`HTTP ${relicRes.status} cargando relics.json`);
  if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status} cargando miscrits.json`);

  DB = await dbRes.json();
  RELICS = await relicRes.json();

  const metaJson = await metaRes.json();
  MISCRITS_META = metaJson?.miscrits ?? [];

  RELIC_BY_NAME = new Map(RELICS.map(r => [r.name, r]));

  AVATAR_BY_NAME = new Map(
    MISCRITS_META
      .filter(x => x?.name && x?.avatar)
      .map(x => [normalize(x.name), x.avatar])
  );
}


function bindMiscritSearch(side) {
  const inputId = side === "atk" ? "#atkMiscritSearch" : "#defMiscritSearch";
  const input = $(inputId);
  if (!input) return;

  const tryPick = () => {
    const id = parseMiscritInput(input.value);
    if (!id) return;
    applyMiscritSelection(side, id);
  };

  input.addEventListener("change", tryPick);
  input.addEventListener("input", tryPick);
}

function bindAll() {
  bindMiscritPicker("atk");
  bindMiscritPicker("def");

  $("#atkAttack")?.addEventListener("change", () => {
    atkAttackIndex = toNum($("#atkAttack")?.value);
    syncMoveListPicker();
    renderResult();
  });

  $("#openMoveList")?.addEventListener("click", () => {
    const modal = $("#moveModal");
    if (!modal) return;
    syncMoveListPicker();
    modal.hidden = false;
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="close-moves"]')) {
      const modal = $("#moveModal");
      if (modal) modal.hidden = true;
    }
    if (e.target.closest('[data-action="close-relic"]')) closeRelicModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeRelicModal();
      const modal = $("#moveModal");
      if (modal) modal.hidden = true;
    }
  });

  $("#atkMode")?.addEventListener("change", renderResult);

  ["atkPA","atkEA","atkSPD","atkPD","atkED","atkHP","defPA","defEA","defSPD","defPD","defED","defHP"]
    .forEach(id => $(`#${id}`)?.addEventListener("input", renderResult));

  document.querySelectorAll(".atkRelic, .defRelic").forEach(sel => {
    sel.addEventListener("change", () => {
      refreshAllRelicSlots();
      renderResult();
    });
  });

  document.querySelectorAll(".relic-slot").forEach(btn => {
    btn.addEventListener("click", () => {
      const side = btn.getAttribute("data-side");
      const slot = toNum(btn.getAttribute("data-slot"));
      if (side !== "atk" && side !== "def") return;
      openRelicModal(side, slot);
    });
  });

  $("#atkEnhancedToggle")?.addEventListener("change", (e) => {
    atkUseEnhanced = !!e.target.checked;
    atkAttackIndex = 0;
    fillAttackSelect();
    syncMoveListPicker();
    renderSelectedMoveButton();
    renderResult();
  });

}

async function init() {
  await loadAll();
	populateRelicSelects();

  fillMiscritDatalist();
  refreshAllRelicSlots();

  const atkSearch = $("#atkMiscritSearch");
  const defSearch = $("#defMiscritSearch");

  const first = DB[0]?.name ?? null;
  atkId = first ? String(first) : null;
  defId = first ? String(first) : null;

  if ($("#atkMiscrit")) $("#atkMiscrit").value = atkId ?? "";
  if ($("#defMiscrit")) $("#defMiscrit").value = defId ?? "";

  setSearchValueFromId(atkSearch, atkId);
  setSearchValueFromId(defSearch, defId);

  setMeta(atkId, $("#atkMeta"));
  setMeta(defId, $("#defMeta"));

  const atkM = findById(atkId);
  const defM = findById(defId);

	if (atkM?.stats) ATK_BASE = { ...atkM.stats };
	if (defM?.stats) DEF_BASE = { ...defM.stats };

	refreshSideStatsFromRelics("atk");
	refreshSideStatsFromRelics("def");


  fillAttackSelect();
	syncMoveListPicker();
  renderSelectedMoveButton();
  bindAll();
  renderResult();
}

init().catch((e) => {
  console.error(e);
  const box = $("#resultBox");
  if (box) box.textContent = "Error cargando data. Revisa consola y rutas ../assets/data/*.json";
});
