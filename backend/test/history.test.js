// Historial de rangos, último rango conocido y actualización automática.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { openDatabase } = require("../src/db/database");
const { createApp } = require("../src/app");
const { createRefresher } = require("../src/services/refresher");
const { startAutoRefresh } = require("../src/services/autoRefresh");
const { RiotError } = require("../src/services/riot");

const ORIGIN = "http://localhost:5173";
const config = {
  isProduction: false,
  allowedOrigin: ORIGIN,
  sessionSecret: "x".repeat(40),
  sessionDays: 7,
  registrationOpen: true,
  riotQueue5v5: ["RANKED_TEAM_5x5"],
  refreshCooldownSeconds: 0,
  frontendDist: "/nonexistent"
};

// Riot simulado con estado mutable por cuenta.
const state = {};
const riot = {
  calls: 0,
  fail: null,
  async fetchProfile({ gameName, tagLine }) {
    this.calls++;
    if (this.fail) throw this.fail;
    const s = state[gameName];
    return {
      puuid: s.puuid ?? `puuid-${gameName}`,
      gameName,
      tagLine,
      summonerLevel: s.level ?? 100,
      profileIconId: 1,
      entries: s.entries.map(([queueType, tier, rank, lp, wins = 10, losses = 10]) => ({
        queueType, tier, rank, leaguePoints: lp, wins, losses
      }))
    };
  }
};

let vault, server, base, db, created;

test.before(async () => {
  vault = await import(path.join(__dirname, "../../frontend/src/crypto/vault.js"));
  db = openDatabase(":memory:");
  server = await new Promise((r) => {
    const s = createApp({ config, db, riot }).listen(0, "127.0.0.1", () => r(s));
  });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => server.close());

let cookie = "";
async function api(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: {
      Origin: ORIGIN,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const sc = res.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function addAccount(gameName) {
  const secret = await vault.encryptSecret(created.vaultKey, { username: "u", password: "p" });
  return (await api("POST", "/accounts", { gameName, tagLine: "LAS", platform: "la2", secret })).body;
}

test("historial, último rango conocido y orden", async () => {
  created = await vault.createVault("contraseña maestra larga", 600_000);
  await api("POST", "/auth/register", {
    username: "hist",
    authKey: created.authKey,
    kdf: created.kdf,
    wrappedVaultKey: created.wrappedVaultKey
  });

  state.Veterana = { entries: [["RANKED_SOLO_5x5", "DIAMOND", "I", 50]] };
  state.Activa = { entries: [["RANKED_SOLO_5x5", "IRON", "IV", 0]] };
  state.Nunca = { entries: [], level: 900 };
  const vet = await addAccount("Veterana");
  await addAccount("Activa");
  await addAccount("Nunca");

  // Refrescar sin cambios no duplica el historial
  await api("POST", `/accounts/${vet.id}/refresh`);
  let hist = (await api("GET", `/accounts/${vet.id}/history`)).body;
  assert.equal(hist.length, 1);

  // Cambio de LP => nueva fila
  state.Veterana.entries = [["RANKED_SOLO_5x5", "DIAMOND", "I", 75, 11, 10]];
  await api("POST", `/accounts/${vet.id}/refresh`);
  hist = (await api("GET", `/accounts/${vet.id}/history`)).body;
  assert.equal(hist.length, 2);
  assert.equal(hist[1].lp, 75);

  // Reinicio de temporada: Veterana queda unranked
  state.Veterana.entries = [];
  const after = (await api("POST", `/accounts/${vet.id}/refresh`)).body;
  assert.equal(after.ranked.solo, null);
  assert.equal(after.lastKnown.solo.tier, "DIAMOND");
  assert.equal(after.lastKnown.solo.lp, 75);
  assert.ok(after.lastKnown.solo.recordedAt > 0);

  // Orden: rango actual (aunque sea Iron) > último conocido Diamante > nada (aunque nivel 900)
  const list = (await api("GET", "/accounts")).body;
  assert.deepEqual(list.map((a) => a.gameName), ["Activa", "Veterana", "Nunca"]);
});

test("cambiar el Riot ID a otra cuenta no hereda su historial", async () => {
  state.Original = { entries: [["RANKED_FLEX_SR", "GOLD", "II", 10]] };
  state.Otra = { entries: [] };
  const acc = await addAccount("Original");
  assert.equal(acc.lastKnown.flex.tier, "GOLD");
  const patched = (await api("PATCH", `/accounts/${acc.id}`, { gameName: "Otra" })).body;
  assert.equal(patched.lastKnown.flex, null);
  assert.equal((await api("GET", `/accounts/${acc.id}/history`)).body.length, 0);
});

test("la siembra inicial migra rangos ya guardados", () => {
  const { openDatabase: reopen } = require("../src/db/database");
  // Base con rangos de la versión anterior (sin historial); al reabrirla se siembra.
  const fs = require("fs");
  const os = require("os");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "zkl-")), "t.sqlite");
  const d1 = reopen(file);
  d1.prepare("INSERT INTO users (username, kdf_salt, kdf_iterations, auth_hash, wrapped_vault_key) VALUES ('u','s',1,'h','{}')").run();
  d1.prepare(`INSERT INTO accounts (user_id, game_name, tag_line, platform, secret, puuid, ranked_json, refreshed_at, created_at, updated_at)
              VALUES (1,'a','b','la2','{}','p1',?,123,1,1)`).run(
    JSON.stringify([{ queueType: "RANKED_SOLO_5x5", tier: "GOLD", rank: "I", lp: 5, wins: 1, losses: 2 }])
  );
  d1.exec("DELETE FROM rank_history");
  d1.close();
  const d2 = reopen(file);
  const rows = d2.prepare("SELECT * FROM rank_history").all();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tier, "GOLD");
  assert.equal(rows[0].puuid, "p1");
  // Una segunda apertura no duplica
  d2.close();
  assert.equal(reopen(file).prepare("SELECT COUNT(*) c FROM rank_history").get().c, 1);
});

test("auto-refresh actualiza cuentas viejas y se detiene si la key expiró", async () => {
  db.prepare("UPDATE accounts SET refreshed_at = 1").run();
  const refresh = createRefresher({ db, riot });
  const total = db.prepare("SELECT COUNT(*) c FROM accounts").get().c;

  // Simulamos el temporizador: llamamos al ciclo directamente
  const logs = [];
  const log = { log: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) };

  // Key expirada: debe detenerse tras la primera cuenta
  riot.fail = new RiotError(403, "La API key de Riot es inválida o expiró.");
  const before = riot.calls;
  await runOnce({ refresh, log });
  assert.equal(riot.calls - before, 1);
  assert.ok(logs.some((l) => String(l).includes("detenido")));

  // Key buena: actualiza todas
  riot.fail = null;
  db.prepare("UPDATE accounts SET refreshed_at = 1").run();
  const before2 = riot.calls;
  await runOnce({ refresh, log });
  assert.equal(riot.calls - before2, total);
});

// Ejecuta un ciclo del auto-refresh sin esperar los temporizadores reales.
async function runOnce({ refresh, log }) {
  const timers = [];
  const realSetTimeout = global.setTimeout;
  const realSetInterval = global.setInterval;
  global.setTimeout = (fn) => (timers.push(fn), { unref() {} });
  global.setInterval = () => ({ unref() {} });
  try {
    startAutoRefresh({ db, refresh, hours: 12, log });
  } finally {
    global.setTimeout = realSetTimeout;
    global.setInterval = realSetInterval;
  }
  await timers[0]();
}
