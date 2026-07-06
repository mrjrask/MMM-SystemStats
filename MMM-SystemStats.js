/* MMM-SystemStats.js
 * A MagicMirror module to display CPU, RAM, temperature, disk, fan, and ping telemetry.
 */
/* global Module */

Module.register("MMM-SystemStats", {
    defaults: {
        cpuUpdateInterval: 1000,    // CPU usage and temperature update every 1 second
        ramUpdateInterval: 10000,   // RAM usage update every 10 seconds
        diskUpdateInterval: 60000,  // Disk usage update every 60 seconds

        cpuTempPath: "/sys/class/thermal/thermal_zone0/temp",
        diskMount: "/",

        fanUpdateInterval: 10000,   // Fan tachometer update
        fanHwmonPath: "",           // Optional explicit /sys/class/hwmon/.../fan*_input path

        // Configurable options to enable/disable specific metrics
        showCpuUsage: true,
        showCpuTempC: true,
        showCpuTempF: true,
        showRamUsage: true,
        showDiskUsage: true,
        showFanSpeed: true,
        showPing: true,

        // Ping configuration (overridable in config.js)
        // Helper also has a fallback to 8.8.8.8 if this ends up empty/undefined.
        pingHost: "1.1.1.1",
        pingCount: 1,
        pingIntervalMin: 10,  // seconds (minimum)
        pingIntervalMax: 30   // seconds (maximum)
    },

    start: function() {
        this.timers = [];
        this.stats = {
            cpuUsage: "N/A",
            cpuTemp: "N/A",
            cpuTempF: "N/A",
            usedRam: 0,
            freeRam: 0,
            totalRam: 0,
            driveCapacity: "N/A",
            freeSpace: "N/A",
            diskMount: this.config.diskMount,
            pingMs: "N/A",
            fanRpm: "N/A"
        };

        this.updateCpuStats();
        this.updateCpuTemp();
        this.updateRamStats();
        this.updateDiskUsage();
        this.requestFanTelemetry();
        this.scheduleCpuStatsUpdate();
        this.scheduleTempUpdate();
        this.scheduleRamUpdate();
        this.scheduleDiskUpdate();
        this.scheduleFanUpdate();
        this.configurePing();
    },

    suspend: function() {
        this.clearTimers();
    },

    resume: function() {
        this.clearTimers();
        this.scheduleCpuStatsUpdate();
        this.scheduleTempUpdate();
        this.scheduleRamUpdate();
        this.scheduleDiskUpdate();
        this.scheduleFanUpdate();
        this.configurePing();
    },

    clearTimers: function() {
        if (!this.timers) {
            this.timers = [];
            return;
        }
        this.timers.forEach((timer) => clearInterval(timer));
        this.timers = [];
    },

    normalizeInterval: function(value, fallback, minimum) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return Math.max(fallback, minimum);
        }
        return Math.max(parsed, minimum);
    },

    addTimer: function(callback, value, fallback, minimum) {
        const interval = this.normalizeInterval(value, fallback, minimum);
        const timer = setInterval(callback, interval);
        this.timers.push(timer);
        return timer;
    },

    configurePing: function() {
        if (!this.config.showPing) {
            this.sendSocketNotification("PING_CONFIG", { enabled: false });
            return;
        }

        this.sendSocketNotification("PING_CONFIG", {
            enabled: true,
            pingHost: this.config.pingHost,
            pingCount: this.config.pingCount,
            pingIntervalMin: this.config.pingIntervalMin,
            pingIntervalMax: this.config.pingIntervalMax
        });
    },

    updateCpuStats: function() {
        if (this.config.showCpuUsage) {
            this.sendSocketNotification("GET_CPU_USAGE");
        }
    },

    updateCpuTemp: function() {
        if (this.config.showCpuTempC || this.config.showCpuTempF) {
            this.sendSocketNotification("GET_CPU_TEMP", {
                cpuTempPath: this.config.cpuTempPath
            });
        }
    },

    updateRamStats: function() {
        if (this.config.showRamUsage) {
            this.sendSocketNotification("GET_RAM_USAGE");
        }
    },

    updateDiskUsage: function() {
        if (this.config.showDiskUsage) {
            this.sendSocketNotification("GET_DISK_USAGE", {
                diskMount: this.config.diskMount
            });
        }
    },

    requestFanTelemetry: function() {
        if (this.config.showFanSpeed) {
            this.sendSocketNotification("GET_FAN_SPEED", {
                fanUpdateInterval: this.config.fanUpdateInterval,
                fanHwmonPath: this.config.fanHwmonPath
            });
        }
    },

    scheduleCpuStatsUpdate: function() {
        this.addTimer(() => this.updateCpuStats(), this.config.cpuUpdateInterval, 1000, 500);
    },

    scheduleTempUpdate: function() {
        this.addTimer(() => this.updateCpuTemp(), this.config.cpuUpdateInterval, 1000, 500);
    },

    scheduleRamUpdate: function() {
        this.addTimer(() => this.updateRamStats(), this.config.ramUpdateInterval, 10000, 1000);
    },

    scheduleDiskUpdate: function() {
        this.addTimer(() => this.updateDiskUsage(), this.config.diskUpdateInterval, 60000, 10000);
    },

    scheduleFanUpdate: function() {
        this.addTimer(() => this.requestFanTelemetry(), this.config.fanUpdateInterval, 10000, 1000);
    },

    colorForPing: function(ms) {
        if (typeof ms !== "number" || isNaN(ms)) return "";
        if (ms <= 20) return "#00a000";
        if (ms <= 50) return "#c0a000";
        if (ms <= 100) return "#d07a00";
        return "#d00000";
    },

    colorForTemp: function(tempC) {
        const temp = parseFloat(tempC);
        if (isNaN(temp)) return "#4CAF50";

        if (temp < 50) return "#4CAF50";
        if (temp < 60) return "#9ACD32";
        if (temp < 70) return "#FF8C00";
        if (temp < 80) return "#FF0000";
        return "#9932CC";
    },

    isTempCritical: function(tempC) {
        const temp = parseFloat(tempC);
        return !isNaN(temp) && temp >= 80;
    },

    niceTotalRamLabel: function(totalRamGBFloat) {
        const g = Number(totalRamGBFloat);
        if (!Number.isFinite(g) || g <= 0) return "RAM";

        const knownSizes = [0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256];
        let closest = knownSizes[0];
        let smallestDiff = Math.abs(g - closest);

        for (let i = 1; i < knownSizes.length; i++) {
            const diff = Math.abs(g - knownSizes[i]);
            if (diff < smallestDiff) {
                smallestDiff = diff;
                closest = knownSizes[i];
            }
        }

        if (closest < 1) {
            return "512MB RAM";
        }
        return `${Math.round(closest)}GB RAM`;
    },

    getDom: function() {
        let wrapper = document.createElement("div");
        wrapper.className = "system-stats";

        if (this.config.showCpuUsage) {
            let cpuUsageWrapper = document.createElement("div");
            cpuUsageWrapper.className = "cpu-usage";
            let titleCpu = document.createElement("div");
            const cpuUsage = Number(this.stats.cpuUsage);
            const cpuLabel = Number.isFinite(cpuUsage) ? `${cpuUsage}%` : "N/A";
            titleCpu.innerHTML = `CPU Usage: <strong>${cpuLabel}</strong>`;
            let cpuBar = document.createElement("progress");
            cpuBar.value = Number.isFinite(cpuUsage) ? cpuUsage : 0;
            cpuBar.max = 100;
            cpuUsageWrapper.appendChild(titleCpu);
            cpuUsageWrapper.appendChild(cpuBar);
            wrapper.appendChild(cpuUsageWrapper);
        }

        if (this.config.showCpuTempC || this.config.showCpuTempF) {
            let cpuTempWrapper = document.createElement("div");
            cpuTempWrapper.className = "cpu-temp";
            let titleTemp = document.createElement("div");

            const tempColor = this.colorForTemp(this.stats.cpuTemp);
            const isCritical = this.isTempCritical(this.stats.cpuTemp);
            const pulseClass = isCritical ? " temp-critical" : "";

            let tempText = "CPU Temp: <strong>";
            if (this.config.showCpuTempC) {
                tempText += `<span class="temp-value${pulseClass}" style="color:${tempColor}">${this.stats.cpuTemp}ºC</span>`;
            }
            if (this.config.showCpuTempF) {
                tempText += ` / <span class="temp-value${pulseClass}" style="color:${tempColor}">${this.stats.cpuTempF}ºF</span>`;
            }
            tempText += "</strong>";
            titleTemp.innerHTML = tempText;
            cpuTempWrapper.appendChild(titleTemp);
            wrapper.appendChild(cpuTempWrapper);
        }

        if (this.config.showRamUsage) {
            let ramUsageWrapper = document.createElement("div");
            ramUsageWrapper.className = "ram-usage";
            let titleRam = document.createElement("div");

            const totalLabel = this.niceTotalRamLabel(this.stats.totalRam);
            titleRam.innerHTML = `${totalLabel}: <strong>Used: ${this.stats.usedRam}GB / Free: ${this.stats.freeRam}GB</strong>`;
            ramUsageWrapper.appendChild(titleRam);
            wrapper.appendChild(ramUsageWrapper);
        }

        if (this.config.showDiskUsage) {
            let diskUsageWrapper = document.createElement("div");
            diskUsageWrapper.className = "disk-usage";
            let titleDisk = document.createElement("div");
            titleDisk.innerHTML = `Disk Usage (${this.stats.diskMount || this.config.diskMount}): <strong>Free: ${this.stats.freeSpace} / Capacity: ${this.stats.driveCapacity}</strong>`;
            diskUsageWrapper.appendChild(titleDisk);
            wrapper.appendChild(diskUsageWrapper);
        }

        if (this.config.showFanSpeed && this.stats.fanRpm !== "N/A") {
            let fanWrapper = document.createElement("div");
            fanWrapper.className = "fan-speed";
            let titleFan = document.createElement("div");
            const fanValue = (typeof this.stats.fanRpm === "number") ? `${this.stats.fanRpm} RPM` : this.stats.fanRpm;
            titleFan.innerHTML = `Fan: <strong>${fanValue}</strong>`;
            fanWrapper.appendChild(titleFan);
            wrapper.appendChild(fanWrapper);
        }

        if (this.config.showPing) {
            let pingWrapper = document.createElement("div");
            pingWrapper.className = "ping";
            let titlePing = document.createElement("div");

            if (this.stats.pingMs === "N/A") {
                titlePing.innerHTML = `Ping: <strong>${this.stats.pingMs}</strong>`;
            } else {
                const msVal = Number(this.stats.pingMs);
                const color = this.colorForPing(msVal);
                titlePing.innerHTML = `Ping: <strong><span style="color:${color}">${msVal.toFixed(1)} ms</span></strong>`;
            }

            pingWrapper.appendChild(titlePing);
            wrapper.appendChild(pingWrapper);
        }

        return wrapper;
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "CPU_USAGE") {
            this.stats.cpuUsage = payload.cpuUsage;
            this.updateDom();
        }
        if (notification === "CPU_TEMP") {
            this.stats.cpuTemp = payload.cpuTemp;
            this.stats.cpuTempF = payload.cpuTempF;
            this.updateDom();
        }
        if (notification === "RAM_USAGE") {
            this.stats.usedRam = payload.usedRam;
            this.stats.freeRam = payload.freeRam;
            this.stats.totalRam = parseFloat(payload.totalRam);
            this.updateDom();
        }
        if (notification === "DISK_USAGE") {
            this.stats.driveCapacity = payload.driveCapacity;
            this.stats.freeSpace = payload.freeSpace;
            this.stats.diskMount = payload.diskMount || this.config.diskMount;
            this.updateDom();
        }
        if (notification === "PING_RESULT") {
            if (payload && typeof payload.avgMs === "number") {
                this.stats.pingMs = payload.avgMs;
            } else {
                this.stats.pingMs = "N/A";
            }
            this.updateDom();
        }
        if (notification === "FAN_SPEED") {
            this.stats.fanRpm = payload ? payload.rpm : "N/A";
            this.updateDom();
        }
    }
});
