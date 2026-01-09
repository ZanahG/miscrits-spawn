(function () {
  const $ = (sel) => document.querySelector(sel);

  const RATING_ROWS = [
    { rating: "F-", score: 0,  common: 45, rare: 35, epic: 25, exotic100: 15, exotic1: 100, legendary1: null },
    { rating: "F",  score: 1,  common: 43, rare: 33, epic: 23, exotic100: 13, exotic1: 100, legendary1: null },
    { rating: "F+", score: 2,  common: 42, rare: 32, epic: 22, exotic100: 12, exotic1: 100, legendary1: null },
    { rating: "D",  score: 3,  common: 40, rare: 30, epic: 20, exotic100: 10, exotic1: 100, legendary1: null },
    { rating: "D+", score: 4,  common: 39, rare: 29, epic: 19, exotic100: 9,  exotic1: 100, legendary1: null },
    { rating: "C",  score: 5,  common: 37, rare: 27, epic: 17, exotic100: 7,  exotic1: 100, legendary1: null },
    { rating: "C+", score: 6,  common: 36, rare: 26, epic: 16, exotic100: 6,  exotic1: 100, legendary1: 95 },
    { rating: "B",  score: 7,  common: 34, rare: 24, epic: 14, exotic100: 4,  exotic1: 100, legendary1: 93 },
    { rating: "B+", score: 8,  common: 33, rare: 23, epic: 13, exotic100: 3,  exotic1: 100, legendary1: 92 },
    { rating: "A",  score: 9,  common: 31, rare: 21, epic: 11, exotic100: 1,  exotic1: 100, legendary1: 90 },
    { rating: "A+", score: 10, common: 30, rare: 20, epic: 10, exotic100: 1,  exotic1: 99,  legendary1: 89 },
    { rating: "S",  score: 11, common: 28, rare: 18, epic: 8,  exotic100: 1,  exotic1: 97,  legendary1: 87 },
    { rating: "S+", score: 12, common: 27, rare: 17, epic: 7,  exotic100: 1,  exotic1: 96,  legendary1: 86 },
  ];

  function rarityToActiveKey(rarityRaw) {
    const r = (rarityRaw ?? "").toString().trim().toLowerCase();
    if (r === "common") return "common";
    if (r === "rare") return "rare";
    if (r === "epic") return "epic";
    if (r === "exotic") return "exotic100";
    if (r === "legendary") return "legendary1";
    return null;
  }

  function setNote(rarityRaw) {
    const note = $("#ivsNote");
    if (!note) return;

    const r = (rarityRaw ?? "").toString().trim().toLowerCase();
    if (r === "exotic") note.textContent = "Exotic: referencia a 100% HP (incluye columna 1% HP).";
    else if (r === "legendary") note.textContent = "Legendary: referencia a 1% HP.";
    else note.textContent = "Probabilidad por rating/score según rareza.";
  }

  function buildTable(activeKey) {
    const table = document.createElement("table");
    table.className = "ivs-table";

    const rarityLabelMap = {
      common: "Common",
      rare: "Rare",
      epic: "Epic",
      exotic100: "Exotic (100% HP)",
      exotic1: "Exotic (1% HP)",
      legendary1: "Legendary (1% HP)"
    };

    table.innerHTML = `
      <thead>
        <tr>
          <th>Rating</th>
          <th>Score</th>
          <th>${rarityLabelMap[activeKey] ?? "Chance"}</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector("tbody");

    for (const r of RATING_ROWS) {
      // si esa rareza no aplica para ese rating (ej Legend null)
      const value = r[activeKey];
      if (value == null) continue;

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.rating}</td>
        <td>${r.score}</td>
        <td class="active-col">${value}%</td>
      `;
      tbody.appendChild(tr);
    }

    return table;
  }

  window.renderIvsTable = function renderIvsTable(rarityRaw) {
    const wrap = document.querySelector("#ivsTableWrap");
    if (!wrap) return;

    const activeKey = rarityToActiveKey(rarityRaw);
    if (!activeKey) return;

    setNote(rarityRaw);

    wrap.innerHTML = "";
    wrap.appendChild(buildTable(activeKey));
  };
})();
