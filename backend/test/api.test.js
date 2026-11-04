// Flujo completo: registro → cuentas cifradas → login → desbloqueo, con un
// cliente de Riot simulado. Usa la bóveda real del frontend (WebCrypto).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { openDatabase } = require("../src/db/database");
const { createApp } = require("../src/app");
const { RiotError } = require("../src/services/riot");

const ORIGIN = "http://localhost:5173";
const config = {
  isProduction: false,
  allowedOrigin: ORIGIN,
  sessionSecret: "x".repeat(40),
  sessionDays: 7,
  registrationOpen: true,
  riotQueue5v5: ["RANKED_TEAM_5x5"],
  refreshCooldownSeconds: 60,
  frontendDist: "/nonexistent"
};

const fakeRiot = {
  calls: 0,
  async fetchRankedMatchIds() { return []; },
  async fetchMatchSummary() { return null; },
  async fetchProfile({ gameName, tagLine }) {
    this.calls++;
    if (gameName === "NoExiste") throw new RiotError(404, "Riot ID no encontrado en esa región.");
    return {
      puuid: `puuid-${gameName}`,
      gameName,
      tagLine,
      summonerLevel: gameName === "Alta" ? 100 : 300,
      profileIconId: 29,
      entries:
        gameName === "Alta"
          ? [{ queueType: "RANKED_SOLO_5x5", tier: "DIAMOND", rank: "II", leaguePoints: 40, wins: 10, losses: 5 }]
          : []
    };
  }
};

let vault;
let server;
let base;

test.before(async () => {
  vault = await import(path.join(__dirname, "../../frontend/src/crypto/vault.js"));
  const db = openDatabase(":memory:");
  const app = createApp({ config, db, riot: fakeRiot });
  await new Promise((r) => (server = app.listen(0, "127.0.0.1", r)));
  base = `http://127.0.0.1:${server.address().port}/api`;
});

test.after(() => server.close());

function client() {
  let cookie = "";
  return async (method, url, body, { origin = ORIGIN } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(origin ? { Origin: origin } : {}),
        ...(cookie ? { Cookie: cookie } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, setCookie };
  };
}

const ITER = 600_000;

test("flujo completo de la bóveda", async () => {
  const api = client();
  const password = "una contraseña maestra larga";

  // Registro
  const created = await vault.createVault(password, ITER);
  const reg = await api("POST", "/auth/register", {
    username: "Zakiumy",
    authKey: created.authKey,
    kdf: created.kdf,
    wrappedVaultKey: created.wrappedVaultKey
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.body.username, "zakiumy");
  assert.match(reg.setCookie, /HttpOnly/i);
  assert.match(reg.setCookie, /SameSite=Strict/i);

  // Crear cuentas con credenciales cifradas
  const secret = await vault.encryptSecret(created.vaultKey, {
    username: "mi_login_secreto",
    password: "p4ss!"
  });
  const a1 = await api("POST", "/accounts", { gameName: "Baja", tagLine: "#LAS", platform: "la2", secret });
  assert.equal(a1.status, 201);
  assert.equal(a1.body.tagLine, "LAS");
  const a2 = await api("POST", "/accounts", { gameName: "Alta", tagLine: "LAS", platform: "LA2", secret });
  assert.equal(a2.status, 201);

  // Riot falla => la cuenta se guarda igual, con el error
  const a3 = await api("POST", "/accounts", { gameName: "NoExiste", tagLine: "X", platform: "la2", secret });
  assert.equal(a3.status, 201);
  assert.equal(a3.body.refreshError, "Riot ID no encontrado en esa región.");

  // Orden: Diamond primero aunque tenga menos nivel
  const list = await api("GET", "/accounts");
  assert.deepEqual(list.body.map((a) => a.gameName), ["Alta", "Baja", "NoExiste"]);
  assert.equal(list.body[0].ranked.solo.tier, "DIAMOND");

  // El servidor no tiene las credenciales en claro
  assert.ok(!JSON.stringify(list.body).includes("mi_login_secreto"));

  // Login en otro "navegador": prelogin → derivar → login → desenvolver
  const api2 = client();
  const pre = await api2("POST", "/auth/prelogin", { username: "zakiumy" });
  assert.deepEqual(pre.body.kdf, created.kdf);
  const { authKey, encKey } = await vault.deriveAuthKey(password, pre.body.kdf);
  const login = await api2("POST", "/auth/login", { username: "zakiumy", authKey });
  assert.equal(login.status, 200);
  const vaultKey = await vault.unwrapVaultKey(encKey, login.body.wrappedVaultKey);
  const accounts = await api2("GET", "/accounts");
  const plain = await vault.decryptSecret(vaultKey, accounts.body[0].secret);
  assert.equal(plain.username, "mi_login_secreto");
  assert.equal(plain.password, "p4ss!");

  // Contraseña incorrecta
  const bad = await vault.deriveAuthKey("otra contraseña", pre.body.kdf);
  const badLogin = await api2("POST", "/auth/login", { username: "zakiumy", authKey: bad.authKey });
  assert.equal(badLogin.status, 401);
  await assert.rejects(
    vault.unlockVault("otra contraseña", login.body.kdf, login.body.wrappedVaultKey),
    vault.WrongPasswordError
  );

  // Desbloqueo con /me
  const me = await api2("GET", "/auth/me");
  const k = await vault.unlockVault(password, me.body.kdf, me.body.wrappedVaultKey);
  assert.equal((await vault.decryptSecret(k, accounts.body[1].secret)).password, "p4ss!");

  // Refresh con cooldown no vuelve a llamar a Riot
  const before = fakeRiot.calls;
  await api2("POST", `/accounts/${a1.body.id}/refresh`);
  assert.equal(fakeRiot.calls, before);

  // Editar credenciales
  const newSecret = await vault.encryptSecret(vaultKey, { username: "nuevo", password: "nueva" });
  const patched = await api2("PATCH", `/accounts/${a1.body.id}`, { secret: newSecret });
  assert.equal((await vault.decryptSecret(vaultKey, patched.body.secret)).username, "nuevo");

  // Borrar
  assert.equal((await api2("DELETE", `/accounts/${a3.body.id}`)).status, 204);
  assert.equal((await api2("GET", "/accounts")).body.length, 2);

  // Logout invalida la sesión
  assert.equal((await api2("POST", "/auth/logout")).status, 204);
  assert.equal((await api2("GET", "/accounts")).status, 401);
});

test("aislamiento entre usuarios", async () => {
  const owner = client();
  const v = await vault.createVault("contraseña del dueño", ITER);
  await owner("POST", "/auth/register", { username: "dueno", authKey: v.authKey, kdf: v.kdf, wrappedVaultKey: v.wrappedVaultKey });
  const secret = await vault.encryptSecret(v.vaultKey, { username: "u", password: "p" });
  const acc = await owner("POST", "/accounts", { gameName: "Baja", tagLine: "LAS", platform: "la2", secret });

  const other = client();
  const v2 = await vault.createVault("contraseña del intruso", ITER);
  await other("POST", "/auth/register", { username: "intruso", authKey: v2.authKey, kdf: v2.kdf, wrappedVaultKey: v2.wrappedVaultKey });
  assert.equal((await other("GET", "/accounts")).body.length, 0);
  assert.equal((await other("DELETE", `/accounts/${acc.body.id}`)).status, 404);
  assert.equal((await other("PATCH", `/accounts/${acc.body.id}`, { gameName: "x" })).status, 404);
});

test("protecciones", async () => {
  const api = client();
  // Sin sesión
  assert.equal((await api("GET", "/accounts")).status, 401);
  // Origen ajeno (CSRF)
  const evil = await api("POST", "/auth/prelogin", { username: "zakiumy" }, { origin: "https://evil.example" });
  assert.equal(evil.status, 403);
  // Prelogin de usuario inexistente devuelve una sal estable y no revela nada
  const p1 = await api("POST", "/auth/prelogin", { username: "fantasma" });
  const p2 = await api("POST", "/auth/prelogin", { username: "fantasma" });
  assert.equal(p1.status, 200);
  assert.deepEqual(p1.body, p2.body);
  // Usuario duplicado
  const v = await vault.createVault("lo que sea largo", ITER);
  const dup = await api("POST", "/auth/register", { username: "zakiumy", authKey: v.authKey, kdf: v.kdf, wrappedVaultKey: v.wrappedVaultKey });
  assert.equal(dup.status, 409);
  // Iteraciones débiles rechazadas
  const weak = await api("POST", "/auth/register", { username: "debil", authKey: v.authKey, kdf: { ...v.kdf, iterations: 1000 }, wrappedVaultKey: v.wrappedVaultKey });
  assert.equal(weak.status, 400);
});
