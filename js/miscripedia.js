const $ = (s) => document.querySelector(s);

const STATE = {
  all: [],
  q: "",
  rarity: "",
  element: "",
  tag: "",
  attack: "",
  sort: "idAsc",
};

const ELEMENTS_ORDER = ["Water","Fire","Nature","Wind","Earth","Lightning","Physical","Misc"];

function prettyElementLabel(el){
  const parts = String(el ?? "").match(/[A-Z][a-z]*/g) || [];
  return parts.length >= 2 ? parts.join("/") : (el ?? "");
}

function elementIconPath(el){
  const parts = String(el ?? "").match(/[A-Z][a-z]*/g) || [];

  const file = parts.length >= 2
    ? parts.map(p => p.toLowerCase()).join("")
    : String(el ?? "").toLowerCase();

  return `../assets/images/type/${file}.png`;
}


function stageName(m, stageIdx=0){
  return m?.names?.[stageIdx] ?? m?.names?.[0] ?? "Unknown";
}

/* =========================================================
   ATTACK AUTOCOMPLETE
========================================================= */

let ATTACK_NAMES = [];

function buildAttackIndex(){
  const set = new Set();
  for (const m of STATE.all){
    for (const a of (m.abilities ?? [])){
      const n = String(a?.name ?? "").trim();
      if (n) set.add(n);
    }
  }
  ATTACK_NAMES = [...set].sort((a,b)=>a.localeCompare(b));
}

function escapeAttr(s){
  return String(s).replaceAll("&","&amp;").replaceAll('"',"&quot;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}
function escapeHtml(s){
  return String(s).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function renderAttackDropdown(query){
  const dd = $("#attackDropdown");
  if (!dd) return;

  const q = String(query ?? "").trim().toLowerCase();

  if (!q){
    dd.hidden = true;
    dd.innerHTML = "";
    return;
  }

  const matches = ATTACK_NAMES
    .filter(n => n.toLowerCase().includes(q))
    .slice(0, 40);

  if (!matches.length){
    dd.hidden = true;
    dd.innerHTML = "";
    return;
  }

  dd.hidden = false;
  dd.innerHTML = matches.map((name) => `
    <div class="apItem" data-name="${escapeAttr(name)}">
      <div class="apIcon"></div>
      <div class="apName">${escapeHtml(name)}</div>
    </div>
  `).join("");
}

function closeAttackDropdown(){
  const dd = $("#attackDropdown");
  if (!dd) return;
  dd.hidden = true;
  dd.innerHTML = "";
}

function wireAttackAutocomplete(){
  const input = $("#attackFilter");
  const dd = $("#attackDropdown");
  if (!input || !dd) return;

  input.addEventListener("input", (e) => {
    STATE.attack = e.target.value.trim();
    renderAttackDropdown(STATE.attack);
    render();
  });

  dd.addEventListener("click", (e) => {
    const item = e.target.closest(".apItem");
    if (!item) return;

    const name = item.getAttribute("data-name") || "";
    input.value = name;
    STATE.attack = name;
    closeAttackDropdown();
    render();
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest(".miscritpicker")) return;
    closeAttackDropdown();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape"){
      closeAttackDropdown();
      input.blur();
    }
  });

  input.addEventListener("focus", () => {
    renderAttackDropdown(input.value);
  });
}

function rarityClass(rarity){
  switch ((rarity ?? "").toLowerCase()){
    case "common": return "rarity-common";
    case "rare": return "rarity-rare";
    case "epic": return "rarity-epic";
    case "exotic": return "rarity-exotic";
    case "legendary": return "rarity-legendary";
    default: return "";
  }
}

/* =========================================================
   SPRITES
========================================================= */

function spriteUrl(m) {
  const name = (m?.names?.[0] ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");

  return `../assets/images/backs/${name}_back.png`;
}

/* =========================================================
   FILTER HELPERS
========================================================= */

function uniq(arr){ return Array.from(new Set(arr)); }

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

  const deny = new Set(["Attack", "Buff"]);
  const out = [...set].filter(t => !deny.has(t));

  return out;
}


function rarityColor(rarity){
  switch ((rarity ?? "").toLowerCase()){
    case "common": return "#9ca3af";
    case "rare": return "#60a5fa";
    case "epic": return "#4ade80";
    case "exotic": return "#a78bfa";
    case "legendary": return "#facc15";
    default: return "rgba(255,255,255,.45)";
  }
}

function hasAttack(m, attackName){
  const q = String(attackName ?? "").toLowerCase().trim();
  if (!q) return true;

  return (m.abilities ?? []).some(a =>
    String(a?.name ?? "").toLowerCase().includes(q)
  );
}

/* =========================================================
   APPLY FILTERS + RENDER
========================================================= */

function applyFilters(){
  let out = STATE.all.slice();

  // attack filter
  if (STATE.attack) out = out.filter(m => hasAttack(m, STATE.attack));

  // search by name/id
  const q = STATE.q.trim().toLowerCase();
  if (q){
    out = out.filter(m => (
      stageName(m,0).toLowerCase().includes(q) ||
      String(m.id).includes(q)
    ));
  }

  if (STATE.rarity) out = out.filter(m => m.rarity === STATE.rarity);
  if (STATE.element) out = out.filter(m => (m.element ?? "") === STATE.element);
  if (STATE.tag) out = out.filter(m => computeTags(m).includes(STATE.tag));

  out.sort((a,b) => {
    const an = stageName(a,0).toLowerCase();
    const bn = stageName(b,0).toLowerCase();
    switch(STATE.sort){
      case "nameAsc": return an.localeCompare(bn);
      case "nameDesc": return bn.localeCompare(an);
      case "idAsc": return (a.id??0) - (b.id??0);
      case "idDesc": return (b.id??0) - (a.id??0);
      default: return 0;
    }
  });

  return out;
}

function render(){
  const grid = $("#grid");
  const empty = $("#empty");
  if (!grid || !empty) return;

  const list = applyFilters();

  grid.innerHTML = "";
  empty.classList.toggle("hidden", list.length !== 0);

  for (const m of list){
    const tags = computeTags(m).slice(0,3);

    const card = document.createElement("div");
    card.className = "card";
    card.addEventListener("click", () => {
      window.location.href = `../html/miscripedia_data.html?id=${encodeURIComponent(m.id)}&stage=0`;
    });

    card.innerHTML = `
      <div class="cardTop">
        <div class="elemDot" style="background:${rarityColor(m.rarity)}"></div>
        <div class="cardName">${escapeHtml(stageName(m,0))}</div>
      </div>

      <div class="cardBox">
        <img src="${spriteUrl(m)}" alt="${escapeAttr(stageName(m,0))}" onerror="this.style.opacity=.25;"/>
      </div>

      <div class="cardFooter">
        <div class="tagPills">
          ${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
        </div>
        <div class="cardRarity ${rarityClass(m.rarity)}">
					${escapeHtml(m.rarity ?? "")}
				</div>
      </div>
    `;
    grid.appendChild(card);
  }
}

/* =========================================================
   UI BUILDERS
========================================================= */

function renderElementPills(){
  const box = $("#elementsPills");
  if (!box) return;

  const elems = uniq(STATE.all.map(m => m.element).filter(Boolean))
    .sort((a,b)=>ELEMENTS_ORDER.indexOf(a)-ELEMENTS_ORDER.indexOf(b));

  box.innerHTML = "";

  const allBtn = document.createElement("div");
  allBtn.className = "pill active";
  allBtn.innerHTML = `<span>All Elements</span>`;
  allBtn.onclick = () => {
    STATE.element = "";
    [...box.querySelectorAll(".pill")].forEach(p=>p.classList.remove("active"));
    allBtn.classList.add("active");
    render();
  };
  box.appendChild(allBtn);

  for (const el of elems){
    const p = document.createElement("div");
    p.className = "pill";

    const label = prettyElementLabel(el);
    const icon = elementIconPath(el);

    p.innerHTML = `
      <img class="pill__icon" src="${icon}" alt="${label}"
           onerror="this.style.display='none'">
      <span>${label}</span>
    `;

    p.onclick = () => {
      STATE.element = el;
      [...box.querySelectorAll(".pill")].forEach(x=>x.classList.remove("active"));
      p.classList.add("active");
      render();
    };

    box.appendChild(p);
  }
}

function fillSelects(){
  const raritySel = $("#rarity");
  const tagSel = $("#tag");
  if (!raritySel || !tagSel) return;

  raritySel.innerHTML = `<option value="">All Rarities</option>`;
  tagSel.innerHTML = `<option value="">Filter by Tags</option>`;

  const rarities = uniq(STATE.all.map(m=>m.rarity).filter(Boolean)).sort();
  for (const r of rarities){
    const opt = document.createElement("option");
    opt.value = r;
    opt.textContent = r;
    raritySel.appendChild(opt);
  }

  const tags = uniq(STATE.all.flatMap(computeTags)).sort((a,b)=>a.localeCompare(b));
  for (const t of tags){
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    tagSel.appendChild(opt);
  }
}

/* =========================================================
   MAIN
========================================================= */

async function main(){
  const res = await fetch("../assets/data/miscripedia.json");
  const data = await res.json();

  STATE.all = Array.isArray(data) ? data : (data.miscrits ?? []);

  buildAttackIndex();
  wireAttackAutocomplete();

  fillSelects();
  renderElementPills();

  const qEl = $("#q");
  const rarityEl = $("#rarity");
  const tagEl = $("#tag");
  const sortEl = $("#sort");

  if (qEl) qEl.addEventListener("input", (e)=>{ STATE.q = e.target.value; render(); });
  if (rarityEl) rarityEl.addEventListener("change", (e)=>{ STATE.rarity = e.target.value; render(); });
  if (tagEl) tagEl.addEventListener("change", (e)=>{ STATE.tag = e.target.value; render(); });
  if (sortEl) sortEl.addEventListener("change", (e)=>{ STATE.sort = e.target.value; render(); });

  render();
}

main().catch(console.error);
