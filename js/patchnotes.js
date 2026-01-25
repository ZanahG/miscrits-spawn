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

function isEmptyChange(v){
  const s = String(v ?? "").trim();
  return s === "" || s === "-" || s.toLowerCase() === "none" || s.toLowerCase() === "n/a";
}

function tokenizeStats(str){
  const s = String(str ?? "");
  const re = /(\d+\/\d+|\d+(?:\.\d+)?%|\d+(?:\.\d+)?)/g;
  const out = [];
  let m;
  while ((m = re.exec(s)) !== null){
    out.push({ token: m[0], index: m.index, length: m[0].length });
  }
  return out;
}

function statValue(token){
  if (!token) return null;
  const frac = token.match(/^(\d+)\/(\d+)$/);
  if (frac){
    const a = Number(frac[1]);
    const b = Number(frac[2]);
    if (!b) return null;
    return a / b;
  }
  const num = token.replace("%", "");
  const v = Number(num);
  return Number.isFinite(v) ? v : null;
}

function wrapChangedToken(token, cls){
  return `<span class="pn-num pn-num--${cls}">${token}</span>`;
}

function diffHighlight(from, to){
  const fromStr = String(from ?? "");
  const toStr   = String(to ?? "");

  const fromTokens = tokenizeStats(fromStr).map(t => t.token);

  if (isEmptyChange(fromStr) && !isEmptyChange(toStr)){
    const toHTML = esc(toStr).replace(/(\d+\/\d+|\d+(?:\.\d+)?%|\d+(?:\.\d+)?)/g, (m) => wrapChangedToken(m, "new"));
    return { fromHTML: "", toHTML, rowKind: "new" };
  }

  let out = "";
  let last = 0;

  const toSpans = tokenizeStats(toStr);
  let anyUp = false, anyDown = false;

  for (let i = 0; i < toSpans.length; i++){
    const span = toSpans[i];
    const tokTo = span.token;
    const tokFrom = fromTokens[i] ?? null;

    out += esc(toStr.slice(last, span.index));

    if (tokFrom === tokTo){
      out += esc(tokTo);
    } else {
      const a = statValue(tokFrom);
      const b = statValue(tokTo);

      let cls = "new";
      if (a != null && b != null){
        if (b > a) { cls = "up"; anyUp = true; }
        else if (b < a) { cls = "down"; anyDown = true; }
        else cls = "neutral";
      }

      out += wrapChangedToken(tokTo, cls);
    }

    last = span.index + span.length;
  }

  out += esc(toStr.slice(last));

  const rowKind = anyUp && !anyDown ? "up" : (!anyUp && anyDown ? "down" : "neutral");
  return { fromHTML: esc(fromStr), toHTML: out, rowKind };
}

function renderDiffRow(label, from, to){
  const { fromHTML, toHTML, rowKind } = diffHighlight(from, to);

  return `
    <div class="pn-diffRow pn-diffRow--${rowKind}">
      <div class="pn-diffDot"></div>
      <div class="pn-diffText">
        <span class="pn-diffLabel">${esc(label)}</span>:
        ${fromHTML ? `<span class="pn-diffFrom">${fromHTML}</span>` : ``}
        ${(fromHTML && toHTML) ? `<span class="pn-diffArrow">⇒</span>` : ``}
        ${toHTML ? `<span class="pn-diffTo">${toHTML}</span>` : ``}
      </div>
    </div>
  `;
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
