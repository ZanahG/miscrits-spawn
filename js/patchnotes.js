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
    const changes = (b.changes ?? [])
      .map(c => renderDiffRow(c.label, c.from, c.to))
      .join("");

    const iconSrc = b.icon
      ? b.icon
      : getRelicIconPath(b.spell ?? b.title ?? sec.name);

    return `
      <div class="pn-spellBlock">
        <div class="pn-spellHead">
          <img
            class="pn-spellIcon"
            src="${esc(iconSrc)}"
            alt="${esc(b.spell ?? b.title ?? sec.name)}"
            onerror="this.onerror=null;this.src='../assets/images/relics/_placeholder.png';"
          />
          <div class="pn-spellTitle">${esc(b.spell ?? b.title ?? "Changes")}</div>
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
          src="${esc(getRelicIconPath(sec.name))}"
          alt="${esc(sec.name)}"
          onerror="this.onerror=null;this.src='../assets/images/relics/_placeholder.png';"
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

async function renderPatchVisual(patch){
  if (!patch.visual) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 900;

  const ctx = canvas.getContext("2d");

  function drawTriangleDown(x, y, size, color){
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x + size/2, y + size);
    ctx.closePath();
    ctx.fill();
  }

  function drawTriangleUp(x, y, size, color){
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + size/2, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x + size, y + size);
    ctx.closePath();
    ctx.fill();
  }


  ctx.fillStyle = "#191919";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const bg = new Image();
  bg.src = "../assets/images/ui/patch-template.png";
  await bg.decode();

  ctx.globalAlpha = 0.25;
  ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 1;

  ctx.fillStyle = "#fff";
  ctx.font = "bold 64px system-ui";
  ctx.fillText("PATCH NOTES", 80, 130);

  ctx.font = "bold 120px system-ui";
  ctx.fillText(patch.version, 550, 130);

  const logo = new Image();
  logo.src = "../assets/images/logo.png";
  await logo.decode();

  const logoHeight = 300;
  const logoWidth = (logo.width / logo.height) * logoHeight;
  const logoX = 1180;
  const logoY = -40;

  ctx.drawImage(logo, logoX, logoY, logoWidth, logoHeight);


  ctx.font = "bold 40px system-ui";
  drawTriangleDown(80, 305, 22, "#ff3b3b");
  ctx.fillStyle = "#fff";
  ctx.fillText("NERF", 110, 332);
  drawTriangleUp(80, 573, 22, "#34ff2e");
  ctx.fillStyle = "#fff";
  ctx.fillText("BUFF", 110, 600);
  ctx.fillText("RELICS", 1050, 340);

  async function drawIcons(list, startX, startY, isMiscrit = true){
    const ICON = 72;
    const GAP  = 12;
    const PER_ROW = 8;

    let x = startX;
    let y = startY;

    for (let i = 0; i < (list?.length ?? 0); i++){
      const item = list[i];

      const img = new Image();
      img.src = isMiscrit ? getMiscritAvatarPath(item) : getRelicIconPath(item);

      try { await img.decode(); } catch { }

      ctx.drawImage(img, x, y, ICON, ICON);

      const isRowEnd = (i + 1) % PER_ROW === 0;
      if (isRowEnd){
        x = startX;
        y += ICON + GAP;
      } else {
        x += ICON + GAP;
      }
    }
  }

  await drawIcons(patch.visual.nerf ?? [], 80, 380, true);
  await drawIcons(patch.visual.buff ?? [], 80, 650, true);
  await drawIcons(patch.visual.relics ?? [], 1050, 380, false);

  return canvas.toDataURL("image/png");
}

function slugifyRelicName(name){
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getRelicIconPath(name){
  const slug = slugifyRelicName(name);
  return `../assets/images/relics/${slug}.png`;
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
  const visualDataURL = await renderPatchVisual(patch);

  qs("#patchIntro").innerHTML = `
    <h2 class="pn-h2">Summary</h2>
    ${
      visualDataURL
        ? `<img class="pn-patchAutoVisual" src="${visualDataURL}" alt="Patch summary" />`
        : `<div class="pn-muted">No visual summary available.</div>`
    }
  `;

  // Secciones
	const sectionsEl = qs("#patchSections");
	sectionsEl.innerHTML = (patch.sections ?? []).map(sec => {
		const t = String(sec.type || "").toLowerCase();

		if (t === "system") return renderSystemSection(sec);

		if (t === "miscrit") return renderMiscritSection(sec);

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
