function qs(sel){ return document.querySelector(sel); }
function qsa(sel){ return Array.from(document.querySelectorAll(sel)); }

function getParam(name){
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function esc(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function slugifyMiscritName(name){
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getMiscritAvatarPath(name){
  const slug = slugifyMiscritName(name);
  return `../assets/images/miscrits_avatar/${slug}_avatar.png`;
}

function miniMD(text){
  const s = esc(text);
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

function renderDiffRow(label, from, to){
  return `
    <div class="pn-diffRow">
      <div class="pn-diffDot"></div>
      <div class="pn-diffText">
        <span class="pn-diffLabel">${esc(label)}</span>:
        <span class="pn-diffFrom">${esc(from)}</span>
        <span class="pn-diffArrow">⇒</span>
        <span class="pn-diffTo">${esc(to)}</span>
      </div>
    </div>
  `;
}

function renderSystemSection(sec){
  const items = (sec.items ?? []).map(i => renderDiffRow(i.label, i.from, i.to)).join("");
  return `
    <section class="pn-panel">
      <h2 class="pn-h2">${esc(sec.title)}</h2>
      <div class="pn-diffList">${items}</div>
    </section>
  `;
}

function renderMiscritSection(sec){
  const avatarSrc = sec.icon ? sec.icon : getMiscritAvatarPath(sec.name);

  const blocks = (sec.blocks ?? []).map(b => {
    const changes = (b.changes ?? [])
      .map(c => renderDiffRow(c.label, c.from, c.to))
      .join("");

    return `
      <div class="pn-spellBlock">
        <div class="pn-spellHead">
          ${b.icon
            ? `<img class="pn-spellIcon" src="${esc(b.icon)}" alt="${esc(b.spell)}" />`
            : `<div class="pn-spellIcon pn-spellIcon--empty"></div>`
          }
          <div class="pn-spellTitle">${esc(b.spell)}</div>
        </div>
        <div class="pn-diffList">${changes}</div>
      </div>
    `;
  }).join("");

  return `
    <section class="pn-panel pn-champ">
      <div class="pn-champHead">
        <img
          class="pn-champImg"
          src="${esc(avatarSrc)}"
          alt="${esc(sec.name)}"
          onerror="this.onerror=null;this.src='assets/images/miscrits_avatar/_placeholder_avatar.png';"
        />
        <div class="pn-champMeta">
          <div class="pn-champName">${esc(sec.name)}</div>
          ${sec.quote ? `<div class="pn-champQuote">“${miniMD(sec.quote)}”</div>` : ""}
        </div>
      </div>
      ${blocks}
    </section>
  `;
}

function renderRelicSection(sec){
  const blocks = (sec.blocks ?? []).map(b => {
    const changes = (b.changes ?? []).map(c => renderDiffRow(c.label, c.from, c.to)).join("");
    return `
      <div class="pn-spellBlock">
        <div class="pn-spellHead">
					${b.icon
						? `<img class="pn-spellIcon" src="${esc(b.icon)}" alt="${esc(b.spell)}" />`
						: `<div class="pn-spellIcon pn-spellIcon--empty"></div>`
					}
          <div class="pn-spellTitle">${esc(b.spell ?? b.title ?? "Cambios")}</div>
        </div>
        <div class="pn-diffList">${changes}</div>
      </div>
    `;
  }).join("");

  return `
    <section class="pn-panel pn-champ">
      <div class="pn-champHead">
        <img class="pn-champImg" src="${esc(sec.icon)}" alt="${esc(sec.name)}" />
        <div class="pn-champMeta">
          <div class="pn-champName">${esc(sec.name)}</div>
          ${sec.quote ? `<div class="pn-champQuote">“${miniMD(sec.quote)}”</div>` : ""}
        </div>
      </div>
      ${blocks}
    </section>
  `;
}

async function loadPatch(){
  const version = getParam("v") || "2.1.0";
  const res = await fetch(`../assets/data/patch-${encodeURIComponent(version)}.json`);
  if (!res.ok){
    qs("#patchSections").innerHTML = `
      <section class="pn-panel">
        <h2 class="pn-h2">No se encontró el parche ${esc(version)}</h2>
        <div class="pn-muted">Revisa que exista data/patch-${esc(version)}.json</div>
      </section>
    `;
    return;
  }

  const patch = await res.json();
  document.title = `Patch ${patch.version} | Patch Notes`;

  qs("#patchVersion").textContent = `Patch ${patch.version}`;
  qs("#patchTitle").textContent = patch.title ?? "";

  // Intro
  const introHTML = (patch.intro ?? []).map(p => `<p class="pn-p">${miniMD(p)}</p>`).join("");
  qs("#patchIntro").innerHTML = `
    <h2 class="pn-h2">Resumen</h2>
    ${introHTML || `<div class="pn-muted">Sin resumen.</div>`}
  `;

  // Secciones
	const sectionsEl = qs("#patchSections");
	sectionsEl.innerHTML = (patch.sections ?? []).map(sec => {
		const t = String(sec.type || "").toLowerCase();

		if (t === "system") return renderSystemSection(sec);

		// Acepta Miscrit / miscrit / MISCRIT
		if (t === "miscrit") return renderMiscritSection(sec);

		// Acepta reliquia / reliquias / relic / relics
		if (t === "relic" || t === "relics" || t === "reliquia" || t === "reliquias") {
			return renderRelicSection(sec);
		}

		return `
			<section class="pn-panel">
				<h2 class="pn-h2">${esc(sec.title ?? "Sección")}</h2>
				<div class="pn-muted">Tipo de sección no soportado: ${esc(sec.type)}</div>
			</section>
		`;
	}).join("");
}

loadPatch();
