const test = require("node:test");
const assert = require("node:assert/strict");
const { rankScore, compareAccounts, classifyQueues } = require("../src/lib/ranks");

const e = (tier, rank, lp = 0) => ({ tier, rank, lp });

test("la división cuenta: Gold I > Gold IV", () => {
  assert.ok(rankScore(e("GOLD", "I")) > rankScore(e("GOLD", "IV", 99)));
});

test("Gold I 99 LP < Platinum IV 0 LP", () => {
  assert.ok(rankScore(e("GOLD", "I", 99)) < rankScore(e("PLATINUM", "IV", 0)));
});

test("Master con mucho LP no supera a Grandmaster", () => {
  assert.ok(rankScore(e("MASTER", null, 1500)) < rankScore(e("GRANDMASTER", null, 0)));
});

test("unranked es menor que Iron IV 0 LP", () => {
  assert.equal(rankScore(null), 0);
  assert.ok(rankScore(e("IRON", "IV", 0)) > 0);
});

test("orden: solo > flex > 5v5 > nivel", () => {
  const acc = (name, solo, flex, team5, level) => ({
    gameName: name,
    summonerLevel: level,
    ranked: { solo, flex, team5, others: [] }
  });
  const list = [
    acc("nivel", null, null, null, 500),
    acc("team5", null, null, e("SILVER", "II"), 30),
    acc("flex", null, e("BRONZE", "I"), null, 30),
    acc("soloBajo", e("IRON", "IV"), e("DIAMOND", "I"), null, 30),
    acc("soloAlto", e("GOLD", "II", 50), null, null, 30)
  ].sort(compareAccounts);
  assert.deepEqual(
    list.map((a) => a.gameName),
    ["soloAlto", "soloBajo", "flex", "team5", "nivel"]
  );
});

test("colas desconocidas quedan en 'others'", () => {
  const r = classifyQueues(
    [
      { queueType: "RANKED_SOLO_5x5" },
      { queueType: "RANKED_TEAM_5x5" },
      { queueType: "ALGO_NUEVO" }
    ],
    ["RANKED_TEAM_5x5"]
  );
  assert.ok(r.solo && r.team5);
  assert.equal(r.others[0].queueType, "ALGO_NUEVO");
});
