/* node_helper.js
 * Backend for MMM-SystemStats, now with Ping support.
 * Runs system collectors and pings a configurable host on a randomized interval.
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
      this.config = Object.assign(
        {
          updateInterval: 5000,
          pingHost: "1.1.1.1",
          pingCount: 1,
          pingIntervalMin: 10,
          pingIntervalMax: 20
        },
        payload || {}
      );

      // Kick off regular system collectors (CPU temp, load, mem, disk, uptime)
      this.startSystemCollectors();

      // Kick off the ping loop
      this.scheduleNextPing();
    }
  },

  // ---------------------------
  // System collectors (lightweight)
  // ---------------------------
  startSystemCollectors: function () {
    const interval = Math.max(1000, Number(this.config.updateInterval) || 5000);
    if (this.systemTimer) clearInterval(this.systemTimer);

    // Poll basic stats and push to front-end
    const poll = () => {
      this.collectSystemStats()
        .then((stats) => {
          this.sendSocketNotification("SYSTEMSTATS_DATA", stats);
        })
        .catch((err) => {
          // In case of failure, send what we have
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
    // CPU temp (try common Linux path; fallback: null)
    const cpuTempC = await this.readCpuTempC();

    // Load average (1-min)
    const cpuLoad = this.getLoadAverage();

    // Memory
    const memUsedMB = this.getMemUsedMB();
    const memTotalMB = this.getMemTotalMB();

    // Uptime
    const uptime = this.getUptime();

    // Disk free (root)
    const diskFree = await this.getDiskFreeRoot();

    return { cpuTempC, cpuLoad, memUsedMB, memTotalMB, uptime, diskFree };
  },

  readCpuTempC: function () {
    // Raspberry Pi style path; returns °C as float
    return new Promise((resolve) => {
      fs.readFile("/sys/class/thermal/thermal_zone0/temp", "utf8", (err, data) => {
        if (err || !data) return resolve(null);
        const val = parseFloat(data) / 1000; // millidegrees
        if (isNaN(val)) return resolve(null);
        resolve(val);
      });
    });
  },

  getLoadAverage: function () {
    const la = os.loadavg();
    return Array.isArray(la) && la.length ? la[0] : null; // 1-minute
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
    // Format as d h m
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  },

  getDiskFreeRoot: function () {
    return new Promise((resolve) => {
      // `df -h /` prints human-readable size; parse the "Avail" column from the second line.
      exec("df -h / | awk 'NR==2{print $4}'", (err, stdout) => {
        if (err || !stdout) return resolve(null);
        resolve(stdout.trim());
      });
    });
  },

  // ---------------------------
  // Ping loop
  // ---------------------------
  scheduleNextPing: function () {
    if (!this.config) return;

    const minS = Number(this.config.pingIntervalMin) || 10;
    const maxS = Number(this.config.pingIntervalMax) || 20;
    const minMs = Math.max(1, Math.min(minS, maxS)) * 1000;
    const maxMs = Math.max(minS, maxS) * 1000;
    const delay = Math.floor(minMs + Math.random() * (maxMs - minMs));

    if (this.pingTimerHandle) clearTimeout(this.pingTimerHandle);
    this.pingTimerHandle = setTimeout(() => this.performPing(), delay);
  },

  performPing: function () {
    const host = this.config.pingHost || "1.1.1.1";
    const count = Math.max(1, parseInt(this.config.pingCount, 10) || 1);

    // -n (numeric), -q (quiet summary), -c N (count). Works on Linux/macOS (BSD ping accepts -n/-q/-c)
    const cmd = `ping -n -q -c ${count} ${host}`;

    exec(cmd, { timeout: Math.max(5000, 2000 * count) }, (error, stdout, stderr) => {
      let avg = null;
      let errMsg = null;

      const out = (stdout || "") + "\n" + (stderr || "");

      if (error) {
        errMsg = error.message || "Ping failed";
      }

      // Try to parse Linux style: "rtt min/avg/max/mdev = 13.456/15.789/..." (ms)
      // Or macOS/BSD style: "round-trip min/avg/max/stddev = 13.456/15.789/..." (ms)
      const matchLinux = out.match(/rtt [^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)\s*ms/);
      const matchBSD   = out.match(/round-trip [^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)\s*ms/);

      const m = matchLinux || matchBSD;
      if (m && m[2]) {
        avg = parseFloat(m[2]);
        if (Number.isNaN(avg)) avg = null;
      } else {
        // Some platforms print a single "time=XX ms" when count=1; take first time= value
        const timeOne = out.match(/time[=<]\s*([\d.]+)\s*ms/);
        if (timeOne && timeOne[1]) {
          avg = parseFloat(timeOne[1]);
          if (Number.isNaN(avg)) avg = null;
        }
      }

      this.sendSocketNotification("SYSTEMSTATS_PING", {
        host,
        avgMs: avg,
        error: errMsg
      });

      // Schedule the next run
      this.scheduleNextPing();
    });
  }
});
