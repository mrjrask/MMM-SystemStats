/* MMM-SystemStats.js
 * A MagicMirror module to display CPU, RAM, temperature statistics … and Ping (ms).
 * Copyright (c) 2025
 * MIT Licensed.
 */

Module.register("MMM-SystemStats", {
  defaults: {
    updateInterval: 5000,   // ms for regular system stats refresh (existing behavior)

    // --- NEW: Ping configuration (all overridable in config.js) ---
    pingHost: "1.1.1.1",    // target to ping
    pingCount: 1,           // number of echo requests per measurement
    pingIntervalMin: 10,    // seconds (min random delay)
    pingIntervalMax: 20     // seconds (max random delay)
  },

  start() {
    this.loaded = false;

    // Container for stats coming from node_helper
    this.stats = {
      cpuTempC: null,
      cpuLoad: null,
      memUsedMB: null,
      memTotalMB: null,
      uptime: null,
      diskFree: null,
      // New field:
      ping: null   // avg RTT in ms
    };

    // Send config to node_helper (starts collectors incl. ping loop)
    this.sendSocketNotification("SYSTEMSTATS_CONFIG", this.config);
  },

  getStyles() {
    return ["MMM-SystemStats.css"];
  },

  // Render a simple table of stats, including Ping
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-systemstats";

    if (!this.loaded) {
      wrapper.innerHTML = "Loading...";
      return wrapper;
    }

    const tbl = document.createElement("table");
    tbl.className = "small light";

    const addRow = (label, value) => {
      const tr = document.createElement("tr");
      const tdL = document.createElement("td");
      const tdR = document.createElement("td");
      tdL.className = "label";
      tdR.className = "value";
      tdL.textContent = label;
      tdR.textContent = (value !== null && value !== undefined) ? value : "—";
      tr.appendChild(tdL);
      tr.appendChild(tdR);
      tbl.appendChild(tr);
    };

    // Existing stats (names may differ in your current CSS)
    if (this.stats.cpuTempC !== null) addRow("CPU Temp", `${this.stats.cpuTempC.toFixed(1)} °C`);
    if (this.stats.cpuLoad !== null)  addRow("System Load", this.stats.cpuLoad.toFixed(2));
    if (this.stats.memUsedMB !== null && this.stats.memTotalMB !== null) {
      addRow("Memory", `${Math.round(this.stats.memUsedMB)}/${Math.round(this.stats.memTotalMB)} MB`);
    }
    if (this.stats.diskFree !== null) addRow("Avail Space", this.stats.diskFree);
    if (this.stats.uptime !== null)   addRow("Uptime", this.stats.uptime);

    // --- NEW: Ping row ---
    if (this.stats.ping !== null) {
      addRow("Ping", `${this.stats.ping.toFixed(1)} ms`);
    } else {
      addRow("Ping", "—");
    }

    wrapper.appendChild(tbl);
    return wrapper;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "SYSTEMSTATS_DATA") {
      // Replace only known keys (defensive merge)
      const keys = ["cpuTempC", "cpuLoad", "memUsedMB", "memTotalMB", "uptime", "diskFree"];
      keys.forEach(k => {
        if (payload.hasOwnProperty(k)) this.stats[k] = payload[k];
      });
      this.loaded = true;
      this.updateDom();
    } else if (notification === "SYSTEMSTATS_PING") {
      // payload: { host, avgMs: Number|null, error: String|null }
      if (payload && typeof payload.avgMs === "number") {
        this.stats.ping = payload.avgMs;
      } else {
        this.stats.ping = null; // show dash if error
      }
      this.loaded = true;
      this.updateDom();
    }
  }
});
