// Estimación del "banco" de días antes del decay, por cola.
// Riot no publica este número en la API, así que lo simulamos con las partidas.
//
// Reglas (2026):
//   Diamante:         +7 días por partida, máximo 28, -50 LP/día al vaciarse.
//   Master/GM/Chall.: +1 día por partida,  máximo 14, -75 LP/día al vaciarse.

const DAY = 24 * 60 * 60 * 1000;

const RULES = {
  DIAMOND: { gain: 7, max: 28, lpPerDay: 50 },
  APEX: { gain: 1, max: 14, lpPerDay: 75 }
};

const QUEUE_IDS = { solo: 420, flex: 440 };

function rulesFor(tier) {
  if (tier === "DIAMOND") return RULES.DIAMOND;
  if (["MASTER", "GRANDMASTER", "CHALLENGER"].includes(tier)) return RULES.APEX;
  return null;
}

/**
 * @param {string} tier  tier actual en esa cola
 * @param {number[]} gameStarts  timestamps (ms) de partidas válidas de esa cola
 * @param {number} now
 * @returns {null | { daysLeft: number, max: number, lpPerDay: number, lastGame: number | null, status: string }}
 */
function estimateDecay(tier, gameStarts, now = Date.now()) {
  const rules = rulesFor(tier);
  if (!rules) return null;

  const games = [...gameStarts].sort((a, b) => a - b);
  if (games.length === 0) {
    // Sin partidas recientes registradas: no podemos estimar.
    return { daysLeft: null, max: rules.max, lpPerDay: rules.lpPerDay, lastGame: null, status: "unknown" };
  }

  // Suponemos banco lleno en la partida más antigua conocida. Con 4 partidas
  // en Diamante (14 en Master+) el resultado ya no depende de esa suposición.
  let bank = rules.max;
  for (let i = 1; i < games.length; i++) {
    const elapsed = (games[i] - games[i - 1]) / DAY;
    bank = Math.min(rules.max, Math.max(0, bank - elapsed) + rules.gain);
  }
  const last = games[games.length - 1];
  const remaining = bank - (now - last) / DAY;
  const daysLeft = Math.floor(remaining);

  let status = "ok";
  if (remaining <= 0) status = "decaying";
  else if (daysLeft <= 3) status = "danger";
  else if (daysLeft <= 7) status = "warning";

  return { daysLeft: Math.max(daysLeft, 0), max: rules.max, lpPerDay: rules.lpPerDay, lastGame: last, status };
}

/** Decay por cola de una cuenta serializada. */
function decayForAccount(ranked, matches, now = Date.now()) {
  const out = {};
  for (const [queue, queueId] of Object.entries(QUEUE_IDS)) {
    const entry = ranked[queue];
    if (!entry) {
      out[queue] = null;
      continue;
    }
    const starts = matches
      .filter((m) => m.queueId === queueId && !m.remake)
      .map((m) => m.gameStart);
    out[queue] = estimateDecay(entry.tier, starts, now);
  }
  return out;
}

module.exports = { RULES, estimateDecay, decayForAccount };
