// reindex_ids.js
// Uso: node reindex_ids.js base_stats.json base_stats_reindexed.json

import fs from "node:fs";

const inPath = process.argv[2] ?? "base_stats.json";
const outPath = process.argv[3] ?? "base_stats_reindexed.json";

const data = JSON.parse(fs.readFileSync(inPath, "utf8"));

if (!Array.isArray(data.miscrits)) {
  throw new Error("El JSON no tiene un array 'miscrits'");
}

data.miscrits = data.miscrits.map((m, index) => ({
  ...m,
  id: String(index + 1).padStart(3, "0")
}));

fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");

console.log(`✔ IDs reasignados correctamente (${data.miscrits.length} miscrits)`);
console.log(`✔ Archivo generado: ${outPath}`);
