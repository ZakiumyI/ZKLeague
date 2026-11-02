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

  /** @returns {{ row: object, error: Error | null }} */
  return async function refresh(row) {
    try {
      const profile = await riot.fetchProfile({
        gameName: row.game_name,
        tagLine: row.tag_line,
        platform: row.platform
      });
      saveProfile(row, profile, profile.entries.map(toEntry), Date.now());
      return { row: getStmt.get(row.id), error: null };
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
