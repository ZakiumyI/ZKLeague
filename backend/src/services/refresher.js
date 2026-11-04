// Consulta Riot para una cuenta, guarda el perfil y registra en el historial
// los rangos que cambiaron. Lo usan las rutas y la actualización automática.
const { toEntry } = require("../lib/ranks");
const { RiotError } = require("./riot");

function createRefresher({ db, riot }) {
  const getStmt = db.prepare("SELECT * FROM accounts WHERE id = ?");
  const saveProfileStmt = db.prepare(`
    UPDATE accounts SET
      game_name = ?, tag_line = ?, puuid = ?, summoner_level = ?, profile_icon_id = ?,
      ranked_json = ?, refreshed_at = ?, refresh_error = NULL
    WHERE id = ?
  `);
  const saveErrorStmt = db.prepare(
    "UPDATE accounts SET refresh_error = ?, refreshed_at = ? WHERE id = ?"
  );
  const lastSnapshotStmt = db.prepare(`
    SELECT tier, rank, lp, wins, losses FROM rank_history
    WHERE account_id = ? AND puuid = ? AND queue_type = ?
    ORDER BY id DESC LIMIT 1
  `);
  const insertSnapshotStmt = db.prepare(`
    INSERT INTO rank_history (account_id, puuid, queue_type, tier, rank, lp, wins, losses, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const sameSnapshot = (a, b) =>
    a && a.tier === b.tier && a.rank === b.rank && a.lp === b.lp &&
    a.wins === b.wins && a.losses === b.losses;

  const saveProfile = db.transaction((row, profile, entries, now) => {
    saveProfileStmt.run(
      profile.gameName,
      profile.tagLine,
      profile.puuid,
      profile.summonerLevel,
      profile.profileIconId,
      JSON.stringify(entries),
      now,
      row.id
    );
    for (const e of entries) {
      const last = lastSnapshotStmt.get(row.id, profile.puuid, e.queueType);
      if (!sameSnapshot(last, e)) {
        insertSnapshotStmt.run(
          row.id, profile.puuid, e.queueType, e.tier, e.rank, e.lp, e.wins, e.losses, now
        );
      }
    }
  });

  const latestMatchStmt = db.prepare(
    "SELECT MAX(game_start) AS t FROM matches WHERE account_id = ? AND puuid = ?"
  );
  const hasMatchStmt = db.prepare(
    "SELECT 1 FROM matches WHERE account_id = ? AND match_id = ?"
  );
  const insertMatchStmt = db.prepare(`
    INSERT OR IGNORE INTO matches (account_id, puuid, match_id, queue_id, game_start, duration,
      win, remake, champion_id, champion_name, position, kills, deaths, assists, cs)
    VALUES (@accountId, @puuid, @matchId, @queueId, @gameStart, @duration,
      @win, @remake, @championId, @championName, @position, @kills, @deaths, @assists, @cs)
  `);

  // "LA2_1234567" => 1234567 (los ids crecen con el tiempo)
  const matchNum = (id) => Number(id.split("_")[1]) || 0;

  // Descarga las partidas ranked nuevas, de la más antigua a la más nueva, para
  // que si se corta por tiempo la próxima sincronización continúe donde quedó.
  async function syncMatches(row, deadline) {
    const { id: accountId, puuid, platform } = row;
    const latest = latestMatchStmt.get(accountId, puuid).t;
    let ids;
    if (latest) {
      ids = await riot.fetchRankedMatchIds({
        puuid, platform, count: 30, startTime: Math.floor(latest / 1000) + 1
      });
    } else {
      // Primera vez: últimas ranked + algunas de Solo/Q y Flex por separado,
      // para poder estimar el decay aunque una cola se juegue poco.
      const lists = await Promise.all([
        riot.fetchRankedMatchIds({ puuid, platform, count: 20 }),
        riot.fetchRankedMatchIds({ puuid, platform, count: 10, queue: 420 }),
        riot.fetchRankedMatchIds({ puuid, platform, count: 10, queue: 440 })
      ]);
      ids = [...new Set(lists.flat())];
    }
    const pending = ids
      .filter((m) => !hasMatchStmt.get(accountId, m))
      .sort((a, b) => matchNum(a) - matchNum(b));

    let saved = 0;
    for (const matchId of pending) {
      if (Date.now() > deadline) break;
      const summary = await riot.fetchMatchSummary({ matchId, puuid, platform });
      if (summary) {
        insertMatchStmt.run({
          ...summary,
          accountId,
          puuid,
          win: summary.win ? 1 : 0,
          remake: summary.remake ? 1 : 0
        });
        saved++;
      }
    }
    return { saved, pending: pending.length - saved };
  }

  /** @returns {{ row: object, error: Error | null }} */
  return async function refresh(row, { matchBudgetMs = Infinity } = {}) {
    try {
      const profile = await riot.fetchProfile({
        gameName: row.game_name,
        tagLine: row.tag_line,
        platform: row.platform
      });
      saveProfile(row, profile, profile.entries.map(toEntry), Date.now());
      const updated = getStmt.get(row.id);
      // Las partidas son un extra: si fallan, el perfil ya quedó guardado.
      try {
        await syncMatches(updated, Date.now() + matchBudgetMs);
      } catch (err) {
        if (!(err instanceof RiotError)) console.error("[riot] error en partidas:", err);
      }
      return { row: updated, error: null };
    } catch (err) {
      if (!(err instanceof RiotError) && err.name !== "TimeoutError") {
        console.error("[riot] error inesperado:", err);
      }
      const message = err instanceof RiotError ? err.message : "No se pudo contactar a Riot.";
      saveErrorStmt.run(message, Date.now(), row.id);
      return { row: getStmt.get(row.id), error: err };
    }
  };
}

module.exports = { createRefresher };
