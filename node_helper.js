const NodeHelper = require("node_helper");
const moment     = require("moment");
const fs         = require("fs");

console.log("[MMM-MLBScoresAndStandings] helper started");

module.exports = NodeHelper.create({
  start() {
    this.games  = [];
    this.config = {};
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "INIT") {
      this.config = payload;
      this.fetchData();
      this.fetchStandingsFromFile();
      this.scheduleFetch();
    }
  },

  scheduleFetch() {
    setInterval(
      () => this.fetchData(),
      this.config.updateIntervalScores
    );
    setInterval(
      () => this.fetchStandingsFromFile(),
      this.config.updateIntervalStandings
    );
  },

  async fetchData() {
    const date = moment().format("YYYY-MM-DD");
    const url  = `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore`;
    try {
      console.log("[MMM] fetching schedule URL:", url);
      const res  = await fetch(url);
      const json = await res.json();
      this.games = json.dates?.[0]?.games || [];
      console.log("[MMM-MLBScoresAndStandings] fetched games:", this.games.length);
      this.sendSocketNotification("GAMES", this.games);
    } catch (e) {
      console.error("[MMM-MLBScoresAndStandings] fetchData error", e);
      this.sendSocketNotification("GAMES", []);
    }
  },

  fetchStandingsFromFile() {
    const filePath = __dirname + "/standings.json";
    console.log("[MMM] reading standings from file:", filePath);
    try {
      const data    = fs.readFileSync(filePath, "utf8");
      const records = JSON.parse(data);
      console.log("[MMM-MLBScoresAndStandings] loaded standings from file:", records.length);
      this.sendSocketNotification("STANDINGS", records);
    } catch (e) {
      console.error("[MMM-MLBScoresAndStandings] read standings file error", e);
      this.sendSocketNotification("STANDINGS", []);
    }
  }
});
