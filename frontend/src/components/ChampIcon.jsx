import { useState } from "react";
import { champName, championIconUrl } from "../lib/ranks.js";

export default function ChampIcon({ id, name: key, size = 28, className = "" }) {
  const name = champName(key);
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (failed) {
    return (
      <div
        style={style}
        className={`flex items-center justify-center rounded bg-zinc-800 text-[9px] font-bold text-zinc-400 ${className}`}
        title={name}
      >
        {name?.slice(0, 2)}
      </div>
    );
  }
  return (
    <img
      src={championIconUrl(id)}
      alt={name}
      title={name}
      style={style}
      className={`rounded object-cover ${className}`}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  );
}
