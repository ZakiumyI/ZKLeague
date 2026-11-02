const express = require("express");
const { HttpError, badRequest, requireString, requireCipherBlob } = require("../lib/http");
const { classifyQueues, compareAccounts, toEntry } = require("../lib/ranks");
const { PLATFORMS, RiotError } = require("../services/riot");

const GAME_NAME = { min: 1, max: 32 };
const TAG_LINE = { min: 1, max: 10 };

function accountsRouter({ db, config, riot }) {
  const router = express.Router();

  const listStmt = db.prepare("SELECT * FROM accounts WHERE user_id = ?");
  const getStmt = db.prepare("SELECT * FROM accounts WHERE id = ? AND user_id = ?");
  const insertStmt = db.prepare(`
    INSERT INTO accounts (user_id, game_name, tag_line, platform, secret, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const deleteStmt = db.prepare("DELETE FROM accounts WHERE id = ? AND user_id = ?");
  const saveProfileStmt = db.prepare(`
    UPDATE accounts SET
      game_name = ?, tag_line = ?, puuid = ?, summoner_level = ?, profile_icon_id = ?,
      ranked_json = ?, refreshed_at = ?, refresh_error = NULL
    WHERE id = ?
  `);
  const saveErrorStmt = db.prepare(
    "UPDATE accounts SET refresh_error = ?, refreshed_at = ? WHERE id = ?"
  );

  function serialize(row) {
    const entries = row.ranked_json ? JSON.parse(row.ranked_json) : [];
    return {
      id: row.id,
      gameName: row.game_name,
      tagLine: row.tag_line,
      platform: row.platform,
      platformLabel: PLATFORMS[row.platform]?.label ?? row.platform,
      secret: JSON.parse(row.secret),
      summonerLevel: row.summoner_level,
      profileIconId: row.profile_icon_id,
      ranked: classifyQueues(entries, config.riotQueue5v5),
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

  // Consulta Riot y guarda el resultado. Si Riot falla, la cuenta se conserva
  // igual (las credenciales son lo importante) y se guarda el error.
  async function refresh(row) {
    try {
      const profile = await riot.fetchProfile({
        gameName: row.game_name,
        tagLine: row.tag_line,
        platform: row.platform
      });
      saveProfileStmt.run(
        profile.gameName,
        profile.tagLine,
        profile.puuid,
        profile.summonerLevel,
        profile.profileIconId,
        JSON.stringify(profile.entries.map(toEntry)),
        Date.now(),
        row.id
      );
    } catch (err) {
      if (!(err instanceof RiotError) && err.name !== "TimeoutError") {
        console.error("[riot] error inesperado:", err);
      }
      const message =
        err instanceof RiotError ? err.message : "No se pudo contactar a Riot.";
      saveErrorStmt.run(message, Date.now(), row.id);
    }
    return getStmt.get(row.id, row.user_id);
  }

  router.get("/platforms", (_req, res) => {
    res.json(
      Object.entries(PLATFORMS).map(([id, p]) => ({ id, label: p.label }))
    );
  });

  router.get("/", (req, res) => {
    const accounts = listStmt.all(req.userId).map(serialize).sort(compareAccounts);
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
    res.status(201).json(serialize(row));
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
    res.json(serialize(updated));
  });

  router.post("/:id/refresh", async (req, res) => {
    const row = loadOwned(req);
    const cooldownMs = config.refreshCooldownSeconds * 1000;
    if (row.refreshed_at && Date.now() - row.refreshed_at < cooldownMs) {
      // Muy reciente: devolvemos lo guardado sin gastar llamadas a Riot.
      return res.json(serialize(row));
    }
    res.json(serialize(await refresh(row)));
  });

  router.delete("/:id", (req, res) => {
    const row = loadOwned(req);
    deleteStmt.run(row.id, req.userId);
    res.status(204).end();
  });

  return router;
}

module.exports = { accountsRouter };
