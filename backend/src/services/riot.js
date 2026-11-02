// Cliente mínimo de la API de Riot con limitador de tasa propio.

const PLATFORMS = {
  la2: { label: "LAS", region: "americas" },
  la1: { label: "LAN", region: "americas" },
  na1: { label: "NA", region: "americas" },
  br1: { label: "BR", region: "americas" },
  oc1: { label: "OCE", region: "americas" },
  euw1: { label: "EUW", region: "europe" },
  eun1: { label: "EUNE", region: "europe" },
  tr1: { label: "TR", region: "europe" },
  ru: { label: "RU", region: "europe" },
  me1: { label: "ME", region: "europe" },
  kr: { label: "KR", region: "asia" },
  jp1: { label: "JP", region: "asia" },
  sg2: { label: "SEA", region: "asia" },
  tw2: { label: "TW", region: "asia" },
  vn2: { label: "VN", region: "asia" }
};

class RiotError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Ventanas deslizantes, p. ej. 20 req/1 s y 100 req/120 s (key de desarrollo).
function createRateLimiter(limits) {
  const stamps = [];
  let chain = Promise.resolve();

  async function waitTurn() {
    for (;;) {
      const now = Date.now();
      let waitMs = 0;
      for (const { count, seconds } of limits) {
        const windowStart = now - seconds * 1000;
        const inWindow = stamps.filter((t) => t > windowStart);
        if (inWindow.length >= count) {
          waitMs = Math.max(waitMs, inWindow[inWindow.length - count] - windowStart + 5);
        }
      }
      if (waitMs === 0) {
        stamps.push(now);
        const maxWindow = Math.max(...limits.map((l) => l.seconds)) * 1000;
        while (stamps.length && stamps[0] < now - maxWindow) stamps.shift();
        return;
      }
      await sleep(waitMs);
    }
  }

  // Serializamos los turnos para que no compitan entre sí.
  return () => {
    const turn = chain.then(waitTurn);
    chain = turn.catch(() => {});
    return turn;
  };
}

function createRiotClient({ apiKey, rateLimits, fetchImpl = fetch }) {
  const acquire = createRateLimiter(rateLimits);

  async function get(url, attempt = 0) {
    if (!apiKey) {
      throw new RiotError(503, "No hay API key de Riot configurada en el servidor.");
    }
    await acquire();
    const res = await fetchImpl(url, {
      headers: { "X-Riot-Token": apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000)
    });

    if (res.ok) return res.json();

    if (res.status === 429 && attempt < 2) {
      const retryAfter = Number(res.headers.get("retry-after")) || 2;
      await sleep(Math.min(retryAfter, 30) * 1000);
      return get(url, attempt + 1);
    }
    if (res.status === 401 || res.status === 403) {
      throw new RiotError(res.status, "La API key de Riot es inválida o expiró.");
    }
    if (res.status === 404) {
      throw new RiotError(404, "Riot ID no encontrado en esa región.");
    }
    if (res.status === 429) {
      throw new RiotError(429, "Límite de la API de Riot alcanzado, intenta más tarde.");
    }
    throw new RiotError(res.status, `Error de la API de Riot (${res.status}).`);
  }

  const enc = encodeURIComponent;
  // Caracteres invisibles que a veces se pegan al copiar el Riot ID del cliente.
  const clean = (s) => s.replace(/[​-‍﻿‪-‮⁦-⁩]/g, "").trim();

  return {
    async fetchProfile({ gameName, tagLine, platform }) {
      const p = PLATFORMS[platform];
      if (!p) throw new RiotError(400, `Plataforma desconocida: ${platform}`);

      const account = await get(
        `https://${p.region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${enc(clean(gameName))}/${enc(clean(tagLine))}`
      );
      const summoner = await get(
        `https://${platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${enc(account.puuid)}`
      );
      const entries = await get(
        `https://${platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${enc(account.puuid)}`
      );

      return {
        puuid: account.puuid,
        gameName: account.gameName,
        tagLine: account.tagLine,
        summonerLevel: summoner.summonerLevel,
        profileIconId: summoner.profileIconId,
        entries
      };
    }
  };
}

module.exports = { PLATFORMS, RiotError, createRiotClient, createRateLimiter };
