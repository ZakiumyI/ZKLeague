import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Lock, LogOut, Plus, RefreshCw, Search } from "lucide-react";
import Brand from "./Brand.jsx";
import AccountCard from "./AccountCard.jsx";
import AccountForm from "./AccountForm.jsx";
import { useToast } from "./Toast.jsx";
import { api } from "../lib/api.js";
import { compareAccounts } from "../lib/ranks.js";

export default function Vault({ session, vaultKey, onLock, onLogout, onUnauthorized }) {
  const toast = useToast();
  const [accounts, setAccounts] = useState(null);
  const [platforms, setPlatforms] = useState([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | account
  const [refreshing, setRefreshing] = useState(new Set());
  const [bulk, setBulk] = useState(null); // { done, total }

  const handleError = useCallback(
    (err) => {
      if (err.status === 401) return onUnauthorized();
      toast(err.message, "error");
    },
    [onUnauthorized, toast]
  );

  useEffect(() => {
    Promise.all([api.listAccounts(), api.platforms()])
      .then(([list, plats]) => {
        setAccounts(list);
        setPlatforms(plats);
      })
      .catch(handleError);
  }, [handleError]);

  const upsert = (acc) =>
    setAccounts((list) => [...list.filter((a) => a.id !== acc.id), acc].sort(compareAccounts));

  const setBusy = (id, on) =>
    setRefreshing((s) => {
      const next = new Set(s);
      on ? next.add(id) : next.delete(id);
      return next;
    });

  async function refreshOne(id, { silent = false } = {}) {
    setBusy(id, true);
    try {
      const acc = await api.refreshAccount(id);
      upsert(acc);
      if (!silent && acc.refreshError) toast(acc.refreshError, "error");
      return acc;
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(id, false);
    }
  }

  async function refreshAll() {
    const ids = accounts.map((a) => a.id);
    setBulk({ done: 0, total: ids.length });
    let errors = 0;
    for (const [i, id] of ids.entries()) {
      const acc = await refreshOne(id, { silent: true });
      if (!acc || acc.refreshError) errors++;
      setBulk({ done: i + 1, total: ids.length });
    }
    setBulk(null);
    toast(errors ? `Actualizado con ${errors} error(es).` : "Todo actualizado.", errors ? "error" : "info");
  }

  async function remove(id) {
    try {
      await api.deleteAccount(id);
      setAccounts((list) => list.filter((a) => a.id !== id));
      toast("Cuenta eliminada.");
    } catch (err) {
      handleError(err);
    }
  }

  const visible = useMemo(() => {
    if (!accounts) return [];
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter((a) =>
      `${a.gameName}#${a.tagLine} ${a.platformLabel}`.toLowerCase().includes(q)
    );
  }, [accounts, query]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-col gap-4 border-b border-zinc-900 pb-6 sm:flex-row sm:items-center sm:justify-between">
        <Brand subtitle={`${session.username} · ${accounts?.length ?? 0} cuentas`} />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <Plus size={16} /> Añadir cuenta
          </button>
          <button
            className="btn btn-ghost"
            onClick={refreshAll}
            disabled={!accounts?.length || bulk !== null}
          >
            <RefreshCw size={16} className={bulk ? "animate-spin" : ""} />
            {bulk ? `${bulk.done}/${bulk.total}` : "Actualizar todo"}
          </button>
          <button className="btn btn-ghost" onClick={onLock} title="Bloquear bóveda">
            <Lock size={16} />
          </button>
          <button className="btn btn-ghost" onClick={onLogout} title="Cerrar sesión">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {accounts === null ? (
        <div className="flex justify-center py-20 text-zinc-500">
          <Loader2 className="animate-spin" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 py-20 text-center">
          <p className="mb-4 text-zinc-400">Todavía no tienes cuentas guardadas.</p>
          <button className="btn btn-primary" onClick={() => setEditing("new")}>
            <Plus size={16} /> Añadir la primera
          </button>
        </div>
      ) : (
        <>
          <div className="relative mb-6 max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              className="input pl-9"
              placeholder="Buscar por Riot ID o servidor"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((acc, i) => (
              <AccountCard
                key={acc.id}
                position={accounts.indexOf(acc) + 1}
                account={acc}
                vaultKey={vaultKey}
                refreshing={refreshing.has(acc.id)}
                onRefresh={() => refreshOne(acc.id)}
                onEdit={() => setEditing(acc)}
                onDelete={() => remove(acc.id)}
                style={{ animationDelay: `${i * 30}ms` }}
              />
            ))}
          </div>
          {visible.length === 0 && (
            <p className="py-10 text-center text-sm text-zinc-500">Sin resultados.</p>
          )}
        </>
      )}

      {editing && (
        <AccountForm
          account={editing === "new" ? null : editing}
          platforms={platforms}
          vaultKey={vaultKey}
          onClose={() => setEditing(null)}
          onSaved={(acc) => {
            upsert(acc);
            setEditing(null);
            toast(
              acc.refreshError ? `Guardada. ${acc.refreshError}` : "Cuenta guardada.",
              acc.refreshError ? "error" : "info"
            );
          }}
          onError={handleError}
        />
      )}
    </div>
  );
}
