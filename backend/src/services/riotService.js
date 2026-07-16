const axios = require("axios");

// Asegúrate de tener dotenv configurado en tu archivo principal: require('dotenv').config();
const API_KEY = process.env.RIOT_API_KEY;

/*
|--------------------------------------------------------------------------
| CONFIGURACIÓN Y HEADERS
|--------------------------------------------------------------------------
*/

const headers = {
  "X-Riot-Token": API_KEY,
  "User-Agent": "LeagueAccountManager",
  "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
  "Accept-Charset": "application/x-www-form-urlencoded; charset=UTF-8"
};

const ACCOUNT_REGION = "americas";
const GAME_REGION = "la2";

/*
|--------------------------------------------------------------------------
| SERVICIOS CORE RIOT API
|--------------------------------------------------------------------------
*/

async function getAccountByRiotId(gameName, tagLine) {
  try {
    const cleanRegex = /[\u200B-\u200D\uFEFF\u202A-\u202E\u2066-\u2069]/g;
    const sanitizedName = gameName ? gameName.replace(cleanRegex, "").trim() : "";
    const sanitizedTag = tagLine ? tagLine.replace(cleanRegex, "").trim() : "";

    const url = `https://${ACCOUNT_REGION}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(sanitizedName)}/${encodeURIComponent(sanitizedTag)}`;

    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    console.error("ERROR getAccountByRiotId:", error.response?.status);
    throw error;
  }
}

async function getSummonerByPuuid(puuid) {
  try {
    const url = `https://${GAME_REGION}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${puuid}`;
    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    console.error("ERROR getSummonerByPuuid:", error.response?.status);
    throw error;
  }
}

async function getLeagueEntries(puuid) {
  try {
    const url = `https://${GAME_REGION}.api.riotgames.com/lol/league/v4/entries/by-puuid/${puuid}`;
    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    console.error("ERROR getLeagueEntries:", error.response?.status);
    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| SERVICIO DE SINCRONIZACIÓN (NUEVO)
|--------------------------------------------------------------------------
| Combina los servicios para obtener un perfil completo de cuenta
*/

async function getFullAccountData(gameName, tagLine) {
  const account = await getAccountByRiotId(gameName, tagLine);
  const summoner = await getSummonerByPuuid(account.puuid);
  const leagues = await getLeagueEntries(account.puuid);

  return {
    puuid: account.puuid,
    gameName: account.gameName,
    tagLine: account.tagLine,
    summonerLevel: summoner.summonerLevel,
    profileIconId: summoner.profileIconId,
    leagues: leagues // Array con SoloQ y Flex
  };
}

/*
|--------------------------------------------------------------------------
| EXPORTS
|--------------------------------------------------------------------------
*/

module.exports = {
  getAccountByRiotId,
  getSummonerByPuuid,
  getLeagueEntries,
  getFullAccountData
};