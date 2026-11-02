export default function Brand({ subtitle }) {
  return (
    <div className="flex items-center gap-3">
      <img src="/favicon.svg" alt="" className="h-9 w-9" />
      <div>
        <h1 className="font-mono text-xl font-black tracking-wider">
          ZK<span className="text-cyan-400">League</span>
        </h1>
        {subtitle && (
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-400/60">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
