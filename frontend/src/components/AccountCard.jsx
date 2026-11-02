import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Eye,
  EyeOff,
  Pencil,
  RefreshCw,
  Trash2,
  UserRound
} from "lucide-react";
import { useToast } from "./Toast.jsx";
import { decryptSecret } from "../crypto/vault.js";
import { QUEUE_LABELS, formatRank, profileIconUrl, timeAgo } from "../lib/ranks.js";

const REVEAL_SECONDS = 20;

function RankRow({ label, entry }) {
  const r = formatRank(entry);
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-sm">
      <span className="w-14 shrink-0 font-mono text-xs uppercase text-zinc-500">{label}</span>
      {r ? (
        <>
          <span className="flex-1 truncate font-semibold" style={{ color: r.color }}>
            {r.label}
            <span className="ml-1.5 font-normal text-zinc-400">{r.lp} LP</span>
          </span>
          <span className="shrink-0 text-xs text-zinc-500">
            {r.winrate !== null ? `${r.winrate}% · ${r.games}p` : "—"}
          </span>
        </>
      ) : (
        <span className="flex-1 text-zinc-600">Sin clasificar</span>
      )}
    </div>
  );
}

function SecretField({ label, value, visible, onCopy }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-zinc-500">{label}</span>
      <code className="min-w-0 flex-1 truncate rounded bg-zinc-950/70 px-2 py-1 font-mono text-sm text-zinc-200">
        {visible ? value || <span className="text-zinc-600">(vacío)</span> : "••••••••••"}
      </code>
      <button className="icon-btn" onClick={onCopy} aria-label={`Copiar ${label.toLowerCase()}`}>
        <Copy size={15} />
      </button>
    </div>
  );
}

export default function AccountCard({
  account,
  position,
  vaultKey,
  refreshing,
  onRefresh,
  onEdit,
  onDelete,
  style
}) {
  const toast = useToast();
  const [secret, setSecret] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const hideTimer = useRef();

  // Si cambian las credenciales cifradas (edición), descartamos la copia en claro.
  useEffect(() => {
    setSecret(null);
    setRevealed(false);
  }, [account.secret]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  async function getSecret() {
    if (secret) return secret;
    try {
      const s = await decryptSecret(vaultKey, account.secret);
      setSecret(s);
      return s;
    } catch {
      toast("No se pudieron descifrar las credenciales.", "error");
      return null;
    }
  }

  async function toggleReveal() {
    clearTimeout(hideTimer.current);
    if (revealed) return setRevealed(false);
    if (!(await getSecret())) return;
    setRevealed(true);
    hideTimer.current = setTimeout(() => setRevealed(false), REVEAL_SECONDS * 1000);
  }

  async function copy(field, message) {
    const s = await getSecret();
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s[field]);
      toast(message);
    } catch {
      toast("El navegador no permitió copiar.", "error");
    }
  }

  async function copyRiotId() {
    try {
      await navigator.clipboard.writeText(`${account.gameName}#${account.tagLine}`);
      toast("Riot ID copiado.");
    } catch {
      /* sin portapapeles */
    }
  }

  const icon = !iconFailed && profileIconUrl(account.profileIconId);

  return (
    <article
      style={style}
      className="flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 shadow-xl backdrop-blur transition hover:border-zinc-700"
    >
      <header className="mb-3 flex items-center gap-3">
        <div className="relative shrink-0">
          {icon ? (
            <img
              src={icon}
              alt=""
              className="h-14 w-14 rounded-xl border border-zinc-700 object-cover"
              onError={() => setIconFailed(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-800 text-zinc-500">
              <UserRound />
            </div>
          )}
          {account.summonerLevel != null && (
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-950 px-1.5 font-mono text-[10px] text-zinc-300">
              {account.summonerLevel}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <button
            onClick={copyRiotId}
            className="block max-w-full truncate text-left font-semibold hover:text-cyan-300"
            title="Copiar Riot ID"
          >
            {account.gameName}
            <span className="text-zinc-500">#{account.tagLine}</span>
          </button>
          <p className="font-mono text-xs text-zinc-500">
            #{position} · {account.platformLabel}
          </p>
        </div>
        <div className="flex shrink-0">
          <button
            className="icon-btn"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Actualizar rangos"
            title="Actualizar rangos"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
          <button className="icon-btn" onClick={onEdit} aria-label="Editar" title="Editar">
            <Pencil size={15} />
          </button>
          <button
            className="icon-btn hover:!text-red-400"
            onClick={() => setConfirmDelete(true)}
            aria-label="Eliminar"
            title="Eliminar"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      <div className="mb-3 divide-y divide-zinc-800/70 rounded-lg border border-zinc-800/70 px-3 py-1">
        {Object.entries(QUEUE_LABELS).map(([key, label]) => (
          <RankRow key={key} label={label} entry={account.ranked[key]} />
        ))}
        {account.ranked.others.map((e) => (
          <RankRow key={e.queueType} label={e.queueType.slice(0, 8)} entry={e} />
        ))}
      </div>

      <div className="space-y-1.5 rounded-lg bg-zinc-950/40 p-2">
        <SecretField
          label="Usuario"
          value={secret?.username}
          visible={revealed}
          onCopy={() => copy("username", "Usuario copiado.")}
        />
        <SecretField
          label="Contraseña"
          value={secret?.password}
          visible={revealed}
          onCopy={() => copy("password", "Contraseña copiada.")}
        />
        {revealed && secret?.notes && (
          <p className="whitespace-pre-wrap px-1 pt-1 text-xs text-zinc-400">{secret.notes}</p>
        )}
        <button
          className="btn w-full py-1 text-xs text-zinc-400 hover:text-cyan-300"
          onClick={toggleReveal}
        >
          {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          {revealed ? "Ocultar" : `Mostrar credenciales (${REVEAL_SECONDS}s)`}
        </button>
      </div>

      <footer className="mt-3 flex items-center justify-between gap-2 text-xs text-zinc-500">
        {account.refreshError ? (
          <span className="flex items-center gap-1 text-amber-400" title={account.refreshError}>
            <AlertTriangle size={13} className="shrink-0" />
            <span className="truncate">{account.refreshError}</span>
          </span>
        ) : (
          <span>Actualizado {timeAgo(account.refreshedAt)}</span>
        )}
      </footer>

      {confirmDelete && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-red-500/30 bg-red-950/30 p-2 text-sm">
          <span className="text-red-200">¿Eliminar esta cuenta?</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost py-1" onClick={() => setConfirmDelete(false)}>
              No
            </button>
            <button className="btn btn-danger py-1" onClick={onDelete}>
              Eliminar
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
