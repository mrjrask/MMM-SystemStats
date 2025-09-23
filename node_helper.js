const NodeHelper = require("node_helper");
const { exec } = require("child_process");
const os = require("os");
const fs = require("fs");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node_helper for: " + this.name);
        this.lastIdle = 0;
        this.lastTotal = 0;

        // Ping scheduling state + defaults
        this.pingConfig = {
            pingHost: "1.1.1.1",
            pingCount: 1,
            pingIntervalMin: 10,
            pingIntervalMax: 30
        };
        this._pingTimer = null;
    },

    stop: function () {
        if (this._pingTimer) clearTimeout(this._pingTimer);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "GET_CPU_USAGE") {
            this.getCpuUsage();
        }
        if (notification === "GET_CPU_TEMP") {
            this.getCpuTempAndRam();
        }
        if (notification === "GET_RAM_USAGE") {
            this.getRamUsage();
        }
        if (notification === "GET_DISK_USAGE") {
            this.getDiskUsage();
        }

        // Accept ping config from front-end and (re)start ping loop
        if (notification === "PING_CONFIG") {
            this.pingConfig = Object.assign({}, this.pingConfig, payload || {});
            this._scheduleNextPing(); // kicks off randomized loop
        }
    },

    // Calculate overall CPU usage from /proc/stat
    getCpuUsage: function() {
        fs.readFile('/proc/stat', 'utf8', (err, data) => {
            if (err) {
                console.error("Error reading /proc/stat:", err);
                return;
            }

            const cpuData = data.split('\n')[0].replace(/ +/g, ' ').split(' ');
            const idle = parseInt(cpuData[4]);
            const total = cpuData.slice(1, 8).reduce((acc, val) => acc + parseInt(val), 0);

            const idleDiff = idle - this.lastIdle;
            const totalDiff = total - this.lastTotal;

            const cpuUsage = Math.round(100 * (1 - idleDiff / totalDiff));

            this.lastIdle = idle;
            this.lastTotal = total;

            this.sendSocketNotification("CPU_USAGE", { cpuUsage });
        });
    },

    // Get CPU temperature
    getCpuTempAndRam: function() {
        fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8', (err, data) => {
            if (err) {
                console.error("Error reading CPU temperature:", err);
                this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A", cpuTempF: "N/A" });
            } else {
                const tempC = parseFloat(data) / 1000; // Convert millidegree to degree Celsius
                const tempF = (tempC * 9/5) + 32;      // Convert Celsius to Fahrenheit
                if (isNaN(tempC)) {
                    console.error("Error parsing CPU temperature.");
                    this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A", cpuTempF: "N/A" });
                } else {
                    this.sendSocketNotification("CPU_TEMP", {
                        cpuTemp: tempC.toFixed(1),
                        cpuTempF: tempF.toFixed(1)
                    });
                }
            }
        });
    },

    // Calculate RAM usage
    getRamUsage: function() {
        const totalRamBytes = os.totalmem();
        const freeRamBytes = os.freemem();

        const usedRamGB = (totalRamBytes - freeRamBytes) / (1024 * 1024 * 1024);
        const freeRamGB = freeRamBytes / (1024 * 1024 * 1024);
        const totalRamGB = totalRamBytes / (1024 * 1024 * 1024);

        this.sendSocketNotification("RAM_USAGE", {
            usedRam: usedRamGB.toFixed(2),
            freeRam: freeRamGB.toFixed(2),
            totalRam: totalRamGB.toFixed(2)   // send total for nice label
        });
    },

    // Disk Usage via df
    getDiskUsage: function() {
        exec("df -h --output=source,size,avail,target /", (err, stdout, stderr) => {
            if (err) {
                console.error("Error fetching disk usage:", err);
                return;
            }

            const lines = stdout.trim().split('\n');
            if (lines.length >= 2) {
                const diskInfo = lines[1].replace(/ +/g, ' ').split(' ');
                const driveCapacity = diskInfo[1].replace("G", "GB");
                const freeSpace = diskInfo[2].replace("G", "GB");

                this.sendSocketNotification("DISK_USAGE", {
                    driveCapacity: driveCapacity,
                    freeSpace: freeSpace
                });
            }
        });
    },

    // ───── Ping support (average shown when pingCount > 1) ──────────────────
    _scheduleNextPing: function () {
        if (this._pingTimer) {
            clearTimeout(this._pingTimer);
            this._pingTimer = null;
        }
        const minS = Math.max(1, Number(this.pingConfig.pingIntervalMin) || 10);
        const maxS = Math.max(minS, Number(this.pingConfig.pingIntervalMax) || 30);
        const delayMs = Math.floor(minS * 1000 + Math.random() * ((maxS - minS) * 1000));

        this._pingTimer = setTimeout(() => this._performPing(), delayMs);
    },

    _performPing: function () {
        // Fallback host if pingHost is missing/empty → 8.8.8.8
        const host = (this.pingConfig.pingHost && String(this.pingConfig.pingHost).trim()) ? this.pingConfig.pingHost : "8.8.8.8";
        const count = Math.max(1, parseInt(this.pingConfig.pingCount, 10) || 1);

        // -n (numeric), -q (summary), -c <count>: works on Linux/macOS
        const cmd = `ping -n -q -c ${count} ${host}`;

        exec(cmd, { timeout: Math.max(5000, 2000 * count) }, (error, stdout, stderr) => {
            let avg = null;
            const out = `${stdout || ""}\n${stderr || ""}`;

            // Linux: "rtt min/avg/max/mdev = 13.456/15.789/..."
            // BSD/macOS: "round-trip min/avg/max/stddev = 13.456/15.789/..."
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

            this.sendSocketNotification("PING_RESULT", {
                host,
                avgMs: avg, // average across pingCount (or single value)
                error: error ? (error.message || "Ping failed") : null
            });

            // Schedule next randomized run
            this._scheduleNextPing();
        });
    }
});
