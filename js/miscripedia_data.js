const $ = (s) => document.querySelector(s);

function getParam(name){
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function stageName(m, stageIdx=0){
  return m?.names?.[stageIdx] ?? m?.names?.[0] ?? "Unknown";
}

/* =========================================================
   SAFE ESCAPES
========================================================= */
function escHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
/* =========================================================
   HELPERS
========================================================= */
const ABILITY_ICON_ALIAS = {
  hot: "heal",
	Bot: "bot_buff",
	bot: "buff_over_time",
  healovertime: "heal",
  lifesteal: "heal",
  regen: "heal",

  accuracydebuff: "accuracy_debuff",
  accuracybuff: "accuracy_buff",

  attackdebuff: "debuff",
  defensedeuff: "debuff",
};

function resolveAbilityIcon(key){
  if (!key) return "";
  return ABILITY_ICON_ALIAS[key] ?? key;
}


/* =========================================================
   SPRITES
========================================================= */
function backSpriteUrl(m) {
  const name = (m?.names?.[0] ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
  return `../assets/images/backs/${name}_back.png`;
}

function evoSpriteUrl(m, stageIdx){
  return backSpriteUrl(m);
}

/* =========================================================
   ICONS FOR ABILITIES
========================================================= */
function normalizeKey(s){
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}


function elementIconUrl(element){
  if (!element) return "";

  const key = normalizeKey(element);
  return `../assets/images/type/${key}.png`;
}

function abilityIconUrl(ab){
  const typeRaw = normalizeKey(ab?.type);
  const elRaw   = normalizeKey(ab?.element);

  const type = resolveAbilityIcon(typeRaw);
  const el   = resolveAbilityIcon(elRaw);

  if (typeRaw === "attack"){
    return el ? `../assets/images/type/${el}.png` : "";
  }

  if (el && el !== "misc"){
    return `../assets/images/type/${el}.png`;
  }

  return type ? `../assets/images/type/${type}.png` : "";
}


/* =========================================================
   TAGS / META
========================================================= */
function computeTags(m){
  const set = new Set();
  for (const ab of (m.abilities ?? [])){
    if (ab?.type) set.add(String(ab.type));
    if (Array.isArray(ab.additional)){
      for (const ad of ab.additional){
        if (ad?.type) set.add(String(ad.type));
      }
    }
  }

  const prefer = ["Sleep","Poison","Negate"];
  const out = prefer.filter(x => set.has(x));
  return out.length ? out : Array.from(set).slice(0,3);
}

function firstLocation(m){
  const loc = m.locations ?? {};
  const zones = Object.keys(loc);
  if (!zones.length) return "Unknown";
  return zones[0];
}

/* =========================================================
   STATS
========================================================= */
function statToPips(label){
  switch(String(label)){
    case "Weak": return 1;
    case "Moderate": return 2;
    case "Strong": return 3;
    case "Max": return 4;
    case "Elite": return 5;
    default: return 0;
  }
}

function renderStats(m){
  const rows = [
    ["Health", m.hp, "hp"],
    ["Speed", m.spd, "spd"],
    ["Elemental Attack", m.ea, "ea"],
    ["Elemental Defense", m.ed, "ed"],
    ["Physical Attack", m.pa, "pa"],
    ["Physical Defense", m.pd, "pd"],
  ];

  $("#stats").innerHTML = rows.map(([label,val,key]) => {
    const n = statToPips(val);
    return `
      <div class="statRow statRow--pips">
        <div class="statLabel">${label}</div>
        <div class="pips pips--${key}" aria-label="${label} ${n}/5">
          ${Array.from({length:5}, (_,i)=>`
            <span class="pip ${i < n ? "is-on" : ""}"></span>
          `).join("")}
        </div>
      </div>
    `;
  }).join("");
}


/* =========================================================
   ABILITIES ORDER + RENDER
========================================================= */
function orderAbilities(m){
  const abs = m.abilities ?? [];
  const byId = new Map(abs.map(a => [a.id, a]));
  const ordered = [];

  for (const id of (m.ability_order ?? [])){
    if (byId.has(id)) ordered.push(byId.get(id));
  }
  for (const a of abs){
    if (!ordered.includes(a)) ordered.push(a);
  }
  return ordered;
}

function buildEnchantText(a){
  const ed = String(a.enchant_desc ?? "").trim();
  if (ed) return ed;

  const e = a.enchant ?? null;
  if (!e) return "";

  const parts = [];
  if (e.ap != null) parts.push(`${e.ap > 0 ? "+" : ""}${e.ap} Attack Power`);
  if (e.accuracy != null) parts.push(`${e.accuracy > 0 ? "+" : ""}${e.accuracy}% Accuracy`);

  const add = e.additional?.[0];
  if (add?.type){
    const ap = add.ap != null ? ` ${add.ap > 0 ? "+" : ""}${add.ap}` : "";
    parts.push(`${add.type}${ap}`.trim());
  }

  return parts.join(" • ");
}

function showAbTip(targetEl, a){
  const tip = $("#abTip");
  if (!tip) return;

  const name = a.name ?? "Ability";
  const el = a.element ?? "";
  const ap = (a.ap != null) ? `AP: ${a.ap}` : "";
  const acc = (a.accuracy != null) ? `Accuracy: ${a.accuracy}%` : "";
  const desc = String(a.desc ?? "").trim();
  const ench = buildEnchantText(a);

  tip.innerHTML = `
    <div class="abTip__top">
      <div>${escHtml(name)}</div>
      <div>${escHtml(el)}</div>
    </div>

    <div class="abTip__row">
      <div class="abTip__label">${escHtml(ap)}</div>
      <div class="abTip__label">${escHtml(acc)}</div>
    </div>

    ${desc ? `<div class="abTip__desc">${escHtml(desc)}</div>` : ""}

    ${ench ? `
      <div class="abTip__enchantTitle">Enchant</div>
      <div class="abTip__enchant">${escHtml(ench)}</div>
    ` : ""}
  `;

  tip.hidden = false;

  positionTip(targetEl);
}

function hideAbTip(){
  const tip = $("#abTip");
  if (!tip) return;
  tip.hidden = true;
  tip.innerHTML = "";
}

function positionTipFromMouse(e){
  const tip = $("#abTip");
  if (!tip || tip.hidden) return;

  const pad = 14;
  const w = tip.offsetWidth || 260;
  const h = tip.offsetHeight || 140;

  let x = e.clientX + pad;
  let y = e.clientY + pad;

  const maxX = window.innerWidth - w - 10;
  const maxY = window.innerHeight - h - 10;

  if (x > maxX) x = e.clientX - w - pad;
  if (y > maxY) y = e.clientY - h - pad;

  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

function renderAbilities(m){
  const list = orderAbilities(m).slice(0,12);

  $("#abilities").innerHTML = list.map(a => {
    const icon = abilityIconUrl(a);

    const elPart  = a.element ? String(a.element).trim() : "";
		const typePart = a.type ? String(a.type).trim() : "";

		const apPart  = (a.ap != null) ? `AP ${a.ap}` : "";
		const accPart = (a.accuracy != null) ? `Acc ${a.accuracy}%` : "";

		// Card compacta estilo original
		const line2 = [elPart, typePart, apPart, accPart].filter(Boolean).join(" • ");


    return `
      <div class="ab" data-abid="${a.id}">
        <div class="abIco">
          ${icon ? `<img class="abIcon" src="${icon}" alt="" onerror="this.style.display='none'">` : ""}
        </div>
        <div>
          <div class="abName">${escHtml(a.name ?? "Ability")}</div>
          <div class="abMeta">${escHtml(line2)}</div>
        </div>
      </div>
    `;
  }).join("");


  const box = $("#abilities");
  box.onmousemove = (e) => positionTipFromMouse(e);

  box.onmouseover = (e) => {
    const abEl = e.target.closest(".ab");
    if (!abEl) return;

    const id = Number(abEl.getAttribute("data-abid"));
    const a = (m.abilities ?? []).find(x => Number(x.id) === id);
    if (!a) return;

    showAbTip(abEl, a);
  };

  box.onmouseleave = () => hideAbTip();
}



/* =========================================================
   EVOLUTIONS
========================================================= */
function renderEvolutions(m, stageIdx){
  const box = $("#evolutions");
  box.innerHTML = "";

  const stages = m.names ?? [];
  stages.forEach((nm, idx) => {
    const d = document.createElement("div");
    d.className = "evo" + (idx === stageIdx ? " active" : "");
    d.innerHTML = `
      <img src="${evoSpriteUrl(m, idx)}" alt="${escHtml(nm)}" onerror="this.style.opacity=.25;"/>
      <div class="evoName">${escHtml(nm)}</div>
    `;
    d.onclick = () => {
      const u = new URL(location.href);
      u.searchParams.set("stage", String(idx));
      location.href = u.toString();
    };
    box.appendChild(d);
  });
}

/* =========================================================
   MAIN
========================================================= */
async function main(){
  const id = Number(getParam("id"));
  const stageIdx = Math.max(0, Math.min(3, Number(getParam("stage") ?? 0)));

  const res = await fetch("../assets/data/miscripedia.json");
  const data = await res.json();
  const all = Array.isArray(data) ? data : (data.miscrits ?? []);
  const m = all.find(x => Number(x.id) === id);
	const badge = $("#elemBadge");
	const icon = elementIconUrl(m.element);

	if (icon){
		badge.innerHTML = `
			<img src="${icon}" alt="${m.element}" />
		`;
	}

  if (!m){
    $("#name").textContent = "Not found";
    return;
  }

  $("#name").textContent = stageName(m, stageIdx);
  $("#rarityText").textContent = m.rarity ?? "";

  const tags = computeTags(m);
  $("#tags").innerHTML = tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join("");

  $("#sprite").src = backSpriteUrl(m);
  $("#sprite").alt = stageName(m, stageIdx);

  $("#lore").textContent = (m.descriptions?.[stageIdx] ?? m.descriptions?.[0] ?? "");

  $("#type").textContent = m.element ?? "";
  $("#location").textContent = firstLocation(m);

  renderEvolutions(m, stageIdx);
  renderStats(m);
  renderAbilities(m);
}

main().catch(console.error);
