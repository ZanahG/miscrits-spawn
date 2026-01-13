const $ = (sel) => document.querySelector(sel);

let DB = [];
let ELEMENT_NAMES = null;

function stripDiacritics(str) {
  return (str ?? "").toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normalize(str) {
  return stripDiacritics(str).trim().toLowerCase();
}

function toTitle(s) {
  const x = (s ?? "").toString();
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : "";
}

function elementLabel(el) {
  const k = normalize(el);
  if (ELEMENT_NAMES && ELEMENT_NAMES[k]) return ELEMENT_NAMES[k];
  return toTitle(k);
}

function elementMultiplier(atkEl, defEls) {
  const atk = normalize(atkEl);
  const def = (defEls ?? []).map(normalize);

  const weaknesses = {
    earth: ["water"],
    water: ["nature", "air"],
    fire: ["water", "earth"],
    nature: ["fire"],
    air: ["fire", "earth"],
    electric: ["earth"],
  };

  if (def.includes(atk)) return 0.5;

  const weakTo = weaknesses[atk] ?? [];
  for (const e of def) {
    if (weakTo.includes(e)) return 2.0;
  }

  return 1.0;
}

function computePerHit(ap, attackStat, defenseStat, level, elementMult, rngMultiplier) {
  const damage = (ap * ((attackStat / defenseStat) / 2) * (level / 20) * elementMult) * rngMultiplier;
  return Math.floor(Math.max(damage, 1));
}

function calculateDamage(attack, attacker, defender) {
  if (!attack || !attacker || !defender) return null;

  const level = 30;

  const ap = Number(attack.ap ?? 0);
  const hits = Math.max(1, Number(attack.hits ?? 1));
  const physical = !!attack.physical;

  const atkStat = physical ? Number(attacker.stats?.pa ?? 1) : Number(attacker.stats?.ea ?? 1);
  const defStat = physical ? Number(defender.stats?.pd ?? 1) : Number(defender.stats?.ed ?? 1);

  const atkEl = attack.element ?? (attacker.elements?.[0] ?? "");
  const defEls = defender.elements ?? [];

  const mult = elementMultiplier(atkEl, defEls);

  const minPerHit = computePerHit(ap, atkStat, defStat, level, mult, 0.85);
  const avgPerHit = computePerHit(ap, atkStat, defStat, level, mult, 0.925);
  const maxPerHit = computePerHit(ap, atkStat, defStat, level, mult, 1.0);

  return {
    element: atkEl,
    physical,
    hits,
    mult,
    perHit: { min: minPerHit, avg: avgPerHit, max: maxPerHit },
    total: { min: minPerHit * hits, avg: avgPerHit * hits, max: maxPerHit * hits },
  };
}

function buildStatsHTML(m) {
  const s = m?.stats ?? {};
  const pairs = [
    ["HP", s.hp],
    ["PA", s.pa],
    ["PD", s.pd],
    ["EA", s.ea],
    ["ED", s.ed],
    ["SP", s.sp],
  ];

  return pairs.map(([k, v]) => `
    <div class="dmg-stat">
      <div class="dmg-stat__k">${k}</div>
      <div class="dmg-stat__v">${Number(v ?? 0)}</div>
    </div>
  `).join("");
}

function fillMiscritSelect(sel, list) {
  sel.innerHTML = "";
  for (const m of list) {
    const opt = document.createElement("option");
    opt.value = m.name;
    opt.textContent = m.name;
    sel.appendChild(opt);
  }
}

function fillAttackSelect(sel, attacker) {
  sel.innerHTML = "";
  const attacks = attacker?.attacks ?? [];

  for (let i = 0; i < attacks.length; i++) {
    const a = attacks[i];
    const name = (a?.name ?? `Attack ${i + 1}`).toString();
    const ap = a?.ap ?? "";
    const el = elementLabel(a?.element ?? "");
    const phys = a?.physical ? "Physical" : "Elemental";
    const hits = a?.hits ? ` x${a.hits}` : "";
    const text = `${name} • AP ${ap} • ${el} • ${phys}${hits}`;

    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = text;
    sel.appendChild(opt);
  }
}

function getMiscritByName(name) {
  const n = normalize(name);
  return DB.find(m => normalize(m.name) === n) ?? null;
}

function refresh() {
  const atkSel = $("#atkMiscrit");
  const defSel = $("#defMiscrit");
  const atkAttack = $("#atkAttack");

  const atk = getMiscritByName(atkSel.value);
  const def = getMiscritByName(defSel.value);

  if ($("#atkStats")) $("#atkStats").innerHTML = buildStatsHTML(atk);
  if ($("#defStats")) $("#defStats").innerHTML = buildStatsHTML(def);

  if (atk) fillAttackSelect(atkAttack, atk);

  const aIndex = parseInt(atkAttack.value || "0", 10);
  const attack = atk?.attacks?.[Number.isFinite(aIndex) ? aIndex : 0] ?? null;

  const calc = calculateDamage(attack, atk, def);

  const resultName = $("#resultName");
  const resultMeta = $("#resultMeta");
  const resultNumbers = $("#resultNumbers");
  const resultNote = $("#resultNote");

  if (!calc) {
    if (resultName) resultName.textContent = "—";
    if (resultMeta) resultMeta.textContent = "—";
    if (resultNumbers) resultNumbers.innerHTML = "";
    if (resultNote) resultNote.textContent = "";
    return;
  }

  const el = elementLabel(calc.element);
  const kind = calc.physical ? "Physical" : "Elemental";
  const multTxt = calc.mult === 2 ? "Super effective (x2)" : (calc.mult === 0.5 ? "Not very effective (x0.5)" : "Normal (x1)");
  const hitsTxt = calc.hits > 1 ? ` • Hits x${calc.hits}` : "";

  if (resultName) resultName.textContent = attack?.name ?? "Attack";
  if (resultMeta) resultMeta.textContent = `${el} • ${kind}${hitsTxt} • ${multTxt}`;

  const row = (label, v) => `
    <div class="dmg-num">
      <div class="dmg-num__k">${label}</div>
      <div class="dmg-num__v">${v}</div>
    </div>
  `;

  if (resultNumbers) {
    resultNumbers.innerHTML = `
      <div class="dmg-numrow">
        ${row("Min / hit", calc.perHit.min)}
        ${row("Avg / hit", calc.perHit.avg)}
        ${row("Max / hit", calc.perHit.max)}
      </div>
      <div class="dmg-numrow">
        ${row("Min total", calc.total.min)}
        ${row("Avg total", calc.total.avg)}
        ${row("Max total", calc.total.max)}
      </div>
    `;
  }

  if (resultNote) {
    resultNote.textContent = "Cálculo basado en (lvl 30, RNG 0.85–1.00).";
  }
}

async function init() {
  const res = await fetch("../assets/data/miscritsdb.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} cargando miscritsdb.json`);
  DB = await res.json();

  try {
    const r2 = await fetch("../assets/data/elementType.json", { cache: "no-store" });
    if (r2.ok) ELEMENT_NAMES = await r2.json();
  } catch (_) {}

  const atkSel = $("#atkMiscrit");
  const defSel = $("#defMiscrit");
  const atkAttack = $("#atkAttack");

  fillMiscritSelect(atkSel, DB);
  fillMiscritSelect(defSel, DB);

  atkSel.value = DB[0]?.name ?? "";
  defSel.value = DB[1]?.name ?? DB[0]?.name ?? "";

  refresh();

  atkSel.addEventListener("change", () => refresh());
  defSel.addEventListener("change", () => refresh());
  atkAttack.addEventListener("change", () => refresh());
}

init().catch(console.error);
