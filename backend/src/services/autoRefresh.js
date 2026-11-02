// Actualiza en segundo plano las cuentas cuyo rango tiene más de N horas,
// para que el historial se vaya llenando aunque nadie abra la app.
const { RiotError } = require("./riot");

const CHECK_EVERY_MS = 30 * 60 * 1000;
const BATCH = 40;

function startAutoRefresh({ db, refresh, hours, log = console }) {
  if (!hours || hours <= 0) return () => {};

  const staleStmt = db.prepare(`
    SELECT * FROM accounts
    WHERE refreshed_at IS NULL OR refreshed_at < ?
    ORDER BY COALESCE(refreshed_at, 0) ASC
    LIMIT ?
  `);

  let running = false;

  async function run() {
    if (running) return;
    running = true;
    let done = 0;
    try {
      const rows = staleStmt.all(Date.now() - hours * 3600 * 1000, BATCH);
      for (const row of rows) {
        const { error } = await refresh(row);
        done++;
        // Key inválida/expirada o sin key: no tiene sentido seguir intentando.
        if (error instanceof RiotError && [401, 403, 503].includes(error.status)) {
          log.warn(`[auto-refresh] detenido: ${error.message}`);
          break;
        }
      }
      if (done) log.log(`[auto-refresh] ${done} cuenta(s) procesadas`);
    } catch (err) {
      log.error("[auto-refresh] error:", err);
    } finally {
      running = false;
    }
  }

  const first = setTimeout(run, 60 * 1000);
  const timer = setInterval(run, CHECK_EVERY_MS);
  first.unref();
  timer.unref();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}

module.exports = { startAutoRefresh };
