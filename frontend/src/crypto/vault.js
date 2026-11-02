// Bóveda cifrada en el navegador (WebCrypto). El servidor nunca ve la contraseña
// maestra ni las credenciales en claro.
//
//   contraseña maestra ──PBKDF2-SHA256 (600k, sal por usuario)──▶ masterKey
//   masterKey ──HKDF "zkl-auth"──▶ authKey  (se envía al servidor para iniciar sesión)
//   masterKey ──HKDF "zkl-enc"───▶ encKey   (nunca sale del navegador)
//   vaultKey (AES-256 aleatoria) se guarda en el servidor envuelta con encKey.
//   Cada cuenta: { usuario, contraseña, notas } cifrado con vaultKey (AES-256-GCM).

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const KDF_ITERATIONS = 600_000;
const AAD_VAULT_KEY = enc.encode("zkl:vault-key:v1");
const AAD_ACCOUNT = enc.encode("zkl:account:v1");

export class WrongPasswordError extends Error {
  constructor() {
    super("Contraseña maestra incorrecta.");
    this.name = "WrongPasswordError";
  }
}

export function toB64(bytes) {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromB64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const randomBytes = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function deriveKeys(password, saltB64, iterations) {
  const pwKey = await subtle.importKey(
    "raw",
    enc.encode(password.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const masterBits = await subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(saltB64), iterations },
    pwKey,
    256
  );
  const hkdfKey = await subtle.importKey("raw", masterBits, "HKDF", false, [
    "deriveBits",
    "deriveKey"
  ]);
  const hkdf = (info) => ({
    name: "HKDF",
    hash: "SHA-256",
    salt: new Uint8Array(32),
    info: enc.encode(info)
  });

  const authBits = await subtle.deriveBits(hkdf("zkl-auth"), hkdfKey, 256);
  const encKey = await subtle.deriveKey(
    hkdf("zkl-enc"),
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
  return { authKey: toB64(authBits), encKey };
}

async function seal(key, data, aad) {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key, data);
  return { v: 1, iv: toB64(iv), ct: toB64(ct) };
}

async function open(key, blob, aad) {
  return subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(blob.iv), additionalData: aad },
    key,
    fromB64(blob.ct)
  );
}

const importVaultKey = (raw) =>
  subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

/** Registro: crea sal, claves y una vaultKey nueva envuelta con encKey. */
export async function createVault(password, iterations = KDF_ITERATIONS) {
  const salt = toB64(randomBytes(16));
  const { authKey, encKey } = await deriveKeys(password, salt, iterations);
  const rawVaultKey = randomBytes(32);
  const wrappedVaultKey = await seal(encKey, rawVaultKey, AAD_VAULT_KEY);
  const vaultKey = await importVaultKey(rawVaultKey);
  rawVaultKey.fill(0);
  return { kdf: { salt, iterations }, authKey, wrappedVaultKey, vaultKey };
}

/** Solo deriva la authKey (para el login, antes de tener la vaultKey). */
export async function deriveAuthKey(password, kdf) {
  const { authKey, encKey } = await deriveKeys(password, kdf.salt, kdf.iterations);
  return { authKey, encKey };
}

/** Desenvuelve la vaultKey. Lanza WrongPasswordError si la contraseña no corresponde. */
export async function unwrapVaultKey(encKey, wrappedVaultKey) {
  let raw;
  try {
    raw = new Uint8Array(await open(encKey, wrappedVaultKey, AAD_VAULT_KEY));
  } catch {
    throw new WrongPasswordError();
  }
  const key = await importVaultKey(raw);
  raw.fill(0);
  return key;
}

/** Atajo: contraseña + datos de /me => vaultKey. */
export async function unlockVault(password, kdf, wrappedVaultKey) {
  const { encKey } = await deriveKeys(password, kdf.salt, kdf.iterations);
  return unwrapVaultKey(encKey, wrappedVaultKey);
}

export async function encryptSecret(vaultKey, secret) {
  const payload = enc.encode(
    JSON.stringify({
      username: secret.username ?? "",
      password: secret.password ?? "",
      notes: secret.notes ?? ""
    })
  );
  return seal(vaultKey, payload, AAD_ACCOUNT);
}

export async function decryptSecret(vaultKey, blob) {
  return JSON.parse(dec.decode(await open(vaultKey, blob, AAD_ACCOUNT)));
}
