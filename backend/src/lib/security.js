const crypto = require("crypto");
const { promisify } = require("util");

const scrypt = promisify(crypto.scrypt);

// El cliente nunca envía la contraseña maestra: envía una "authKey" derivada
// (PBKDF2 + HKDF). Aun así la hasheamos con scrypt para que una filtración de la
// base de datos no permita iniciar sesión directamente con lo guardado.
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLen: 32, maxmem: 64 * 1024 * 1024 };

async function hashAuthKey(authKey) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(authKey, salt, SCRYPT.keyLen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
    maxmem: SCRYPT.maxmem
  });
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    hash.toString("base64")
  ].join("$");
}

async function verifyAuthKey(authKey, stored) {
  const [alg, N, r, p, saltB64, hashB64] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(authKey, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    maxmem: SCRYPT.maxmem
  });
  return crypto.timingSafeEqual(actual, expected);
}

// Hash "señuelo" para igualar el tiempo de respuesta cuando el usuario no existe.
let dummyHashPromise;
function dummyHash() {
  dummyHashPromise ??= hashAuthKey(crypto.randomBytes(32).toString("base64"));
  return dummyHashPromise;
}

// Sal falsa pero estable para usuarios inexistentes: así /prelogin no revela
// qué nombres de usuario están registrados.
function fakeKdfSalt(secret, username) {
  return crypto
    .createHmac("sha256", secret)
    .update(`kdf-salt:${username}`)
    .digest()
    .subarray(0, 16)
    .toString("base64");
}

function newSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = {
  hashAuthKey,
  verifyAuthKey,
  dummyHash,
  fakeKdfSalt,
  newSessionToken,
  sha256
};
