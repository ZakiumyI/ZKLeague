const { HttpError } = require("../lib/http");
const { newSessionToken, sha256 } = require("../lib/security");

function cookieName(config) {
  // El prefijo __Host- obliga a Secure, Path=/ y sin Domain (solo en HTTPS).
  return config.isProduction ? "__Host-zkl_session" : "zkl_session";
}

function parseCookies(header = "") {
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function createSessionStore(db, config) {
  const insert = db.prepare(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)"
  );
  const find = db.prepare(
    "SELECT user_id, expires_at FROM sessions WHERE token_hash = ?"
  );
  const remove = db.prepare("DELETE FROM sessions WHERE token_hash = ?");
  const purge = db.prepare("DELETE FROM sessions WHERE expires_at < ?");

  const maxAgeMs = config.sessionDays * 24 * 60 * 60 * 1000;

  function cookieOptions() {
    return {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: maxAgeMs
    };
  }

  return {
    start(res, userId) {
      const token = newSessionToken();
      const now = Date.now();
      purge.run(now);
      insert.run(sha256(token), userId, now + maxAgeMs, now);
      res.cookie(cookieName(config), token, cookieOptions());
    },

    end(req, res) {
      const token = parseCookies(req.headers.cookie)[cookieName(config)];
      if (token) remove.run(sha256(token));
      const { maxAge, ...opts } = cookieOptions();
      res.clearCookie(cookieName(config), opts);
    },

    // Middleware: rellena req.userId si hay sesión válida.
    load(req, _res, next) {
      const token = parseCookies(req.headers.cookie)[cookieName(config)];
      if (token) {
        const tokenHash = sha256(token);
        const row = find.get(tokenHash);
        if (row && row.expires_at > Date.now()) {
          req.userId = row.user_id;
        } else if (row) {
          remove.run(tokenHash);
        }
      }
      next();
    }
  };
}

function requireAuth(req, _res, next) {
  if (!req.userId) {
    return next(new HttpError(401, "Inicia sesión para continuar.", "unauthorized"));
  }
  next();
}

module.exports = { createSessionStore, requireAuth };
