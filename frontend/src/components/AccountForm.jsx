import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import PasswordInput from "./PasswordInput.jsx";
import { api } from "../lib/api.js";
import { decryptSecret, encryptSecret } from "../crypto/vault.js";

// "Nombre#TAG" → { gameName, tagLine }. El nombre puede tener espacios.
function parseRiotId(value) {
  const idx = value.lastIndexOf("#");
  if (idx <= 0) return null;
  const gameName = value.slice(0, idx).trim();
  const tagLine = value.slice(idx + 1).trim();
  if (!gameName || !tagLine) return null;
  return { gameName, tagLine };
}

export default function AccountForm({ account, platforms, vaultKey, onClose, onSaved, onError }) {
  const isEdit = Boolean(account);
  const [riotId, setRiotId] = useState(isEdit ? `${account.gameName}#${account.tagLine}` : "");
  const [platform, setPlatform] = useState(account?.platform ?? "la2");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(isEdit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isEdit) return;
    decryptSecret(vaultKey, account.secret)
      .then((s) => {
        setUsername(s.username);
        setPassword(s.password);
        setNotes(s.notes);
      })
      .catch(() => setError("No se pudieron descifrar las credenciales."))
      .finally(() => setLoading(false));
  }, [isEdit, account, vaultKey]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    setError("");
    const id = parseRiotId(riotId);
    if (!id) return setError('Riot ID inválido. Formato: "Nombre#TAG".');
    if (!username.trim() || !password) return setError("Usuario y contraseña son obligatorios.");

    setBusy(true);
    try {
      const secret = await encryptSecret(vaultKey, {
        username: username.trim(),
        password,
        notes: notes.trim()
      });
      const payload = { ...id, platform, secret };
      const saved = isEdit
        ? await api.updateAccount(account.id, payload)
        : await api.createAccount(payload);
      onSaved(saved);
    } catch (err) {
      setBusy(false);
      if (err.status === 401) return onError(err);
      setError(err.message);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-form-title"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
        autoComplete="off"
      >
        <div className="flex items-center justify-between">
          <h2 id="account-form-title" className="text-lg font-semibold">
            {isEdit ? "Editar cuenta" : "Añadir cuenta"}
          </h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-10 text-zinc-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <div>
                <label htmlFor="riotId" className="label">Riot ID</label>
                <input
                  id="riotId"
                  className="input"
                  placeholder="Nombre#TAG"
                  value={riotId}
                  onChange={(e) => setRiotId(e.target.value)}
                  spellCheck={false}
                  autoFocus
                  required
                />
              </div>
              <div>
                <label htmlFor="platform" className="label">Servidor</label>
                <select
                  id="platform"
                  className="input"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  {platforms.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="login-user" className="label">Usuario de inicio de sesión</label>
              <input
                id="login-user"
                className="input font-mono"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                autoCapitalize="off"
                data-1p-ignore
                data-lpignore="true"
                required
              />
            </div>

            <div>
              <label htmlFor="login-pass" className="label">Contraseña de la cuenta</label>
              <PasswordInput
                id="login-pass"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                data-1p-ignore
                data-lpignore="true"
                required
              />
            </div>

            <div>
              <label htmlFor="notes" className="label">Notas (opcional, cifradas)</label>
              <textarea
                id="notes"
                className="input min-h-16 resize-y"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                placeholder="Correo asociado, smurf, etc."
              />
            </div>

            {error && <p className="text-sm text-red-400" role="alert">{error}</p>}

            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy && <Loader2 size={16} className="animate-spin" />}
                {busy ? "Consultando Riot…" : "Guardar"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
