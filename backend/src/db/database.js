const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

function openDatabase(dbPath) {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      username          TEXT NOT NULL UNIQUE,
      kdf_salt          TEXT NOT NULL,
      kdf_iterations    INTEGER NOT NULL,
      auth_hash         TEXT NOT NULL,
      wrapped_vault_key TEXT NOT NULL,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash  TEXT PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS accounts (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id           INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      game_name         TEXT NOT NULL,
      tag_line          TEXT NOT NULL,
      platform          TEXT NOT NULL,
      -- Credenciales cifradas en el navegador (AES-256-GCM). El servidor no puede leerlas.
      secret            TEXT NOT NULL,
      puuid             TEXT,
      summoner_level    INTEGER,
      profile_icon_id   INTEGER,
      ranked_json       TEXT,
      refreshed_at      INTEGER,
      refresh_error     TEXT,
      created_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);

    -- Historial de rangos: una fila cada vez que cambia el rango de una cola.
    -- Ligado al puuid para no mezclar historiales si se cambia el Riot ID.
    CREATE TABLE IF NOT EXISTS rank_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      puuid        TEXT NOT NULL,
      queue_type   TEXT NOT NULL,
      tier         TEXT NOT NULL,
      rank         TEXT,
      lp           INTEGER NOT NULL,
      wins         INTEGER NOT NULL,
      losses       INTEGER NOT NULL,
      recorded_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_account
      ON rank_history(account_id, puuid, queue_type, id);

    -- Partidas ranked de cada cuenta (resumen del propio jugador). Inmutables.
    CREATE TABLE IF NOT EXISTS matches (
      account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      puuid         TEXT NOT NULL,
      match_id      TEXT NOT NULL,
      queue_id      INTEGER NOT NULL,
      game_start    INTEGER NOT NULL,
      duration      INTEGER NOT NULL,
      win           INTEGER NOT NULL,
      remake        INTEGER NOT NULL,
      champion_id   INTEGER NOT NULL,
      champion_name TEXT NOT NULL,
      position      TEXT NOT NULL,
      kills         INTEGER NOT NULL,
      deaths        INTEGER NOT NULL,
      assists       INTEGER NOT NULL,
      cs            INTEGER NOT NULL,
      PRIMARY KEY (account_id, match_id)
    );
    CREATE INDEX IF NOT EXISTS idx_matches_account
      ON matches(account_id, puuid, game_start DESC);
  `);

  // Primera vez: sembrar el historial con los rangos ya guardados.
  db.exec(`
    INSERT INTO rank_history (account_id, puuid, queue_type, tier, rank, lp, wins, losses, recorded_at)
    SELECT a.id, a.puuid,
           json_extract(e.value, '$.queueType'), json_extract(e.value, '$.tier'),
           json_extract(e.value, '$.rank'), json_extract(e.value, '$.lp'),
           json_extract(e.value, '$.wins'), json_extract(e.value, '$.losses'),
           a.refreshed_at
    FROM accounts a, json_each(a.ranked_json) e
    WHERE a.puuid IS NOT NULL AND a.refreshed_at IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM rank_history h WHERE h.account_id = a.id);
  `);

  return db;
}

module.exports = { openDatabase };
