import { useState } from "react";
import { Loader2, Lock, LogOut } from "lucide-react";
import Brand from "./Brand.jsx";
import PasswordInput from "./PasswordInput.jsx";
import { unlockVault } from "../crypto/vault.js";

export default function UnlockScreen({ session, onUnlocked, onLogout }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const key = await unlockVault(password, session.kdf, session.wrappedVaultKey);
      onUnlocked(key);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand subtitle="Bóveda bloqueada" />
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-6 shadow-2xl backdrop-blur"
        >
          <p className="text-sm text-zinc-400">
            Hola, <span className="font-mono text-cyan-300">{session.username}</span>. Ingresa tu
            contraseña maestra para desbloquear.
          </p>
          {/* Campo de usuario oculto para que el gestor de contraseñas del navegador asocie la clave */}
          <input type="text" autoComplete="username" value={session.username} readOnly hidden />
          <PasswordInput
            id="unlock-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            autoFocus
            required
          />
          {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
            Desbloquear
          </button>
          <button type="button" className="btn btn-ghost w-full" onClick={onLogout}>
            <LogOut size={16} /> Cerrar sesión
          </button>
        </form>
      </div>
    </main>
  );
}
