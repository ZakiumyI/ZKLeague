const TIERS = [
  "IRON",
  "BRONZE",
  "SILVER",
  "GOLD",
  "PLATINUM",
  "EMERALD",
  "DIAMOND",
  "MASTER",
  "GRANDMASTER",
  "CHALLENGER"
];
const DIVISIONS = { IV: 0, III: 1, II: 2, I: 3 };
const APEX = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

// Puntaje comparable entre rangos. Unranked = 0; Iron IV 0 LP = 1.
// Cada tier ocupa un bloque de 10.000 para que el LP de Master/GM/Challenger
// (que puede superar 1.000) nunca invada el tier siguiente.
function rankScore(entry) {
  if (!entry) return 0;
  const tierIdx = TIERS.indexOf(String(entry.tier).toUpperCase());
  if (tierIdx === -1) return 0;
  const division = APEX.has(TIERS[tierIdx]) ? 0 : DIVISIONS[entry.rank] ?? 0;
  const lp = Math.max(0, Math.min(Number(entry.lp) || 0, 9999 - division * 1000));
  return 1 + tierIdx * 10_000 + division * 1_000 + lp;
}

function toEntry(raw) {
  return {
    queueType: raw.queueType,
    tier: raw.tier,
    rank: APEX.has(raw.tier) ? null : raw.rank,
    lp: raw.leaguePoints ?? 0,
    wins: raw.wins ?? 0,
    losses: raw.losses ?? 0
  };
}

// Separa las entradas de league-v4 en solo/flex/5v5 y "otras" (colas que aún no
// conocemos, para poder identificarlas si Riot cambia nombres).
function classifyQueues(entries, queue5v5) {
  const out = { solo: null, flex: null, team5: null, others: [] };
  for (const e of entries || []) {
    if (e.queueType === "RANKED_SOLO_5x5") out.solo = e;
    else if (e.queueType === "RANKED_FLEX_SR") out.flex = e;
    else if (queue5v5.includes(e.queueType)) out.team5 = e;
    else out.others.push(e);
  }
  return out;
}

// Orden: Solo/Q > Flex > 5v5 > nivel > nombre.
function compareAccounts(a, b) {
  return (
    rankScore(b.ranked.solo) - rankScore(a.ranked.solo) ||
    rankScore(b.ranked.flex) - rankScore(a.ranked.flex) ||
    rankScore(b.ranked.team5) - rankScore(a.ranked.team5) ||
    (b.summonerLevel ?? 0) - (a.summonerLevel ?? 0) ||
    a.gameName.localeCompare(b.gameName, "es")
  );
}

module.exports = { TIERS, rankScore, toEntry, classifyQueues, compareAccounts };
