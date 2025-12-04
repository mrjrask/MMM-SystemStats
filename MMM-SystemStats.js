/* MMM-SystemStats.js
 * A MagicMirror module to display CPU, RAM, temp, disk usage … plus Ping (ms).
 * Minimal change: adds ONE new line for "Ping:" while preserving original layout,
 * and shows a nice rounded total RAM label.
 */
/* global Module */

Module.register("MMM-SystemStats", {
    defaults: {
        cpuUpdateInterval: 1000,    // CPU usage and temperature update every 1 second
        ramUpdateInterval: 10000,   // RAM usage update every 10 seconds
        diskUpdateInterval: 60000,  // Disk usage update every 60 seconds

        fanUpdateInterval: 10000,   // Fan tachometer update
        fanHwmonPath: "",           // Optional explicit /sys/class/hwmon/.../fan*_input path

        // Configurable options to enable/disable specific metrics
        showCpuUsage: true,
        showCpuTempC: true,
        showCpuTempF: true,
        showRamUsage: true,
        showDiskUsage: true,
        showFanSpeed: true,

        // Ping configuration (overridable in config.js)
        // Helper also has a fallback to 8.8.8.8 if this ends up empty/undefined.
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
            totalRam: 0,      // in GB (float)
            driveCapacity: "N/A",
            freeSpace: "N/A",
            // Ping value; "N/A" until first result
            pingMs: "N/A",

            // Fan tachometer
            fanRpm: "N/A"
        };

        // Existing scheduling/initial kicks
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

        // Send ping config to node_helper and let helper schedule randomized loop
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

    requestFanTelemetry: function() {
        if (this.config.showFanSpeed) {
            this.sendSocketNotification("GET_FAN_SPEED", {
                fanUpdateInterval: this.config.fanUpdateInterval,
                fanHwmonPath: this.config.fanHwmonPath
            });
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

    scheduleFanUpdate: function() {
        setInterval(() => {
            this.requestFanTelemetry();
        }, this.config.fanUpdateInterval);
    },

    // Compute a readable color from ping ms (green=fast, red=slow)
    // Thresholds: <=20ms green, 21–50 yellow, 51–100 orange, >100 red.
    colorForPing: function(ms) {
        if (typeof ms !== "number" || isNaN(ms)) return "";
        if (ms <= 20) return "#00a000";      // green
        if (ms <= 50) return "#c0a000";      // yellow-ish
        if (ms <= 100) return "#d07a00";     // orange
        return "#d00000";                    // red
    },

    // Compute color for temperature (Celsius)
    // Green (<50°C), Yellow-Green (50-60°C), Orange (60-70°C), Red (70-80°C), Purple (80°C+)
    colorForTemp: function(tempC) {
        // Parse temperature value (remove "N/A" or non-numeric values)
        const temp = parseFloat(tempC);
        if (isNaN(temp)) return "#4CAF50"; // Default green for N/A

        if (temp < 50) return "#4CAF50";      // Green - Normal
        if (temp < 60) return "#9ACD32";      // Yellow-Green - Warm
        if (temp < 70) return "#FF8C00";      // Orange - Hot
        if (temp < 80) return "#FF0000";      // Red - Very hot
        return "#9932CC";                     // Purple - Critical
    },

    // Check if temperature is critical (80°C+) for pulsing animation
    isTempCritical: function(tempC) {
        const temp = parseFloat(tempC);
        return !isNaN(temp) && temp >= 80;
    },

    // Nice total RAM label (512MB, 1GB, 2GB, 4GB, 8GB, 16GB, …)
    // Round to the nearest "typical" Raspberry Pi size so an 8GB Pi that
    // reports ~7.8GB (because of GPU reservation) still shows "8GB RAM".
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
            // Only known sub-1GB size we support is 512MB.
            return "512MB RAM";
        }
        return `${Math.round(closest)}GB RAM`;
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

            // Determine color based on Celsius temperature
            const tempColor = this.colorForTemp(this.stats.cpuTemp);
            const isCritical = this.isTempCritical(this.stats.cpuTemp);
            const pulseClass = isCritical ? ' temp-critical' : '';

            let tempText = `CPU Temp: <strong>`;
            if (this.config.showCpuTempC) {
                tempText += `<span class="temp-value${pulseClass}" style="color:${tempColor}">${this.stats.cpuTemp}ºC</span>`;
            }
            if (this.config.showCpuTempF) {
                tempText += ` / <span class="temp-value${pulseClass}" style="color:${tempColor}">${this.stats.cpuTempF}ºF</span>`;
            }
            tempText += `</strong>`;
            titleTemp.innerHTML = tempText;
            cpuTempWrapper.appendChild(titleTemp);
            wrapper.appendChild(cpuTempWrapper);
        }

        // RAM Usage Display (with nice total RAM label)
        if (this.config.showRamUsage) {
            let ramUsageWrapper = document.createElement("div");
            ramUsageWrapper.className = "ram-usage";
            let titleRam = document.createElement("div");

            const totalLabel = this.niceTotalRamLabel(this.stats.totalRam);
            titleRam.innerHTML = `${totalLabel}: <strong>Used: ${this.stats.usedRam}GB / Free: ${this.stats.freeRam}GB</strong>`;
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

        // Fan speed (align styling with Ping line)
        if (this.config.showFanSpeed) {
            let fanWrapper = document.createElement("div");
            fanWrapper.className = "fan-speed";
            let titleFan = document.createElement("div");
            const fanValue = (typeof this.stats.fanRpm === "number") ? `${this.stats.fanRpm} RPM` : this.stats.fanRpm;
            titleFan.innerHTML = `Fan: <strong>${fanValue}</strong>`;
            fanWrapper.appendChild(titleFan);
            wrapper.appendChild(fanWrapper);
        }

        // Ping line (single line, same style: label + <strong>value</strong>)
        // Always show if pingHost is configured; shows "N/A" until first result.
        if (this.config.pingHost || true) { // keep visible even if fallback is used in helper
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
            this.stats.totalRam = parseFloat(payload.totalRam);  // NEW
            this.updateDom();
        }
        if (notification === "DISK_USAGE") {
            this.stats.driveCapacity = payload.driveCapacity;
            this.stats.freeSpace = payload.freeSpace;
            this.updateDom();
        }

        // Update ping ms (avg when pingCount > 1; single value otherwise)
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
