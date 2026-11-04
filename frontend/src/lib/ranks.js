// Debe coincidir con backend/src/lib/ranks.js
export const TIERS = [
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

export const TIER_INFO = {
  IRON: { name: "Hierro", color: "#8b7d7b" },
  BRONZE: { name: "Bronce", color: "#b0714a" },
  SILVER: { name: "Plata", color: "#a8b5c1" },
  GOLD: { name: "Oro", color: "#e0b24f" },
  PLATINUM: { name: "Platino", color: "#3fb8a8" },
  EMERALD: { name: "Esmeralda", color: "#2fbf71" },
  DIAMOND: { name: "Diamante", color: "#6f8cff" },
  MASTER: { name: "Maestro", color: "#b15cff" },
  GRANDMASTER: { name: "Gran Maestro", color: "#ef4c4c" },
  CHALLENGER: { name: "Retador", color: "#f4d27a" }
};

export const QUEUE_LABELS = {
  solo: "Solo/Q",
  flex: "Flex",
  team5: "5v5"
};

export function rankScore(entry) {
  if (!entry) return 0;
  const tierIdx = TIERS.indexOf(String(entry.tier).toUpperCase());
  if (tierIdx === -1) return 0;
  const division = APEX.has(TIERS[tierIdx]) ? 0 : DIVISIONS[entry.rank] ?? 0;
  const lp = Math.max(0, Math.min(Number(entry.lp) || 0, 9999 - division * 1000));
  return 1 + tierIdx * 10_000 + division * 1_000 + lp;
}

const CURRENT_BONUS = 1_000_000;
function queueScore(account, queue) {
  const current = account.ranked?.[queue];
  if (current) return CURRENT_BONUS + rankScore(current);
  return rankScore(account.lastKnown?.[queue]);
}

export function compareAccounts(a, b) {
  return (
    queueScore(b, "solo") - queueScore(a, "solo") ||
    queueScore(b, "flex") - queueScore(a, "flex") ||
    queueScore(b, "team5") - queueScore(a, "team5") ||
    (b.summonerLevel ?? 0) - (a.summonerLevel ?? 0) ||
    a.gameName.localeCompare(b.gameName, "es")
  );
}

export function formatMonth(ms) {
  return new Date(ms).toLocaleDateString("es-CL", { month: "short", year: "numeric" });
}

export function formatRank(entry) {
  if (!entry) return null;
  const info = TIER_INFO[entry.tier] ?? { name: entry.tier, color: "#a1a1aa" };
  return {
    label: entry.rank ? `${info.name} ${entry.rank}` : info.name,
    color: info.color,
    lp: entry.lp,
    games: entry.wins + entry.losses,
    winrate:
      entry.wins + entry.losses > 0
        ? Math.round((entry.wins / (entry.wins + entry.losses)) * 100)
        : null
  };
}

export function profileIconUrl(id) {
  if (id == null) return null;
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`;
}

export function timeAgo(ms) {
  if (!ms) return "nunca";
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return "hace un momento";
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} d`;
}

export const QUEUE_NAMES = { 420: "Solo/Q", 440: "Flex" };
export const queueName = (id) => QUEUE_NAMES[id] ?? `Ranked ${id}`;

export function championIconUrl(id) {
  return `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;
}

export function kdaRatio(k, d, a) {
  return d === 0 ? "Perfecto" : ((k + a) / d).toFixed(2);
}

export const DECAY_STYLES = {
  ok: { color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  warning: { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30" },
  danger: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/40" },
  decaying: { color: "text-red-300", bg: "bg-red-500/20 border-red-500/60" },
  unknown: { color: "text-zinc-500", bg: "bg-zinc-800/60 border-zinc-700" }
};

export function decayLabel(d) {
  if (!d) return null;
  if (d.status === "unknown") return "Decay: sin datos";
  if (d.status === "decaying") return `En decay (−${d.lpPerDay} LP/día)`;
  return `Decay en ${d.daysLeft} ${d.daysLeft === 1 ? "día" : "días"}`;
}

// "LeeSin" → "Lee Sin", con excepciones donde la clave interna no es el nombre.
const CHAMP_NAMES = {
  MonkeyKing: "Wukong",
  Chogath: "Cho'Gath",
  Kaisa: "Kai'Sa",
  Khazix: "Kha'Zix",
  KogMaw: "Kog'Maw",
  Velkoz: "Vel'Koz",
  Belveth: "Bel'Veth",
  RekSai: "Rek'Sai",
  KSante: "K'Sante",
  Leblanc: "LeBlanc",
  FiddleSticks: "Fiddlesticks",
  Nunu: "Nunu & Willump",
  Renata: "Renata Glasc"
};
export function champName(key = "") {
  return CHAMP_NAMES[key] ?? key.replace(/([a-z])([A-Z])/g, "$1 $2");
}
