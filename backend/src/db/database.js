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
  `);

  return db;
}

module.exports = { openDatabase };
