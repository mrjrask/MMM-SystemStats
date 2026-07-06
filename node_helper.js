const NodeHelper = require("node_helper");
const { execFile } = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node_helper for: " + this.name);
        this.lastIdle = null;
        this.lastTotal = null;

        this.pingConfig = {
            enabled: true,
            pingHost: "1.1.1.1",
            pingCount: 1,
            pingIntervalMin: 10,
            pingIntervalMax: 30
        };
        this._pingTimer = null;

        this.fanConfig = {
            fanUpdateInterval: 10000,
            fanHwmonPath: ""
        };
        this._fanTimer = null;
        this._fanInputPath = null;
    },

    stop: function() {
        if (this._pingTimer) clearTimeout(this._pingTimer);
        if (this._fanTimer) clearInterval(this._fanTimer);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "GET_CPU_USAGE") {
            this.getCpuUsage();
        }
        if (notification === "GET_CPU_TEMP") {
            this.getCpuTemp(payload || {});
        }
        if (notification === "GET_RAM_USAGE") {
            this.getRamUsage();
        }
        if (notification === "GET_DISK_USAGE") {
            this.getDiskUsage(payload || {});
        }
        if (notification === "GET_FAN_SPEED") {
            this._configureFanPolling(payload || {});
        }
        if (notification === "PING_CONFIG") {
            this.pingConfig = Object.assign({}, this.pingConfig, payload || {});
            if (!this.pingConfig.enabled) {
                this._clearPingTimer();
                this.sendSocketNotification("PING_RESULT", { avgMs: null, error: null });
                return;
            }
            this._scheduleNextPing();
        }
    },

    getCpuUsage: function() {
        fs.readFile("/proc/stat", "utf8", (err, data) => {
            if (err) {
                console.error("Error reading /proc/stat:", err);
                return;
            }

            const cpuData = data.split("\n")[0].replace(/ +/g, " ").split(" ");
            const idle = parseInt(cpuData[4], 10);
            const total = cpuData.slice(1, 8).reduce((acc, val) => acc + parseInt(val, 10), 0);

            if (!Number.isFinite(idle) || !Number.isFinite(total)) {
                console.error("Error parsing /proc/stat CPU values.");
                return;
            }

            if (this.lastIdle === null || this.lastTotal === null) {
                this.lastIdle = idle;
                this.lastTotal = total;
                this.sendSocketNotification("CPU_USAGE", { cpuUsage: "N/A" });
                return;
            }

            const idleDiff = idle - this.lastIdle;
            const totalDiff = total - this.lastTotal;

            this.lastIdle = idle;
            this.lastTotal = total;

            if (totalDiff <= 0) {
                this.sendSocketNotification("CPU_USAGE", { cpuUsage: "N/A" });
                return;
            }

            const cpuUsage = Math.max(0, Math.min(100, Math.round(100 * (1 - idleDiff / totalDiff))));
            this.sendSocketNotification("CPU_USAGE", { cpuUsage });
        });
    },

    getCpuTemp: function(payload) {
        const tempPath = this._resolveCpuTempPath(payload.cpuTempPath);
        if (!tempPath) {
            this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A", cpuTempF: "N/A" });
            return;
        }

        fs.readFile(tempPath, "utf8", (err, data) => {
            if (err) {
                console.error("Error reading CPU temperature:", err);
                this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A", cpuTempF: "N/A" });
                return;
            }

            const rawTemp = parseFloat(data);
            const tempC = rawTemp > 1000 ? rawTemp / 1000 : rawTemp;
            const tempF = (tempC * 9 / 5) + 32;
            if (isNaN(tempC)) {
                console.error("Error parsing CPU temperature.");
                this.sendSocketNotification("CPU_TEMP", { cpuTemp: "N/A", cpuTempF: "N/A" });
                return;
            }

            this.sendSocketNotification("CPU_TEMP", {
                cpuTemp: tempC.toFixed(1),
                cpuTempF: tempF.toFixed(1)
            });
        });
    },

    _resolveCpuTempPath: function(configuredPath) {
        const preferredPath = String(configuredPath || "").trim();
        if (preferredPath && path.isAbsolute(preferredPath) && fs.existsSync(preferredPath)) {
            return preferredPath;
        }

        const thermalPath = "/sys/class/thermal/thermal_zone0/temp";
        if (fs.existsSync(thermalPath)) {
            return thermalPath;
        }

        const base = "/sys/class/hwmon";
        let hwmons = [];
        try {
            hwmons = fs.readdirSync(base);
        } catch (err) {
            console.error("Unable to read hwmon directory for CPU temperature:", err.message || err);
            return null;
        }

        for (const entry of hwmons) {
            const hwmonPath = path.join(base, entry);
            const candidates = [hwmonPath, path.join(hwmonPath, "device")];

            for (const dir of candidates) {
                let files = [];
                try {
                    files = fs.readdirSync(dir);
                } catch (err) {
                    continue;
                }

                const tempFile = files.find((file) => /^temp\d+_input$/.test(file));
                if (tempFile) {
                    return path.join(dir, tempFile);
                }
            }
        }

        return null;
    },

    getRamUsage: function() {
        const totalRamBytes = os.totalmem();
        const freeRamBytes = os.freemem();

        const usedRamGB = (totalRamBytes - freeRamBytes) / (1024 * 1024 * 1024);
        const freeRamGB = freeRamBytes / (1024 * 1024 * 1024);
        const totalRamGB = totalRamBytes / (1024 * 1024 * 1024);

        this.sendSocketNotification("RAM_USAGE", {
            usedRam: usedRamGB.toFixed(2),
            freeRam: freeRamGB.toFixed(2),
            totalRam: totalRamGB.toFixed(2)
        });
    },

    getDiskUsage: function(payload) {
        const diskMount = String(payload.diskMount || "/").trim() || "/";

        execFile("df", ["-h", "--output=source,size,avail,target", diskMount], (err, stdout, stderr) => {
            if (err) {
                console.error("Error fetching disk usage:", err.message || stderr || err);
                this.sendSocketNotification("DISK_USAGE", {
                    driveCapacity: "N/A",
                    freeSpace: "N/A",
                    diskMount
                });
                return;
            }

            const lines = stdout.trim().split("\n");
            if (lines.length >= 2) {
                const diskInfo = lines[1].replace(/ +/g, " ").split(" ");
                const driveCapacity = diskInfo[1].replace("G", "GB");
                const freeSpace = diskInfo[2].replace("G", "GB");

                this.sendSocketNotification("DISK_USAGE", {
                    driveCapacity,
                    freeSpace,
                    diskMount: diskInfo[3] || diskMount
                });
            }
        });
    },

    _clearPingTimer: function() {
        if (this._pingTimer) {
            clearTimeout(this._pingTimer);
            this._pingTimer = null;
        }
    },

    _scheduleNextPing: function() {
        this._clearPingTimer();
        const minS = Math.max(1, Number(this.pingConfig.pingIntervalMin) || 10);
        const maxS = Math.max(minS, Number(this.pingConfig.pingIntervalMax) || 30);
        const delayMs = Math.floor(minS * 1000 + Math.random() * ((maxS - minS) * 1000));

        this._pingTimer = setTimeout(() => this._performPing(), delayMs);
    },

    _isValidPingHost: function(host) {
        // Keep validation focused on preventing option injection while allowing
        // hostnames, IPv4 addresses, IPv6 literals, and IPv6 zone identifiers.
        return /^[A-Za-z0-9.:%-]+$/.test(host) && host.length <= 253 && !host.startsWith("-");
    },

    _performPing: function() {
        const host = (this.pingConfig.pingHost && String(this.pingConfig.pingHost).trim()) ? String(this.pingConfig.pingHost).trim() : "8.8.8.8";
        const count = Math.max(1, parseInt(this.pingConfig.pingCount, 10) || 1);

        if (!this._isValidPingHost(host)) {
            this.sendSocketNotification("PING_RESULT", {
                host,
                avgMs: null,
                error: "Invalid ping host"
            });
            this._scheduleNextPing();
            return;
        }

        execFile("ping", ["-n", "-q", "-c", String(count), host], { timeout: Math.max(5000, 2000 * count) }, (error, stdout, stderr) => {
            let avg = null;
            const out = `${stdout || ""}\n${stderr || ""}`;

            const matchLinux = out.match(/rtt [^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)\s*ms/);
            const matchBSD = out.match(/round-trip [^=]*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)\s*ms/);
            const m = matchLinux || matchBSD;

            if (m && m[2]) {
                const v = parseFloat(m[2]);
                avg = Number.isNaN(v) ? null : v;
            } else {
                const one = out.match(/time[=<]\s*([\d.]+)\s*ms/);
                if (one && one[1]) {
                    const v = parseFloat(one[1]);
                    avg = Number.isNaN(v) ? null : v;
                }
            }

            this.sendSocketNotification("PING_RESULT", {
                host,
                avgMs: avg,
                error: error ? (error.message || "Ping failed") : null
            });

            this._scheduleNextPing();
        });
    },

    _configureFanPolling: function(payload) {
        const intervalMs = Math.max(1000, Number(payload.fanUpdateInterval || this.fanConfig.fanUpdateInterval) || 10000);
        const hwmonPath = payload.fanHwmonPath || this.fanConfig.fanHwmonPath || "";

        let shouldRestart = false;
        if (intervalMs !== this.fanConfig.fanUpdateInterval) {
            this.fanConfig.fanUpdateInterval = intervalMs;
            shouldRestart = true;
        }
        if (hwmonPath !== this.fanConfig.fanHwmonPath) {
            this.fanConfig.fanHwmonPath = hwmonPath;
            this._fanInputPath = null;
            shouldRestart = true;
        }

        if (shouldRestart || !this._fanTimer) {
            if (this._fanTimer) clearInterval(this._fanTimer);
            this._pollFanSpeed();
            this._fanTimer = setInterval(() => this._pollFanSpeed(), this.fanConfig.fanUpdateInterval);
        }
    },

    _pollFanSpeed: function() {
        const fanPath = this._getFanInputPath();

        if (!fanPath) {
            this.sendSocketNotification("FAN_SPEED", { rpm: "N/A" });
            return;
        }

        fs.readFile(fanPath, "utf8", (err, data) => {
            if (err) {
                console.error("Error reading fan speed:", err.message || err);
                this._fanInputPath = null;
                this.sendSocketNotification("FAN_SPEED", { rpm: "N/A" });
                return;
            }

            const raw = parseInt(String(data).trim(), 10);
            const rpm = Number.isFinite(raw) ? raw : "N/A";
            this.sendSocketNotification("FAN_SPEED", { rpm });
        });
    },

    _getFanInputPath: function() {
        if (this.fanConfig.fanHwmonPath) {
            const direct = this.fanConfig.fanHwmonPath;
            if (fs.existsSync(direct)) {
                this._fanInputPath = direct;
                return direct;
            }
        }

        if (this._fanInputPath && fs.existsSync(this._fanInputPath)) {
            return this._fanInputPath;
        }

        const base = "/sys/class/hwmon";
        let hwmons = [];
        try {
            hwmons = fs.readdirSync(base);
        } catch (err) {
            console.error("Unable to read hwmon directory for fan telemetry:", err.message || err);
            return null;
        }

        for (const entry of hwmons) {
            const hwmonPath = path.join(base, entry);
            const candidates = [hwmonPath, path.join(hwmonPath, "device")];

            for (const dir of candidates) {
                let files = [];
                try {
                    files = fs.readdirSync(dir);
                } catch (err) {
                    continue;
                }

                for (const file of files) {
                    if (/^fan\d+_input$/.test(file)) {
                        const fullPath = path.join(dir, file);
                        this._fanInputPath = fullPath;
                        return fullPath;
                    }
                }
            }
        }

        return null;
    }
});
