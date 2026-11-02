const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", "..", ".env"),
  quiet: true
});

function fail(message) {
  console.error(`[config] ${message}`);
  console.error("[config] Copia .env.example a backend/.env y complétalo.");
  process.exit(1);
}

const REQUIRED = ["SESSION_SECRET", "ALLOWED_ORIGIN"];
const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
if (missing.length > 0) {
  fail(`Faltan variables de entorno obligatorias: ${missing.join(", ")}`);
}

if (process.env.SESSION_SECRET.length < 32) {
  fail("SESSION_SECRET debe tener al menos 32 caracteres.");
}

const port = Number(process.env.PORT ?? 3100);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  fail(`PORT inválido: ${process.env.PORT}`);
}

let allowedOrigin;
try {
  allowedOrigin = new URL(process.env.ALLOWED_ORIGIN.trim()).origin;
} catch {
  fail(`ALLOWED_ORIGIN no es una URL válida: ${process.env.ALLOWED_ORIGIN}`);
}

// "20:1,100:120" => [{ count: 20, seconds: 1 }, { count: 100, seconds: 120 }]
function parseRateLimits(raw) {
  return raw.split(",").map((part) => {
    const [count, seconds] = part.split(":").map(Number);
    if (!count || !seconds) fail(`RIOT_RATE_LIMITS inválido: ${raw}`);
    return { count, seconds };
  });
}

const riotApiKey = process.env.RIOT_API_KEY?.trim() || "";
if (!riotApiKey) {
  console.warn(
    "[config] RIOT_API_KEY vacía: la app funciona, pero no podrá actualizar rangos."
  );
}

const isProduction = process.env.NODE_ENV === "production";

module.exports = Object.freeze({
  port,
  host: process.env.HOST?.trim() || "127.0.0.1",
  isProduction,
  allowedOrigin,
  sessionSecret: process.env.SESSION_SECRET,
  sessionDays: Number(process.env.SESSION_DAYS ?? 7),
  registrationOpen: (process.env.REGISTRATION_OPEN ?? "true") === "true",
  dbPath: path.resolve(
    __dirname,
    "..",
    "..",
    process.env.DB_PATH?.trim() || "data/zkleague.sqlite"
  ),
  riotApiKey,
  riotRateLimits: parseRateLimits(process.env.RIOT_RATE_LIMITS || "20:1,100:120"),
  // Colas que se muestran como "5v5" (Ranked 5s). Separadas por coma.
  riotQueue5v5: (process.env.RIOT_QUEUE_5V5 || "RANKED_TEAM_5x5")
    .split(",")
    .map((q) => q.trim())
    .filter(Boolean),
  refreshCooldownSeconds: Number(process.env.REFRESH_COOLDOWN_SECONDS ?? 60),
  // Ruta al build del frontend; si existe, el backend lo sirve.
  frontendDist: path.resolve(__dirname, "..", "..", "..", "frontend", "dist")
});
