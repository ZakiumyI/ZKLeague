import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, LogIn, UserPlus } from "lucide-react";
import Brand from "./Brand.jsx";
import PasswordInput from "./PasswordInput.jsx";
import { api } from "../lib/api.js";
import { createVault, deriveAuthKey, unwrapVaultKey } from "../crypto/vault.js";

const MIN_PASSWORD = 12;
const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.config().then((c) => setRegistrationOpen(c.registrationOpen)).catch(() => {});
  }, []);

  const normalizedUser = username.trim().toLowerCase();

  async function handleLogin() {
    const { kdf } = await api.prelogin(normalizedUser);
    const { authKey, encKey } = await deriveAuthKey(password, kdf);
    const session = await api.login(normalizedUser, authKey);
    const vaultKey = await unwrapVaultKey(encKey, session.wrappedVaultKey);
    onAuthenticated(session, vaultKey);
  }

  async function handleRegister() {
    if (!USERNAME_RE.test(normalizedUser)) {
      throw new Error("Usuario: 3–32 caracteres, solo letras, números, punto, guion y guion bajo.");
    }
    if (password.length < MIN_PASSWORD) {
      throw new Error(`La contraseña maestra debe tener al menos ${MIN_PASSWORD} caracteres.`);
    }
    if (password !== confirm) throw new Error("Las contraseñas no coinciden.");
    if (!understood) throw new Error("Confirma que entiendes que no hay recuperación.");

    const vault = await createVault(password);
    const session = await api.register({
      username: normalizedUser,
      authKey: vault.authKey,
      kdf: vault.kdf,
      wrappedVaultKey: vault.wrappedVaultKey
    });
    onAuthenticated(session, vault.vaultKey);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await (mode === "login" ? handleLogin() : handleRegister());
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand subtitle="Bóveda de multicuentas" />
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur"
        >
          {registrationOpen && (
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-950/60 p-1 text-sm">
              {["login", "register"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError("");
                  }}
                  className={`rounded-md py-1.5 transition ${
                    mode === m ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {m === "login" ? "Entrar" : "Crear bóveda"}
                </button>
              ))}
            </div>
          )}

          <div>
            <label htmlFor="username" className="label">Usuario</label>
            <input
              id="username"
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="off"
              spellCheck={false}
              required
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="password" className="label">Contraseña maestra</label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              autoComplete={isRegister ? "new-password" : "current-password"}
              required
            />
          </div>

          {isRegister && (
            <>
              <div>
                <label htmlFor="confirm" className="label">Repite la contraseña maestra</label>
                <PasswordInput
                  id="confirm"
                  value={confirm}
                  onChange={setConfirm}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>
                  Tus credenciales se cifran en este navegador con tu contraseña maestra. El
                  servidor no puede leerlas, así que <b>si la olvidas, no hay forma de recuperarlas</b>.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-400">
                <input
                  type="checkbox"
                  checked={understood}
                  onChange={(e) => setUnderstood(e.target.checked)}
                  className="accent-cyan-400"
                />
                Lo entiendo
              </label>
            </>
          )}

          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}

          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                {isRegister ? "Creando bóveda…" : "Derivando claves…"}
              </>
            ) : isRegister ? (
              <>
                <UserPlus size={16} /> Crear bóveda
              </>
            ) : (
              <>
                <LogIn size={16} /> Entrar
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
