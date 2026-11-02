const express = require("express");
const rateLimit = require("express-rate-limit");
const {
  HttpError,
  badRequest,
  isBase64,
  requireString,
  requireCipherBlob
} = require("../lib/http");
const {
  hashAuthKey,
  verifyAuthKey,
  dummyHash,
  fakeKdfSalt
} = require("../lib/security");
const { requireAuth } = require("../middleware/session");

const USERNAME = { min: 3, max: 32, pattern: /^[a-z0-9._-]+$/ };
const MIN_ITERATIONS = 600_000;
const MAX_ITERATIONS = 5_000_000;

function readUsername(body) {
  if (typeof body?.username === "string") body.username = body.username.toLowerCase();
  return requireString(body, "username", USERNAME);
}

function readAuthKey(body) {
  // 32 bytes en base64 => 44 caracteres
  if (!isBase64(body?.authKey, { min: 44, max: 44 })) {
    throw badRequest("authKey inválida.");
  }
  return body.authKey;
}

function authRouter({ db, config, sessions }) {
  const router = express.Router();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Demasiados intentos. Espera unos minutos.", code: "rate_limited" }
  });

  const findUser = db.prepare("SELECT * FROM users WHERE username = ?");
  const insertUser = db.prepare(`
    INSERT INTO users (username, kdf_salt, kdf_iterations, auth_hash, wrapped_vault_key)
    VALUES (?, ?, ?, ?, ?)
  `);
  const findById = db.prepare(
    "SELECT username, kdf_salt, kdf_iterations, wrapped_vault_key FROM users WHERE id = ?"
  );

  const vaultInfo = (user) => ({
    username: user.username,
    kdf: { salt: user.kdf_salt, iterations: user.kdf_iterations },
    wrappedVaultKey: JSON.parse(user.wrapped_vault_key)
  });

  router.get("/config", (_req, res) => {
    res.json({ registrationOpen: config.registrationOpen });
  });

  // Paso 1 del login: el cliente necesita la sal para derivar sus claves.
  router.post("/prelogin", limiter, (req, res) => {
    const username = readUsername(req.body);
    const user = findUser.get(username);
    res.json({
      kdf: user
        ? { salt: user.kdf_salt, iterations: user.kdf_iterations }
        : { salt: fakeKdfSalt(config.sessionSecret, username), iterations: MIN_ITERATIONS }
    });
  });

  router.post("/register", limiter, async (req, res) => {
    if (!config.registrationOpen) {
      throw new HttpError(403, "El registro está cerrado.", "registration_closed");
    }
    const username = readUsername(req.body);
    const authKey = readAuthKey(req.body);
    const salt = req.body?.kdf?.salt;
    const iterations = req.body?.kdf?.iterations;
    if (!isBase64(salt, { min: 24, max: 24 })) throw badRequest("Sal KDF inválida.");
    if (
      !Number.isInteger(iterations) ||
      iterations < MIN_ITERATIONS ||
      iterations > MAX_ITERATIONS
    ) {
      throw badRequest("Iteraciones KDF inválidas.");
    }
    const wrapped = requireCipherBlob(req.body, "wrappedVaultKey", { maxCt: 128 });

    if (findUser.get(username)) {
      throw new HttpError(409, "Ese nombre de usuario ya existe.", "username_taken");
    }

    const authHash = await hashAuthKey(authKey);
    let userId;
    try {
      userId = insertUser.run(username, salt, iterations, authHash, wrapped).lastInsertRowid;
    } catch (err) {
      if (err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw new HttpError(409, "Ese nombre de usuario ya existe.", "username_taken");
      }
      throw err;
    }

    sessions.start(res, Number(userId));
    res.status(201).json(vaultInfo(findById.get(userId)));
  });

  router.post("/login", limiter, async (req, res) => {
    const username = readUsername(req.body);
    const authKey = readAuthKey(req.body);
    const user = findUser.get(username);

    const ok = user
      ? await verifyAuthKey(authKey, user.auth_hash)
      : await verifyAuthKey(authKey, await dummyHash()).then(() => false);

    if (!ok) {
      throw new HttpError(401, "Usuario o contraseña maestra incorrectos.", "bad_credentials");
    }

    sessions.start(res, user.id);
    res.json(vaultInfo(user));
  });

  router.post("/logout", (req, res) => {
    sessions.end(req, res);
    res.status(204).end();
  });

  // Para desbloquear tras recargar la página: la sesión sigue viva, pero la
  // clave de la bóveda solo existe en memoria del navegador.
  router.get("/me", requireAuth, (req, res) => {
    const user = findById.get(req.userId);
    if (!user) throw new HttpError(401, "Sesión inválida.", "unauthorized");
    res.json(vaultInfo(user));
  });

  return router;
}

module.exports = { authRouter };
