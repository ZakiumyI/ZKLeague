// Sincronización de partidas: incremental, de antigua a nueva, con corte por tiempo.
const test = require("node:test");
const assert = require("node:assert/strict");
const { openDatabase } = require("../src/db/database");
const { createRefresher } = require("../src/services/refresher");

const DAY = 24 * 60 * 60 * 1000;

function setup() {
  const db = openDatabase(":memory:");
  db.prepare(
    "INSERT INTO users (username, kdf_salt, kdf_iterations, auth_hash, wrapped_vault_key) VALUES ('u','s',1,'h','{}')"
  ).run();
  db.prepare(
    `INSERT INTO accounts (user_id, game_name, tag_line, platform, secret, created_at, updated_at)
     VALUES (1, 'Zak', 'LAS', 'la2', '{}', 1, 1)`
  ).run();

  // 25 partidas: LA2_1..LA2_25, una por día; las pares son flex.
  const now = Date.now();
  const all = Array.from({ length: 25 }, (_, i) => ({
    matchId: `LA2_${i + 1}`,
    queueId: i % 2 ? 440 : 420,
    gameStart: now - (25 - i) * DAY,
    duration: 1800,
    win: i % 3 !== 0,
    remake: false,
    championId: 103,
    championName: "Ahri",
    position: "MIDDLE",
    kills: 5,
    deaths: 2,
    assists: 7,
    cs: 200
  }));

  const riot = {
    detailCalls: 0,
    known: all.slice(0, 20),
    async fetchProfile() {
      return { puuid: "p1", gameName: "Zak", tagLine: "LAS", summonerLevel: 300, profileIconId: 1,
        entries: [{ queueType: "RANKED_SOLO_5x5", tier: "DIAMOND", rank: "IV", leaguePoints: 10, wins: 1, losses: 1 }] };
    },
    async fetchRankedMatchIds({ count, startTime, queue }) {
      return this.known
        .filter((m) => (!queue || m.queueId === queue) && (!startTime || m.gameStart >= startTime * 1000))
        .map((m) => m.matchId)
        .reverse() // Riot devuelve las más nuevas primero
        .slice(0, count);
    },
    async fetchMatchSummary({ matchId }) {
      this.detailCalls++;
      return all.find((m) => m.matchId === matchId);
    }
  };
  return { db, riot, all, row: () => db.prepare("SELECT * FROM accounts WHERE id = 1").get() };
}

const ids = (db) =>
  db.prepare("SELECT match_id FROM matches ORDER BY game_start").all().map((r) => r.match_id);

test("primera sincronización guarda todas y no repite", async () => {
  const { db, riot, row } = setup();
  const refresh = createRefresher({ db, riot });
  await refresh(row());
  assert.equal(ids(db).length, 20);
  const calls = riot.detailCalls;
  await refresh(row());
  assert.equal(riot.detailCalls, calls, "no vuelve a descargar partidas ya guardadas");
});

test("incremental: solo descarga las nuevas", async () => {
  const { db, riot, all, row } = setup();
  const refresh = createRefresher({ db, riot });
  await refresh(row());
  riot.known = all; // se jugaron 5 más
  const before = riot.detailCalls;
  await refresh(row());
  assert.equal(riot.detailCalls - before, 5);
  assert.equal(ids(db).length, 25);
});

test("corte por tiempo: guarda las más antiguas y continúa después", async () => {
  const { db, riot, row } = setup();
  const refresh = createRefresher({ db, riot });
  // Presupuesto 0: el corte ocurre antes de la primera descarga
  await refresh(row(), { matchBudgetMs: -1 });
  assert.equal(ids(db).length, 0);
  // Simula un corte a mitad: solo deja pasar 7 descargas
  const orig = riot.fetchMatchSummary.bind(riot);
  let n = 0;
  const realNow = Date.now;
  riot.fetchMatchSummary = async (args) => {
    if (++n === 7) Date.now = () => realNow() + 60_000;
    return orig(args);
  };
  await refresh(row(), { matchBudgetMs: 30_000 });
  Date.now = realNow;
  assert.equal(ids(db).length, 7);
  assert.deepEqual(ids(db), ["LA2_1", "LA2_2", "LA2_3", "LA2_4", "LA2_5", "LA2_6", "LA2_7"]);
  // La siguiente sincronización completa el resto
  riot.fetchMatchSummary = orig;
  await refresh(row());
  assert.equal(ids(db).length, 20);
});

test("si Riot falla en partidas, el perfil se guarda igual", async () => {
  const { db, riot, row } = setup();
  riot.fetchRankedMatchIds = async () => {
    const { RiotError } = require("../src/services/riot");
    throw new RiotError(429, "Límite");
  };
  const refresh = createRefresher({ db, riot });
  const { row: r, error } = await refresh(row());
  assert.equal(error, null);
  assert.equal(r.summoner_level, 300);
});
