(() => {
  /* =========================================================
     CONFIG
  ========================================================= */
  const DATA_URL = "../assets/data/base_stats.json";

  const AVATAR_FOLDER = "../assets/images/miscrits_avatar/";
  const AVATAR_FALLBACK = `${AVATAR_FOLDER}preset_avatar.png`;

  const RELICS_URL = "../assets/data/relics.json";
  const RELIC_IMG_FOLDER = "../assets/images/relics/";
  const RELIC_PLACEHOLDER = `${RELIC_IMG_FOLDER}molten_coin.png`;

  const SLOT_LEVELS = [10, 20, 30, 35];

  const $id = (id) => document.getElementById(id);
  const $q = (sel) => document.querySelector(sel);
  const $qa = (sel) => Array.from(document.querySelectorAll(sel));

  const ui = {
    // picker
    guess: $id("sc-guess"),
    dropdown: $id("scDropdown"),

    // level/buttons
    level: $id("levelInput"),
    calc: $id("calcBtn"),
    reset: $id("resetBtn"),

    // presets
    presetRedSpeed: $id("presetRedSpeed"),
    presetAllGreen: $id("presetAllGreen"),

    // header
    title: $id("title"),
    subtitle: $id("subtitle"),
    avatar: $id("avatarImg"),
    err: $id("err"),

    // outputs
    out: {
      hp: $id("outHp"),
      spd: $id("outSpd"),
      ea: $id("outEa"),
      pa: $id("outPa"),
      ed: $id("outEd"),
      pd: $id("outPd"),
    },

    // color selects
    colors: {
      hp: $id("cHp"),
      spd: $id("cSpd"),
      ea: $id("cEa"),
      pa: $id("cPa"),
      ed: $id("cEd"),
      pd: $id("cPd"),
    },

    // bonus x level
    bonus: {
      title: $id("bonusTitle"),
      regen: $id("regenBonusBtn"),
      applyBtn: $id("applyBonusBtn"),
      inputs: {
        hp: $id("bHp"),
        spd: $id("bSpd"),
        ea: $id("bEa"),
        pa: $id("bPa"),
        ed: $id("bEd"),
        pd: $id("bPd"),
      },
    },

    // bonus x platinum
    plat: {
      title: $id("platBonusTitle"),
      regen: $id("regenPlatBonusBtn"),
      applyBtn: $id("applyPlatBonusBtn"),
      inputs: {
        hp: $id("pHp"),
        spd: $id("pSpd"),
        ea: $id("pEa"),
        pa: $id("pPa"),
        ed: $id("pEd"),
        pd: $id("pPd"),
      },
    },

    // relic modal
    relicModal: $id("relicModal"),
    relicTitle: $id("relicModalTitle"),
    relicGrid: $id("relicGrid"),
    relicSearch: $id("relicSearch"),
  };

  /* =========================================================
     STATE
  ========================================================= */
  let MISCRITS = [];
  let selected = null;

  let applyBonus = false;
  let applyPlat = false;

  // Relics (single system)
  let RELICS = [];
  let RELIC_BY_NAME = new Map(); // name -> {name, level, icon, stats}

  // Optional: if you later add a button with id="applyRelicsBtn"
  let applyRelics = true; // default ON (since your UI no tiene toggle)
  const applyRelicsBtn = $id("applyRelicsBtn");

  const BONUS_KEYS = ["hp", "spd", "ea", "pa", "ed", "pd"];

  const STAT_KEY_MAP = { hp: "HP", spd: "SPD", ea: "EA", pa: "PA", ed: "ED", pd: "PD" };

  /* =========================================================
     UTILS
  ========================================================= */
  function normalize(s) {
    return (s ?? "").toString().trim().toLowerCase();
  }

  function setError(msg) {
    if (ui.err) ui.err.textContent = msg || "";
  }

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, Math.trunc(x)));
  }

  function toInt(x) {
    const n = Number(x);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }

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

  function setAvatar(name) {
    if (!ui.avatar) return;
    ui.avatar.src = avatarSrcFromName(name);
    ui.avatar.alt = name || "";
    ui.avatar.onerror = () => {
      ui.avatar.onerror = null;
      ui.avatar.src = AVATAR_FALLBACK;
    };
  }

  function clearOutputs() {
    if (ui.title) ui.title.textContent = "—";
    if (ui.subtitle) ui.subtitle.textContent = "—";
    Object.values(ui.out).forEach((el) => el && (el.textContent = "—"));
    setAvatar(null);
  }

  function colorFactor(color) {
    const c = normalize(color);
    if (c === "red") return 1;
    if (c === "white") return 2;
    return 3;
  }

  function getSelectedColors() {
    return {
      hp: ui.colors.hp?.value || "white",
      spd: ui.colors.spd?.value || "white",
      ea: ui.colors.ea?.value || "white",
      pa: ui.colors.pa?.value || "white",
      ed: ui.colors.ed?.value || "white",
      pd: ui.colors.pd?.value || "white",
    };
  }

  function statAtLevel(baseStat15, level, color, isHp) {
    const C = colorFactor(color);
    const L = level;

    if (isHp) {
      const perLevel = (12 + 2 * baseStat15 + 1.5 * C) / 5;
      return Math.floor(perLevel * L + 10);
    } else {
      const perLevel = (3 + 2 * baseStat15 + 1.5 * C) / 6;
      return Math.floor(perLevel * L + 5);
    }
  }

  function totalBonusPoints(level) {
    return Math.max(0, 3 * (level - 1));
  }

  function totalPlatBonusPoints(level) {
    return Math.max(0, level);
  }

  function sumInputs(group) {
    const n = (el) => {
      const x = Number(el?.value);
      return Number.isFinite(x) ? Math.max(0, Math.trunc(x)) : 0;
    };
    return {
      hp: n(group.hp),
      spd: n(group.spd),
      ea: n(group.ea),
      pa: n(group.pa),
      ed: n(group.ed),
      pd: n(group.pd),
    };
  }

  function randInt(max) {
    return Math.floor(Math.random() * max);
  }

  function randomDistribution(totalPts) {
    const t = { hp: 0, spd: 0, ea: 0, pa: 0, ed: 0, pd: 0 };
    for (let i = 0; i < totalPts; i++) {
      const k = BONUS_KEYS[randInt(BONUS_KEYS.length)];
      t[k] += 1;
    }
    return t;
  }

  function writeInputs(group, totals) {
    if (!group) return;
    if (group.hp) group.hp.value = String(totals.hp ?? 0);
    if (group.spd) group.spd.value = String(totals.spd ?? 0);
    if (group.ea) group.ea.value = String(totals.ea ?? 0);
    if (group.pa) group.pa.value = String(totals.pa ?? 0);
    if (group.ed) group.ed.value = String(totals.ed ?? 0);
    if (group.pd) group.pd.value = String(totals.pd ?? 0);
  }

  function updateBonusTitles(level) {
    const b = totalBonusPoints(level);
    const p = totalPlatBonusPoints(level);
    if (ui.bonus.title) ui.bonus.title.textContent = `BONUS X LEVEL (${b} PTS)`;
    if (ui.plat.title) ui.plat.title.textContent = `BONUS X PLATINUM (${p} PTS)`;
  }

  function syncApplyButtons() {
    if (ui.bonus.applyBtn) ui.bonus.applyBtn.classList.toggle("is-active", applyBonus);
    if (ui.plat.applyBtn) ui.plat.applyBtn.classList.toggle("is-active", applyPlat);
    if (applyRelicsBtn) applyRelicsBtn.classList.toggle("is-active", applyRelics);
  }

  /* =========================================================
     COLOR ROW UI
  ========================================================= */
  function setRowColorFromSelect(selectEl) {
    const row = selectEl?.closest?.(".scrow");
    if (!row) return;
    row.dataset.color = normalize(selectEl.value || "white");
  }

  function syncColorRowsFromSelects() {
    ["cHp", "cSpd", "cEa", "cPa", "cEd", "cPd"].forEach((id) => {
      const sel = $id(id);
      if (sel) setRowColorFromSelect(sel);
    });
  }

  function initColorSelects() {
    const ids = ["cHp", "cSpd", "cEa", "cPa", "cEd", "cPd"];
    ids
      .map($id)
      .filter(Boolean)
      .forEach((sel) => {
        setRowColorFromSelect(sel);
        sel.addEventListener("change", () => {
          setRowColorFromSelect(sel);
          render();
        });
      });
  }

  function setAllColors(val) {
    Object.values(ui.colors).forEach((sel) => {
      if (!sel) return;
      sel.value = val;
      setRowColorFromSelect(sel);
    });
  }

  function presetAllGreen() {
    setAllColors("green");
    render();
  }

  function presetRedSpeed() {
    setAllColors("green");
    if (ui.colors.spd) {
      ui.colors.spd.value = "red";
      setRowColorFromSelect(ui.colors.spd);
    }
    render();
  }

  function resetColors() {
    setAllColors("white");
    render();
  }

  /* =========================================================
     DROPDOWN PICKER
  ========================================================= */
  function renderDropdown(matches) {
    const dd = ui.dropdown;
    if (!dd) return;

    if (!matches.length) {
      dd.hidden = true;
      dd.innerHTML = "";
      return;
    }

    dd.hidden = false;
    dd.innerHTML = matches
      .map(
        (m) => `
        <button type="button" class="miscritpicker__item" data-id="${m.id}">
          <img class="miscritpicker__avatar" src="${avatarSrcFromName(m.name)}" alt="">
          <div class="miscritpicker__name">${m.name}</div>
        </button>
      `
      )
      .join("");

    dd.querySelectorAll(".miscritpicker__item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const m = MISCRITS.find((x) => String(x.id) === String(id));
        if (!m) return;

        selected = m;
        if (ui.guess) ui.guess.value = m.name;
        dd.hidden = true;

        setAvatar(m.name);
        render();
      });
    });
  }

  function bindPicker() {
    const input = ui.guess;
    const dd = ui.dropdown;
    if (!input || !dd) return;

    const close = () => (dd.hidden = true);

    const open = () => {
      const q = normalize(input.value);
      const matches = MISCRITS.filter((m) => !q || normalize(m.name).includes(q)).slice(0, 60);
      renderDropdown(matches);
    };

    input.addEventListener("focus", open);
    input.addEventListener("input", open);

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();

      if (e.key === "Enter") {
        const exact = MISCRITS.find((m) => normalize(m.name) === normalize(input.value));
        if (exact) {
          selected = exact;
          dd.hidden = true;
          setAvatar(exact.name);
          render();
          return;
        }

        const first = dd.querySelector(".miscritpicker__item");
        if (first) {
          e.preventDefault();
          first.click();
        }
      }
    });

    document.addEventListener("click", (e) => {
      const host = input.closest(".miscritpicker");
      if (!host) return;
      if (!host.contains(e.target)) close();
    });
  }

  /* =========================================================
     RELICS (SINGLE SYSTEM: .scRelic + .relic-slot + modal)
  ========================================================= */
  function normalizeRelicsForStatsCalc(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((r) => ({
        name: (r.name ?? "").toString().trim(),
        level: Number(r.level) || 0,
        icon: (r.icon ?? "").toString().trim(),
        stats: r.stats ?? {},
      }))
      .filter((r) => r.name && r.level);
  }

  function getSlotLevel(slot) {
    const s = Math.max(0, Math.min(3, Number(slot) || 0));
    return SLOT_LEVELS[s] ?? 35;
  }

  function relicIconSrc(r) {
    if (!r) return RELIC_PLACEHOLDER;
    const file = r.icon ? String(r.icon) : "";
    return file ? `${RELIC_IMG_FOLDER}${file}` : RELIC_PLACEHOLDER;
  }

  function relicBonusText(r) {
    const s = r?.stats || {};
    const parts = [];
    if (Number(s.HP)) parts.push(`+${Number(s.HP)} HP`);
    if (Number(s.SPD)) parts.push(`+${Number(s.SPD)} SPD`);
    if (Number(s.PA)) parts.push(`+${Number(s.PA)} PA`);
    if (Number(s.EA)) parts.push(`+${Number(s.EA)} EA`);
    if (Number(s.PD)) parts.push(`+${Number(s.PD)} PD`);
    if (Number(s.ED)) parts.push(`+${Number(s.ED)} ED`);
    return parts.join(" • ");
  }

  function getScRelicSelect(slot) {
    return document.querySelector(`.scRelic[data-slot="${slot}"]`);
  }

  function populateScRelicSelects() {
    const all = document.querySelectorAll(".scRelic");
    if (!all.length) return;

    const sorted = RELICS
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

    const html = [`<option value=""></option>`, ...sorted.map((r) => `<option value="${r.name}">${r.name}</option>`)].join(
      ""
    );

    all.forEach((sel) => {
      sel.innerHTML = html;
      if (!sel.value) sel.value = "";
    });
  }

  function setSlotButtonUI(slot) {
    const btn = document.querySelector(`.relic-slot[data-slot="${slot}"]`);
    if (!btn) return;

    const sel = getScRelicSelect(slot);
    const name = (sel?.value ?? "").toString().trim();
    const r = name ? RELIC_BY_NAME.get(name) : null;

    const img = r ? relicIconSrc(r) : RELIC_PLACEHOLDER;

    btn.dataset.relicName = name || "";
    btn.dataset.relicLevel = String(getSlotLevel(slot));

    btn.style.backgroundImage = `url("${img}")`;
    btn.style.backgroundRepeat = "no-repeat";
    btn.style.backgroundPosition = "center";
    btn.style.backgroundSize = "70% 70%";

    btn.title = name ? `${name} (lvl ${getSlotLevel(slot)})` : `Empty (lvl ${getSlotLevel(slot)})`;
    btn.setAttribute("aria-label", btn.title);
  }

  function refreshAllScRelicSlots() {
    for (let i = 0; i < 4; i++) setSlotButtonUI(i);
  }

  let RELIC_PICK_SLOT = null;

  function openRelicModalForStats(slot) {
    RELIC_PICK_SLOT = slot;

    const modal = ui.relicModal;
    const title = ui.relicTitle;
    const grid = ui.relicGrid;
    const search = ui.relicSearch;

    if (!modal || !title || !grid || !search) return;

    const lvl = getSlotLevel(slot);
    title.textContent = `Relics lvl ${lvl}`;

    search.value = "";

    const renderGrid = (q) => {
      const qq = normalize(q);
      grid.innerHTML = "";

      const items = RELICS
        .filter((r) => Number(r.level) === Number(lvl))
        .filter((r) => !qq || normalize(r.name).includes(qq))
        .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

      // Empty option
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
        const sel = getScRelicSelect(slot);
        if (sel) sel.value = "";
        refreshAllScRelicSlots();
        closeRelicModal();
        render();
      });
      grid.appendChild(empty);

      // Relics
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
          const sel = getScRelicSelect(slot);
          if (sel) sel.value = r.name;
          refreshAllScRelicSlots();
          closeRelicModal();
          render();
        });
        grid.appendChild(el);
      }
    };

    renderGrid("");
    search.oninput = () => renderGrid(search.value);

    modal.hidden = false;
  }

  function closeRelicModal() {
    const modal = ui.relicModal;
    if (modal) modal.hidden = true;
    RELIC_PICK_SLOT = null;
  }

  function bindScRelicSlots() {
    // ABRIR MODAL: delegación
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".relic-slot");
      if (!btn) return;

      const slot = Number(btn.getAttribute("data-slot") || 0);
      openRelicModalForStats(slot);
    });

    // CERRAR MODAL
    document.addEventListener("click", (e) => {
      if (e.target.closest('[data-action="close-relic"]')) closeRelicModal();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeRelicModal();
    });

    // Sync por si cambia el select hidden
    document.querySelectorAll(".scRelic").forEach((sel) => {
      sel.addEventListener("change", () => {
        refreshAllScRelicSlots();
        render();
      });
    });
  }


  function sumRelicsStats() {
    const totals = { hp: 0, spd: 0, ea: 0, pa: 0, ed: 0, pd: 0 };

    for (let slot = 0; slot < 4; slot++) {
      const sel = getScRelicSelect(slot);
      const name = (sel?.value ?? "").toString().trim();
      if (!name) continue;

      const r = RELIC_BY_NAME.get(name);
      if (!r) continue;

      // only if level matches this slot
      const lvl = getSlotLevel(slot);
      if (Number(r.level) !== Number(lvl)) continue;

      const st = r.stats || {};
      totals.hp += Number(st.HP || 0);
      totals.spd += Number(st.SPD || 0);
      totals.ea += Number(st.EA || 0);
      totals.pa += Number(st.PA || 0);
      totals.ed += Number(st.ED || 0);
      totals.pd += Number(st.PD || 0);
    }

    return totals;
  }

  /* =========================================================
     MAIN RENDER
  ========================================================= */
  function render() {
    setError("");

    const level = clampInt(ui.level?.value, 1, 35);
    if (ui.level) ui.level.value = String(level);

    updateBonusTitles(level);
    syncApplyButtons();

    if (!selected) {
      clearOutputs();
      return;
    }

    const t = selected.baseStats;
    if (!t) {
      setError("Miscrit sin baseStats.");
      clearOutputs();
      return;
    }

    const c = getSelectedColors();

    let s = {
      hp: statAtLevel(t.hp, level, c.hp, true),
      spd: statAtLevel(t.spd, level, c.spd, false),
      ea: statAtLevel(t.ea, level, c.ea, false),
      pa: statAtLevel(t.pa, level, c.pa, false),
      ed: statAtLevel(t.ed, level, c.ed, false),
      pd: statAtLevel(t.pd, level, c.pd, false),
    };

    const manualLevelBonus = sumInputs(ui.bonus.inputs);
    const manualPlatBonus = sumInputs(ui.plat.inputs);

    if (applyBonus) {
      s.hp += manualLevelBonus.hp;
      s.spd += manualLevelBonus.spd;
      s.ea += manualLevelBonus.ea;
      s.pa += manualLevelBonus.pa;
      s.ed += manualLevelBonus.ed;
      s.pd += manualLevelBonus.pd;
    }

    if (applyPlat) {
      s.hp += manualPlatBonus.hp;
      s.spd += manualPlatBonus.spd;
      s.ea += manualPlatBonus.ea;
      s.pa += manualPlatBonus.pa;
      s.ed += manualPlatBonus.ed;
      s.pd += manualPlatBonus.pd;
    }

    if (applyRelics) {
      const rAdd = sumRelicsStats();
      s.hp += rAdd.hp;
      s.spd += rAdd.spd;
      s.ea += rAdd.ea;
      s.pa += rAdd.pa;
      s.ed += rAdd.ed;
      s.pd += rAdd.pd;
    }

    if (ui.title) ui.title.textContent = `${selected.name} — Nivel ${level}`;
    if (ui.subtitle) {
      ui.subtitle.textContent =
        `${selected.rarity} • ${selected.type}` +
        ` • BONUS:${applyBonus ? "ON" : "OFF"}` +
        ` • PLAT:${applyPlat ? "ON" : "OFF"}` +
        ` • RELICS:${applyRelics ? "ON" : "OFF"}`;
    }

    if (ui.out.hp) ui.out.hp.textContent = String(s.hp);
    if (ui.out.spd) ui.out.spd.textContent = String(s.spd);
    if (ui.out.ea) ui.out.ea.textContent = String(s.ea);
    if (ui.out.pa) ui.out.pa.textContent = String(s.pa);
    if (ui.out.ed) ui.out.ed.textContent = String(s.ed);
    if (ui.out.pd) ui.out.pd.textContent = String(s.pd);

    setAvatar(selected.name);
    syncColorRowsFromSelects();
  }

  /* =========================================================
     INIT
  ========================================================= */
  async function init() {
    try {
      setError("");

      // defaults
      setAllColors("white");

      // Load base stats
      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`No pude cargar ${DATA_URL} (HTTP ${res.status}).`);

      const data = await res.json();
      if (!data || !Array.isArray(data.miscrits)) {
        throw new Error("base_stats.json no tiene la estructura esperada: { miscrits: [...] }");
      }

      MISCRITS = data.miscrits
        .filter((m) => m && m.name && m.baseStats)
        .slice()
        .sort((a, b) => (a.name ?? "").localeCompare((b.name ?? ""), "en", { sensitivity: "base" }));

      if (!MISCRITS.length) throw new Error("No hay miscrits válidos en base_stats.json");

      // Load relics (single load)
      try {
        const relicRes = await fetch(RELICS_URL, { cache: "no-store" });
        if (!relicRes.ok) throw new Error(`No pude cargar ${RELICS_URL} (HTTP ${relicRes.status}).`);
        const relicRaw = await relicRes.json();

        RELICS = normalizeRelicsForStatsCalc(relicRaw);
        RELIC_BY_NAME = new Map(RELICS.map((r) => [r.name, r]));

        populateScRelicSelects();
        bindScRelicSlots();
        refreshAllScRelicSlots();
      } catch (e) {
        console.warn("Relics load failed:", e);
      }

      // bind UI
      bindPicker();
      initColorSelects();

      // pick default
      selected = MISCRITS.find((m) => normalize(m.name) === "flue") || MISCRITS[0];
      if (ui.guess) ui.guess.value = selected.name;
      setAvatar(selected.name);

      // seed random bonus
      const lvl = clampInt(ui.level?.value, 1, 35);
      if (ui.bonus.inputs.hp) writeInputs(ui.bonus.inputs, randomDistribution(totalBonusPoints(lvl)));
      if (ui.plat.inputs.hp) writeInputs(ui.plat.inputs, randomDistribution(totalPlatBonusPoints(lvl)));

      render();
    } catch (e) {
      console.error(e);
      clearOutputs();
      setError(e.message || String(e));
    }
  }

  /* =========================================================
     EVENTS
  ========================================================= */
  ui.calc?.addEventListener("click", render);
  ui.reset?.addEventListener("click", resetColors);

  ui.level?.addEventListener("input", () => {
    const level = clampInt(ui.level.value, 1, 35);
    ui.level.value = String(level);
    updateBonusTitles(level);
    render();
  });

  ui.presetAllGreen?.addEventListener("click", presetAllGreen);
  ui.presetRedSpeed?.addEventListener("click", presetRedSpeed);

  ui.bonus.applyBtn?.addEventListener("click", () => {
    applyBonus = !applyBonus;
    syncApplyButtons();
    render();
  });

  ui.plat.applyBtn?.addEventListener("click", () => {
    applyPlat = !applyPlat;
    syncApplyButtons();
    render();
  });

  ui.bonus.regen?.addEventListener("click", () => {
    const level = clampInt(ui.level.value, 1, 35);
    writeInputs(ui.bonus.inputs, randomDistribution(totalBonusPoints(level)));
    render();
  });

  ui.plat.regen?.addEventListener("click", () => {
    const level = clampInt(ui.level.value, 1, 35);
    writeInputs(ui.plat.inputs, randomDistribution(totalPlatBonusPoints(level)));
    render();
  });

  // Optional relic toggle if you add this button in HTML:
  // <button id="applyRelicsBtn" ...>APPLY RELICS</button>
  applyRelicsBtn?.addEventListener("click", () => {
    applyRelics = !applyRelics;
    syncApplyButtons();
    render();
  });

  Object.values(ui.bonus.inputs).forEach((inp) => inp?.addEventListener("input", render));
  Object.values(ui.plat.inputs).forEach((inp) => inp?.addEventListener("input", render));

  init();
})();
