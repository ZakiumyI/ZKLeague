import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AuthScreen from "./components/AuthScreen.jsx";
import UnlockScreen from "./components/UnlockScreen.jsx";
import Vault from "./components/Vault.jsx";
import { api } from "./lib/api.js";
import { useIdleLock } from "./hooks/useIdleLock.js";

// Estados: loading → auth (sin sesión) → locked (sesión, sin clave) → unlocked
export default function App() {
  const [phase, setPhase] = useState("loading");
  const [session, setSession] = useState(null);
  const [vaultKey, setVaultKey] = useState(null);

  useEffect(() => {
    api
      .me()
      .then((me) => {
        setSession(me);
        setPhase("locked");
      })
      .catch(() => setPhase("auth"));
  }, []);

  const lock = useCallback(() => {
    setVaultKey(null);
    setPhase((p) => (p === "unlocked" ? "locked" : p));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* la sesión puede haber expirado ya */
    }
    setVaultKey(null);
    setSession(null);
    setPhase("auth");
  }, []);

  // Si el servidor responde 401 (sesión expirada), volvemos al login.
  const onUnauthorized = useCallback(() => {
    setVaultKey(null);
    setSession(null);
    setPhase("auth");
  }, []);

  useIdleLock(phase === "unlocked", lock, 10);

  if (phase === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-500">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  if (phase === "auth") {
    return (
      <AuthScreen
        onAuthenticated={(s, key) => {
          setSession(s);
          setVaultKey(key);
          setPhase("unlocked");
        }}
      />
    );
  }

  if (phase === "locked" || !vaultKey) {
    return (
      <UnlockScreen
        session={session}
        onLogout={logout}
        onUnlocked={(key) => {
          setVaultKey(key);
          setPhase("unlocked");
        }}
      />
    );
  }

  return (
    <Vault
      session={session}
      vaultKey={vaultKey}
      onLock={lock}
      onLogout={logout}
      onUnauthorized={onUnauthorized}
    />
  );
}
