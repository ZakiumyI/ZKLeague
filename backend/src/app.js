const fs = require("fs");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const { HttpError } = require("./lib/http");
const { createSessionStore, requireAuth } = require("./middleware/session");
const { requireSameOrigin } = require("./middleware/origin");
const { authRouter } = require("./routes/auth");
const { accountsRouter } = require("./routes/accounts");

function createApp({ config, db, riot }) {
  const app = express();
  const sessions = createSessionStore(db, config);

  // Detrás de Caddy (mismo servidor): confiar en X-Forwarded-For de loopback.
  app.set("trust proxy", "loopback");
  app.disable("x-powered-by");

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "default-src": ["'self'"],
          "img-src": ["'self'", "data:", "https://raw.communitydragon.org"],
          "connect-src": ["'self'"],
          "object-src": ["'none'"],
          "base-uri": ["'self'"],
          "frame-ancestors": ["'none'"],
          "form-action": ["'self'"]
        }
      },
      referrerPolicy: { policy: "no-referrer" }
    })
  );

  const api = express.Router();
  api.use(express.json({ limit: "32kb" }));
  api.use(requireSameOrigin(config));
  api.use(sessions.load);
  api.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

  api.use("/auth", authRouter({ db, config, sessions }));
  api.use("/accounts", requireAuth, accountsRouter({ db, config, riot }));
  api.get("/health", (_req, res) => res.json({ ok: true }));
  api.use((_req, _res, next) => next(new HttpError(404, "Ruta no encontrada.", "not_found")));

  app.use("/api", api);

  // En producción el backend sirve también el frontend compilado.
  const indexHtml = path.join(config.frontendDist, "index.html");
  if (fs.existsSync(indexHtml)) {
    app.use(express.static(config.frontendDist, { index: false, maxAge: "1h" }));
    app.get("/{*splat}", (_req, res) => res.sendFile(indexHtml));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    if (err.type === "entity.parse.failed") {
      return res.status(400).json({ error: "JSON inválido.", code: "bad_json" });
    }
    if (err.type === "entity.too.large") {
      return res.status(413).json({ error: "Petición demasiado grande.", code: "too_large" });
    }
    console.error(err);
    res.status(500).json({ error: "Error interno del servidor.", code: "internal" });
  });

  return app;
}

module.exports = { createApp };
