class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const badRequest = (message) => new HttpError(400, message, "bad_request");

function isBase64(value, { min = 1, max = Infinity } = {}) {
  return (
    typeof value === "string" &&
    value.length >= min &&
    value.length <= max &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}

function requireString(body, field, { min = 1, max = 200, pattern } = {}) {
  const value = body?.[field];
  if (typeof value !== "string") throw badRequest(`Falta el campo "${field}".`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw badRequest(`"${field}" debe tener entre ${min} y ${max} caracteres.`);
  }
  if (pattern && !pattern.test(trimmed)) {
    throw badRequest(`"${field}" tiene un formato inválido.`);
  }
  return trimmed;
}

// Blob cifrado en el cliente: { v, iv, ct } en base64.
function requireCipherBlob(body, field, { maxCt = 8192 } = {}) {
  const blob = body?.[field];
  if (
    !blob ||
    typeof blob !== "object" ||
    blob.v !== 1 ||
    !isBase64(blob.iv, { min: 16, max: 16 }) ||
    !isBase64(blob.ct, { min: 24, max: maxCt })
  ) {
    throw badRequest(`"${field}" no es un bloque cifrado válido.`);
  }
  return JSON.stringify({ v: 1, iv: blob.iv, ct: blob.ct });
}

module.exports = { HttpError, badRequest, isBase64, requireString, requireCipherBlob };
