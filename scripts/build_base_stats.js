// build_miscrits_official.js
// Uso: node build_miscrits_official.js Miscrit.json miscrits_official.json

import fs from "node:fs";

const inPath = process.argv[2] ?? "Miscrit.json";
const outPath = process.argv[3] ?? "miscrits_official.json";

const RATING_MAP = {
  Weak: 1,
  Moderate: 2,
  Strong: 3,
  Max: 4,
  Elite: 5,
};

const STAT_KEYS = ["hp", "spd", "ea", "pa", "ed", "pd"];

function toIntStat(value, miscritName, key) {
  const n = RATING_MAP[value];
  if (!n) throw new Error(`Stat inválida ${key}="${value}" en ${miscritName}`);
  return n;
}

const raw = JSON.parse(fs.readFileSync(inPath, "utf8"));
if (!Array.isArray(raw)) throw new Error("El JSON de entrada debe ser un array.");

const seenBaseNames = new Set();

const miscrits = raw.map((m) => {
  const baseName = Array.isArray(m.names) && m.names.length ? m.names[0] : m.name;
  if (!baseName) throw new Error(`Miscrit sin name/names (id=${m.id})`);

  if (seenBaseNames.has(baseName)) {
    throw new Error(`Nombre duplicado detectado (primera evo): "${baseName}"`);
  }
  seenBaseNames.add(baseName);

  // baseStats numérico (1..5)
  const baseStats = {
    hp: toIntStat(m.hp, baseName, "hp"),
    spd: toIntStat(m.spd, baseName, "spd"),
    ea: toIntStat(m.ea, baseName, "ea"),
    pa: toIntStat(m.pa, baseName, "pa"),
    ed: toIntStat(m.ed, baseName, "ed"),
    pd: toIntStat(m.pd, baseName, "pd"),
  };

  // Mantener las labels originales también (por si quieres UI con texto)
  const baseRating = {
    hp: m.hp,
    spd: m.spd,
    ea: m.ea,
    pa: m.pa,
    ed: m.ed,
    pd: m.pd,
  };

  // Construimos un objeto “oficial” manteniendo info útil:
  return {
    id: String(m.id).padStart(3, "0"),
    name: baseName,          // <- solo primera evolución como nombre principal
    type: m.element,
    rarity: m.rarity,

    // Mantén esto si te sirve para mostrar evoluciones (no afecta al “solo primera evo”)
    names: m.names ?? [baseName],

    baseStats,
    baseRating,

    // Mantener ataques y orden
    abilities: m.abilities ?? [],
    ability_order: m.ability_order ?? [],

    // Extra útil para tu hub/wiki
    descriptions: m.descriptions ?? [],
    locations: m.locations ?? {},

    // Si en el futuro el JSON trae más campos, puedes agregarlos aquí.
  };
});

const out = {
  version: 1,
  stats_scale: { min: 1, max: 5 },
  rating_map: RATING_MAP,
  stat_keys: STAT_KEYS,
  miscrits,
};

fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log(`OK -> ${outPath} (${miscrits.length} miscrits)`);
