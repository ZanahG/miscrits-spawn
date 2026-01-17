(() => {
  const DATA_URL = "../assets/data/base_stats.json";

  const AVATAR_FOLDER = "../assets/images/miscrits_avatar/";
  const AVATAR_FALLBACK = `${AVATAR_FOLDER}preset_avatar.png`;

  const $ = (id) => document.getElementById(id);

  const ui = {
    guess: $("sc-guess"),
    dropdown: $("scDropdown"),

    level: $("levelInput"),
    calc: $("calcBtn"),
    reset: $("resetBtn"),

    presetRedSpeed: $("presetRedSpeed"),
    presetAllGreen: $("presetAllGreen"),

    title: $("title"),
    subtitle: $("subtitle"),
    avatar: $("avatarImg"),
    err: $("err"),
    out: {
      hp: $("outHp"),
      spd: $("outSpd"),
      ea: $("outEa"),
      pa: $("outPa"),
      ed: $("outEd"),
      pd: $("outPd"),
    },

    colors: {
      hp: $("cHp"),
      spd: $("cSpd"),
      ea: $("cEa"),
      pa: $("cPa"),
      ed: $("cEd"),
      pd: $("cPd"),
    },

    bonus: {
      title: $("bonusTitle"),
      regen: $("regenBonusBtn"),
      applyBtn: $("applyBonusBtn"),
      inputs: {
        hp: $("bHp"),
        spd: $("bSpd"),
        ea: $("bEa"),
        pa: $("bPa"),
        ed: $("bEd"),
        pd: $("bPd"),
      },
    },

    plat: {
      title: $("platBonusTitle"),
      regen: $("regenPlatBonusBtn"),
      applyBtn: $("applyPlatBonusBtn"),
      inputs: {
        hp: $("pHp"),
        spd: $("pSpd"),
        ea: $("pEa"),
        pa: $("pPa"),
        ed: $("pEd"),
        pd: $("pPd"),
      },
    },
  };

  let MISCRITS = [];
  let selected = null;
  let applyBonus = false;
  let applyPlat = false;

  const BONUS_KEYS = ["hp", "spd", "ea", "pa", "ed", "pd"];

  /* =========================
     Utils
  ========================= */
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

  function avatarSrcFromName(name) {
    if (!name) return AVATAR_FALLBACK;
    const file =
      name
        .toString()
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_") + "_avatar.png";
    return `${AVATAR_FOLDER}${file}`;
  }

  function colorFactor(color) {
    if (color === "red") return 1;
    if (color === "white") return 2;
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

  /* =========================
     Formula base
  ========================= */
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

  /* =========================
     Bonus totals
  ========================= */
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

  /* =========================
     Random distribution
  ========================= */
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
    group.hp.value = String(totals.hp ?? 0);
    group.spd.value = String(totals.spd ?? 0);
    group.ea.value = String(totals.ea ?? 0);
    group.pa.value = String(totals.pa ?? 0);
    group.ed.value = String(totals.ed ?? 0);
    group.pd.value = String(totals.pd ?? 0);
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
  }

  /* =========================
     Presets de color
  ========================= */
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

  /* =========================
     Dropdown
  ========================= */
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

    const close = () => {
      dd.hidden = true;
    };

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

  /* =========================
     Render principal
  ========================= */
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
    Object.values(ui.out).forEach((el) => {
      if (el) el.textContent = "—";
    });
    setAvatar(null);
  }

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

    if (ui.title) ui.title.textContent = `${selected.name} — Nivel ${level}`;
    if (ui.subtitle) {
      ui.subtitle.textContent =
        `${selected.rarity} • ${selected.type}` +
        ` • BONUS:${applyBonus ? "ON" : "OFF"}` +
        ` • PLAT:${applyPlat ? "ON" : "OFF"}`;
    }

    if (ui.out.hp) ui.out.hp.textContent = s.hp;
    if (ui.out.spd) ui.out.spd.textContent = s.spd;
    if (ui.out.ea) ui.out.ea.textContent = s.ea;
    if (ui.out.pa) ui.out.pa.textContent = s.pa;
    if (ui.out.ed) ui.out.ed.textContent = s.ed;
    if (ui.out.pd) ui.out.pd.textContent = s.pd;

    setAvatar(selected.name);

    syncColorRowsFromSelects();
  }

  /* =========================
     RESULT STATS color UI
  ========================= */
  function setRowColorFromSelect(selectEl) {
    const row = selectEl?.closest?.(".scrow");
    if (!row) return;
    const val = (selectEl.value || "white").toLowerCase();
    row.dataset.color = val;
  }

  function syncColorRowsFromSelects() {
    ["cHp", "cSpd", "cEa", "cPa", "cEd", "cPd"].forEach((id) => {
      const sel = document.getElementById(id);
      if (sel) setRowColorFromSelect(sel);
    });
  }

  function initColorSelects() {
    const ids = ["cHp", "cSpd", "cEa", "cPa", "cEd", "cPd"];
    const selects = ids.map((id) => document.getElementById(id)).filter(Boolean);

    selects.forEach((sel) => setRowColorFromSelect(sel));

    selects.forEach((sel) => {
      sel.addEventListener("change", () => {
        setRowColorFromSelect(sel);
        render();
      });
    });
  }

  /* =========================
     Init
  ========================= */
  async function init() {
    try {
      setError("");

      setAllColors("white");

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

      bindPicker();
      initColorSelects();

      selected = MISCRITS.find((m) => normalize(m.name) === "flue") || MISCRITS[0];
      if (ui.guess) ui.guess.value = selected.name;
      setAvatar(selected.name);

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

  /* =========================
     Events
  ========================= */
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

  Object.values(ui.bonus.inputs).forEach((inp) => {
    inp?.addEventListener("input", render);
  });
  Object.values(ui.plat.inputs).forEach((inp) => {
    inp?.addEventListener("input", render);
  });

  init();
})();
