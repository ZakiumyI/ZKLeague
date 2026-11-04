const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateDecay, decayForAccount } = require("../src/lib/decay");

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 4, 12);
const daysAgo = (d) => NOW - d * DAY;

test("solo aplica desde Diamante", () => {
  assert.equal(estimateDecay("EMERALD", [daysAgo(1)], NOW), null);
  assert.equal(estimateDecay("GOLD", [], NOW), null);
});

test("Diamante: banco lleno tras jugar hoy = 28 días", () => {
  const r = estimateDecay("DIAMOND", [daysAgo(10), daysAgo(5), daysAgo(0.1)], NOW);
  assert.equal(r.max, 28);
  assert.equal(r.daysLeft, 27); // 28 - 0.1 => 27.9 => 27 días completos
  assert.equal(r.status, "ok");
});

test("Diamante: una partida hace 25 días => 3 días, peligro", () => {
  const r = estimateDecay("DIAMOND", [daysAgo(25)], NOW);
  assert.equal(r.daysLeft, 3);
  assert.equal(r.status, "danger");
  assert.equal(r.lpPerDay, 50);
});

test("Diamante: sin jugar hace 30 días => en decay", () => {
  const r = estimateDecay("DIAMOND", [daysAgo(30)], NOW);
  assert.equal(r.daysLeft, 0);
  assert.equal(r.status, "decaying");
});

test("Diamante: el banco se recarga 7 por partida sin pasar de 28", () => {
  // Juega una vez cada 10 días: el banco baja 10 y sube 7 cada vez.
  // 28 → (18+7)=25 → (15+7)=22 → 22 - 10 (hoy) = 12
  const r = estimateDecay("DIAMOND", [daysAgo(30), daysAgo(20), daysAgo(10)], NOW);
  assert.equal(r.daysLeft, 12);
  assert.equal(r.status, "ok");
});

test("Master: 1 día por partida, máximo 14", () => {
  const r = estimateDecay("MASTER", [daysAgo(9)], NOW);
  assert.equal(r.max, 14);
  assert.equal(r.daysLeft, 5);
  assert.equal(r.status, "warning");
  assert.equal(r.lpPerDay, 75);
  // Muchas partidas el mismo día no superan 14
  const many = Array.from({ length: 30 }, (_, i) => daysAgo(1 - i * 0.01));
  assert.equal(estimateDecay("CHALLENGER", many, NOW).daysLeft, 13);
});

test("sin partidas conocidas => desconocido", () => {
  const r = estimateDecay("DIAMOND", [], NOW);
  assert.equal(r.status, "unknown");
  assert.equal(r.daysLeft, null);
});

test("por cola: ignora remakes y partidas de otra cola", () => {
  const ranked = {
    solo: { tier: "DIAMOND" },
    flex: { tier: "GOLD" },
    team5: null
  };
  const matches = [
    { queueId: 420, gameStart: daysAgo(20), remake: false },
    { queueId: 420, gameStart: daysAgo(1), remake: true }, // remake: no cuenta
    { queueId: 440, gameStart: daysAgo(1), remake: false } // flex: no cuenta para solo
  ];
  const d = decayForAccount(ranked, matches, NOW);
  assert.equal(d.solo.daysLeft, 8);
  assert.equal(d.flex, null);
});
