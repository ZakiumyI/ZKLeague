const { getRankScore } = require("../utils/rankUtils");
const { encrypt, decrypt } = require("../utils/crypto");
const db = require("../db/database");
const riotService = require("../services/riotService");

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/
function getScoreFromFullRank(fullRankString, lp) {
  if (!fullRankString || fullRankString === "UNRANKED") return 0;
  const parts = fullRankString.split(" ");
  const tier = parts[0]; 
  return typeof getRankScore === "function" ? getRankScore(tier, lp || 0) : 0;
}

function calculateWinrate(wins, losses) {
  const total = wins + losses;
  return total ? Number(((wins / total) * 100).toFixed(1)) : 0;
}

/*
|--------------------------------------------------------------------------
| CONTROLLER ACTIONS
|--------------------------------------------------------------------------
*/

async function createAccount(req, res) {
  try {
    const { gameName, tagLine, region, username, password } = req.body;
    const riotAccount = await riotService.getAccountByRiotId(gameName, tagLine);
    const summoner = await riotService.getSummonerByPuuid(riotAccount.puuid);
    const leagues = await riotService.getLeagueEntries(riotAccount.puuid);

    const soloQueue = leagues.find(l => l.queueType === "RANKED_SOLO_5x5");
    const flexQueue = leagues.find(l => l.queueType === "RANKED_FLEX_SR");

    const passwordEncrypted = encrypt(password);

    db.run(
      `INSERT INTO accounts (gameName, tagLine, region, username, passwordEncrypted, puuid, summonerLevel, profileIconId, soloRank, soloLP, soloWinrate, flexRank, flexLP, flexWinrate, lastUpdated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        riotAccount.gameName, riotAccount.tagLine, region, username, passwordEncrypted, riotAccount.puuid,
        summoner.summonerLevel, summoner.profileIconId,
        soloQueue ? `${soloQueue.tier} ${soloQueue.rank}` : "UNRANKED", soloQueue?.leaguePoints || 0, soloQueue ? calculateWinrate(soloQueue.wins, soloQueue.losses) : 0,
        flexQueue ? `${flexQueue.tier} ${flexQueue.rank}` : "UNRANKED", flexQueue?.leaguePoints || 0, flexQueue ? calculateWinrate(flexQueue.wins, flexQueue.losses) : 0,
        new Date().toISOString()
      ],
      function (err) {
        if (err) return res.status(500).json({ error: "Database insert error" });
        res.json({ message: "Account created", accountId: this.lastID });
      }
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

function getAccounts(req, res) {
  db.all(`SELECT * FROM accounts`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: "Database read error" });

    const parsed = rows.map(r => ({ ...r, password: decrypt(r.passwordEncrypted) }));
    parsed.sort((a, b) => getScoreFromFullRank(b.soloRank, b.soloLP) - getScoreFromFullRank(a.soloRank, a.soloLP) || 
                          getScoreFromFullRank(b.flexRank, b.flexLP) - getScoreFromFullRank(a.flexRank, a.flexLP) || 
                          b.summonerLevel - a.summonerLevel);
    res.json(parsed);
  });
}

async function refreshAccount(req, res) {
  try {
    const { id } = req.params;
    db.get(`SELECT * FROM accounts WHERE id = ?`, [id], async (err, account) => {
      if (err || !account) return res.status(404).json({ error: "Account not found" });

      const riotAccount = await riotService.getAccountByRiotId(account.gameName, account.tagLine);
      const summoner = await riotService.getSummonerByPuuid(riotAccount.puuid);
      const leagues = await riotService.getLeagueEntries(riotAccount.puuid);

      const solo = leagues.find(l => l.queueType === "RANKED_SOLO_5x5");
      const flex = leagues.find(l => l.queueType === "RANKED_FLEX_SR");

      db.run(
        `UPDATE accounts SET summonerLevel = ?, profileIconId = ?, soloRank = ?, soloLP = ?, soloWinrate = ?, flexRank = ?, flexLP = ?, flexWinrate = ?, lastUpdated = ? WHERE id = ?`,
        [summoner.summonerLevel, summoner.profileIconId, solo ? `${solo.tier} ${solo.rank}` : "UNRANKED", solo?.leaguePoints || 0, calculateWinrate(solo?.wins || 0, solo?.losses || 0), flex ? `${flex.tier} ${flex.rank}` : "UNRANKED", flex?.leaguePoints || 0, calculateWinrate(flex?.wins || 0, flex?.losses || 0), new Date().toISOString(), id],
        () => res.json({ message: "Account refreshed", id })
      );
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

async function refreshAllAccounts(req, res) {
  try {
    db.all(`SELECT id, gameName, tagLine FROM accounts`, [], async (err, accounts) => {
      if (err) return res.status(500).json({ error: "Database error" });

      for (const account of accounts) {
        // Reutilizamos la lógica de refresh para cada cuenta
        const riotAccount = await riotService.getAccountByRiotId(account.gameName, account.tagLine);
        const summoner = await riotService.getSummonerByPuuid(riotAccount.puuid);
        const leagues = await riotService.getLeagueEntries(riotAccount.puuid);
        
        const solo = leagues.find(l => l.queueType === "RANKED_SOLO_5x5");
        const flex = leagues.find(l => l.queueType === "RANKED_FLEX_SR");

        await new Promise((resolve) => {
          db.run(
            `UPDATE accounts SET summonerLevel = ?, profileIconId = ?, soloRank = ?, soloLP = ?, soloWinrate = ?, flexRank = ?, flexLP = ?, flexWinrate = ?, lastUpdated = ? WHERE id = ?`,
            [summoner.summonerLevel, summoner.profileIconId, solo ? `${solo.tier} ${solo.rank}` : "UNRANKED", solo?.leaguePoints || 0, calculateWinrate(solo?.wins || 0, solo?.losses || 0), flex ? `${flex.tier} ${flex.rank}` : "UNRANKED", flex?.leaguePoints || 0, calculateWinrate(flex?.wins || 0, flex?.losses || 0), new Date().toISOString(), account.id],
            resolve
          );
        });
      }
      res.json({ message: "All accounts refreshed successfully" });
    });
  } catch (error) {
    res.status(500).json({ error: "Bulk refresh failed" });
  }
}

function deleteAccount(req, res) {
  db.run(`DELETE FROM accounts WHERE id = ?`, [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: "Delete error" });
    res.json({ message: "Account deleted", id: req.params.id });
  });
}

module.exports = { createAccount, getAccounts, refreshAccount, refreshAllAccounts, deleteAccount };