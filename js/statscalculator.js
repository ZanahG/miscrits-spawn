(() => {
  const DATA_URL = "../assets/data/base_stats.json";
  const AVATAR_FOLDER = "../assets/images/miscrits_avatar/";
  const AVATAR_FALLBACK = `${AVATAR_FOLDER}preset_avatar.png`;

  const $ = (id) => document.getElementById(id);

  const ui = {
    guess: $("sc-guess"),
    dropdown: $("scDropdown"),
    selectHidden: $("miscritSelect"),

    level: $("levelInput"),
    btn: $("calcBtn"),
    reset: $("resetBtn"),

    title: $("title"),
    subtitle: $("subtitle"),
    avatar: $("avatarImg"),
    err: $("err"),

    colors: {
      hp: $("cHp"),
      spd: $("cSpd"),
      ea: $("cEa"),
      pa: $("cPa"),
      ed: $("cEd"),
      pd: $("cPd"),
    },
    out: {
      hp: $("outHp"),
      spd: $("outSpd"),
      ea: $("outEa"),
      pa: $("outPa"),
      ed: $("outEd"),
      pd: $("outPd"),
    },

    bonus: {
      apply: $("applyBonus"),
      regen: $("regenBonusBtn"),
      title: $("bonusTitle"),
      totals: {
        hp: $("bHp"),
        spd: $("bSpd"),
        ea: $("bEa"),
        pa: $("bPa"),
        ed: $("bEd"),
        pd: $("bPd"),
      }
    },

    plat: {
      apply: $("applyPlatBonus"),
      regen: $("regenPlatBonusBtn"),
      title: $("platBonusTitle"),
      totals: {
        hp: $("pHp"),
        spd: $("pSpd"),
        ea: $("pEa"),
        pa: $("pPa"),
        ed: $("pEd"),
        pd: $("pPd"),
      }
    }
  };

  let MISCRITS = [];

  /* ===============================
     Helpers
  =============================== */
  function setError(msg) {
    if (ui.err) ui.err.textContent = msg || "";
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

  function normalize(s) {
    return (s ?? "").toString().trim().toLowerCase();
  }

  function clampInt(n, min, max) {
    const x = Number(n);
    if (!Number.isFinite(x)) return min;
    return Math.min(max, Math.max(min, Math.trunc(x)));
  }

  function avatarSrc(m) {
    const file = (m?.avatar ?? "").toString().trim();
    return file ? `${AVATAR_FOLDER}${file}` : AVATAR_FALLBACK;
  }

  function applySelectDataVal() {
    Object.values(ui.colors).forEach((sel) => {
      if (!sel) return;
      sel.dataset.val = sel.value;
    });
  }

  function colorFactor(color) {
    if (color === "red") return 1;
    if (color === "white") return 2;
    return 3;
  }

  function getSelectedColors() {
    return {
      hp: ui.colors.hp.value,
      spd: ui.colors.spd.value,
      ea: ui.colors.ea.value,
      pa: ui.colors.pa.value,
      ed: ui.colors.ed.value,
      pd: ui.colors.pd.value,
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

  function readTotalsInputs(group) {
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

  function writeTotalsInputs(group, t) {
    group.hp.value  = String(t.hp ?? 0);
    group.spd.value = String(t.spd ?? 0);
    group.ea.value  = String(t.ea ?? 0);
    group.pa.value  = String(t.pa ?? 0);
    group.ed.value  = String(t.ed ?? 0);
    group.pd.value  = String(t.pd ?? 0);
  }

  /* ===============================
     Bonus: natural
  =============================== */
  const BONUS_KEYS = ["hp", "spd", "ea", "pa", "ed", "pd"];
  const BONUS_POINTS_PER_LEVEL = 3;

  function totalBonusPoints(level) {
    return Math.max(0, BONUS_POINTS_PER_LEVEL * (level - 1));
  }

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6D2B79F5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function bonusSeedKey(miscritId, level) {
    return `sc_bonus_seed_${miscritId}_L${level}_v3`;
  }

  function getOrCreateSeed(miscritId, level) {
    const k = bonusSeedKey(miscritId, level);
    const raw = localStorage.getItem(k);
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;

    const seed = Math.floor(Math.random() * 2_147_483_647) + 1;
    localStorage.setItem(k, String(seed));
    return seed;
  }

  function setNewSeed(miscritId, level) {
    const k = bonusSeedKey(miscritId, level);
    const seed = Math.floor(Math.random() * 2_147_483_647) + 1;
    localStorage.setItem(k, String(seed));
    return seed;
  }

  function generateBonusTotals(level, seed) {
    const rnd = mulberry32(seed);
    const totals = { hp: 0, spd: 0, ea: 0, pa: 0, ed: 0, pd: 0 };

    for (let L = 2; L <= level; L++) {
      for (let p = 0; p < BONUS_POINTS_PER_LEVEL; p++) {
        const idx = Math.floor(rnd() * BONUS_KEYS.length);
        totals[BONUS_KEYS[idx]] += 1;
      }
    }
    return totals;
  }

  function updateBonusTitle(level) {
    if (!ui.bonus.title) return;
    ui.bonus.title.textContent = `BONUS TOTAL (${totalBonusPoints(level)} PTS)`;
  }

  /* ===============================
     Bonus: Platino 
  =============================== */
  function totalPlatPoints(level) {
    return Math.max(0, level);
  }

  function platSeedKey(miscritId, level) {
    return `sc_plat_seed_${miscritId}_L${level}_v1`;
  }

  function getOrCreatePlatSeed(miscritId, level) {
    const k = platSeedKey(miscritId, level);
    const raw = localStorage.getItem(k);
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;

    const seed = Math.floor(Math.random() * 2_147_483_647) + 1;
    localStorage.setItem(k, String(seed));
    return seed;
  }

  function setNewPlatSeed(miscritId, level) {
    const k = platSeedKey(miscritId, level);
    const seed = Math.floor(Math.random() * 2_147_483_647) + 1;
    localStorage.setItem(k, String(seed));
    return seed;
  }

  function generatePlatTotals(level, seed) {
    const rnd = mulberry32(seed);
    const totals = { hp: 0, spd: 0, ea: 0, pa: 0, ed: 0, pd: 0 };

    for (let L = 1; L <= level; L++) {
      const idx = Math.floor(rnd() * BONUS_KEYS.length);
      totals[BONUS_KEYS[idx]] += 1;
    }
    return totals;
  }

  function updatePlatTitle(level) {
    if (!ui.plat.title) return;
    ui.plat.title.textContent = `BONUS PLATINO (${totalPlatPoints(level)} PTS)`;
  }

  /* ===============================
     Picker
  =============================== */
  function findById(id) {
    return MISCRITS.find(m => String(m.id) === String(id)) || null;
  }

  function findByName(name) {
    const n = normalize(name);
    return MISCRITS.find(m => normalize(m.name) === n) || null;
  }

  function setSelectedMiscrit(m) {
    if (!m) return;

    ui.selectHidden.value = m.id;     // hidden id
    ui.guess.value = m.name;          // input visible
    ui.dropdown.hidden = true;

    // Auto recalcula al seleccionar
    renderStats();
  }

  function renderDropdown(matches) {
    const dd = ui.dropdown;
    if (!dd) return;

    if (!matches.length) {
      dd.hidden = true;
      dd.innerHTML = "";
      return;
    }

    dd.hidden = false;
    dd.innerHTML = matches.map(m => `
      <button type="button" class="miscritpicker__item" data-id="${m.id}">
        <img class="miscritpicker__avatar" src="${avatarSrcFromName(m.name)}" alt="">
        <div class="miscritpicker__name">${m.name}</div>
      </button>
    `).join("");

    dd.querySelectorAll(".miscritpicker__item").forEach(btn => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id") || "";
        const m = findById(id);
        if (m) setSelectedMiscrit(m);
      });
    });
  }

  function openPicker() {
    const q = normalize(ui.guess.value);
    const matches = MISCRITS
      .filter(m => !q || normalize(m.name).includes(q))
      .slice(0, 60);

    renderDropdown(matches);
  }

  function bindPicker() {
    if (!ui.guess || !ui.dropdown) return;

    ui.guess.addEventListener("focus", openPicker);
    ui.guess.addEventListener("input", openPicker);

    ui.guess.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        ui.dropdown.hidden = true;
      }

      if (e.key === "Enter") {
        const exact = findByName(ui.guess.value);
        if (exact) {
          setSelectedMiscrit(exact);
          return;
        }

        const first = ui.dropdown.querySelector(".miscritpicker__item");
        if (first) {
          e.preventDefault();
          first.click();
        }
      }
    });

    document.addEventListener("click", (e) => {
      const host = ui.guess.closest(".miscritpicker");
      if (!host) return;
      if (!host.contains(e.target)) ui.dropdown.hidden = true;
    });
  }

  /* ===============================
     Render main
  =============================== */
  function clearOutputs() {
    ui.title.textContent = "—";
    ui.subtitle.textContent = "White / Flat (sin bonus)";
    Object.values(ui.out).forEach((el) => (el.textContent = "—"));
    ui.avatar.src = "../assets/images/logo.png";
    ui.avatar.alt = "";

    const level = clampInt(ui.level.value, 1, 35);
    updateBonusTitle(level);
    updatePlatTitle(level);
  }

  function resetColors() {
    Object.values(ui.colors).forEach((sel) => (sel.value = "white"));
    applySelectDataVal();
    renderStats();
  }

  function renderStats() {
    setError("");

    const id = ui.selectHidden.value;
    if (!id) {
      clearOutputs();
      return;
    }

    const level = clampInt(ui.level.value, 1, 35);
    ui.level.value = String(level);

    updateBonusTitle(level);
    updatePlatTitle(level);

    const m = findById(id);
    if (!m) {
      setError("No encontré el Miscrit seleccionado.");
      clearOutputs();
      return;
    }

    const t = m.baseStats;
    const c = getSelectedColors();

    let s = {
      hp: statAtLevel(t.hp, level, c.hp, true),
      spd: statAtLevel(t.spd, level, c.spd, false),
      ea: statAtLevel(t.ea, level, c.ea, false),
      pa: statAtLevel(t.pa, level, c.pa, false),
      ed: statAtLevel(t.ed, level, c.ed, false),
      pd: statAtLevel(t.pd, level, c.pd, false),
    };

    const seedB = getOrCreateSeed(m.id, level);
    const autoBonus = generateBonusTotals(level, seedB);

    const seedP = getOrCreatePlatSeed(m.id, level);
    const autoPlat = generatePlatTotals(level, seedP);

    const manualB = readTotalsInputs(ui.bonus.totals);
    const allZeroB = Object.values(manualB).every(v => v === 0);
    if (allZeroB) writeTotalsInputs(ui.bonus.totals, autoBonus);

    const manualP = readTotalsInputs(ui.plat.totals);
    const allZeroP = Object.values(manualP).every(v => v === 0);
    if (allZeroP) writeTotalsInputs(ui.plat.totals, autoPlat);

    const applyBonus = !!ui.bonus.apply?.checked;
    const applyPlat = !!ui.plat.apply?.checked;

    if (applyBonus) {
      const b = readTotalsInputs(ui.bonus.totals);
      s.hp += b.hp; s.spd += b.spd; s.ea += b.ea; s.pa += b.pa; s.ed += b.ed; s.pd += b.pd;
    }

    if (applyPlat) {
      const p = readTotalsInputs(ui.plat.totals);
      s.hp += p.hp; s.spd += p.spd; s.ea += p.ea; s.pa += p.pa; s.ed += p.ed; s.pd += p.pd;
    }

    ui.title.textContent = `${m.name} — Nivel ${level}`;
    ui.subtitle.textContent =
      `${m.rarity} • ${m.type} • ` +
      `HP:${c.hp} SPD:${c.spd} EA:${c.ea} PA:${c.pa} ED:${c.ed} PD:${c.pd}` +
      ` • BONUS:${applyBonus ? "ON" : "OFF"} • PLAT:${applyPlat ? "ON" : "OFF"}`;

    ui.out.hp.textContent = s.hp;
    ui.out.spd.textContent = s.spd;
    ui.out.ea.textContent = s.ea;
    ui.out.pa.textContent = s.pa;
    ui.out.ed.textContent = s.ed;
    ui.out.pd.textContent = s.pd;

    ui.avatar.src = avatarSrcFromName(m.name);
    ui.avatar.alt = m.name;

    ui.avatar.onerror = () => {
      ui.avatar.onerror = null;
      ui.avatar.src = AVATAR_FALLBACK;
    };
  }

  /* ===============================
     Init
  =============================== */
  async function init() {
    try {
      setError("");

      const res = await fetch(DATA_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`No pude cargar ${DATA_URL} (HTTP ${res.status}).`);

      const data = await res.json();
      if (!data || !Array.isArray(data.miscrits)) {
        throw new Error("base_stats.json no tiene la estructura esperada: { miscrits: [...] }");
      }

      MISCRITS = data.miscrits
        .filter((m) => m && m.baseStats && m.name && m.id)
        .slice()
        .sort((a, b) => (a.name ?? "").localeCompare((b.name ?? ""), "en", { sensitivity: "base" }));

      if (!MISCRITS.length) throw new Error("No hay miscrits válidos en base_stats.json");

      bindPicker();
      applySelectDataVal();

      const flue = MISCRITS.find(m => normalize(m.name) === "flue") || MISCRITS[0];
      setSelectedMiscrit(flue);

      if (ui.bonus.apply) ui.bonus.apply.checked = false;
      if (ui.plat.apply) ui.plat.apply.checked = false;

      renderStats();
    } catch (e) {
      clearOutputs();
      setError(e.message);
      console.error(e);
    }
  }

  /* ===============================
     Events
  =============================== */
  ui.btn?.addEventListener("click", renderStats);
  ui.reset?.addEventListener("click", resetColors);

  ui.level?.addEventListener("input", () => {
    renderStats();
  });

  Object.values(ui.colors).forEach((sel) => {
    sel?.addEventListener("change", () => {
      sel.dataset.val = sel.value;
      renderStats();
    });
  });

  ui.bonus.apply?.addEventListener("change", renderStats);
  ui.plat.apply?.addEventListener("change", renderStats);

  ui.bonus.regen?.addEventListener("click", () => {
    const id = ui.selectHidden.value;
    if (!id) return;

    const level = clampInt(ui.level.value, 1, 35);
    const seed = setNewSeed(id, level);
    const totals = generateBonusTotals(level, seed);
    writeTotalsInputs(ui.bonus.totals, totals);
    renderStats();
  });

  ui.plat.regen?.addEventListener("click", () => {
    const id = ui.selectHidden.value;
    if (!id) return;

    const level = clampInt(ui.level.value, 1, 35);
    const seed = setNewPlatSeed(id, level);
    const totals = generatePlatTotals(level, seed);
    writeTotalsInputs(ui.plat.totals, totals);
    renderStats();
  });

  Object.values(ui.bonus.totals).forEach(inp => inp?.addEventListener("input", renderStats));
  Object.values(ui.plat.totals).forEach(inp => inp?.addEventListener("input", renderStats));

  init();
})();
