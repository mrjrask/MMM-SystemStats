Module.register("MMM-SystemStats", {
    defaults: {
        updateInterval: 10000, // Update every 10 seconds
    },

    start: function() {
        this.stats = {
            cpuUsage: 0,
            cpuTemp: 0,
            totalRam: 0,
            freeRam: 0
        };
        this.updateStats();
        this.scheduleUpdate();
    },

    updateStats: function() {
        this.sendSocketNotification("GET_SYSTEM_STATS");
    },

    scheduleUpdate: function() {
        setInterval(() => {
            this.updateStats();
        }, this.config.updateInterval);
    },

    getDom: function() {
        let wrapper = document.createElement("div");
        wrapper.className = "system-stats";

        // CPU Usage Bar (overall)
        let cpuUsageWrapper = document.createElement("div");
        cpuUsageWrapper.className = "cpu-usage";
        let titleCpu = document.createElement("h2");
        titleCpu.innerHTML = "CPU Usage:";
        let cpuBar = document.createElement("progress");
        cpuBar.value = this.stats.cpuUsage;
        cpuBar.max = 100;
        cpuUsageWrapper.appendChild(titleCpu);
        cpuUsageWrapper.appendChild(cpuBar);

        // CPU Temperature
        let cpuTempWrapper = document.createElement("div");
        cpuTempWrapper.className = "cpu-temp";
        let titleTemp = document.createElement("h2");
        titleTemp.innerHTML = `CPU Temperature: ${this.stats.cpuTemp}°C`;
        cpuTempWrapper.appendChild(titleTemp);

        // RAM Usage Bar
        let ramUsageWrapper = document.createElement("div");
        ramUsageWrapper.className = "ram-usage";
        let titleRam = document.createElement("h2");
        titleRam.innerHTML = `RAM Usage: ${this.stats.totalRam - this.stats.freeRam}MB/${this.stats.totalRam}MB`;
        let ramBar = document.createElement("progress");
        ramBar.value = (this.stats.totalRam - this.stats.freeRam);
        ramBar.max = this.stats.totalRam;
        ramUsageWrapper.appendChild(titleRam);
        ramUsageWrapper.appendChild(ramBar);

        // Append all elements to the main wrapper
        wrapper.appendChild(cpuUsageWrapper);
        wrapper.appendChild(cpuTempWrapper);
        wrapper.appendChild(ramUsageWrapper);

        return wrapper;
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "SYSTEM_STATS") {
            this.stats = payload;
            this.updateDom();
        }
    }
});
