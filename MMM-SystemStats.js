/* MMM-SystemStats.js
 * A MagicMirror module to display CPU, RAM, temp, disk usage … plus Ping (ms).
 * Minimal change: adds ONE new line for "Ping:" while preserving original layout.
 */
/* global Module */

Module.register("MMM-SystemStats", {
    defaults: {
        cpuUpdateInterval: 1000,    // CPU usage and temperature update every 1 second
        ramUpdateInterval: 10000,   // RAM usage update every 10 seconds
        diskUpdateInterval: 60000,  // Disk usage update every 60 seconds

        // Configurable options to enable/disable specific metrics
        showCpuUsage: true,
        showCpuTempC: true,
        showCpuTempF: true,
        showRamUsage: true,
        showDiskUsage: true,

        // NEW: Ping configuration (can be overridden in config.js)
        pingHost: "1.1.1.1",
        pingCount: 1,
        pingIntervalMin: 10,  // seconds (minimum)
        pingIntervalMax: 30   // seconds (maximum)
    },

    start: function() {
        this.stats = {
            cpuUsage: 0,
            cpuTemp: "N/A",
            cpuTempF: "N/A",
            usedRam: 0,
            freeRam: 0,
            driveCapacity: "N/A",
            freeSpace: "N/A",
            // NEW: keep ping value; "N/A" until first result
            pingMs: "N/A"
        };

        // Existing scheduling/initial kicks
        this.updateCpuStats();
        this.updateCpuTemp();
        this.updateRamStats();
        this.updateDiskUsage();
        this.scheduleCpuStatsUpdate();
        this.scheduleTempUpdate();
        this.scheduleRamUpdate();
        this.scheduleDiskUpdate();

        // NEW: send ping config to node_helper and let helper schedule randomized loop
        this.sendSocketNotification("PING_CONFIG", {
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
            this.sendSocketNotification("GET_CPU_TEMP");
        }
    },

    updateRamStats: function() {
        if (this.config.showRamUsage) {
            this.sendSocketNotification("GET_RAM_USAGE");
        }
    },

    updateDiskUsage: function() {
        if (this.config.showDiskUsage) {
            this.sendSocketNotification("GET_DISK_USAGE");
        }
    },

    scheduleCpuStatsUpdate: function() {
        setInterval(() => {
            this.updateCpuStats();
        }, this.config.cpuUpdateInterval);
    },

    scheduleTempUpdate: function() {
        setInterval(() => {
            this.updateCpuTemp();
        }, this.config.cpuUpdateInterval);
    },

    scheduleRamUpdate: function() {
        setInterval(() => {
            this.updateRamStats();
        }, this.config.ramUpdateInterval);
    },

    scheduleDiskUpdate: function() {
        setInterval(() => {
            this.updateDiskUsage();
        }, this.config.diskUpdateInterval);
    },

    // Helper to compute a readable color from ping ms (green=fast, red=slow)
    // Uses simple thresholds: <=20ms green, 21–50 yellow, 51–100 orange, >100 red.
    colorForPing: function(ms) {
        if (typeof ms !== "number" || isNaN(ms)) return "";
        if (ms <= 20) return "#00a000";      // green
        if (ms <= 50) return "#c0a000";      // yellow-ish
        if (ms <= 100) return "#d07a00";     // orange
        return "#d00000";                    // red
    },

    getDom: function() {
        let wrapper = document.createElement("div");
        wrapper.className = "system-stats";

        // CPU Usage Display
        if (this.config.showCpuUsage) {
            let cpuUsageWrapper = document.createElement("div");
            cpuUsageWrapper.className = "cpu-usage";
            let titleCpu = document.createElement("div");
            titleCpu.innerHTML = `CPU Usage: <strong>${this.stats.cpuUsage}%</strong>`;
            let cpuBar = document.createElement("progress");
            cpuBar.value = this.stats.cpuUsage;
            cpuBar.max = 100;
            cpuUsageWrapper.appendChild(titleCpu);
            cpuUsageWrapper.appendChild(cpuBar);
            wrapper.appendChild(cpuUsageWrapper);
        }

        // CPU Temperature Display (both Celsius and Fahrenheit)
        if (this.config.showCpuTempC || this.config.showCpuTempF) {
            let cpuTempWrapper = document.createElement("div");
            cpuTempWrapper.className = "cpu-temp";
            let titleTemp = document.createElement("div");
            let tempText = `CPU Temp: <strong>`;
            if (this.config.showCpuTempC) {
                tempText += `${this.stats.cpuTemp}ºC`;
            }
            if (this.config.showCpuTempF) {
                tempText += ` / ${this.stats.cpuTempF}ºF`;
            }
            tempText += `</strong>`;
            titleTemp.innerHTML = tempText;
            cpuTempWrapper.appendChild(titleTemp);
            wrapper.appendChild(cpuTempWrapper);
        }

        // RAM Usage Display
        if (this.config.showRamUsage) {
            let ramUsageWrapper = document.createElement("div");
            ramUsageWrapper.className = "ram-usage";
            let titleRam = document.createElement("div");
            titleRam.innerHTML = `8GB RAM: <strong>Used: ${this.stats.usedRam}GB / Free: ${this.stats.freeRam}GB</strong>`;
            ramUsageWrapper.appendChild(titleRam);
            wrapper.appendChild(ramUsageWrapper);
        }

        // Disk Usage Display
        if (this.config.showDiskUsage) {
            let diskUsageWrapper = document.createElement("div");
            diskUsageWrapper.className = "disk-usage";
            let titleDisk = document.createElement("div");
            titleDisk.innerHTML = `Disk Usage: <strong>Free: ${this.stats.freeSpace} / Capacity: ${this.stats.driveCapacity}</strong>`;
            diskUsageWrapper.appendChild(titleDisk);
            wrapper.appendChild(diskUsageWrapper);
        }

        // NEW: Ping line (single line, same style: label + <strong>value</strong>)
        // Always show if pingHost is configured; shows "N/A" until first result.
        if (this.config.pingHost) {
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
            this.updateDom();
        }
        if (notification === "DISK_USAGE") {
            this.stats.driveCapacity = payload.driveCapacity;
            this.stats.freeSpace = payload.freeSpace;
            this.updateDom();
        }

        // NEW: update ping ms
        if (notification === "PING_RESULT") {
            if (payload && typeof payload.avgMs === "number") {
                this.stats.pingMs = payload.avgMs;
            } else {
                this.stats.pingMs = "N/A";
            }
            this.updateDom();
        }
    }
});
