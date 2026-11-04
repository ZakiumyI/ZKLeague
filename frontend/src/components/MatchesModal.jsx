import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import ChampIcon from "./ChampIcon.jsx";
import { api } from "../lib/api.js";
import { champName, kdaRatio, queueName, timeAgo } from "../lib/ranks.js";

const POSITIONS = {
  TOP: "Top",
  JUNGLE: "Jungla",
  MIDDLE: "Mid",
  BOTTOM: "ADC",
  UTILITY: "Support"
};

function summarize(matches) {
  const games = matches.filter((m) => !m.remake);
  const n = games.length;
  if (!n) return null;
  const sum = (f) => games.reduce((acc, m) => acc + f(m), 0);
  const wins = sum((m) => (m.win ? 1 : 0));
  const k = sum((m) => m.kills);
  const d = sum((m) => m.deaths);
  const a = sum((m) => m.assists);
  const minutes = sum((m) => m.duration) / 60;

  const byChamp = new Map();
  for (const m of games) {
    const c = byChamp.get(m.championId) ?? { id: m.championId, name: m.championName, n: 0, w: 0, k: 0, d: 0, a: 0 };
    c.n++;
    c.w += m.win ? 1 : 0;
    c.k += m.kills;
    c.d += m.deaths;
    c.a += m.assists;
    byChamp.set(m.championId, c);
  }
  return {
    n,
    wins,
    winrate: Math.round((wins / n) * 100),
    kda: kdaRatio(k, d, a),
    avg: `${(k / n).toFixed(1)} / ${(d / n).toFixed(1)} / ${(a / n).toFixed(1)}`,
    csMin: (sum((m) => m.cs) / minutes).toFixed(1),
    champs: [...byChamp.values()].sort((x, y) => y.n - x.n).slice(0, 5)
  };
}

export default function MatchesModal({ account, onClose, onError }) {
  const [matches, setMatches] = useState(null);
  const [queue, setQueue] = useState("all");

  useEffect(() => {
    api.matches(account.id, 50).then(setMatches).catch((err) => {
      onError(err);
      setMatches([]);
    });
  }, [account.id, onError]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const queues = useMemo(
    () => [...new Set((matches ?? []).map((m) => m.queueId))].sort(),
    [matches]
  );
  const visible = useMemo(
    () => (matches ?? []).filter((m) => queue === "all" || m.queueId === queue),
    [matches, queue]
  );
  const stats = useMemo(() => summarize(visible), [visible]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="matches-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        <header className="flex items-center justify-between border-b border-zinc-800 p-4">
          <h2 id="matches-title" className="font-semibold">
            {account.gameName}
            <span className="text-zinc-500">#{account.tagLine}</span>
            <span className="ml-2 text-sm font-normal text-zinc-500">· Historial ranked</span>
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        {matches === null ? (
          <div className="flex justify-center py-16 text-zinc-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : matches.length === 0 ? (
          <p className="p-8 text-center text-sm text-zinc-500">
            Aún no hay partidas guardadas. Pulsa ↻ en la tarjeta para descargarlas.
          </p>
        ) : (
          <div className="overflow-y-auto p-4">
            <div className="mb-4 flex flex-wrap gap-1 text-xs">
              {["all", ...queues].map((q) => (
                <button
                  key={q}
                  onClick={() => setQueue(q)}
                  className={`rounded-md px-2.5 py-1 transition ${
                    queue === q ? "bg-cyan-400 text-zinc-950" : "bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                  }`}
                >
                  {q === "all" ? "Todas" : queueName(q)}
                </button>
              ))}
            </div>

            {stats && (
              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ["Partidas", `${stats.n}`, `${stats.wins}V ${stats.n - stats.wins}D`],
                  ["Winrate", `${stats.winrate}%`, null],
                  ["KDA", stats.kda, stats.avg],
                  ["CS/min", stats.csMin, null]
                ].map(([label, value, sub]) => (
                  <div key={label} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                    <p className="label">{label}</p>
                    <p
                      className={`text-lg font-semibold ${
                        label === "Winrate" ? (stats.winrate >= 50 ? "text-emerald-400" : "text-red-400") : ""
                      }`}
                    >
                      {value}
                    </p>
                    {sub && <p className="text-xs text-zinc-500">{sub}</p>}
                  </div>
                ))}
              </div>
            )}

            {stats && (
              <div className="mb-4">
                <p className="label">Campeones más jugados</p>
                <div className="space-y-1">
                  {stats.champs.map((c) => {
                    const wr = Math.round((c.w / c.n) * 100);
                    return (
                      <div key={c.id} className="flex items-center gap-3 rounded-lg bg-zinc-950/40 px-2 py-1.5 text-sm">
                        <ChampIcon id={c.id} name={c.name} size={28} />
                        <span className="flex-1 truncate">{champName(c.name)}</span>
                        <span className="w-16 text-right text-xs text-zinc-400">{c.n} part.</span>
                        <span className={`w-12 text-right text-xs ${wr >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                          {wr}%
                        </span>
                        <span className="w-14 text-right text-xs text-zinc-400">{kdaRatio(c.k, c.d, c.a)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="label">Partidas</p>
            <ul className="space-y-1">
              {visible.map((m) => {
                const tone = m.remake
                  ? "border-zinc-700 bg-zinc-800/40"
                  : m.win
                    ? "border-emerald-500/50 bg-emerald-500/5"
                    : "border-red-500/50 bg-red-500/5";
                return (
                  <li key={m.matchId} className={`flex items-center gap-3 rounded-lg border-l-4 px-3 py-2 text-sm ${tone}`}>
                    <ChampIcon id={m.championId} name={m.championName} size={34} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {m.remake ? "Remake" : m.win ? "Victoria" : "Derrota"}
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          {queueName(m.queueId)} · {POSITIONS[m.position] ?? "—"}
                        </span>
                      </p>
                      <p className="text-xs text-zinc-500">
                        {timeAgo(m.gameStart)} · {Math.round(m.duration / 60)} min
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm">
                        {m.kills}/<span className="text-red-400">{m.deaths}</span>/{m.assists}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {kdaRatio(m.kills, m.deaths, m.assists)} KDA · {(m.cs / (m.duration / 60)).toFixed(1)} cs/m
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
