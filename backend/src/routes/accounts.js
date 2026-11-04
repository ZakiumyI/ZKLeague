const express = require("express");
const { HttpError, badRequest, requireString, requireCipherBlob } = require("../lib/http");
const { classifyQueues, compareAccounts } = require("../lib/ranks");
const { PLATFORMS } = require("../services/riot");
const { decayForAccount } = require("../lib/decay");

const GAME_NAME = { min: 1, max: 32 };
const TAG_LINE = { min: 1, max: 10 };

function accountsRouter({ db, config, refresh: refreshAccount }) {
  const router = express.Router();

  const listStmt = db.prepare("SELECT * FROM accounts WHERE user_id = ?");
  const getStmt = db.prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?");
  const insertStmt = db.prepare(`
    INSERT INTO accounts (user_id, game_name, tag_line, platform, secret, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteStmt = db.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?");
  // Último rango registrado de cada cola, para el puuid actual de cada cuenta.
  const lastKnownStmt = db.prepare(`
    SELECT h.account_id, h.queue_type AS queueType, h.tier, h.rank, h.lp, h.wins, h.losses,
           h.recorded_at AS recordedAt
    FROM rank_history h
    JOIN accounts a ON a.id = h.account_id
    WHERE a.user_id = ? AND h.puuid = a.puuid
      AND h.id = (SELECT MAX(id) FROM rank_history x
                  WHERE x.account_id = h.account_id AND x.puuid = h.puuid
                    AND x.queue_type = h.queue_type)
  `);
  const historyStmt = db.prepare(`
    SELECT queue_type AS queueType, tier, rank, lp, wins, losses, recorded_at AS recordedAt
    FROM rank_history WHERE account_id = ? AND puuid = ? ORDER BY id ASC
  `);

  const MATCH_COLS = `match_id AS matchId, queue_id AS queueId, game_start AS gameStart,
    duration, win, remake, champion_id AS championId, champion_name AS championName,
    position, kills, deaths, assists, cs`;

  // Últimas 40 partidas de cada cuenta del usuario (puuid actual).
  const recentMatchesStmt = db.prepare(`
    SELECT account_id, ${MATCH_COLS} FROM (
      SELECT m.*, ROW_NUMBER() OVER (PARTITION BY m.account_id ORDER BY m.game_start DESC) AS rn
      FROM matches m JOIN accounts a ON a.id = m.account_id
      WHERE a.user_id = ? AND m.puuid = a.puuid
    ) WHERE rn <= 40
    ORDER BY game_start DESC
  `);
  const accountMatchesStmt = db.prepare(`
    SELECT ${MATCH_COLS} FROM matches
    WHERE account_id = ? AND puuid = ? ORDER BY game_start DESC LIMIT ?
  `);

  const toMatch = (m) => ({ ...m, win: Boolean(m.win), remake: Boolean(m.remake) });

  function matchesFor(userId) {
    const byAccount = new Map();
    for (const { account_id, ...m } of recentMatchesStmt.all(userId)) {
      if (!byAccount.has(account_id)) byAccount.set(account_id, []);
      byAccount.get(account_id).push(toMatch(m));
    }
    return byAccount;
  }

  function lastKnownFor(userId) {
    const byAccount = new Map();
    for (const r of lastKnownStmt.all(userId)) {
      const { account_id, ...entry } = r;
      if (!byAccount.has(account_id)) byAccount.set(account_id, []);
      byAccount.get(account_id).push(entry);
    }
    return byAccount;
  }

  function serialize(row, lastKnownEntries = [], matches = []) {
    const entries = row.ranked_json ? JSON.parse(row.ranked_json) : [];
    const ranked = classifyQueues(entries, config.riotQueue5v5);
    return {
      id: row.id,
      gameName: row.game_name,
      tagLine: row.tag_line,
      platform: row.platform,
      platformLabel: PLATFORMS[row.platform]?.label ?? row.platform,
      secret: JSON.parse(row.secret),
      summonerLevel: row.summoner_level,
      profileIconId: row.profile_icon_id,
      ranked,
      decay: decayForAccount(ranked, matches),
      recentMatches: matches.slice(0, 10),
      lastKnown: classifyQueues(lastKnownEntries, config.riotQueue5v5),
      refreshedAt: row.refreshed_at,
      refreshError: row.refresh_error,
      hasRiotData: row.puuid !== null
    };
  }

  function loadOwned(req) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw badRequest("Id inválido.");
    const row = getStmt.get(id, req.userId);
    if (!row) throw new HttpError(404, "Cuenta no encontrada.", "not_found");
    return row;
  }

  function readPlatform(body) {
    const platform = requireString(body, "platform", { max: 8 }).toLowerCase();
    if (!PLATFORMS[platform]) throw badRequest("Plataforma inválida.");
    return platform;
  }

  async function refresh(row) {
    // Desde la web limitamos el tiempo dedicado a partidas para no exceder el
    // timeout del proxy; lo que falte se descarga en la próxima actualización.
    return (await refreshAccount(row, { matchBudgetMs: 20_000 })).row;
  }

  // Serializa una sola cuenta incluyendo su último rango conocido.
  function serializeOne(row) {
    return serialize(
      row,
      lastKnownFor(row.user_id).get(row.id),
      row.puuid ? accountMatchesStmt.all(row.id, row.puuid, 40).map(toMatch) : []
    );
  }

  router.get("/platforms", (_req, res) => {
    res.json(
      Object.entries(PLATFORMS).map(([id, p]) => ({ id, label: p.label }))
    );
  });

  router.get("/", (req, res) => {
    const lastKnown = lastKnownFor(req.userId);
    const matches = matchesFor(req.userId);
    const accounts = listStmt
      .all(req.userId)
      .map((row) => serialize(row, lastKnown.get(row.id), matches.get(row.id)))
      .sort(compareAccounts);
    res.json(accounts);
  });

  router.post("/", async (req, res) => {
    const gameName = requireString(req.body, "gameName", GAME_NAME);
    const tagLine = requireString(req.body, "tagLine", TAG_LINE).replace(/^#/, "");
    const platform = readPlatform(req.body);
    const secret = requireCipherBlob(req.body, "secret");

    const now = Date.now();
    const id = insertStmt.run(
      req.userId,
      gameName,
      tagLine,
      platform,
      secret,
      now,
      now
    ).lastInsertRowid;

    const row = await refresh(getStmt.get(Number(id), req.userId));
    res.status(201).json(serializeOne(row));
  });

  router.patch("/:id", async (req, res) => {
    const row = loadOwned(req);
    const body = req.body ?? {};
    const sets = [];
    const values = [];

    const next = {
      game_name: body.gameName !== undefined ? requireString(body, "gameName", GAME_NAME) : row.game_name,
      tag_line:
        body.tagLine !== undefined
          ? requireString(body, "tagLine", TAG_LINE).replace(/^#/, "")
          : row.tag_line,
      platform: body.platform !== undefined ? readPlatform(body) : row.platform
    };
    const riotIdChanged =
      next.game_name.toLowerCase() !== row.game_name.toLowerCase() ||
      next.tag_line.toLowerCase() !== row.tag_line.toLowerCase() ||
      next.platform !== row.platform;

    for (const [col, value] of Object.entries(next)) {
      sets.push(`${col} = ?`);
      values.push(value);
    }
    if (body.secret !== undefined) {
      sets.push("secret = ?");
      values.push(requireCipherBlob(body, "secret"));
    }
    if (riotIdChanged) {
      sets.push(
        "puuid = NULL, summoner_level = NULL, profile_icon_id = NULL, ranked_json = NULL, refreshed_at = NULL, refresh_error = NULL"
      );
    }
    sets.push("updated_at = ?");
    values.push(Date.now());

    db.prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(
      ...values,
      row.id,
      req.userId
    );

    let updated = getStmt.get(row.id, req.userId);
    if (riotIdChanged) updated = await refresh(updated);
    res.json(serializeOne(updated));
  });

  router.post("/:id/refresh", async (req, res) => {
    const row = loadOwned(req);
    const cooldownMs = config.refreshCooldownSeconds * 1000;
    if (row.refreshed_at && Date.now() - row.refreshed_at < cooldownMs) {
      // Muy reciente: devolvemos lo guardado sin gastar llamadas a Riot.
      return res.json(serializeOne(row));
    }
    res.json(serializeOne(await refresh(row)));
  });

  // Historial completo de rangos de una cuenta (puuid actual).
  router.get("/:id/history", (req, res) => {
    const row = loadOwned(req);
    res.json(row.puuid ? historyStmt.all(row.id, row.puuid) : []);
  });

  // Partidas ranked guardadas de una cuenta (máx. 100).
  router.get("/:id/matches", (req, res) => {
    const row = loadOwned(req);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    res.json(row.puuid ? accountMatchesStmt.all(row.id, row.puuid, limit).map(toMatch) : []);
  });

  router.delete("/:id", (req, res) => {
    const row = loadOwned(req);
    deleteStmt.run(row.id, req.userId);
    res.status(204).end();
  });

  return router;
}

module.exports = { accountsRouter };
