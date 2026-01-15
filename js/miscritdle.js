const $ = (sel) => document.querySelector(sel);

const TZ = "America/Santiago";
const MAX_TRIES = 6;

const MISCRITS_JSON_URL = "../miscrits.json";

const AVATAR_FOLDER = "../assets/images/miscrits_avatar/";
const AVATAR_FALLBACK = `${AVATAR_FOLDER}preset_avatar.png`;
const TYPE_FOLDER = "../assets/images/type/";

let MISCRITS = [];
let todayTarget = null;

const COLS = [
  { key: "miscrit", label: "MISCRIT" },
  { key: "element", label: "ELEMENT" },
  { key: "rarity", label: "RARITY" },
  { key: "place", label: "SPAWN PLACE" },
  { key: "dark", label: "DARK VERSION" },
  { key: "light", label: "LIGHT VERSION" },
];

const RESET_TZ = "America/Santiago";
const RESET_HOUR = 21;
let endTimerInterval = null;

function getNextResetTimestampChile() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: RESET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const y = Number(parts.find(p => p.type === "year")?.value);
  const m = Number(parts.find(p => p.type === "month")?.value);
  const d = Number(parts.find(p => p.type === "day")?.value);

  const candidate = new Date(Date.UTC(y, m - 1, d, RESET_HOUR + 3, 0, 0)); 
  const chileHour = Number(new Intl.DateTimeFormat("en-US", { timeZone: RESET_TZ, hour: "2-digit", hour12: false }).format(now));
  const chileMin  = Number(new Intl.DateTimeFormat("en-US", { timeZone: RESET_TZ, minute: "2-digit" }).format(now));

  const alreadyPassed = (chileHour > RESET_HOUR) || (chileHour === RESET_HOUR && chileMin >= 0);
  if (alreadyPassed) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  return candidate.getTime();
}

function fmt2(n) {
  return String(n).padStart(2, "0");
}

function startNextTimer() {
  const timerEl = $("#md-next-timer");
  if (!timerEl) return;

  if (endTimerInterval) clearInterval(endTimerInterval);

  const tick = () => {
    const next = getNextResetTimestampChile();
    const diff = Math.max(0, next - Date.now());

    const totalSec = Math.floor(diff / 1000);
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;

    timerEl.textContent = `${fmt2(hh)}:${fmt2(mm)}:${fmt2(ss)}`;
  };

  tick();
  endTimerInterval = setInterval(tick, 1000);
}

function stopNextTimer() {
  if (endTimerInterval) clearInterval(endTimerInterval);
  endTimerInterval = null;
}

function renderEndCard(state) {
  const card = $("#md-endcard");
  if (!card) return;

  if (!state.finished) {
    card.hidden = true;
    stopNextTimer();
    return;
  }

  const titleEl = $("#md-end-title");
  const avatarEl = $("#md-end-avatar");
  const line1El = $("#md-end-line1");
  const nameEl = $("#md-end-name");

  const isWin = state.solved === true;

  if (titleEl) titleEl.textContent = isWin ? "VICTORY!" : "YOU FAILED THIS TIME";
  if (line1El) line1El.textContent = isWin ? "You guessed it" : "The Miscrit was";
  if (nameEl) nameEl.textContent = todayTarget?.name ?? "-";
  if (avatarEl) {
    avatarEl.src = todayTarget ? avatarSrc(todayTarget) : AVATAR_FALLBACK;
    avatarEl.alt = todayTarget?.name ?? "";
  }

  card.hidden = false;
  startNextTimer();
}

function normalize(s) {
  return (s ?? "").toString().trim().toLowerCase();
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function avatarSrc(m) {
  const file = (m?.avatar ?? "").toString().trim();
  return file ? `${AVATAR_FOLDER}${file}` : AVATAR_FALLBACK;
}
function elementIconSrc(type) {
  const el = normalize(type || "physical");
  return `${TYPE_FOLDER}${el}.png`;
}
function primaryPlace(m) {
  return (m?.spawns?.[0]?.place ?? "Unknown").toString();
}
function existsVariant(baseName, prefix) {
  const wanted = normalize(`${prefix} ${baseName}`);
  return MISCRITS.some(x => normalize(x?.name) === wanted);
}

function getGameDateKey(timeZone = TZ, resetHour = RESET_HOUR) {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const y = Number(parts.find(p => p.type === "year")?.value);
  const m = Number(parts.find(p => p.type === "month")?.value);
  const d = Number(parts.find(p => p.type === "day")?.value);
  const hh = Number(parts.find(p => p.type === "hour")?.value);
  const mm = Number(parts.find(p => p.type === "minute")?.value);

  const afterReset = (hh > resetHour) || (hh === resetHour && mm >= 0);

  const base = new Date(Date.UTC(y, m - 1, d));
  if (afterReset) base.setUTCDate(base.getUTCDate() + 1);

  const yy = base.getUTCFullYear();
  const mm2 = String(base.getUTCMonth() + 1).padStart(2, "0");
  const dd2 = String(base.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm2}-${dd2}`;
}


function hashStringToInt(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0);
}

function storageKey() {
  return `miscritdle:${getGameDateKey()}`;
}

function pickTodayTarget(list) {
  const key = getGameDateKey();
  const idx = hashStringToInt(key) % list.length;
  return list[idx];
}

/* ====== state ====== */

function setStatus(txt) {
  const el = $("#md-status");
  if (el) el.textContent = txt || "";
}

function loadState() {
  const raw = localStorage.getItem(storageKey());
  if (!raw) return { guesses: [], solved: false, finished: false };

  try {
    const st = JSON.parse(raw);
    if (!Array.isArray(st.guesses)) st.guesses = [];
    st.solved = !!st.solved;
    st.finished = !!st.finished;
    return st;
  } catch {
    return { guesses: [], solved: false, finished: false };
  }
}

function saveState(state) {
  localStorage.setItem(storageKey(), JSON.stringify(state));
}

/* ====== data helpers ====== */

function findByName(name) {
  const n = normalize(name);
  return MISCRITS.find(m => normalize(m?.name) === n) || null;
}

/* ====== UI render ====== */

function renderHeader() {
  const header = $("#md-header");
  if (!header) return;

  header.innerHTML = "";
  for (const c of COLS) {
    const div = document.createElement("div");
    div.className = "cell";
    div.textContent = c.label;
    header.appendChild(div);
  }
}

function renderRow(guess, target) {
  const row = document.createElement("div");
  row.className = "miscritdle__row";

  const c1 = document.createElement("div");
  c1.className = `mdcell ${guess.id === target.id ? "ok" : "no"}`;
  c1.innerHTML = `<img class="md-avatar" src="${avatarSrc(guess)}" alt="${guess.name}">`;
  row.appendChild(c1);

  const gType = (guess.type ?? "?").toString();
  const tType = (target.type ?? "?").toString();
  const c2 = document.createElement("div");
  c2.className = `mdcell ${normalize(gType) === normalize(tType) ? "ok" : "no"}`;
  c2.innerHTML = `<img class="md-elem" src="${elementIconSrc(gType)}" alt="${gType}">`;
  row.appendChild(c2);

  const gR = (guess.rarity ?? "?").toString();
  const tR = (target.rarity ?? "?").toString();
  const c3 = document.createElement("div");
  c3.className = `mdcell ${normalize(gR) === normalize(tR) ? "ok" : "no"}`;
  c3.innerHTML = `<div class="mdtext">${gR}</div>`;
  row.appendChild(c3);

  const gP = primaryPlace(guess);
  const tP = primaryPlace(target);
  const c4 = document.createElement("div");
  c4.className = `mdcell ${normalize(gP) === normalize(tP) ? "ok" : "no"}`;
  c4.innerHTML = `<div class="mdtext">${gP}</div>`;
  row.appendChild(c4);

  const hasDark = existsVariant(target.name, "Dark");
  const c5 = document.createElement("div");
  c5.className = `mdcell ${hasDark ? "ok" : "no"}`;
  c5.innerHTML = `<div class="mdtext md-yn">${hasDark ? "YES" : "NO"}</div>`;
  row.appendChild(c5);

  const hasLight = existsVariant(target.name, "Light");
  const c6 = document.createElement("div");
  c6.className = `mdcell ${hasLight ? "ok" : "no"}`;
  c6.innerHTML = `<div class="mdtext md-yn">${hasLight ? "YES" : "NO"}</div>`;
  row.appendChild(c6);

  return row;
}

function renderBoard(state) {
  const board = $("#md-board");
  if (!board) return;

  board.innerHTML = "";

  for (const g of state.guesses) {
    const gObj = findByName(g.name);
    if (!gObj) continue;
    board.appendChild(renderRow(gObj, todayTarget));
  }

  const shareBtn = $("#md-share");
  if (state.solved) {
    setStatus(`¡Correcto! ${state.guesses.length}/${MAX_TRIES}.`);
    if (shareBtn) shareBtn.disabled = false;
  } else if (state.finished) {
    if (shareBtn) shareBtn.disabled = false;
  } else {
    setStatus(`${state.guesses.length}/${MAX_TRIES} intentos usados.`);
    if (shareBtn) shareBtn.disabled = true;
  }
  renderEndCard(state);
}

/* ====== share text ======*/
function buildShareText(state, target) {
  const solved = state.solved === true;
  const tries = state.guesses.length;
  const dayKey = getGameDateKey();

  const title = `Miscritdle ${dayKey} — ${solved ? tries : "X"}/${MAX_TRIES}`;
  const tType = normalize(target.type || "");
  const tR = normalize(target.rarity || "");
  const tP = normalize(primaryPlace(target));
  const tDark = existsVariant(target.name, "Dark");
  const tLight = existsVariant(target.name, "Light");

  const lines = state.guesses.map(g => {
    const gObj = findByName(g.name) || g;
    const gType = normalize(gObj.type || "");
    const gRarity = normalize(gObj.rarity || "");
    const gPlace = normalize(primaryPlace(gObj));

    const cells = [
      normalize(gObj.name) === normalize(target.name) ? "🟩" : "⬛",
      gType === tType ? "🟩" : "⬛",
      gRarity === tR ? "🟩" : "⬛",
      gPlace === tP ? "🟩" : "⬛",
      (tDark ? "🟩" : "⬛"),
      (tLight ? "🟩" : "⬛"),
    ];
    return cells.join("");
  });

  const reveal = solved ? "" : `\nAnswer: ${target.name}`;
  return `${title}\n${lines.join("\n")}${reveal}`;
}

/* ====== dropdown ====== */

function renderDropdown(matches) {
  const dd = $("#mdDropdown");
  if (!dd) return;

  if (!matches.length) {
    dd.hidden = true;
    dd.innerHTML = "";
    return;
  }

  dd.hidden = false;
  dd.innerHTML = matches.map(m => `
    <button type="button" class="miscritpicker__item" data-name="${m.name}">
      <img class="miscritpicker__avatar" src="${avatarSrc(m)}" alt="">
      <div class="miscritpicker__name">${m.name}</div>
    </button>
  `).join("");

  dd.querySelectorAll(".miscritpicker__item").forEach(btn => {
    btn.addEventListener("click", () => {
      const name = btn.getAttribute("data-name") || "";
      const input = $("#md-guess");
      if (input) input.value = name;
      dd.hidden = true;
    });
  });
}

function bindMiscritDropdown() {
  const input = $("#md-guess");
  const dd = $("#mdDropdown");
  if (!input || !dd) return;

  const close = () => { dd.hidden = true; };

  const open = () => {
    const q = normalize(input.value);
    const matches = MISCRITS
      .filter(m => !q || normalize(m.name).includes(q))
      .slice(0, 60);
    renderDropdown(matches);
  };

  input.addEventListener("focus", open);
  input.addEventListener("input", open);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();

    if (e.key === "Enter") {
      const exact = findByName(input.value);
      if (exact) return;

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

/* ====== events ====== */

function initEvents() {
  const input = $("#md-guess");
  const submit = $("#md-submit");
  const share = $("#md-share");

  const doGuess = () => {
    const name = (input?.value ?? "").trim();
    if (!name) return;

    const state = loadState();
    if (state.finished) return;

    const gObj = findByName(name);
    if (!gObj) {
      setStatus("Miscrit not found. Choose one of the menu.");
      return;
    }

    if (state.guesses.some(g => normalize(g.name) === normalize(gObj.name))) {
      setStatus("You already tried that Miscrit.");
      return;
    }

    state.guesses.push({ id: gObj.id, name: gObj.name });

    if (normalize(gObj.name) === normalize(todayTarget.name)) {
      state.solved = true;
      state.finished = true;
    } else if (state.guesses.length >= MAX_TRIES) {
      state.finished = true;
    }

    saveState(state);
    if (input) input.value = "";
    renderBoard(state);
  };

  submit?.addEventListener("click", doGuess);
  input?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doGuess();
  });

  share?.addEventListener("click", async () => {
    const state = loadState();
    const text = buildShareText(state, todayTarget);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copiado. Pégalo en Discord.");
    } catch {
      prompt("Copia esto:", text);
    }
  });
}

/* ====== load ====== */

async function loadMiscrits() {
  const res = await fetch(MISCRITS_JSON_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} cargando ${MISCRITS_JSON_URL}`);

  const json = await res.json();
  const list = Array.isArray(json?.miscrits) ? json.miscrits : [];

  MISCRITS = list
    .filter(m => m?.name && m?.id != null)
    .slice()
    .sort((a, b) => toNum(a.id) - toNum(b.id));

  if (!MISCRITS.length) throw new Error("miscrits.json vacío o estructura inválida.");

  todayTarget = pickTodayTarget(MISCRITS);
}

(async function boot() {
  try {
    await loadMiscrits();
    renderHeader();
    bindMiscritDropdown();
    initEvents();
    renderBoard(loadState());
  } catch (e) {
    console.error(e);
    setStatus("Error loading Miscritdle. Revisa consola y rutas del JSON.");
  }
})();
