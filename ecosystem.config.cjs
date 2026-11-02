// PM2: pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: "zkleague",
      cwd: __dirname + "/backend",
      script: "src/index.js",
      instances: 1, // SQLite + limitador de Riot en memoria => una sola instancia
      exec_mode: "fork",
      max_memory_restart: "300M",
      time: true
    }
  ]
};
