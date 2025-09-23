/* MMM-SystemStats.js
 * A MagicMirror module to display CPU, RAM, temp, disk, uptime … plus Ping (ms).
 * Layout/formatting preserved: we only add one new stat line for Ping.
 * MIT Licensed.
 */
/* global Module, Log */

Module.register("MMM-SystemStats", {
  defaults: {
    updateInterval: 5000,   // ms for regular system stats refresh

    // NEW: Ping configuration (overridable in config.js)
    pingHost: "1.1.1.1",
    pingCount: 1,
    pingIntervalMin: 10,    // seconds
    pingIntervalMax: 20     // seconds
  },

  start() {
    this.loaded = false;

    // Store latest stats we receive from node_helper
    this.stats = {
      cpuTempC: null,
      cpuLoad: null,
      memUsedMB: null,
      memTotalMB: null,
      uptime: null,
      diskFree: null,
      // NEW
      ping: null // avg RTT in ms
    };

    // Let helper know our config (starts collectors + ping loop)
    this.sendSocketNotification("SYSTEMSTATS_CONFIG", this.config);
  },

  // Keep your CSS classes as-is
  getStyles() {
    return ["MMM-SystemStats.css"];
  },

  // Small helper that many people use in this module style:
  addStat(label, value) {
    const row = document.createElement("div");
    row.className = "stat-row";

    const left = document.createElement("span");
    left.className = "label";
    left.textContent = label + ":";

    const right = document.createElement("span");
    right.className = "value";
    right.textContent = (value !== null && value !== undefined) ? value : "—";

    row.appendChild(left);
    row.appendChild(right);
    return row;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-systemstats small light";

    if (!this.loaded) {
      wrapper.innerHTML = "Loading...";
      return wrapper;
    }

    // Preserve existing order/formatting. We only append one extra line (Ping) at the end.
    if (this.stats.cpuTempC !== null) {
      wrapper.appendChild(this.addStat("CPU Temp", this.stats.cpuTempC.toFixed(1) + " °C"));
    } else {
      wrapper.appendChild(this.addStat("CPU Temp", null));
    }

    if (this.stats.cpuLoad !== null) {
      wrapper.appendChild(this.addStat("System Load", this.stats.cpuLoad.toFixed(2)));
    } else {
      wrapper.appendChild(this.addStat("System Load", null));
    }

    if (this.stats.memUsedMB !== null && this.stats.memTotalMB !== null) {
      const mem = Math.round(this.stats.memUsedMB) + "/" + Math.round(this.stats.memTotalMB) + " MB";
      wrapper.appendChild(this.addStat("Memory", mem));
    } else {
      wrapper.appendChild(this.addStat("Memory", null));
    }

    if (this.stats.diskFree !== null) {
      wrapper.appendChild(this.addStat("Avail Space", this.stats.diskFree));
    } else {
      wrapper.appendChild(this.addStat("Avail Space", null));
    }

    if (this.stats.uptime !== null) {
      wrapper.appendChild(this.addStat("Uptime", this.stats.uptime));
    } else {
      wrapper.appendChild(this.addStat("Uptime", null));
    }

    // === NEW SINGLE LINE ADDED (keeps style/placement consistent) ===
    if (typeof this.stats.ping === "number") {
      wrapper.appendChild(this.addStat("Ping", this.stats.ping.toFixed(1) + " ms"));
    } else {
      wrapper.appendChild(this.addStat("Ping", null));
    }

    return wrapper;
  },

  // Receive updates from helper
  socketNotificationReceived(notification, payload) {
    if (notification === "SYSTEMSTATS_DATA") {
      const keys = ["cpuTempC", "cpuLoad", "memUsedMB", "memTotalMB", "uptime", "diskFree"];
      keys.forEach(k => {
        if (payload.hasOwnProperty(k)) this.stats[k] = payload[k];
      });
      this.loaded = true;
      this.updateDom();
    } else if (notification === "SYSTEMSTATS_PING") {
      // payload: { host, avgMs: Number|null, error: String|null }
      this.stats.ping = (payload && typeof payload.avgMs === "number") ? payload.avgMs : null;
      this.loaded = true;
      this.updateDom();
    }
  }
});
