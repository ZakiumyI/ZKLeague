const { HttpError } = require("../lib/http");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Defensa contra CSRF además de SameSite=Strict: toda petición que modifica
// datos debe venir de nuestro propio origen y con cuerpo JSON.
function requireSameOrigin(config) {
  return (req, _res, next) => {
    if (SAFE_METHODS.has(req.method)) return next();

    const origin = req.get("origin");
    if (origin !== config.allowedOrigin) {
      return next(new HttpError(403, "Origen no permitido.", "bad_origin"));
    }

    const hasBody = Number(req.get("content-length") || 0) > 0;
    if (hasBody && !req.is("application/json")) {
      return next(new HttpError(415, "Se esperaba JSON.", "bad_content_type"));
    }
    next();
  };
}

module.exports = { requireSameOrigin };
