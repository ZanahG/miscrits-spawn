const $ = (sel) => document.querySelector(sel);

let DB = [];
let RELICS = [];
let RELIC_BY_NAME = new Map();

let atkId = null;
let defId = null;
let atkAttackIndex = 0;

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

function elementMultiplier(atkElem, defElems) {
  const a = normalize(atkElem);
  const defs = (defElems ?? []).map(normalize);

  let mul = 1;
  for (const d of defs) {
    if (STRONG[a]?.includes(d)) mul *= 1.25;
    if (WEAK[a]?.includes(d)) mul *= 0.75;
  }
  return mul;
}

function computePerHit(ap, atkStat, defStat, elemMul) {
  const a = toNum(ap);
  const atk = Math.max(1, toNum(atkStat));
  const def = Math.max(1, toNum(defStat));
  const m = toNum(elemMul);

  const base = (a * (atk / def)) * m;
  const min = Math.floor(base * 0.85);
  const max = Math.floor(base * 1.00);
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

function relicIconSrc(r) {
  if (!r) return "../assets/images/relics/molten_coin.png";
  if (r.image) return `../assets/images/relics/${r.image}`;
  return `../assets/images/relics/${slugFileName(r.name)}`;
}

function relicBonusText(r, level) {
  const lvl = String(level);
  const b = r?.stats?.[lvl];
  if (!b) return "";
  const parts = [];
  if (toNum(b.hp)) parts.push(`+${toNum(b.hp)} HP`);
  if (toNum(b.spd)) parts.push(`+${toNum(b.spd)} SPD`);
  if (toNum(b.mea)) parts.push(`+${toNum(b.mea)} PA`);
  if (toNum(b.mda)) parts.push(`+${toNum(b.mda)} EA`);
  if (toNum(b.def)) parts.push(`+${toNum(b.def)} DEF`);
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

function getRelicSelections(cls) {
  return Array.from(document.querySelectorAll(cls)).map(s => (s?.value ?? "")).filter(Boolean);
}

function applyRelicStats(stats, relicNames, level) {
  const out = { ...stats };
  const lvl = String(level);

  for (const name of relicNames) {
    const r = RELIC_BY_NAME.get(name);
    if (!r) continue;

    const bonus = r?.stats?.[lvl];
    if (!bonus) continue;

    out.HP = toNum(out.HP) + toNum(bonus.hp);
    out.SPD = toNum(out.SPD) + toNum(bonus.spd);
    out.PA = toNum(out.PA) + toNum(bonus.mea);
    out.EA = toNum(out.EA) + toNum(bonus.mda);
    out.PD = toNum(out.PD) + toNum(bonus.def);
    out.ED = toNum(out.ED) + toNum(bonus.def);
  }

  return out;
}

function findById(id) {
  return DB.find(m => String(m.id) === String(id)) ?? null;
}

function fillMiscritDatalist() {
  const dl = $("#miscritsList");
  if (!dl) return;

  const opts = DB
    .slice()
    .sort((a, b) => (a.name ?? "").localeCompare((b.name ?? ""), "es"))
    .map(m => {
      const id = String(m.id).padStart(3, "0");
      const label = `${m.name} — ${id}`;
      return `<option value="${label}"></option>`;
    })
    .join("");

  dl.innerHTML = opts;
}

function parseMiscritInput(value) {
  const v = (value ?? "").toString().trim();
  if (!v) return null;

  const idMatch = v.match(/(\d{1,4})\s*$/);
  if (idMatch) {
    const id = idMatch[1];
    const exact = DB.find(m => String(m.id) === String(id));
    if (exact) return String(exact.id);
  }

  const vv = normalize(v);
  const byName = DB.find(m => normalize(m.name) === vv);
  if (byName) return String(byName.id);

  const contains = DB.find(m => normalize(m.name).includes(vv));
  if (contains) return String(contains.id);

  return null;
}

function setSearchValueFromId(inputEl, id) {
  const m = findById(id);
  if (!inputEl || !m) return;
  const mid = String(m.id).padStart(3, "0");
  inputEl.value = `${m.name} — ${mid}`;
}


function fillRelicSelects() {
  const all = RELICS.map(r => r.name).filter(Boolean).sort((a, b) => a.localeCompare(b, "es"));

  const html =
    `<option value="">(Sin relic)</option>` +
    all.map(n => `<option value="${n}">${n}</option>`).join("");

  document.querySelectorAll(".atkRelic, .defRelic").forEach(sel => {
    sel.innerHTML = html;
    sel.value = "";
  });
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

  const attacks = atk?.attacks ?? [];
  sel.innerHTML = attacks.map((a, i) => {
    const ap = a?.ap ?? "";
    const el = a?.element ?? "";
    const hits = a?.hits ?? 1;
    return `<option value="${i}">${a.name} • ${el.toUpperCase()} • AP ${ap} • x${hits}</option>`;
  }).join("");

  if (!attacks.length) {
    sel.innerHTML = `<option value="0">(Sin ataques)</option>`;
    atkAttackIndex = 0;
    sel.value = "0";
    return;
  }

  atkAttackIndex = Math.min(atkAttackIndex, attacks.length - 1);
  sel.value = String(atkAttackIndex);
}

function readTotalStatsForCalc() {
  const raw = getInputsRaw();

  const atkRelicLvl = $("#atkRelicLvl")?.value ?? "35";
  const defRelicLvl = $("#defRelicLvl")?.value ?? "35";

  const atkRelics = getRelicSelections(".atkRelic");
  const defRelics = getRelicSelections(".defRelic");

  const atkWithRelics = applyRelicStats(
    { HP: raw.atkHP, SPD: raw.atkSPD, PA: raw.atkPA, EA: raw.atkEA, PD: raw.atkPD, ED: raw.atkED },
    atkRelics,
    atkRelicLvl
  );

  const defWithRelics = applyRelicStats(
    { HP: raw.defHP, SPD: raw.defSPD, PA: raw.defPA, EA: raw.defEA, PD: raw.defPD, ED: raw.defED },
    defRelics,
    defRelicLvl
  );

  return {
    atk: atkWithRelics,
    def: defWithRelics
  };
}

function renderResult() {
  const resultBox = $("#resultBox");
  const resultMeta = $("#resultMeta");
  const resultNotes = $("#resultNotes");
  if (!resultBox || !resultMeta || !resultNotes) return;

  const atk = findById(atkId);
  const def = findById(defId);

  if (!atk || !def) {
    resultMeta.textContent = "—";
    resultBox.textContent = "Selecciona attacker y defender.";
    resultNotes.textContent = "";
    return;
  }

  const attacks = atk.attacks ?? [];
  const a = attacks[atkAttackIndex] ?? null;

  if (!a) {
    resultMeta.textContent = "—";
    resultBox.textContent = "Este Miscrit no tiene ataques cargados.";
    resultNotes.textContent = "";
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

  const mulLabel = mul === 1 ? "1.00x" : `${mul.toFixed(2)}x`;

  resultMeta.textContent = `${a.name} • ${a.element?.toUpperCase?.() ?? a.element} • ${picked.label} • Elem ${mulLabel}`;
  resultBox.textContent = `Damage por hit: ${per.min} - ${per.max}  |  Total (x${hits}): ${totalMin} - ${totalMax}`;

  const atkRelics = getRelicSelections(".atkRelic");
  const defRelics = getRelicSelections(".defRelic");
  const atkLvl = $("#atkRelicLvl")?.value ?? "35";
  const defLvl = $("#defRelicLvl")?.value ?? "35";

  resultNotes.textContent =
    `Relics attacker (lvl ${atkLvl}): ${atkRelics.length ? atkRelics.join(", ") : "—"} • ` +
    `Relics defender (lvl ${defLvl}): ${defRelics.length ? defRelics.join(", ") : "—"}`;
}

async function loadAll() {
  const [dbRes, relicRes] = await Promise.all([
    fetch("../assets/data/miscritsdb.json", { cache: "no-store" }),
    fetch("../assets/data/relics.json", { cache: "no-store" })
  ]);

  if (!dbRes.ok) throw new Error(`HTTP ${dbRes.status} cargando miscritsdb.json`);
  if (!relicRes.ok) throw new Error(`HTTP ${relicRes.status} cargando relics.json`);

  DB = await dbRes.json();
  RELICS = await relicRes.json();

  RELIC_BY_NAME = new Map(RELICS.map(r => [r.name, r]));
}
let RELIC_PICK = { side: null, slot: null };

function getRelicSelect(side, slot) {
  const cls = side === "atk" ? ".atkRelic" : ".defRelic";
  return document.querySelector(`${cls}[data-slot="${slot}"]`);
}

function setSlotButtonUI(side, slot) {
  const host = document.querySelector(`.relic-slot[data-side="${side}"][data-slot="${slot}"]`);
  if (!host) return;

  const lvl = side === "atk" ? ($("#atkRelicLvl")?.value ?? "35") : ($("#defRelicLvl")?.value ?? "35");
  const sel = getRelicSelect(side, slot);
  const name = (sel?.value ?? "").toString();

  if (!name) {
    host.innerHTML = `
      <img class="relic-slot__img" src="../assets/images/relics/molten_coin.png" alt="">
      <div class="relic-slot__meta">
        <div class="relic-slot__name">Empty</div>
        <div class="relic-slot__bonus">Click para elegir</div>
      </div>
    `;
    return;
  }

  const r = RELIC_BY_NAME.get(name);
  const img = r ? relicIconSrc(r) : "../assets/images/relics/molten_coin.png";
  const bonus = r ? relicBonusText(r, lvl) : "";
  host.innerHTML = `
    <img class="relic-slot__img" src="${img}" alt="${name}" onerror="this.src='../assets/images/relics/molten_coin.png'">
    <div class="relic-slot__meta">
      <div class="relic-slot__name">${name}</div>
      <div class="relic-slot__bonus">${bonus || "—"}</div>
    </div>
  `;
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

  const lvl = side === "atk" ? ($("#atkRelicLvl")?.value ?? "35") : ($("#defRelicLvl")?.value ?? "35");
  title.textContent = `Relics lvl ${lvl} • ${side === "atk" ? "Attacker" : "Defender"}`;

  search.value = "";
  grid.innerHTML = "";

  const renderGrid = (q) => {
    const qq = normalize(q);
    grid.innerHTML = "";

    const items = RELICS
      .filter(r => !qq || normalize(r.name).includes(qq))
      .sort((a, b) => (a.name ?? "").localeCompare((b.name ?? ""), "es"));

    const empty = document.createElement("div");
    empty.className = "relic-item";
    empty.innerHTML = `
      <img class="relic-item__img" src="../assets/images/relics/molten_coin.png" alt="">
      <div class="relic-item__text">
        <div class="relic-item__name">Empty</div>
        <div class="relic-item__bonus">Sin bonus</div>
      </div>
    `;
    empty.addEventListener("click", () => {
      const sel = getRelicSelect(side, slot);
      if (sel) sel.value = "";
      setSlotButtonUI(side, slot);
      closeRelicModal();
      renderResult();
    });
    grid.appendChild(empty);

    for (const r of items) {
      const el = document.createElement("div");
      el.className = "relic-item";
      el.innerHTML = `
        <img class="relic-item__img" src="${relicIconSrc(r)}" alt="${r.name}" onerror="this.src='../assets/images/relics/molten_coin.png'">
        <div class="relic-item__text">
          <div class="relic-item__name">${r.name}</div>
          <div class="relic-item__bonus">${relicBonusText(r, lvl) || "—"}</div>
        </div>
      `;
      el.addEventListener("click", () => {
        const sel = getRelicSelect(side, slot);
        if (sel) sel.value = r.name;
        setSlotButtonUI(side, slot);
        closeRelicModal();
        renderResult();
      });
      grid.appendChild(el);
    }
  };

  renderGrid("");
  search.addEventListener("input", () => renderGrid(search.value), { passive: true });

  modal.hidden = false;
}

function closeRelicModal() {
  const modal = $("#relicModal");
  if (modal) modal.hidden = true;
  RELIC_PICK = { side: null, slot: null };
}


function bindAll() {
	$("#atkMiscritSearch")?.addEventListener("input", () => {
		const id = parseMiscritInput($("#atkMiscritSearch").value);
		if (!id) return;

		atkId = id;
		if ($("#atkMiscrit")) $("#atkMiscrit").value = id;

		atkAttackIndex = 0;
		setMeta(atkId, $("#atkMeta"));

		const m = findById(atkId);
		if (m?.stats) setStatsInputs("atk", m.stats);

		fillAttackSelect();
		renderResult();
	});

	$("#defMiscritSearch")?.addEventListener("input", () => {
		const id = parseMiscritInput($("#defMiscritSearch").value);
		if (!id) return;

		defId = id;
		if ($("#defMiscrit")) $("#defMiscrit").value = id;

		setMeta(defId, $("#defMeta"));

		const m = findById(defId);
		if (m?.stats) setStatsInputs("def", m.stats);

		renderResult();
	});


  $("#atkAttack")?.addEventListener("change", () => {
    atkAttackIndex = toNum($("#atkAttack")?.value);
    renderResult();
  });

  $("#atkMode")?.addEventListener("change", renderResult);

  ["atkPA","atkEA","atkSPD","atkPD","atkED","atkHP","defPA","defEA","defSPD","defPD","defED","defHP"]
    .forEach(id => $(`#${id}`)?.addEventListener("input", renderResult));

  document.querySelectorAll(".atkRelic, .defRelic").forEach(sel => {
    sel.addEventListener("change", renderResult);
  });

  $("#atkRelicLvl")?.addEventListener("change", renderResult);
  $("#defRelicLvl")?.addEventListener("change", renderResult);

	document.querySelectorAll(".relic-slot").forEach(btn => {
		btn.addEventListener("click", () => {
			const side = btn.getAttribute("data-side");
			const slot = toNum(btn.getAttribute("data-slot"));
			if (side !== "atk" && side !== "def") return;
			openRelicModal(side, slot);
		});
	});

	document.addEventListener("click", (e) => {
		const close = e.target.closest('[data-action="close-relic"]');
		if (close) closeRelicModal();
	});
}

async function init() {
  await loadAll();

  fillMiscritDatalist();
	fillRelicSelects();
	refreshAllRelicSlots();


	const atkSearch = $("#atkMiscritSearch");
	const defSearch = $("#defMiscritSearch");

	const first = DB[0]?.id ?? null;
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

  if (atkM?.stats) setStatsInputs("atk", atkM.stats);
  if (defM?.stats) setStatsInputs("def", defM.stats);

  fillAttackSelect();
  bindAll();
  renderResult();
}

init().catch((e) => {
  console.error(e);
  const box = $("#resultBox");
  if (box) box.textContent = "Error cargando data. Revisa consola y rutas ../data/*.json";
});
