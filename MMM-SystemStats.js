Module.register("MMM-SystemStats", {
    defaults: {
        cpuUpdateInterval: 1000, // CPU usage update every 1 second
        tempUpdateInterval: 30000, // CPU temperature update every 30 seconds
    },

    start: function() {
        this.stats = {
            cpuUsage: 0,
            cpuTemp: "N/A",
            totalRam: 0,
            freeRam: 0
        };
        this.updateCpuStats();
        this.updateCpuTemp();
        this.scheduleCpuStatsUpdate();
        this.scheduleTempUpdate();
    },

    updateCpuStats: function() {
        this.sendSocketNotification("GET_CPU_USAGE");
    },

    updateCpuTemp: function() {
        this.sendSocketNotification("GET_CPU_TEMP");
    },

    scheduleCpuStatsUpdate: function() {
        setInterval(() => {
            this.updateCpuStats();
        }, this.config.cpuUpdateInterval);
    },

    scheduleTempUpdate: function() {
        setInterval(() => {
            this.updateCpuTemp();
        }, this.config.tempUpdateInterval);
    },

    getDom: function() {
        let wrapper = document.createElement("div");
        wrapper.className = "system-stats";

        // CPU Usage Display
        let cpuUsageWrapper = document.createElement("div");
        cpuUsageWrapper.className = "cpu-usage";
        let titleCpu = document.createElement("div");
        titleCpu.innerHTML = `CPU Usage: <strong>${this.stats.cpuUsage}%</strong>`;
        let cpuBar = document.createElement("progress");
        cpuBar.value = this.stats.cpuUsage;
        cpuBar.max = 100;
        cpuUsageWrapper.appendChild(titleCpu);
        cpuUsageWrapper.appendChild(cpuBar);

        // CPU Temperature Display
        let cpuTempWrapper = document.createElement("div");
        cpuTempWrapper.className = "cpu-temp";
        let titleTemp = document.createElement("div");
        titleTemp.innerHTML = `CPU Temp: <strong>${this.stats.cpuTemp}°C</strong>`;
        cpuTempWrapper.appendChild(titleTemp);

        // RAM Usage Display in GB
        let ramUsageWrapper = document.createElement("div");
        ramUsageWrapper.className = "ram-usage";
        let totalRamGB = this.stats.totalRam;
        let usedRamGB = (this.stats.totalRam - this.stats.freeRam).toFixed(2);
        let titleRam = document.createElement("div");
        titleRam.innerHTML = `RAM Usage: <strong>${usedRamGB}GB / ${totalRamGB}GB</strong>`;
        ramUsageWrapper.appendChild(titleRam);

        // Append all elements to the main wrapper
        wrapper.appendChild(cpuUsageWrapper);
        wrapper.appendChild(cpuTempWrapper);
        wrapper.appendChild(ramUsageWrapper);

        return wrapper;
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "CPU_USAGE") {
            this.stats.cpuUsage = payload.cpuUsage;
            this.updateDom();
        }
        if (notification === "CPU_TEMP") {
            this.stats.cpuTemp = payload.cpuTemp;
            this.stats.totalRam = payload.totalRam;
            this.stats.freeRam = payload.freeRam;
            this.updateDom();
        }
    }
});
