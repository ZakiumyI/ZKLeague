const config = require("./config/env");
const { openDatabase } = require("./db/database");
const { createRiotClient } = require("./services/riot");
const { createApp } = require("./app");

const db = openDatabase(config.dbPath);
const riot = createRiotClient({
  apiKey: config.riotApiKey,
  rateLimits: config.riotRateLimits
});

const app = createApp({ config, db, riot });

const server = app.listen(config.port, config.host, () => {
  console.log(`ZKLeague API escuchando en http://${config.host}:${config.port}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
