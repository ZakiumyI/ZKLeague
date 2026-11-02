const config = require("./config/env");
const { openDatabase } = require("./db/database");
const { createRiotClient } = require("./services/riot");
const { createApp } = require("./app");
const { createRefresher } = require("./services/refresher");
const { startAutoRefresh } = require("./services/autoRefresh");

const db = openDatabase(config.dbPath);
const riot = createRiotClient({
  apiKey: config.riotApiKey,
  rateLimits: config.riotRateLimits
});

const refresh = createRefresher({ db, riot });
const app = createApp({ config, db, riot, refresh });
const stopAutoRefresh = startAutoRefresh({ db, refresh, hours: config.autoRefreshHours });

const server = app.listen(config.port, config.host, () => {
  console.log(`ZKLeague API escuchando en http://${config.host}:${config.port}`);
});

function shutdown() {
  stopAutoRefresh();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
