import fs from "fs";

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

const inPath = arg("--in", "./miscrits.json");
const outPath = arg("--out", "./miscritdle_pool.json");
const sortMode = (arg("--sort", "name") || "name").toLowerCase(); // "id" | "name"

function normalizeName(s) {
  return (s ?? "")
    .toString()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const raw = fs.readFileSync(inPath, "utf8");
const json = JSON.parse(raw);

const miscrits = Array.isArray(json?.miscrits) ? json.miscrits : [];
if (!miscrits.length) {
  console.error("No se encontró json.miscrits o está vacío.");
  process.exit(1);
}

// extraer names (únicos, limpios)
const seen = new Set();
const list = [];
for (const m of miscrits) {
  const name = (m?.name ?? "").toString().trim();
  if (!name) continue;
  const key = normalizeName(name);
  if (seen.has(key)) continue;
  seen.add(key);
  list.push({ name, id: m?.id });
}

// ordenar
if (sortMode === "id") {
  list.sort((a, b) => toNum(a.id) - toNum(b.id));
} else {
  // sortMode === "name"
  list.sort((a, b) => normalizeName(a.name).localeCompare(normalizeName(b.name), "en"));
}

const pool = list.map(x => x.name);

const out = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sort: sortMode,
  count: pool.length,
  pool
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log(`OK: generado ${outPath} con ${pool.length} Miscrits (sort=${sortMode}).`);
