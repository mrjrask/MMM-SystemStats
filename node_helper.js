/* node_helper.js
 * Backend for MMM-SystemStats, with Ping support added.
 * We keep all existing stat collectors and only add a ping loop that pushes a single new stat.
 */

const NodeHelper = require("node_helper");
const { exec } = require("child_process");
const os = require("os");
const fs = require("fs");

module.exports = NodeHelper.create({
  start: function () {
    this.config = null;
    this.systemTimer = null;
    this.pingTimerHandle = null;
  },

  stop: function () {
    if (this.systemTimer) clearInterval(this.systemTimer);
    if (this.pingTimerHandle) clearTimeout(this.pingTimerHandle);
  },

  socketNotificationReceived: function (notification, payload) {
    if (notification === "SYSTEMSTATS_CONFIG") {
      // Merge defaults with provided config
      this.config = Object.assign(
        {
          updateInterval: 5000,
          // NEW: ping options
          pingHost: "1.1.1.1",
          pingCount: 1,
          pingIntervalMin: 10,
          pingIntervalMax: 20
        },
        payload || {}
      );

      // Start regular collectors (unchanged behavior)
      this.startSystemCollectors();

      // Start the ping loop (NEW)
      this.scheduleNextPing();
    }
  },

  // ───────────────────────────────────────────────────────────────────────────
  // System collectors
  // ───────────────────────────────────────────────────────────────────────────
  startSystemCollectors: function () {
    const interval = Math.max(1000, Number(this.config.updateInterval) || 5000);
    if (this.systemTimer) clearInterval(this.systemTimer);

    const poll = () => {
      this.collectSystemStats()
        .then((stats) => {
          this.sendSocketNotification("SYSTEMSTATS_DATA", stats);
        })
        .catch((err) => {
          // Send partial fallback
          this.sendSocketNotification("SYSTEMSTATS_DATA", {
            cpuTempC: null,
            cpuLoad: this.getLoadAverage(),
            memUsedMB: this.getMemUsedMB(),
            memTotalMB: this.getMemTotalMB(),
            uptime: this.getUptime(),
            diskFree: null
          });
          console.error("[MMM-SystemStats] system stats error:", err);
        });
    };

    poll(); // initial
    this.systemTimer = setInterval(poll, interval);
  },

  collectSystemStats: async function () {
    const cpuTempC = await this.readCpuTempC();
    const cpuLoad = this.getLoadAverage();
    const memUsedMB = this.getMemUsedMB();
    const memTotalMB = this.getMemTotalMB();
    const uptime = this.getUptime();
    const diskFree = await this.getDiskFreeRoot();
    return { cpuTempC, cpuLoad, memUsedMB, memTotalMB, uptime, diskFree };
  },

  readCpuTempC: function () {
    // Raspberry Pi path; return °C as float or null
    return new Promise((resolve) => {
      fs.readFile("/sys/class/thermal/thermal_zone0/temp", "utf8", (err, data) => {
        if (err || !data) return resolve(null);
        const v = parseFloat(data) / 1000;
        resolve(Number.isNaN(v) ? null : v);
      });
    });
  },

  getLoadAverage: function () {
    const la = os.loadavg();
    return Array.isArray(la) && la.length ? la[0] : null; // 1-min load
  },

  getMemTotalMB: function () {
    return os.totalmem() / (1024 * 1024);
  },

  getMemUsedMB: function () {
    const used = os.totalmem() - os.freemem();
    return used / (1024 * 1024);
  },

  getUptime: function () {
    const sec = os.uptime();
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },

  getDiskFreeRoot: function () {
    return new Promise((resolve) => {
      exec("df -h / | awk 'NR==2{print $4}'", (err, stdout) => {
        if (err || !stdout) return resolve(null);
        resolve(stdout.trim());
      });
    });
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Ping loop (NEW)
  // ───────────────────────────────────────────────────────────────────────────
  scheduleNextPing: function () {
    if (!this.config) return;

    const minS = Number(this.config.pingIntervalMin) || 10;
    const maxS = Number(this.config.pingIntervalMax) || 20;
    const lo = Math.max(1, Math.min(minS, maxS)) * 1000;
    const hi = Math.max(minS, maxS) * 1000;
    const delay = Math.floor(lo + Math.random() * (hi - lo));

    if (this.pingTimerHandle) clearTimeout(this.pingTimerHandle);
    this.pingTimerHandle = setTimeout(() => this.performPing(), delay);
  },

  performPing: function () {
    const host = this.config.pingHost || "1.1.1.1";
    const count = Math.max(1, parseInt(this.config.pingCount, 10) || 1);

    // -n (numeric), -q (summary), -c <count> — works on Linux/macOS
    const cmd = `ping -n -q -c ${count} ${host}`;

    exec(cmd, { timeout: Math.max(5000, 2000 * count) }, (error, stdout, stderr) => {
      let avg = null;
      const out = (stdout || "") + "\n" + (stderr || "");

      // Linux: "rtt min/avg/max/mdev = 13.456/15.789/..." (ms)
      // BSD/macOS: "round-trip min/avg/max/stddev = 13.456/15.789/..." (ms)
      const matchLinux = out.match(/rtt [^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)\s*ms/);
      const matchBSD   = out.match(/round-trip [^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)\s*ms/);
      const m = matchLinux || matchBSD;

      if (m && m[2]) {
        const v = parseFloat(m[2]);
        avg = Number.isNaN(v) ? null : v;
      } else {
        // If count==1, some platforms only emit "time=XX ms"
        const one = out.match(/time[=<]\s*([\d.]+)\s*ms/);
        if (one && one[1]) {
          const v = parseFloat(one[1]);
          avg = Number.isNaN(v) ? null : v;
        }
      }

      this.sendSocketNotification("SYSTEMSTATS_PING", {
        host,
        avgMs: avg,
        error: error ? (error.message || "Ping failed") : null
      });

      // Schedule next measurement
      this.scheduleNextPing();
    });
  }
});
